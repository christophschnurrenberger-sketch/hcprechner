"use client";

import { useState } from "react";
import { CloudOff, Flag, Loader2 } from "lucide-react";
import { api } from "@/lib/api/client";
import type { DistanceUnit, DraftRound, MemberCourseLists, RoundEntryMode } from "@/lib/api/types";
import { fetchCourseOfflineFirst } from "@/lib/courses/offlineCache";
import { holesFor } from "@/lib/courses/ratingSelection";
import type { CourseDto } from "@/lib/courses/types";
import type { EntryMode, FlowPos, HoleView } from "@/lib/rounds/holeFlow";
import { alignToHoles, holeNumbersFor } from "@/lib/stats/holeStats";
import { useApi } from "@/lib/useApi";
import { ErrorState, PageSkeleton, useToast } from "@/components/ui/feedback";
import { useSession } from "@/components/session/SessionProvider";
import { restoreState, type WizardState } from "@/components/member/wizard/wizardState";
import { clearLocalDraft, loadLocalDraft, type LocalRoundDraft } from "./localDraft";
import { MobileRoundWizard } from "./MobileRoundWizard";
import { BigButton, BottomSheet } from "./ui";

interface MobileMeta {
  mode: EntryMode;
  pos: FlowPos;
}

function isMobileMeta(v: unknown): v is MobileMeta {
  const m = v as MobileMeta | null;
  return Boolean(m && (m.mode === "QUICK" || m.mode === "DETAILED" || m.mode === "TOTAL") && m.pos && typeof m.pos.hole === "number" && typeof m.pos.step === "string");
}

/** Gespeicherter Stand → Ansicht je Loch (für den Wiedereinstieg). */
function viewsOf(state: WizardState, course: CourseDto | null): HoleView[] {
  const layout = course?.layouts.find((l) => l.id === state.layoutId) ?? null;
  const info = state.courseKind === "DB" && layout && state.teeColor ? holesFor(layout, { gender: state.gender, teeColor: state.teeColor, holes: state.holes, nine: state.holes === 9 && layout.holesCount >= 18 ? (state.nine ?? "FRONT") : null }) : null;
  const base = info ? info.map((h) => ({ number: h.number, par: h.par as number | null, strokeIndex: h.strokeIndex ?? null })) : holeNumbersFor(state.holes, state.holes === 9 ? state.nine : null).map((n) => ({ number: n, par: null, strokeIndex: null }));
  const stats = alignToHoles(state.holeStats, base);
  const strokes = state.strokes.length === state.holes ? state.strokes : Array(state.holes).fill(null);
  return base.map((b, i) => ({ ...b, raw: strokes[i] ?? null, stats: { ...stats[i], score: typeof strokes[i] === "number" ? strokes[i] : null } }));
}

/** Aktive Runde: lokaler Stand (auch offline) oder zuletzt geänderter mobiler Server-Entwurf. */
function activeRound(local: LocalRoundDraft | null, drafts: DraftRound[], base: WizardState, userId: string): LocalRoundDraft | null {
  const server = drafts
    .filter((d) => isMobileMeta(d.input.mobile) && (d.input.mobile as MobileMeta).pos.step !== "SETUP")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const fromServer = (d: DraftRound, userId: string): LocalRoundDraft => ({
    v: 1,
    userId,
    draftId: d.id,
    state: restoreState(d.input.wizard, base),
    mode: (d.input.mobile as MobileMeta).mode,
    pos: (d.input.mobile as MobileMeta).pos,
    courseName: d.label.split(" · ")[0] ?? null,
    updatedAt: d.updatedAt,
    pendingSave: null,
  });
  if (local && server && server.id === local.draftId) return server.updatedAt > local.updatedAt ? fromServer(server, userId) : local;
  if (local) return local;
  return server ? fromServer(server, userId) : null;
}

export interface MobileEntryProps {
  base: WizardState;
  initial: WizardState;
  initialCourse: CourseDto | null;
  editId: string | null;
  draftId: string;
  /** über ?draft= geöffneter Server-Entwurf */
  openedDraft: DraftRound | null;
  /** ?resume=1: laufende Runde ohne Rückfrage fortsetzen */
  resumeNow: boolean;
  drafts: DraftRound[];
  lists: MemberCourseLists | undefined;
  entryPref: RoundEntryMode;
  distanceUnit?: DistanceUnit;
  hcpi: number | null;
}

/**
 * Einstieg der mobilen Scorecard: neue Runde, Bearbeiten oder Wiederaufnahme. Es gibt immer nur eine laufende
 * Runde – beim Start einer neuen wird zuerst gefragt, was mit der angefangenen passieren soll.
 */
