"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type TouchEvent } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, CloudOff, Flag, Loader2, MapPin, PartyPopper, RefreshCw, Star, Target, Trophy, X } from "lucide-react";
import { api } from "@/lib/api/client";
import { userMessage } from "@/lib/api/errors";
import type { MemberCourseLists, RoundEntryMode, RoundSaveResult } from "@/lib/api/types";
import { VISIBILITY_LABELS } from "@/lib/community/policy";
import type { MyRanking } from "@/lib/community/types";
import { fetchCourse } from "@/lib/courses/client";
import { greenForHole, layoutHasGreens } from "@/lib/courses/geo";
import { rememberCourse } from "@/lib/courses/offlineCache";
import { availableTees, holesFor, type TeeOption } from "@/lib/courses/ratingSelection";
import { TEE_SWATCH } from "@/lib/courses/tees";
import type { CourseDto, LayoutDto } from "@/lib/courses/types";
import type { CourseSummary } from "@/lib/courses/summary";
import type { GreenTarget } from "@/lib/gps/distanceEngine";
import type { DistanceUnit, RoundStatus } from "@/lib/gps/types";
import { hasNativeWatchBridge, type RoundContext } from "@/lib/gps/watch/bridge";
import type { WatchCommand } from "@/lib/gps/watch/protocol";
import { cn, formatDate, formatDecimal, formatHcp, formatSigned } from "@/lib/format";
import {
  afterHole,
  completeHole,
  firstPos,
  formatToPar,
  holeStatus,
  isHoleStep,
  nextPos,
  normalizeHole,
  prevPos,
  questionsAnswered,
  totals,
  type EntryMode,
  type FlowContext,
  type FlowPos,
  type HoleView,
  type Totals,
} from "@/lib/rounds/holeFlow";
import { alignToHoles, holeNumbersFor } from "@/lib/stats/holeStats";
import type { HoleStat } from "@/lib/stats/types";
import { todayIso } from "@/lib/whs/dates";
import type { HoleScore } from "@/lib/whs/types";
import { Alert, ChoiceCards, Field, Input, Segmented } from "@/components/ui";
import { useToast } from "@/components/ui/feedback";
import { useSession } from "@/components/session/SessionProvider";
import { CoursePicker } from "@/components/courses/CoursePicker";
import { roundHref, roundStatsHref } from "@/components/member/RoundList";
import { useMyCommunity, usePublicRoundsEnabled, VisibilityChooser } from "@/components/community/Visibility";
import { applyPatch, holesChoiceOf, holesPatch, stepErrors, toRoundInput, type HolesChoice, type WizardState } from "@/components/member/wizard/wizardState";
import { DistanceButton } from "@/components/gps/DistanceButton";
import { DistanceScreen } from "@/components/gps/DistanceScreen";
import { useRoundGps } from "@/components/gps/useRoundGps";
import { useWatchBridge } from "@/components/gps/useWatchBridge";
import { haptic, isNetworkError, useDraftAutosave, useOnline, useWakeLock } from "./hooks";
import { clearLocalDraft, lastEntryMode, rememberEntryMode, saveLocalDraft, type LocalRoundDraft } from "./localDraft";
import { PuttsScreen, ScoreScreen, StatsScreen } from "./screens";
import { BigButton, BottomSheet, ChoiceRow, HoleStrip, StickyFooter } from "./ui";

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

type Sheet = null | "exit" | "discard" | "course" | "details" | "visibility" | "more";

const CATEGORY: Record<WizardState["category"], string> = { TOURNAMENT: "Turnier", RPR: "Privatrunde", OTHER: "Training" };

function selectedTee(layout: LayoutDto | null, s: WizardState): TeeOption | null {
  if (!layout || !s.teeColor) return null;
  const split = s.holes === 9 && layout.holesCount >= 18;
  return availableTees(layout, { gender: s.gender, holes: s.holes, date: s.date }).find((t) => t.teeColor === s.teeColor && (!split || t.nine === (s.nine ?? "FRONT"))) ?? null;
}

/** Startmodus: Profil-Einstellung, sonst zuletzt auf diesem Gerät gewählt, sonst „Schnell“. */
export function defaultEntryMode(pref: RoundEntryMode): "QUICK" | "DETAILED" {
  if (pref === "QUICK" || pref === "DETAILED") return pref;
  return lastEntryMode() ?? "QUICK";
}

export interface MobileWizardProps {
  initial: WizardState;
  initialCourse: CourseDto | null;
  editId: string | null;
  draftId: string;
  lists: MemberCourseLists | undefined;
  entryPref: RoundEntryMode;
  /** Fortsetzen: Erfassungsart und Position (sonst Start) */
  resume?: { mode: EntryMode; pos: FlowPos } | null;
  hcpi: number | null;
  /** Einheit der GPS-Entfernung (Profil), Standard Meter */
  distanceUnit?: DistanceUnit;
}

// ---------------------------------------------------------------------------
// Wizard
// ---------------------------------------------------------------------------

/**
 * Mobile Scorecard: eigenständige Schritt-für-Schritt-Eingabe (keine verkleinerte Desktop-Tabelle).
 * Datenmodell, API und Berechnung sind dieselben wie in der Desktop-Eingabe (`WizardState` → `toRoundInput`);
 * Score Differential und Handicap Index berechnet ausschließlich das Backend.
 */
