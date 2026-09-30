"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api/client";
import type { DistanceUnit, DraftRound, RoundEntryMode, RoundInput } from "@/lib/api/types";
import { holesFor } from "@/lib/courses/ratingSelection";
import { fetchCourse } from "@/lib/courses/client";
import { fetchCourseOfflineFirst } from "@/lib/courses/offlineCache";
import type { CourseDto } from "@/lib/courses/types";
import { todayIso } from "@/lib/whs/dates";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/components/session/SessionProvider";
import { Alert, ButtonLink } from "@/components/ui";
import { ErrorState, PageSkeleton } from "@/components/ui/feedback";
import { roundHref } from "@/components/member/RoundList";
import { RoundWizard } from "./RoundWizard";
import { MobileRoundEntry } from "@/components/member/mobile/MobileRoundEntry";
import { useMobileEntry } from "@/components/member/mobile/hooks";
import { initialState, restoreState, type WizardState } from "./wizardState";

interface Loaded {
  state: WizardState;
  course: CourseDto | null;
  unsupported?: string;
  /** Ausgangszustand einer neuen Runde (für die Wiederaufnahme) */
  base: WizardState;
  drafts: DraftRound[];
  openedDraft: DraftRound | null;
  entryPref: RoundEntryMode;
  /** Einheit der GPS-Entfernung (Profil) */
  distanceUnit: DistanceUnit;
  /** Vorschlag für die mobile Eingabe: Heimatplatz bzw. zuletzt gespielt */
  suggested: CourseDto | null;
  hcpi: number | null;
}

/** Kann die mobile Scorecard diesen Stand darstellen? (sonst bisherige Eingabe, z. B. Stableford, manueller Platz) */
function mobileSupports(state: WizardState, course: CourseDto | null, editing: boolean): boolean {
  if (state.courseKind !== "DB") return !editing && !state.manual.courseName;
  if (state.scoreMode === "STABLEFORD_TOTAL") return false;
  if (!editing) return true;
  if (state.scoreMode === "GBE") return Boolean(course);
  const layout = course?.layouts.find((l) => l.id === state.layoutId);
  return Boolean(layout && state.teeColor && holesFor(layout, { gender: state.gender, teeColor: state.teeColor, holes: state.holes, nine: state.holes === 9 && layout.holesCount >= 18 ? (state.nine ?? "FRONT") : null }));
}

/** Gespeicherte Eingabe → Wizard (zum Bearbeiten). */
function fromInput(input: RoundInput, base: WizardState): { state: WizardState; unsupported?: string } {
  const s: WizardState = {
    ...base,
    step: "review",
    date: input.date,
    category: input.category,
    holes: input.holes,
    nine: input.nine ?? null,
    pcc: input.pcc ?? 0,
    notes: input.notes ?? "",
    visibility: input.visibility ?? "PRIVATE",
    detailed: Boolean(input.holeStats?.length),
    holeStats: input.holeStats ?? [],
  };
  const c = input.course;
  if (c?.kind === "DB") Object.assign(s, { courseKind: "DB", courseId: c.courseId, layoutId: c.layoutId, teeColor: c.teeColor, gender: c.gender, ratingConfirmed: c.confirmRating ?? null });
  else if (c?.kind === "MANUAL")
    Object.assign(s, {
      courseKind: "MANUAL",
      gender: c.gender,
      manual: { courseName: c.courseName, city: c.city ?? "", teeColor: c.teeColor ?? "", par: String(c.par), courseRating: String(c.courseRating).replace(".", ","), slopeRating: String(c.slopeRating) },
    });
  const sc = input.score;
  if (sc.mode === "GBE") Object.assign(s, { scoreMode: "GBE", gbe: String(sc.adjustedGrossScore) });
  else if (sc.mode === "HOLES") Object.assign(s, { scoreMode: "HOLES", strokes: sc.strokes });
  else if (sc.mode === "STABLEFORD_TOTAL") Object.assign(s, { scoreMode: "STABLEFORD_TOTAL", stableford: String(sc.points) });
  else return { state: s, unsupported: "Diese Runde wurde importiert (Score Differential bzw. Stableford je Loch) und kann hier nicht bearbeitet werden. Bei Bedarf bitte löschen und neu erfassen." };
  if (!c) return { state: s, unsupported: "Diese Runde hat keine Platzangabe und kann hier nicht bearbeitet werden." };
  return { state: s };
}