export function MobileRoundEntry(props: MobileEntryProps) {
  const { user } = useSession();
  const toast = useToast();
  const [local] = useState(() => (user ? loadLocalDraft(user.id) : null));
  const [decision, setDecision] = useState<"auto" | "resume" | "new">(props.resumeNow ? "resume" : "auto");
  const [confirm, setConfirm] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  const opened: LocalRoundDraft | null = props.openedDraft
    ? local && local.draftId === props.openedDraft.id && local.updatedAt >= props.openedDraft.updatedAt
      ? local
      : {
          v: 1,
          userId: user?.id ?? "",
          draftId: props.openedDraft.id,
          state: props.initial,
          mode: isMobileMeta(props.openedDraft.input.mobile) ? props.openedDraft.input.mobile.mode : props.initial.detailed ? "DETAILED" : props.initial.scoreMode === "GBE" ? "TOTAL" : "QUICK",
          pos: isMobileMeta(props.openedDraft.input.mobile) ? props.openedDraft.input.mobile.pos : { hole: 0, step: "SETUP" },
          courseName: null,
          updatedAt: props.openedDraft.updatedAt,
          pendingSave: null,
        }
    : null;
  const active = props.editId || decision === "new" ? null : (opened ?? activeRound(local, props.drafts, props.base, user?.id ?? ""));
  const resuming = Boolean(active && (opened || decision === "resume"));

  // Platz des fortgesetzten Stands laden (für Par/Handicap je Loch)
  const courseId = resuming && active?.state.courseKind === "DB" ? active.state.courseId : null;
  const course = useApi<CourseDto | null>(() => (courseId ? (courseId === props.initialCourse?.id ? Promise.resolve(props.initialCourse) : fetchCourseOfflineFirst(courseId)) : Promise.resolve(null)), courseId ?? "none");

  if (props.editId) {
    const holes = viewsOf(props.initial, props.initialCourse);
    const mode: EntryMode = props.initial.scoreMode === "GBE" ? "TOTAL" : props.initial.detailed ? "DETAILED" : "QUICK";
    return <MobileRoundWizard initial={props.initial} initialCourse={props.initialCourse} editId={props.editId} draftId={props.draftId} lists={props.lists} entryPref={props.entryPref} hcpi={props.hcpi} distanceUnit={props.distanceUnit} resume={{ mode, pos: { hole: holes.length - 1, step: "FINAL" } }} />;
  }

  if (active && !resuming && decision === "auto") {
    const holes = viewsOf(active.state, null);
    const pos = active.pos;
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-surface-2">
        <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 overflow-y-auto px-6 text-center">
          <Flag className="h-12 w-12 text-brand" aria-hidden />
          <h1 className="text-2xl font-bold text-ink">Du hast eine laufende Runde.</h1>
          <div className="w-full max-w-sm rounded-2xl bg-surface p-5">
            <p className="text-lg font-semibold text-ink">{active.courseName ?? active.state.courseName ?? "Runde"}</p>
            <p className="mt-1 text-base text-ink-2">
              {active.pendingSave ? (
                <span className="inline-flex items-center gap-1.5">
                  <CloudOff className="h-4 w-4 text-warning" aria-hidden /> Abgeschlossen – noch nicht synchronisiert
                </span>
              ) : pos.step === "FINAL" || pos.step === "FRONT_NINE" ? (
                "Bereit zum Abschließen"
              ) : active.mode === "TOTAL" ? (
                "Gesamtergebnis eintragen"
              ) : (
                `Loch ${Math.min(pos.hole + 1, holes.length)} von ${holes.length}`
              )}
            </p>
          </div>
        </main>
        <div className="flex flex-col gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <BigButton onClick={() => setDecision("resume")}>Fortsetzen</BigButton>
          <BigButton variant="secondary" onClick={() => setConfirm(true)}>
            Verwerfen
          </BigButton>
        </div>
        <BottomSheet
          open={confirm}
          onClose={() => setConfirm(false)}
          title="Laufende Runde verwerfen?"
          footer={
            <>
              <BigButton
                variant="danger"
                disabled={discarding}
                onClick={async () => {
                  setDiscarding(true);
                  if (user) clearLocalDraft(user.id, active.draftId);
                  await api.member.deleteDraft(active.draftId).catch(() => undefined);
                  toast("Runde verworfen.");
                  setConfirm(false);
                  setDecision("new");
                  setDiscarding(false);
                }}
              >
                {discarding && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />} Ja, verwerfen
              </BigButton>
              <BigButton variant="secondary" onClick={() => setConfirm(false)}>
                Abbrechen
              </BigButton>
            </>
          }
        >
          <p className="text-ink-2">Alle Eingaben dieser Runde werden gelöscht. Danach startest du eine neue Runde.</p>
        </BottomSheet>
      </div>
    );
  }

  if (resuming && active) {
    if (course.error) return <ErrorState error={course.error} onRetry={course.reload} />;
    if (course.data === undefined) return <PageSkeleton variant="detail" />;
    const state = active.state;
    const views = viewsOf(state, course.data);
    // Abgeschlossene, aber offline gebliebene Runde: an der Übersicht erneut abschließen (idempotent)
    const pos = active.pendingSave ? { hole: views.length - 1, step: "FINAL" as const } : active.pos;
    return (
      <MobileRoundWizard
        key={active.draftId}
        initial={state}
        initialCourse={course.data}
        editId={null}
        draftId={active.draftId}
        lists={props.lists}
        entryPref={props.entryPref}
        hcpi={props.hcpi}
        distanceUnit={props.distanceUnit}
        resume={active.pos.step === "SETUP" && !active.pendingSave ? null : { mode: active.mode, pos }}
      />
    );
  }

  return <MobileRoundWizard key={props.draftId} initial={props.initial} initialCourse={props.initialCourse} editId={null} draftId={props.draftId} lists={props.lists} entryPref={props.entryPref} hcpi={props.hcpi} distanceUnit={props.distanceUnit} resume={null} />;
}