export function MobileRoundWizard({ initial, initialCourse, editId, draftId, lists, entryPref, resume, hcpi, distanceUnit = "M" }: MobileWizardProps) {
  const router = useRouter();
  const toast = useToast();
  const { user, settings } = useSession();
  const online = useOnline();
  const publicRounds = usePublicRoundsEnabled();

  const [ws, setWs] = useState<WizardState>(initial);
  const [course, setCourse] = useState<CourseDto | null>(initialCourse);
  const [mode, setMode] = useState<EntryMode>(resume?.mode ?? (initial.scoreMode === "GBE" && editId ? "TOTAL" : initial.detailed ? "DETAILED" : editId ? "QUICK" : defaultEntryMode(entryPref)));
  const [pos, setPos] = useState<FlowPos>(resume?.pos ?? { hole: 0, step: "SETUP" });
  const [started, setStarted] = useState(Boolean(resume || editId));
  const [dir, setDir] = useState<1 | -1>(1);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupErrors, setSetupErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<RoundSaveResult | null>(null);
  const [pending, setPending] = useState(false);
  const [ranking, setRanking] = useState<MyRanking | null>(null);
  const [distanceOpen, setDistanceOpen] = useState(false);
  /** in der Entfernungsansicht gewähltes Loch – gilt nur, solange die Scorecard auf demselben Loch steht */
  const [distanceOverride, setDistanceOverride] = useState<{ hole: number; base: number | null } | null>(null);
  const [gpsTarget, setGpsTarget] = useState<GreenTarget>("green_center");
  const lastAdvance = useRef(0);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const posRef = useRef(pos);
  useEffect(() => {
    posRef.current = pos;
  }, [pos]);

  // Platz- und Lochdaten
  const layout = course?.layouts.find((l) => l.id === ws.layoutId) ?? null;
  const holeInfo = useMemo(
    () => (ws.courseKind === "DB" && layout && ws.teeColor ? holesFor(layout, { gender: ws.gender, teeColor: ws.teeColor, holes: ws.holes, nine: ws.holes === 9 && layout.holesCount >= 18 ? (ws.nine ?? "FRONT") : null }) : null),
    [ws.courseKind, layout, ws.teeColor, ws.gender, ws.holes, ws.nine],
  );
  const base = useMemo(
    () =>
      holeInfo
        ? holeInfo.map((h) => ({ number: h.number, par: h.par as number | null, strokeIndex: h.strokeIndex ?? null }))
        : holeNumbersFor(ws.holes, ws.holes === 9 ? ws.nine : null).map((n) => ({ number: n, par: null as number | null, strokeIndex: null as number | null })),
    [holeInfo, ws.holes, ws.nine],
  );
  const strokes = useMemo<HoleScore[]>(() => (ws.strokes.length === ws.holes ? ws.strokes : Array(ws.holes).fill(null)), [ws.strokes, ws.holes]);
  const holeStats = useMemo(() => alignToHoles(ws.holeStats, base), [ws.holeStats, base]);
  const views: HoleView[] = useMemo(
    () => base.map((b, i) => ({ ...b, raw: strokes[i] ?? null, stats: { ...holeStats[i], score: typeof strokes[i] === "number" ? (strokes[i] as number) : null } })),
    [base, strokes, holeStats],
  );
  const ctx: FlowContext = { mode, holeCount: ws.holes };
  const courseName = ws.courseKind === "DB" ? (course?.name ?? ws.courseName) : ws.manual.courseName;
  const running = totals(views);
  const inRound = started && pos.step !== "RESULT";

  useWakeLock(inRound);

  // -------------------------------------------------------------- GPS: Entfernung zum Grün (Zusatz, blockiert nie die Scorecard)
  // Standort nur bei aktiver Runde; Übersicht vor dem Abschluss = Pause, Ergebnis/Bearbeiten = beendet.
  const roundStatus: RoundStatus = editId || pos.step === "RESULT" ? "COMPLETED" : !started || pos.step === "SETUP" ? "NOT_STARTED" : pos.step === "FINAL" ? "PAUSED" : "ACTIVE";
  const hasGreens = ws.courseKind === "DB" && layoutHasGreens(layout);
  const scorecardHole: number | null =
    roundStatus === "NOT_STARTED" || views.length === 0
      ? null
      : isHoleStep(pos.step)
        ? (views[Math.min(pos.hole, views.length - 1)]?.number ?? null)
        : pos.step === "FRONT_NINE"
          ? (views[Math.min(9, views.length - 1)]?.number ?? null)
          : pos.step === "FINAL" || pos.step === "RESULT"
            ? views[views.length - 1].number
            : views[0].number;
  const distanceHole = distanceOverride && distanceOverride.base === scorecardHole ? distanceOverride.hole : scorecardHole;
  const green = hasGreens && layout && distanceHole !== null ? greenForHole(layout, distanceHole) : null;
  const gps = useRoundGps({ round: roundStatus, courseId: ws.courseKind === "DB" ? ws.courseId : null, holeNumber: distanceHole, green, hasGreens, target: gpsTarget, unit: distanceUnit });
  const showDistance = roundStatus === "ACTIVE" && hasGreens;
  const distanceHoles = useMemo(() => views.map((v) => ({ number: v.number, par: v.par })), [views]);
  const chooseDistanceHole = useCallback((n: number) => setDistanceOverride(n === scorecardHole ? null : { hole: n, base: scorecardHole }), [scorecardHole]);

  // Apple Watch (über die iPhone-App) bzw. Browser-Vorschau: nur Loch, Entfernung, Ziel, GPS-Status
  const onWatchCommand = useCallback(
    (command: WatchCommand) => {
      if (command.type === "target") return setGpsTarget(command.target);
      const index = distanceHoles.findIndex((h) => h.number === distanceHole);
      const next = distanceHoles[index + command.delta];
      if (index >= 0 && next) chooseDistanceHole(next.number);
    },
    [distanceHoles, distanceHole, chooseDistanceHole],
  );
  const watchContext = useMemo<RoundContext | null>(
    () =>
      showDistance && layout && hasNativeWatchBridge()
        ? {
            v: 1,
            roundActive: true,
            courseId: ws.courseId,
            unit: distanceUnit === "YD" ? "yd" : "m",
            target: gpsTarget === "pin" ? "green_center" : gpsTarget,
            hole: distanceHole,
            holes: distanceHoles.map((h) => {
              const g = greenForHole(layout, h.number);
              return { number: h.number, par: h.par, green: g ? { front: g.front, center: g.center, back: g.back } : null };
            }),
          }
        : null,
    [showDistance, layout, ws.courseId, distanceUnit, gpsTarget, distanceHole, distanceHoles],
  );
  const watch = useWatchBridge({
    view: gps.view,
    roundActive: showDistance,
    par: distanceHoles.find((h) => h.number === distanceHole)?.par ?? null,
    context: watchContext,
    onCommand: onWatchCommand,
  });

  // Platzdaten der laufenden Runde auf dem Gerät vorhalten (Funkloch, erneutes Öffnen ohne Netz)
  useEffect(() => {
    if (started && !editId && course) rememberCourse(course);
  }, [started, editId, course]);

  // Automatisch sichern (nur neue Runden)
  const draft: LocalRoundDraft | null = useMemo(
    () => (editId || !started || !user ? null : { v: 1, userId: user.id, draftId, state: { ...ws, holeStats }, mode, pos, courseName: courseName ?? null, updatedAt: "", pendingSave: null }),
    [editId, started, user, draftId, ws, holeStats, mode, pos, courseName],
  );
  const autosave = useDraftAutosave(draft);

  // Vollbild: Seite dahinter nicht scrollen
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1600);
    return () => clearTimeout(t);
  }, [flash]);

  const cancelAuto = useCallback(() => {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    autoTimer.current = null;
  }, []);
  useEffect(() => cancelAuto, [cancelAuto]);

  // -------------------------------------------------------------- Änderungen
  const patch = (p: Partial<WizardState>) => setWs((s) => applyPatch(s, p));

  const setStroke = (i: number, v: HoleScore) => {
    lastAdvance.current = 0; // bewusste Eingabe – der nächste Tipp auf „Weiter“ ist kein Doppeltipp
    setWs((s) => {
      const arr = s.strokes.length === s.holes ? [...s.strokes] : Array<HoleScore>(s.holes).fill(null);
      arr[i] = v;
      const aligned = alignToHoles(s.holeStats, base);
      aligned[i] = normalizeHole({ ...aligned[i], score: typeof v === "number" ? v : null });
      return { ...s, strokes: arr, holeStats: aligned };
    });
  };

  const setHoleStat = (i: number, p: Partial<HoleStat>) => {
    lastAdvance.current = 0;
    setWs((s) => {
      const aligned = alignToHoles(s.holeStats, base);
      const raw = (s.strokes.length === s.holes ? s.strokes : [])[i];
      aligned[i] = normalizeHole({ ...aligned[i], ...p, score: typeof raw === "number" ? raw : null });
      return { ...s, holeStats: aligned };
    });
  };

  // -------------------------------------------------------------- Navigation
  function go(next: FlowPos, direction: 1 | -1 = 1) {
    cancelAuto();
    setDir(direction);
    setMoreOpen(false);
    setError(null);
    setPos(next);
    // Desktop-Eingabe kann einen Entwurf so fortsetzen
    const step = next.step === "SETUP" ? "course" : next.step === "FINAL" || next.step === "RESULT" ? "review" : "score";
    setWs((s) => (s.step === step ? s : { ...s, step }));
  }

  /** Doppeltipp-Schutz für alles, was weiterblättert. */
  function guard(): boolean {
    const now = Date.now();
    if (now - lastAdvance.current < 350) return false;
    lastAdvance.current = now;
    return true;
  }

  function finishHole(i: number, announce = true) {
    if (mode === "DETAILED") setWs((s) => {
      const aligned = alignToHoles(s.holeStats, base);
      const raw = (s.strokes.length === s.holes ? s.strokes : [])[i];
      aligned[i] = completeHole({ ...aligned[i], score: typeof raw === "number" ? raw : null });
      return { ...s, holeStats: aligned };
    });
    const v = views[i];
    if (v.raw !== null && announce) {
      haptic(15);
      setFlash(`Loch ${v.number} gespeichert · ${v.raw === "PICKUP" ? "Strich" : `${v.raw}${v.par !== null && typeof v.raw === "number" ? ` (${formatToPar(v.raw - v.par)})` : ""}`}`);
    }
  }

  function forward() {
    if (!guard()) return;
    if (isHoleStep(pos.step)) {
      const next = nextPos(pos, ctx);
      // Zwischen zwei Löchern kurz bestätigen; vor Zwischenstand/Übersicht übernimmt das die Zusammenfassung
      if (next.hole !== pos.hole || !isHoleStep(next.step)) finishHole(pos.hole, isHoleStep(next.step));
      go(next);
      return;
    }
    go(nextPos(pos, ctx));
  }

  function back() {
    if (pos.step === "SETUP") {
      setSheet(started ? "exit" : null);
      if (!started) router.push(editId ? roundHref(editId) : "/member");
      return;
    }
    const p = prevPos(pos, ctx);
    if (p) go(p, -1);
  }

  function jumpTo(hole: number) {
    if (!guard()) return;
    if (isHoleStep(pos.step) && hole !== pos.hole) finishHole(pos.hole);
    go({ hole, step: "SCORE" }, hole < pos.hole ? -1 : 1);
  }

  function toSummary() {
    if (isHoleStep(pos.step)) finishHole(pos.hole, false);
    go({ hole: ws.holes - 1, step: "FINAL" });
  }

  // Wischen: rechts = zurück, links = nächstes Loch (Buttons bleiben die Hauptnavigation)
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start || !isHoleStep(pos.step)) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx > 0) back();
    else if (guard()) {
      finishHole(pos.hole);
      go(afterHole(pos.hole, ctx));
    }
  };

  // -------------------------------------------------------------- Start
  const tee = selectedTee(layout, ws);
  function start() {
    const e = stepErrors(ws, "course");
    if (ws.courseKind !== "DB") e.course = "Bitte einen Golfplatz wählen.";
    if (!e.tee && tee && !tee.verified && !ws.ratingConfirmed) e.confirm = "Bitte bestätige die Werte mit deiner Scorekarte.";
    if (Object.keys(e).length) {
      setSetupErrors(e);
      return;
    }
    setSetupErrors({});
    const m: EntryMode = holeInfo ? (mode === "TOTAL" ? defaultEntryMode(entryPref) : mode) : "TOTAL";
    setMode(m);
    rememberEntryMode(m);
    setWs((s) => ({
      ...s,
      scoreMode: m === "TOTAL" ? "GBE" : "HOLES",
      detailed: m === "DETAILED",
      strokes: s.strokes.length === s.holes ? s.strokes : Array(s.holes).fill(null),
      step: "score",
    }));
    setStarted(true);
    go(firstPos({ mode: m, holeCount: ws.holes }));
  }

  // -------------------------------------------------------------- Abschluss
  const loadRanking = useCallback(async () => {
    if (!settings.community.communityEnabled || !settings.community.rankingEnabled) return;
    try {
      const r = await api.member.myRanking();
      if (r.ranking?.participating) setRanking(r.ranking);
    } catch {
      /* optional */
    }
  }, [settings.community.communityEnabled, settings.community.rankingEnabled]);

  const saveRound = useCallback(async () => {
    const input = toRoundInput({ ...ws, holeStats });
    setSaving(true);
    setError(null);
    if (!editId && user && draft) saveLocalDraft({ ...draft, updatedAt: new Date().toISOString(), pendingSave: { input, at: new Date().toISOString() } });
    try {
      const res = editId ? await api.member.updateRound(editId, input) : await api.member.createRound(input, draftId);
      autosave.finalize();
      if (user) clearLocalDraft(user.id, draftId);
      setResult(res);
      setPending(false);
      setDir(1);
      setPos({ hole: pos.hole, step: "RESULT" });
      haptic(25);
      void loadRanking();
      return true;
    } catch (e) {
      if (!editId && isNetworkError(e)) {
        autosave.finalize();
        setPending(true);
        setPos({ hole: pos.hole, step: "RESULT" });
      } else {
        setError(userMessage(e));
      }
      return false;
    } finally {
      setSaving(false);
    }
  }, [ws, holeStats, editId, user, draft, draftId, autosave, pos.hole, loadRanking]);

  // Offline abgeschlossen → bei Verbindung automatisch nachreichen (idempotent über die Entwurfs-ID)
  useEffect(() => {
    if (!pending || !online || saving) return;
    const t = setTimeout(() => {
      void saveRound().then((ok) => ok && toast("Runde synchronisiert."));
    }, 400);
    return () => clearTimeout(t);
  }, [pending, online, saving, saveRound, toast]);

  // -------------------------------------------------------------- Verlassen
  async function leave(kind: "keep" | "draft") {
    if (kind === "draft") {
      const ok = await autosave.flush();
      toast(ok ? "Als Entwurf gespeichert." : "Auf deinem Gerät gespeichert – wird synchronisiert, sobald du online bist.", ok ? "success" : "info");
    }
    router.push("/member");
  }

  async function discard() {
    autosave.finalize();
    if (user) clearLocalDraft(user.id, draftId);
    await api.member.deleteDraft(draftId).catch(() => undefined);
    toast("Runde verworfen.");
    router.push("/member");
  }

  // -------------------------------------------------------------- Darstellung
  const cur = views[Math.min(pos.hole, views.length - 1)];
  const step = pos.step;
  const showStrip = started && mode !== "TOTAL" && step !== "RESULT" && step !== "SETUP";
  const syncBadge = editId ? null : !online ? (
    <span className="inline-flex items-center gap-1 text-warning">
      <CloudOff className="h-3.5 w-3.5" aria-hidden /> Offline
    </span>
  ) : autosave.sync === "saving" ? (
    <span className="inline-flex items-center gap-1">
      <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden /> Synchronisierung
    </span>
  ) : autosave.sync === "saved" ? (
    <span className="inline-flex items-center gap-1 text-good">
      <Check className="h-3.5 w-3.5" aria-hidden /> Gespeichert
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-warning">
      <CloudOff className="h-3.5 w-3.5" aria-hidden /> Lokal gespeichert
    </span>
  );

  let content: ReactNode = null;
  let footer: ReactNode = null;

  if (step === "SETUP") {
    content = (
      <SetupScreen
        ws={ws}
        patch={patch}
        course={course}
        layout={layout}
        tee={tee}
        holeInfoKnown={holeInfo !== null}
        mode={mode === "TOTAL" ? defaultEntryMode(entryPref) : mode}
        setMode={setMode}
        errors={setupErrors}
        hcpi={hcpi}
        onOpenCourse={() => setSheet("course")}
        onOpenDetails={() => setSheet("details")}
        editing={Boolean(editId)}
      />
    );
    footer = (
      <BigButton onClick={started ? () => go(firstPos(ctx)) : start}>
        {started ? "Zurück zur Runde" : "Runde starten"} <ArrowRight className="h-5 w-5" aria-hidden />
      </BigButton>
    );
  } else if (step === "SCORE") {
    content = <ScoreScreen view={cur} value={cur.raw} onChange={(v) => { setStroke(pos.hole, v); haptic(8); }} />;
    const last = pos.hole === ws.holes - 1;
    footer = (
      <BigButton onClick={forward} disabled={cur.raw === null}>
        {mode === "DETAILED" ? "Weiter" : last ? "Runde abschließen" : "Nächstes Loch"} <ArrowRight className="h-5 w-5" aria-hidden />
      </BigButton>
    );
  } else if (step === "PUTTS") {
    content = (
      <PuttsScreen
        view={cur}
        putts={cur.stats.putts}
        onSelect={(p, auto) => {
          setHoleStat(pos.hole, { putts: p });
          if (p !== null) haptic(8);
          if (auto && p !== null) {
            cancelAuto();
            const at = posRef.current;
            autoTimer.current = setTimeout(() => {
              if (posRef.current.hole === at.hole && posRef.current.step === "PUTTS") go({ hole: at.hole, step: "STATS" });
            }, 200);
          }
        }}
      />
    );
    footer = <BigButton onClick={forward}>{cur.stats.putts === null ? "Ohne Putts weiter" : "Weiter"} <ArrowRight className="h-5 w-5" aria-hidden /></BigButton>;
  } else if (step === "STATS") {
    content = (
      <StatsScreen
        view={cur}
        moreOpen={moreOpen}
        onToggleMore={() => {
          cancelAuto();
          setMoreOpen((v) => !v);
        }}
        onChange={(p, question) => {
          setHoleStat(pos.hole, p);
          cancelAuto();
          if (!question || moreOpen) return;
          const updated = normalizeHole({ ...cur.stats, ...p });
          if (questionsAnswered(updated)) {
            const at = posRef.current;
            autoTimer.current = setTimeout(() => {
              if (posRef.current.hole !== at.hole || posRef.current.step !== "STATS") return;
              const next = afterHole(at.hole, ctx);
              finishHole(at.hole, isHoleStep(next.step));
              go(next);
            }, 550);
          }
        }}
      />
    );
    const last = pos.hole === ws.holes - 1;
    footer = (
      <BigButton onClick={forward}>
        {last ? "Zur Übersicht" : "Nächstes Loch"} <ArrowRight className="h-5 w-5" aria-hidden />
      </BigButton>
    );
  } else if (step === "TOTAL") {
    content = <TotalScreen value={ws.gbe} holes={ws.holes} onChange={(gbe) => patch({ gbe })} error={error} />;
    footer = (
      <BigButton onClick={() => (stepErrors(ws, "score").gbe ? setError("Bitte dein Gesamtergebnis (GBE) eingeben.") : forward())}>
        Weiter <ArrowRight className="h-5 w-5" aria-hidden />
      </BigButton>
    );
  } else if (step === "FRONT_NINE") {
    content = <RoundSummary title="Front Nine geschafft" views={views.slice(0, 9)} t={totals(views.slice(0, 9))} detailed={mode === "DETAILED"} onHole={jumpTo} />;
    footer = (
      <BigButton onClick={forward}>
        Back Nine starten <ArrowRight className="h-5 w-5" aria-hidden />
      </BigButton>
    );
  } else if (step === "FINAL") {
    content = (
      <FinalScreen
        views={views}
        t={running}
        mode={mode}
        ws={ws}
        holes={ws.holes}
        onHole={jumpTo}
        error={error}
        publicRounds={publicRounds}
        onVisibility={() => setSheet("visibility")}
        onMore={() => setSheet("more")}
      />
    );
    footer = (
      <BigButton onClick={() => void saveRound()} disabled={saving}>
        {saving ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Speichern…
          </>
        ) : editId ? (
          "Änderungen speichern"
        ) : (
          "Runde beenden"
        )}
      </BigButton>
    );
  } else if (step === "RESULT") {
    content = <ResultScreen result={result} pending={pending} online={online} ranking={ranking} t={running} mode={mode} holes={ws.holes} editing={Boolean(editId)} onRetry={() => void saveRound()} saving={saving} />;
    footer = result ? (
      <div className="grid grid-cols-2 gap-2">
        <BigButton variant="secondary" onClick={() => router.push(roundHref(result.roundId))}>
          Zur Runde
        </BigButton>
        <BigButton onClick={() => router.push("/member")}>Startseite</BigButton>
      </div>
    ) : (
      <BigButton variant="secondary" onClick={() => router.push("/member")}>
        Zur Startseite
      </BigButton>
    );
  }

  const holeHeader = isHoleStep(step) || step === "FRONT_NINE" || step === "FINAL";
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface-2 text-ink" data-mobile-scorecard>
      {step !== "RESULT" && (
        <header className="shrink-0 border-b border-border bg-surface pt-[env(safe-area-inset-top)]">
          <div className="flex h-14 items-center gap-1 px-1">
            <button type="button" onClick={back} aria-label="Zurück" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-ink hover:bg-surface-3">
              <ArrowLeft className="h-6 w-6" />
            </button>
            <div className="min-w-0 flex-1 text-center leading-tight">
              <p className="truncate text-[15px] font-semibold">
                {holeHeader && isHoleStep(step) ? `Loch ${cur.number} · ${pos.hole + 1}/${ws.holes}` : step === "SETUP" ? (editId ? "Runde bearbeiten" : "Runde starten") : step === "TOTAL" ? "Gesamtergebnis" : "Übersicht"}
                {started && running.played > 0 && step !== "SETUP" && step !== "TOTAL" && <span className="font-normal text-ink-3"> · {formatToPar(running.toPar)} ({running.strokes})</span>}
              </p>
              <p className="flex items-center justify-center gap-1.5 truncate text-[13px] text-ink-3">
                <span className="truncate">{courseName || "Golfplatz wählen"}</span>
                {started && syncBadge && <span aria-live="polite">· {syncBadge}</span>}
              </p>
            </div>
            <button type="button" onClick={() => (started && !editId ? setSheet("exit") : router.push(editId ? roundHref(editId) : "/member"))} aria-label="Runde verlassen" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-ink hover:bg-surface-3">
              <X className="h-6 w-6" />
            </button>
          </div>
          {showStrip && (
            <HoleStrip
              holes={views.map((v) => ({ number: v.number, status: holeStatus(v, mode), label: v.raw === "PICKUP" ? "X" : v.raw === null ? "–" : String(v.raw) }))}
              current={isHoleStep(step) ? pos.hole : null}
              onSelect={jumpTo}
              onSummary={toSummary}
              summaryActive={step === "FINAL"}
            />
          )}
          {started && !online && step !== "SETUP" && !editId && (
            <p role="status" className="flex items-center justify-center gap-1.5 bg-warning-soft px-3 py-1.5 text-sm text-ink">
              <CloudOff className="h-4 w-4 text-warning" aria-hidden /> Offline – deine Runde wird lokal gespeichert.
            </p>
          )}
        </header>
      )}

      <main className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {flash && step !== "RESULT" && step !== "FINAL" && (
          <p role="status" className="pointer-events-none fixed inset-x-0 bottom-28 z-10 mx-auto w-fit rounded-full bg-ink px-4 py-2 text-sm font-medium text-surface shadow-lg">
            {flash}
          </p>
        )}
        <div key={`${step}-${pos.hole}`} className={cn("mx-auto w-full max-w-md px-4 py-4", dir === 1 ? "animate-[hcp-step-next_180ms_ease-out]" : "animate-[hcp-step-back_180ms_ease-out]")}>
          {content}
        </div>
      </main>

      <StickyFooter>
        {showDistance && footer ? (
          <div className="flex gap-2">
            <DistanceButton view={gps.view} onOpen={() => setDistanceOpen(true)} />
            <div className="min-w-0 flex-1">{footer}</div>
          </div>
        ) : (
          footer
        )}
      </StickyFooter>

      {distanceOpen && showDistance && (
        <DistanceScreen
          view={gps.view}
          holes={distanceHoles}
          scorecardHole={scorecardHole}
          courseName={courseName ?? ""}
          onHole={chooseDistanceHole}
          onTarget={setGpsTarget}
          onActivate={gps.activate}
          onClose={() => setDistanceOpen(false)}
          watchConnected={watch.connected}
        />
      )}

      {/* ------------------------------------------------ Sheets */}
      <BottomSheet
        open={sheet === "exit"}
        onClose={() => setSheet(null)}
        title="Runde verlassen?"
        footer={
          <>
            <BigButton onClick={() => setSheet(null)}>Weiter erfassen</BigButton>
            <BigButton variant="secondary" onClick={() => void leave("draft")}>
              Als Entwurf speichern
            </BigButton>
            <BigButton variant="ghost" onClick={() => void leave("keep")}>
              Runde verlassen
            </BigButton>
          </>
        }
      >
        <p className="text-ink-2">Dein Stand bleibt erhalten – auf diesem Gerät und als Entwurf. Du kannst jederzeit weitermachen.</p>
        <button type="button" onClick={() => setSheet("discard")} className="mt-3 h-11 text-sm font-medium text-critical">
          Runde verwerfen …
        </button>
      </BottomSheet>
      <BottomSheet
        open={sheet === "discard"}
        onClose={() => setSheet(null)}
        title="Runde wirklich verwerfen?"
        footer={
          <>
            <BigButton variant="danger" onClick={() => void discard()}>
              Ja, verwerfen
            </BigButton>
            <BigButton variant="secondary" onClick={() => setSheet(null)}>
              Abbrechen
            </BigButton>
          </>
        }
      >
        <p className="text-ink-2">Alle Eingaben dieser Runde werden gelöscht.</p>
      </BottomSheet>
      <CourseSheet
        open={sheet === "course"}
        onClose={() => setSheet(null)}
        lists={lists}
        selectedId={ws.courseId}
        onChoose={(c) => {
          setCourse(c);
          const layouts = c.layouts.filter((l) => l.active);
          patch({ courseKind: "DB", courseId: c.id, courseName: c.name, layoutId: layouts.length === 1 ? layouts[0].id : null, teeColor: null, strokes: [] });
          setSheet(null);
        }}
      />
      <DetailsSheet open={sheet === "details"} onClose={() => setSheet(null)} ws={ws} patch={patch} />
      <BottomSheet open={sheet === "visibility"} onClose={() => setSheet(null)} title="Wer darf die Runde sehen?" tall footer={<BigButton onClick={() => setSheet(null)}>Fertig</BigButton>}>
        <VisibilityInSheet value={ws.visibility} onChange={(visibility) => patch({ visibility })} />
      </BottomSheet>
      <BottomSheet open={sheet === "more"} onClose={() => setSheet(null)} title="Weitere Angaben" footer={<BigButton onClick={() => setSheet(null)}>Fertig</BigButton>}>
        <div className="space-y-5">
          <Field label="Spielbedingungen (PCC)" hint="Nur ändern, wenn der Club für den Tag einen PCC-Wert veröffentlicht hat.">
            <Segmented name="PCC" value={ws.pcc} onChange={(pcc) => patch({ pcc })} options={[-1, 0, 1, 2, 3].map((v) => ({ value: v as WizardState["pcc"], label: v > 0 ? `+${v}` : String(v) }))} />
          </Field>
          <Field label="Notiz zur Runde (privat)" htmlFor="m-notes">
            <textarea id="m-notes" value={ws.notes} maxLength={500} rows={3} onChange={(e) => patch({ notes: e.target.value })} className="w-full rounded-xl border border-border-strong bg-surface px-3 py-2 text-base text-ink focus:border-brand-2 focus:outline-none focus:ring-2 focus:ring-brand-2/20" placeholder="z. B. Wetter, Flight …" />
          </Field>
        </div>
      </BottomSheet>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