export function RoundWizardPage() {
  const params = useSearchParams();
  const editId = params.get("edit");
  const draftParam = params.get("draft");
  const courseParam = params.get("course");
  const classic = params.get("classic") === "1";
  const resumeNow = params.get("resume") === "1";
  const [draftId] = useState(() => draftParam ?? crypto.randomUUID());
  const lists = useApi(() => api.member.courseLists(), "lists");
  const { settings } = useSession();
  const communityOn = settings.community.communityEnabled;
  const mobile = useMobileEntry();

  const loaded = useApi<Loaded>(async () => {
    const [profile, community, drafts, hcp, courseLists] = await Promise.all([
      api.member.profile(),
      communityOn ? api.member.community().catch(() => null) : Promise.resolve(null),
      api.member.drafts().catch(() => [] as DraftRound[]),
      api.member.hcp().catch(() => null),
      api.member.courseLists().catch(() => null),
    ]);
    const base = initialState(todayIso(), profile.profile.gender ?? "M", community?.settings.defaultRoundVisibility ?? "PRIVATE");
    const common = {
      base,
      drafts,
      openedDraft: null as DraftRound | null,
      entryPref: profile.preferences.roundEntryMode ?? "ASK",
      distanceUnit: profile.preferences.distanceUnit ?? "M",
      hcpi: hcp?.currentHandicapIndex ?? null,
      suggested: null as CourseDto | null,
    };
    if (editId) {
      const detail = await api.member.round(editId);
      const { state, unsupported } = fromInput(detail.input, base);
      const course = state.courseKind === "DB" && state.courseId ? await fetchCourse(state.courseId).catch(() => null) : null;
      if (course) state.courseName = course.name;
      return { ...common, state, course, unsupported };
    }
    if (draftParam) {
      const draft = drafts.find((d) => d.id === draftParam);
      if (draft) {
        const state = restoreState(draft.input.wizard, base);
        // laufende Runde: ohne Netz die auf dem Gerät gespeicherten Platzdaten verwenden
        const course = state.courseKind === "DB" && state.courseId ? await fetchCourseOfflineFirst(state.courseId).catch(() => null) : null;
        return { ...common, state, course, openedDraft: draft };
      }
    }
    if (courseParam) {
      const course = await fetchCourse(courseParam).catch(() => null);
      if (course) {
        const layouts = course.layouts.filter((l) => l.active);
        return { ...common, state: { ...base, courseId: course.id, courseName: course.name, layoutId: layouts.length === 1 ? layouts[0].id : null }, course };
      }
    }
    // Mobile Eingabe: Heimatplatz bzw. zuletzt gespielten Platz vorschlagen
    const suggestedId = courseLists?.home?.id ?? courseLists?.recent[0]?.id ?? null;
    const suggested = suggestedId ? await fetchCourse(suggestedId).catch(() => null) : null;
    return { ...common, state: base, course: null, suggested };
  }, `${editId}|${draftParam}|${courseParam}`);

  if (loaded.error) return <ErrorState error={loaded.error} onRetry={loaded.reload} />;
  if (!loaded.data || mobile === null) return <PageSkeleton variant="detail" />;
  const d = loaded.data;
  if (d.unsupported) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Alert tone="info">{d.unsupported}</Alert>
        {editId && <ButtonLink href={roundHref(editId)} variant="secondary">Zurück zur Runde</ButtonLink>}
      </div>
    );
  }
  if (mobile && !classic && mobileSupports(d.state, d.course, Boolean(editId))) {
    // Neue Runde: vorgeschlagenen Platz übernehmen (nur mobil – die Desktop-Eingabe startet wie bisher mit der Suche)
    const withSuggestion =
      !editId && !d.openedDraft && !d.course && d.suggested
        ? { state: { ...d.state, courseId: d.suggested.id, courseName: d.suggested.name, layoutId: d.suggested.layouts.filter((l) => l.active).length === 1 ? d.suggested.layouts.find((l) => l.active)!.id : null }, course: d.suggested }
        : { state: d.state, course: d.course };
    return (
      <MobileRoundEntry
        base={d.base}
        initial={withSuggestion.state}
        initialCourse={withSuggestion.course}
        editId={editId}
        draftId={draftId}
        openedDraft={d.openedDraft}
        resumeNow={resumeNow}
        drafts={d.drafts}
        lists={lists.data}
        entryPref={d.entryPref}
        distanceUnit={d.distanceUnit}
        hcpi={d.hcpi}
      />
    );
  }
  return <RoundWizard initial={d.state} initialCourse={d.course} editId={editId} draftId={draftId} lists={lists.data} />;
}