function SetupScreen({
  ws,
  patch,
  course,
  layout,
  tee,
  holeInfoKnown,
  mode,
  setMode,
  errors,
  hcpi,
  onOpenCourse,
  onOpenDetails,
  editing,
}: {
  ws: WizardState;
  patch: (p: Partial<WizardState>) => void;
  course: CourseDto | null;
  layout: LayoutDto | null;
  tee: TeeOption | null;
  holeInfoKnown: boolean;
  mode: "QUICK" | "DETAILED";
  setMode: (m: EntryMode) => void;
  errors: Record<string, string>;
  hcpi: number | null;
  onOpenCourse: () => void;
  onOpenDetails: () => void;
  editing: boolean;
}) {
  const layouts = course?.layouts.filter((l) => l.active) ?? [];
  const split = ws.holes === 9 && layout !== null && layout.holesCount >= 18;
  const tees = layout ? availableTees(layout, { gender: ws.gender, holes: ws.holes, date: ws.date }).filter((t) => (split ? t.nine === (ws.nine ?? "FRONT") : true)) : [];
  const holeOptions: { value: HolesChoice; label: string }[] =
    layout && layout.holesCount < 18
      ? [
          { value: "9", label: "9 Loch" },
          { value: "18", label: "18 Loch" },
        ]
      : [
          { value: "18", label: "18 Loch" },
          { value: "FRONT", label: "Loch 1–9" },
          { value: "BACK", label: "Loch 10–18" },
        ];
  const r = tee?.ratingSet;
  return (
    <div className="space-y-5">
      {!editing && hcpi !== null && <p className="text-center text-sm text-ink-3">Dein Handicap Index: {formatHcp(hcpi)}</p>}

      <button type="button" onClick={onOpenCourse} className={cn("flex w-full items-center gap-3 rounded-2xl border-2 bg-surface p-4 text-left", errors.course ? "border-critical" : "border-border")}>
        <MapPin className="h-6 w-6 shrink-0 text-brand" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium uppercase tracking-wide text-ink-3">Golfplatz</span>
          <span className="block truncate text-lg font-semibold text-ink">{course?.name ?? "Golfplatz wählen"}</span>
        </span>
        <span className="text-sm font-medium text-brand">{course ? "ändern" : "wählen"}</span>
      </button>
      {errors.course && <p className="-mt-3 text-sm font-medium text-critical">{errors.course}</p>}
      {!editing && layoutHasGreens(layout) && (
        <p className="-mt-3 flex items-center gap-1.5 text-sm text-ink-3" data-gps-available>
          <Target className="h-4 w-4 text-brand" aria-hidden /> GPS-Entfernung zum Grün verfügbar
        </p>
      )}

      {course && layouts.length > 1 && (
        <ChoiceRow label="Platz" value={ws.layoutId} allowClear={false} onChange={(layoutId) => layoutId && patch({ layoutId, teeColor: null, strokes: [] })} options={layouts.map((l) => ({ value: l.id, label: <span className="truncate px-1 text-sm">{l.name}</span> }))} />
      )}
      {errors.layout && <p className="-mt-3 text-sm font-medium text-critical">{errors.layout}</p>}

      {layout && (
        <>
          <ChoiceRow label="Löcher" value={holesChoiceOf(ws, layout.holesCount)} allowClear={false} onChange={(c) => c && patch({ ...holesPatch(c), teeColor: null, strokes: [], holeStats: [] })} options={holeOptions} />
          <div className="space-y-2">
            <p className="text-base font-semibold text-ink">Abschlag</p>
            {tees.length === 0 ? (
              <Alert tone="warning" title={ws.holes === 9 ? "Kein 9-Loch-Rating vorhanden" : "Kein Rating vorhanden"}>
                {ws.holes === 9 ? "Für diese neun Löcher ist kein offizielles 9-Loch-Rating hinterlegt – das 18-Loch-Rating darf nicht halbiert werden." : "Für dieses Datum ist kein Rating hinterlegt."}{" "}
                <Link href="/member/rounds/new?classic=1" className="font-medium text-brand underline">
                  Werte von der Scorekarte eingeben
                </Link>
              </Alert>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {tees.map((t) => {
                  const active = ws.teeColor === t.teeColor;
                  return (
                    <button
                      key={`${t.teeColor}-${t.nine ?? ""}`}
                      type="button"
                      aria-pressed={active}
                      onClick={() => patch({ teeColor: t.teeColor })}
                      className={cn("flex h-14 items-center gap-2 rounded-2xl border-2 px-3 text-left", active ? "border-brand bg-brand-soft" : "border-border bg-surface")}
                    >
                      <span className="h-5 w-5 shrink-0 rounded-full border border-border-strong" style={{ background: TEE_SWATCH[t.teeColor] ?? "var(--surface-3)" }} aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-base font-semibold text-ink">{t.teeName ?? t.teeColor}</span>
                      {active && <Check className="h-5 w-5 shrink-0 text-brand" aria-hidden />}
                    </button>
                  );
                })}
              </div>
            )}
            {errors.tee && <p className="text-sm font-medium text-critical">{errors.tee}</p>}
          </div>
          {tee && !tee.verified && r && (
            <div className={cn("space-y-3 rounded-2xl border-2 p-4", ws.ratingConfirmed ? "border-good/40 bg-good-soft" : errors.confirm ? "border-critical bg-warning-soft" : "border-warning/50 bg-warning-soft")}>
              <p className="text-base font-semibold text-ink">{ws.ratingConfirmed ? "Werte bestätigt" : "Stimmt das mit deiner Scorekarte überein?"}</p>
              <p className="tabular text-base text-ink-2">
                Par {r.par ?? "–"} · CR {formatDecimal(r.courseRating)} · Slope {r.slopeRating ?? "–"}
              </p>
              {ws.ratingConfirmed ? (
                <button type="button" className="h-10 text-sm font-medium text-brand" onClick={() => patch({ ratingConfirmed: null })}>
                  Zurücknehmen
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <BigButton onClick={() => patch({ ratingConfirmed: { par: r.par!, courseRating: r.courseRating!, slopeRating: r.slopeRating! } })} className="h-12 text-base">
                    Ja, stimmt
                  </BigButton>
                  <Link href="/member/rounds/new?classic=1" className="flex h-12 items-center justify-center rounded-2xl border border-border-strong bg-surface text-base font-semibold text-ink">
                    Andere Werte
                  </Link>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {!editing && (
        <div className="space-y-2">
          <p className="text-base font-semibold text-ink">Wie möchtest du deine Runde erfassen?</p>
          {tee && !holeInfoKnown ? (
            <p className="rounded-2xl bg-surface p-4 text-base text-ink-2">Für diesen Platz fehlen die Lochdaten – du gibst am Ende dein Gesamtergebnis ein.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { value: "QUICK", title: "Schnell", text: "Nur Schläge" },
                  { value: "DETAILED", title: "Detailliert", text: "Schläge + Statistik" },
                ] as const
              ).map((o) => {
                const active = mode === o.value;
                return (
                  <button key={o.value} type="button" aria-pressed={active} onClick={() => setMode(o.value)} className={cn("flex min-h-20 flex-col items-start justify-center rounded-2xl border-2 px-4 py-3 text-left", active ? "border-brand bg-brand-soft" : "border-border bg-surface")}>
                    <span className="flex items-center gap-1.5 text-lg font-semibold text-ink">
                      {active && <Check className="h-5 w-5 text-brand" aria-hidden />}
                      {o.title}
                    </span>
                    <span className="text-sm text-ink-3">{o.text}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <button type="button" onClick={onOpenDetails} className="flex h-12 w-full items-center justify-between rounded-2xl bg-surface px-4 text-left text-base text-ink-2">
        <span>
          {ws.date === todayIso() ? "Heute" : formatDate(ws.date)} · {CATEGORY[ws.category]} · {ws.gender === "F" ? "Damen" : "Herren"}
        </span>
        <span className="text-sm font-medium text-brand">ändern</span>
      </button>
      {errors.date && <p className="-mt-3 text-sm font-medium text-critical">{errors.date}</p>}

      {!editing && (
        <p className="text-center text-sm text-ink-3">
          Gesamtergebnis, Stableford oder Platz nicht gefunden?{" "}
          <Link href="/member/rounds/new?classic=1" className="font-medium text-brand underline">
            Andere Eingabe
          </Link>
        </p>
      )}
    </div>
  );
}

function QuickCourseList({ lists, onPick }: { lists: MemberCourseLists | undefined; onPick: (id: string) => void }) {
  if (!lists) return null;
  const items: { course: CourseSummary; tag: string }[] = [];
  const seen = new Set<string>();
  const add = (c: CourseSummary | null, tag: string) => {
    if (c && !seen.has(c.id)) {
      seen.add(c.id);
      items.push({ course: c, tag });
    }
  };
  add(lists.home, "Heimatplatz");
  lists.recent.forEach((c) => add(c, "zuletzt gespielt"));
  lists.favorites.forEach((c) => add(c, "Favorit"));
  if (!items.length) return null;
  return (
    <div className="space-y-2">
      {items.slice(0, 6).map(({ course, tag }) => (
        <button key={course.id} type="button" onClick={() => onPick(course.id)} className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-2 text-left">
          {tag === "Heimatplatz" ? <MapPin className="h-5 w-5 shrink-0 text-brand" aria-hidden /> : <Star className="h-5 w-5 shrink-0 text-accent" aria-hidden />}
          <span className="min-w-0">
            <span className="block truncate text-base font-semibold text-ink">{course.name}</span>
            <span className="block text-sm text-ink-3">{tag}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function CourseSheet({ open, onClose, lists, selectedId, onChoose }: { open: boolean; onClose: () => void; lists: MemberCourseLists | undefined; selectedId: string | null; onChoose: (c: CourseDto) => void }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function pick(id: string) {
    setLoading(true);
    setErr(null);
    try {
      onChoose(await fetchCourse(id));
    } catch (e) {
      setErr(userMessage(e));
    } finally {
      setLoading(false);
    }
  }
  return (
    <BottomSheet open={open} onClose={onClose} title="Wo spielst du?" tall>
      <div className="space-y-4">
        {loading && <Loader2 className="mx-auto h-6 w-6 animate-spin text-ink-3" aria-label="Wird geladen" />}
        {err && <Alert tone="error">{err}</Alert>}
        <QuickCourseList lists={lists} onPick={pick} />
        <CoursePicker selectedId={selectedId} onSelect={onChoose} />
      </div>
    </BottomSheet>
  );
}

function DetailsSheet({ open, onClose, ws, patch }: { open: boolean; onClose: () => void; ws: WizardState; patch: (p: Partial<WizardState>) => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Angaben zur Runde" footer={<BigButton onClick={onClose}>Fertig</BigButton>}>
      <div className="space-y-5">
        <Field label="Datum" htmlFor="m-date">
          <Input id="m-date" type="date" value={ws.date} max={todayIso()} onChange={(e) => patch({ date: e.target.value, teeColor: null })} className="h-12 text-base" />
        </Field>
        <div className="space-y-2">
          <p className="text-base font-semibold text-ink">Was für eine Runde?</p>
          <ChoiceCards
            columns={3}
            value={ws.category}
            onChange={(category) => patch({ category })}
            options={[
              { value: "TOURNAMENT", label: "Turnier", description: "zählt fürs Handicap", icon: <Trophy className="h-4 w-4" /> },
              { value: "RPR", label: "Privatrunde", description: "vorher registriert (RPR)", icon: <Flag className="h-4 w-4" /> },
              { value: "OTHER", label: "Training", description: "zählt nicht fürs Handicap" },
            ]}
          />
        </div>
        <ChoiceRow
          label="Gespielt als"
          value={ws.gender}
          allowClear={false}
          onChange={(g) => g && patch({ gender: g, teeColor: null })}
          options={[
            { value: "M" as const, label: "Herren" },
            { value: "F" as const, label: "Damen" },
          ]}
        />
      </div>
    </BottomSheet>
  );
}

function VisibilityInSheet({ value, onChange }: { value: WizardState["visibility"]; onChange: (v: WizardState["visibility"]) => void }) {
  const community = useMyCommunity();
  return <VisibilityChooser value={value} onChange={onChange} community={community.data} onCommunity={(c) => community.setData(c)} />;
}

// ---------------------------------------------------------------------------
// Gesamtergebnis (Platz ohne Lochdaten)
// ---------------------------------------------------------------------------

function TotalScreen({ value, holes, onChange, error }: { value: string; holes: 9 | 18; onChange: (v: string) => void; error: string | null }) {
  const n = Number.parseInt(value, 10);
  const num = Number.isFinite(n) ? n : null;
  const step = (d: number) => onChange(String(Math.max(holes, Math.min(250, (num ?? (holes === 9 ? 45 : 90)) + d))));
  return (
    <div className="flex flex-col items-center gap-5 pt-4">
      <h1 className="text-2xl font-bold text-ink">Wie viele Schläge insgesamt?</h1>
      <p className="text-center text-base text-ink-3">Gewertetes Bruttoergebnis (GBE) von deiner Scorekarte, {holes} Loch.</p>
      <div className="flex items-center gap-4">
        <button type="button" onClick={() => step(-1)} aria-label="Ein Schlag weniger" className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-border bg-surface text-2xl">
          −
        </button>
        <input
          aria-label="Gesamtergebnis"
          inputMode="numeric"
          pattern="[0-9]*"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 3))}
          placeholder={holes === 9 ? "45" : "90"}
          className="tabular h-20 w-32 rounded-2xl border-2 border-border-strong bg-surface text-center text-5xl font-bold text-ink focus:border-brand-2 focus:outline-none"
        />
        <button type="button" onClick={() => step(1)} aria-label="Ein Schlag mehr" className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-border bg-surface text-2xl">
          +
        </button>
      </div>
      {error && <p className="text-base font-medium text-critical">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Zwischenstand und Übersicht
// ---------------------------------------------------------------------------

export function StatBoxes({ t, detailed, holes, withScore = true }: { t: Totals; detailed: boolean; holes: number; withScore?: boolean }) {
  const items = withScore ? [{ label: "Schläge", value: t.played ? String(t.strokes) : "–" }, { label: "zu Par", value: formatToPar(t.toPar) }] : [];
  if (detailed) {
    items.push({ label: "Putts", value: t.puttHoles ? String(t.putts) : "–" });
    items.push({ label: "GIR", value: `${t.girs}/${t.girHoles || holes}` });
    if (t.firHoles) items.push({ label: "FIR", value: `${t.firs}/${t.firHoles}` });
  }
  return (
    <dl className={cn("grid gap-2", items.length > 4 ? "grid-cols-5" : items.length === 4 ? "grid-cols-4" : items.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
      {items.map((i) => (
        <div key={i.label} className="rounded-2xl bg-surface px-1 py-3 text-center">
          <dt className="text-xs text-ink-3">{i.label}</dt>
          <dd className="tabular text-xl font-bold text-ink">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function HoleGrid({ views, onHole, offset = 0 }: { views: HoleView[]; onHole: (i: number) => void; offset?: number }) {
  return (
    <div className="grid grid-cols-9 gap-1">
      {views.map((v, i) => (
        <button key={v.number} type="button" onClick={() => onHole(i + offset)} aria-label={`Loch ${v.number} bearbeiten`} className={cn("flex h-12 flex-col items-center justify-center rounded-lg text-sm", v.raw === null ? "border border-dashed border-warning bg-surface text-ink-3" : "bg-surface text-ink")}>
          <span className="text-[11px] text-ink-3">{v.number}</span>
          <span className="tabular font-bold">{v.raw === "PICKUP" ? "X" : (v.raw ?? "–")}</span>
        </button>
      ))}
    </div>
  );
}

function RoundSummary({ title, views, t, detailed, onHole }: { title: string; views: HoleView[]; t: Totals; detailed: boolean; onHole: (i: number) => void }) {
  return (
    <div className="space-y-5 pt-2">
      <div className="text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-good" aria-hidden />
        <h1 className="mt-2 text-2xl font-bold uppercase tracking-wide text-ink">{title}</h1>
      </div>
      <StatBoxes t={t} detailed={detailed} holes={views.length} />
      <div className="space-y-1.5">
        <p className="text-sm text-ink-3">Tippe auf ein Loch, um es zu ändern.</p>
        <HoleGrid views={views} onHole={onHole} />
      </div>
    </div>
  );
}

function FinalScreen({
  views,
  t,
  mode,
  ws,
  holes,
  onHole,
  error,
  publicRounds,
  onVisibility,
  onMore,
}: {
  views: HoleView[];
  t: Totals;
  mode: EntryMode;
  ws: WizardState;
  holes: number;
  onHole: (i: number) => void;
  error: string | null;
  publicRounds: boolean;
  onVisibility: () => void;
  onMore: () => void;
}) {
  const open = views.filter((v) => v.raw === null).length;
  const gbe = Number.parseInt(ws.gbe, 10);
  return (
    <div className="space-y-5 pt-1">
      <div className="text-center">
        <h1 className="text-2xl font-bold uppercase tracking-wide text-ink">{holes === 9 ? "9 Loch geschafft" : "Runde geschafft"}</h1>
        {mode === "TOTAL" ? <p className="tabular mt-2 text-6xl font-bold text-ink">{Number.isFinite(gbe) ? gbe : "–"}</p> : <p className="tabular mt-2 text-6xl font-bold text-ink">{t.played ? t.strokes : "–"}</p>}
        {mode !== "TOTAL" && t.toPar !== null && <p className="text-xl font-semibold text-ink-2">{formatToPar(t.toPar)}</p>}
      </div>
      {mode !== "TOTAL" && (
        <>
          {mode === "DETAILED" && <StatBoxes t={t} detailed holes={holes} withScore={false} />}
          <div className="space-y-1.5">
            <p className="text-sm text-ink-3">Noch mal prüfen: Tippe auf ein Loch, um es zu ändern.</p>
            <HoleGrid views={views.slice(0, 9)} onHole={onHole} />
            {views.length > 9 && <HoleGrid views={views.slice(9)} onHole={onHole} offset={9} />}
          </div>
          {open > 0 && (
            <Alert tone="warning">
              {open} {open === 1 ? "Loch hat" : "Löcher haben"} noch kein Ergebnis. Du kannst sie ergänzen – oder so speichern; die Wertung nach WHS übernimmt das System.
            </Alert>
          )}
        </>
      )}
      <div className="divide-y divide-border overflow-hidden rounded-2xl bg-surface">
        {publicRounds && (
          <button type="button" onClick={onVisibility} className="flex min-h-14 w-full items-center justify-between px-4 text-left">
            <span className="text-base text-ink">Wer darf sie sehen?</span>
            <span className="text-sm font-medium text-brand">{VISIBILITY_LABELS[ws.visibility].label}</span>
          </button>
        )}
        <button type="button" onClick={onMore} className="flex min-h-14 w-full items-center justify-between px-4 text-left">
          <span className="text-base text-ink">Notiz, Spielbedingungen</span>
          <span className="text-sm font-medium text-brand">{ws.notes ? "Notiz ✓" : "hinzufügen"}</span>
        </button>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ergebnis (vom Backend)
// ---------------------------------------------------------------------------

function ResultScreen({
  result,
  pending,
  online,
  ranking,
  t,
  mode,
  holes,
  editing,
  onRetry,
  saving,
}: {
  result: RoundSaveResult | null;
  pending: boolean;
  online: boolean;
  ranking: MyRanking | null;
  t: Totals;
  mode: EntryMode;
  holes: number;
  editing: boolean;
  onRetry: () => void;
  saving: boolean;
}) {
  if (!result) {
    return (
      <div className="flex flex-col items-center gap-4 pt-10 text-center">
        <CloudOff className="h-12 w-12 text-warning" aria-hidden />
        <h1 className="text-2xl font-bold text-ink">Noch nicht synchronisiert</h1>
        <p className="text-base text-ink-2">Die Runde konnte noch nicht synchronisiert werden. Sie ist sicher auf deinem Gerät gespeichert{pending && !online ? " und wird übertragen, sobald du wieder online bist" : ""}.</p>
        <BigButton variant="secondary" onClick={onRetry} disabled={saving}>
          {saving ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <RefreshCw className="h-5 w-5" aria-hidden />} Erneut versuchen
        </BigButton>
      </div>
    );
  }
  const r = result;
  const delta = Math.round((r.hcpAfter - r.hcpBefore) * 10) / 10;
  const stats = r.stats;
  const gross = stats?.grossScore ?? (t.played === holes ? t.strokes : null);
  return (
    <div className="space-y-5 pt-6">
      <div className="text-center">
        <PartyPopper className="mx-auto h-10 w-10 text-accent" aria-hidden />
        <p className="mt-1 text-sm font-medium text-ink-3" role="status">
          {editing ? "Runde aktualisiert." : "Runde gespeichert."}
        </p>
        <h1 className="text-2xl font-bold uppercase tracking-wide text-ink">{holes === 9 ? "9 Loch geschafft" : "Runde geschafft"}</h1>
        <p className="tabular mt-2 text-6xl font-bold text-ink">{gross ?? r.item.adjustedGrossScore ?? "–"}</p>
        {mode !== "TOTAL" && t.toPar !== null && t.played === holes && <p className="text-xl font-semibold text-ink-2">{formatToPar(t.toPar)}</p>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-surface p-4 text-center">
          <p className="text-sm text-ink-3">Score Differential</p>
          <p className="tabular text-3xl font-bold text-ink">{formatDecimal(r.item.scoreDifferential)}</p>
          <p className="text-xs text-ink-3">{r.item.relevant ? (r.item.counted ? "zählt" : "zählt aktuell nicht") : "nicht handicaprelevant"}</p>
        </div>
        <div className="rounded-2xl bg-surface p-4 text-center">
          <p className="text-sm text-ink-3">Handicap Index</p>
          <p className="tabular text-3xl font-bold text-brand">{formatHcp(r.hcpAfter)}</p>
          <p className="text-xs text-ink-3">{r.changed ? `vorher ${formatHcp(r.hcpBefore)} (${formatSigned(delta)})` : `bleibt ${formatHcp(r.hcpBefore)}`}</p>
        </div>
      </div>
      {stats && mode === "DETAILED" && (
        <div className="space-y-2">
          <p className="text-base font-semibold text-ink">Deine Statistik</p>
          <dl className="grid grid-cols-3 gap-2">
            {[
              { label: "Putts", value: stats.totalPutts ?? "–" },
              { label: "GIR", value: stats.girHoles ? `${stats.girs}/${stats.girHoles}` : "–" },
              { label: "FIR", value: stats.fairwayOpportunities ? `${stats.firs}/${stats.fairwayOpportunities}` : "–" },
            ].map((k) => (
              <div key={k.label} className="rounded-2xl bg-surface py-3 text-center">
                <dt className="text-xs text-ink-3">{k.label}</dt>
                <dd className="tabular text-xl font-bold text-ink">{k.value}</dd>
              </div>
            ))}
          </dl>
          <Link href={`${roundHref(r.roundId)}&tab=stats`} className="inline-flex h-11 items-center text-base font-medium text-brand">
            Alle Statistiken
          </Link>
        </div>
      )}
      {mode === "QUICK" && !editing && (
        <Link href={roundStatsHref(r.roundId)} className="flex h-12 items-center justify-center rounded-2xl bg-brand-soft text-base font-semibold text-brand">
          Statistiken ergänzen
        </Link>
      )}
      {ranking?.position !== null && ranking && (
        <p className="flex items-center justify-center gap-2 text-base text-ink-2">
          <Trophy className="h-5 w-5 text-accent" aria-hidden /> Ranking: Platz {ranking.position} von {ranking.total}
        </p>
      )}
      {r.issues.length > 0 && (
        <details className="rounded-2xl bg-surface px-4 py-3 text-sm text-ink-2">
          <summary className="flex cursor-pointer items-center gap-1.5 font-medium text-ink">
            <AlertTriangle className="h-4 w-4 text-warning" aria-hidden /> Hinweise zur Berechnung
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {r.issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
