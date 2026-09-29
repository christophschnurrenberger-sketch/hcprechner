"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Database, Globe2, FileInput, Save } from "lucide-react";
import { defaultRuleSet } from "@/rules/whs/registry";
import { availableTees, holesFor, selectRatingSet, toRatingSnapshot } from "@/lib/courses/ratingSelection";
import { genderLabel, TEE_COLORS, TEE_SWATCH } from "@/lib/courses/tees";
import type { CourseDto } from "@/lib/courses/types";
import { isIsoDate, todayIso } from "@/lib/whs/dates";
import { calculateScoringRecord, handicapIndexInEffectOn } from "@/lib/whs/scoringRecord";
import type { CourseHandicapResult, EntryMode, NineSide, PccValue, RatingSnapshot } from "@/lib/whs/types";
import {
  CATEGORY_LABELS,
  ENTRY_MODE_LABELS,
  FORMAT_LABELS,
  RATING_STATUS_TEXTS,
  RESULT_STATUS_LABELS,
  SOURCE_TYPE_LABELS,
  issueText,
} from "@/lib/whs/messages";
import { newId } from "@/lib/store/localStore";
import {
  blankHoles,
  buildRound,
  countPlayed,
  draftFromRound,
  draftRating,
  emptyDraft,
  holesCountFor,
  type Draft,
  type HolesMode,
  type ManualRating,
} from "@/lib/rounds/draft";
import { cn, formatDate, formatDecimal, formatHcp, formatPcc } from "@/lib/format";
import { useHcp } from "@/components/providers/HcpStoreProvider";
import { Alert, Badge, Button, Card, CardBody, Checkbox, ChoiceCards, Field, Input, Select, Textarea } from "@/components/ui";
import { CoursePicker, fetchCourse } from "@/components/courses/CoursePicker";
import { ScorecardInput } from "@/components/rounds/ScorecardInput";
import { RoundResultSummary } from "@/components/rounds/RoundResultSummary";
import { LoadingState } from "@/components/dashboard/DashboardView";

type StepKey = "date" | "type" | "course" | "layout" | "holes" | "gender" | "tee" | "score" | "pcc" | "review";

const STEP_LABELS: Record<StepKey, string> = {
  date: "Datum",
  type: "Rundentyp",
  course: "Golfplatz",
  layout: "Platz / Layout",
  holes: "Löcher",
  gender: "Geschlecht",
  tee: "Abschlag",
  score: "Score",
  pcc: "PCC",
  review: "Prüfen & Speichern",
};

function resize<T>(arr: T[], n: number, fill: T): T[] {
  return arr.length >= n ? arr.slice(0, n) : [...arr, ...Array(n - arr.length).fill(fill)];
}

/** Übernimmt Rating-Set und Lochdaten aus der Datenbank passend zu Datum, Löchern, Geschlecht und Abschlag. */
function applyDbSelection(d: Draft, course: CourseDto | null): Draft {
  if (d.courseMode !== "DB" || !course) return d;
  const layout = course.layouts.find((l) => l.id === d.course.layoutId);
  if (!layout || !d.course.teeColor) return { ...d, dbRating: null, dbNineRatings: {} };
  const holes = holesCountFor(d);
  const sel = selectRatingSet(layout.ratingSets, {
    date: d.date,
    gender: d.gender,
    teeColor: d.course.teeColor,
    holes,
    nine: holes === 9 && layout.holesCount >= 18 ? d.nine : null,
  });
  const dbNineRatings: Draft["dbNineRatings"] = {};
  if (d.holesMode === "PARTIAL") {
    for (const side of ["FRONT", "BACK"] as NineSide[]) {
      const s = selectRatingSet(layout.ratingSets, { date: d.date, gender: d.gender, teeColor: d.course.teeColor, holes: 9, nine: side });
      if (s.status === "OK" && s.ratingSet) dbNineRatings[side] = toRatingSnapshot(s.ratingSet);
    }
  }
  const holeInfo = holesFor(layout, { gender: d.gender, teeColor: d.course.teeColor, holes, nine: holes === 9 ? d.nine : null });
  return {
    ...d,
    dbRating: sel.status === "OK" && sel.ratingSet ? toRatingSnapshot(sel.ratingSet) : null,
    dbNineRatings,
    course: { ...d.course, teeName: sel.ratingSet?.teeName ?? null },
    holeData: holeInfo ?? (d.holeData.length === holes && d.holeData.some((h) => h.par > 0) ? d.holeData : blankHoles(holes, holes === 9 && d.nine === "BACK" ? 9 : 0)),
  };
}

function ManualRatingFields({ value, onChange, holes, prefix }: { value: ManualRating; onChange: (v: ManualRating) => void; holes: 9 | 18; prefix: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label={`Course Rating (${holes} Loch)`} htmlFor={`${prefix}-cr`} hint={holes === 9 ? "z. B. 35,8" : "z. B. 72,4"}>
        <Input id={`${prefix}-cr`} inputMode="decimal" value={value.courseRating} onChange={(e) => onChange({ ...value, courseRating: e.target.value })} />
      </Field>
      <Field label="Slope Rating" htmlFor={`${prefix}-slope`} hint="55–155">
        <Input id={`${prefix}-slope`} inputMode="numeric" value={value.slopeRating} onChange={(e) => onChange({ ...value, slopeRating: e.target.value })} />
      </Field>
      <Field label="Par" htmlFor={`${prefix}-par`}>
        <Input id={`${prefix}-par`} inputMode="numeric" value={value.par} onChange={(e) => onChange({ ...value, par: e.target.value })} />
      </Field>
    </div>
  );
}

function RatingInfo({ rating }: { rating: RatingSnapshot }) {
  return (
    <div className="rounded-xl border border-brand-2/40 bg-brand-soft p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-ink">Automatisch geladen</span>
        {rating.verified ? <Badge tone="good">verifiziert</Badge> : <Badge tone="warning">nicht verifiziert</Badge>}
      </div>
      <dl className="tabular mt-2 grid grid-cols-3 gap-2">
        <div>
          <dt className="text-xs text-ink-3">Par</dt>
          <dd className="text-lg font-semibold">{rating.par ?? "–"}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3">Course Rating</dt>
          <dd className="text-lg font-semibold">{formatDecimal(rating.courseRating)}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3">Slope</dt>
          <dd className="text-lg font-semibold">{rating.slopeRating ?? "–"}</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-ink-2">
        Datenquelle: {rating.sourceType ? SOURCE_TYPE_LABELS[rating.sourceType] ?? rating.sourceType : "–"}
        {rating.sourceUrl && (
          <>
            {" "}
            (<a className="underline" href={rating.sourceUrl} target="_blank" rel="noreferrer">Quelle öffnen</a>)
          </>
        )}{" "}
        · Zuletzt geprüft: {formatDate(rating.checkedAt)}
        {rating.validFrom && <> · gültig ab {formatDate(rating.validFrom)}</>}
      </p>
    </div>
  );
}

export function RoundWizard({ editId }: { editId?: string | null }) {
  const router = useRouter();
  const { ready, profile, rounds, saveRound } = useHcp();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [course, setCourse] = useState<CourseDto | null>(null);
  const [courseError, setCourseError] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [missingEdit, setMissingEdit] = useState(false);

  // Initialisieren (neu oder Bearbeiten)
  useEffect(() => {
    if (!ready || draft) return;
    if (editId) {
      const existing = rounds.find((r) => r.id === editId);
      if (!existing) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMissingEdit(true);
        return;
      }
      const d = draftFromRound(existing);
      setDraft(d);
      if (d.courseMode === "DB" && d.course.courseId) {
        fetchCourse(d.course.courseId).then(setCourse).catch(() => setCourseError("Die Anlage ist in der Datenbank nicht mehr verfügbar – die gespeicherten Ratingwerte der Runde bleiben erhalten."));
      }
    } else {
      setDraft(emptyDraft(profile, newId()));
    }
  }, [ready, editId, rounds, profile, draft]);

  const others = useMemo(() => rounds.filter((r) => r.id !== draft?.id), [rounds, draft?.id]);
  const baseResult = useMemo(() => calculateScoringRecord(profile, others), [profile, others]);
  const startHI = draft && isIsoDate(draft.date) ? handicapIndexInEffectOn(baseResult, draft.date) : profile.startHandicapIndex;

  const update = (patch: Partial<Draft> | ((d: Draft) => Partial<Draft>), reselect = false) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...(typeof patch === "function" ? patch(prev) : patch) };
      return reselect ? applyDbSelection(next, course) : next;
    });
  };

  const layout = course?.layouts.find((l) => l.id === draft?.course.layoutId) ?? null;

  const steps: StepKey[] = useMemo(() => {
    if (!draft) return [];
    const list: StepKey[] = ["date", "type", "course"];
    if (draft.courseMode === "DB") list.push("layout");
    list.push("holes");
    if (draft.courseMode !== "NONE") list.push("gender", "tee");
    list.push("score");
    if (draft.courseMode !== "NONE") list.push("pcc");
    list.push("review");
    return list;
  }, [draft]);

  const preview = useMemo(() => {
    if (!draft) return null;
    const round = buildRound(draft);
    const result = calculateScoringRecord(profile, [...others, round]);
    return { round, result, roundResult: result.rounds.find((r) => r.roundId === round.id) ?? null };
  }, [draft, profile, others]);

  // Vorgabenschläge zur Anzeige in der Scorekarte
  const scorecardStrokes = useMemo(() => {
    if (!draft) return null;
    const rating = draftRating(draft);
    const holes = holesCountFor(draft);
    if (rating.courseRating == null || rating.slopeRating == null || rating.par == null) return null;
    try {
      const ch: CourseHandicapResult =
        holes === 9
          ? defaultRuleSet.calculateNineHoleCourseHandicap({ handicapIndex: startHI, courseRating: rating.courseRating, slopeRating: rating.slopeRating, par: rating.par })
          : defaultRuleSet.calculateCourseHandicap({ handicapIndex: startHI, courseRating: rating.courseRating, slopeRating: rating.slopeRating, par: rating.par });
      const holeData = draft.holeData.slice(0, holes);
      if (holeData.some((h) => h.strokeIndex === null)) return { ch, strokes: null };
      return { ch, strokes: defaultRuleSet.allocateStrokes(ch.rounded, holeData) };
    } catch {
      return null;
    }
  }, [draft, startHI]);

  if (!ready) return <LoadingState />;
  if (missingEdit) return <Alert tone="error" title="Runde nicht gefunden">Die zu bearbeitende Runde existiert nicht (mehr).</Alert>;
  if (!draft) return <LoadingState />;

  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const holes = holesCountFor(draft);
  const rating = draftRating(draft);
  const ratingComplete = rating.courseRating != null && rating.slopeRating != null && rating.par != null;

  const dbSelection =
    draft.courseMode === "DB" && layout && draft.course.teeColor
      ? selectRatingSet(layout.ratingSets, {
          date: draft.date,
          gender: draft.gender,
          teeColor: draft.course.teeColor,
          holes,
          nine: holes === 9 && layout.holesCount >= 18 ? draft.nine : null,
        })
      : null;

  const canProceed = (key: StepKey): string | null => {
    switch (key) {
      case "date":
        if (!isIsoDate(draft.date)) return "Bitte ein gültiges Datum eingeben.";
        return null;
      case "course":
        if (draft.courseMode === "DB" && !draft.course.courseId) return "Bitte eine Anlage auswählen.";
        if (draft.courseMode === "MANUAL" && !draft.course.courseName.trim()) return "Bitte den Namen der Golfanlage eingeben.";
        return null;
      case "layout":
        return draft.course.layoutId ? null : "Bitte einen Platz auswählen.";
      case "holes":
        if (holes === 9 && draft.courseMode === "DB" && layout && layout.holesCount >= 18 && !draft.nine) return "Bitte Front Nine oder Back Nine wählen.";
        if (holes === 9 && draft.courseMode === "MANUAL" && !draft.nine) return null;
        return null;
      case "tee":
        if (draft.courseMode === "DB" && !draft.useManualRating) {
          if (!draft.course.teeColor) return "Bitte einen Abschlag wählen.";
          if (!draft.dbRating) return RATING_STATUS_TEXTS[dbSelection?.status ?? "NO_RATING_FOR_TEE"];
        }
        if ((draft.courseMode === "MANUAL" || draft.useManualRating) && !ratingComplete) {
          return "Bitte Course Rating, Slope Rating und Par eingeben.";
        }
        return null;
      case "score": {
        const mode = draft.courseMode === "NONE" ? "SCORE_DIFFERENTIAL" : draft.entryMode;
        if (mode === "AGS" && !draft.ags.trim()) return "Bitte das GBE eingeben.";
        if (mode === "SCORE_DIFFERENTIAL" && !draft.scoreDifferential.trim()) return "Bitte das Score Differential eingeben.";
        if (mode === "STABLEFORD_TOTAL" && !draft.stablefordTotal.trim()) return "Bitte die Gesamtpunkte eingeben.";
        return null;
      }
      default:
        return null;
    }
  };

  const blocker = canProceed(step);
  const goNext = () => {
    if (blocker) return;
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const goBack = () => setStepIndex((i) => Math.max(0, i - 1));

  const save = () => {
    if (!preview) return;
    saveRound(preview.round);
    router.push(`/runden/${encodeURIComponent(preview.round.id)}?gespeichert=1`);
  };

  const entryModes: { value: EntryMode; label: string; description: string; disabled?: boolean }[] = [
    { value: "AGS", label: ENTRY_MODE_LABELS.AGS, description: "Schnellerfassung: GBE direkt eingeben.", disabled: draft.holesMode === "PARTIAL" },
    { value: "HOLE_BY_HOLE", label: ENTRY_MODE_LABELS.HOLE_BY_HOLE, description: "Schläge je Loch – GBE wird mit Netto-Doppelbogey berechnet." },
    { value: "STABLEFORD_HOLES", label: ENTRY_MODE_LABELS.STABLEFORD_HOLES, description: "Punkte je Loch – daraus wird das GBE abgeleitet.", disabled: draft.holesMode === "PARTIAL" },
    { value: "STABLEFORD_TOTAL", label: ENTRY_MODE_LABELS.STABLEFORD_TOTAL, description: "Nur eindeutig, wenn mit 100 % Course Handicap gewertet.", disabled: draft.holesMode === "PARTIAL" },
    { value: "SCORE_DIFFERENTIAL", label: ENTRY_MODE_LABELS.SCORE_DIFFERENTIAL, description: "Wert aus dem offiziellen DGV-Scoring-Record übernehmen.", disabled: draft.holesMode === "PARTIAL" },
  ];

  const onHolesMode = (mode: HolesMode) =>
    update((d) => {
      const n = mode === 9 ? 9 : 18;
      return {
        holesMode: mode,
        nine: mode === 9 ? d.nine : null,
        entryMode: mode === "PARTIAL" ? "HOLE_BY_HOLE" : d.entryMode,
        holeData: d.holeData.length === n ? d.holeData : blankHoles(n),
        holeScores: resize(d.holeScores, n, null),
        stablefordPoints: resize(d.stablefordPoints, n, null),
      };
    }, true);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
      {/* Fortschritt */}
      <nav aria-label="Schritte" className="no-print">
        <ol className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:gap-0.5">
          {steps.map((s, i) => {
            const done = i < stepIndex;
            const active = i === stepIndex;
            return (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => i <= stepIndex && setStepIndex(i)}
                  disabled={i > stepIndex}
                  className={cn(
                    "flex w-full items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-left text-sm",
                    active ? "bg-brand-soft font-semibold text-brand" : done ? "text-ink-2 hover:bg-surface-3" : "text-ink-3",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                      active ? "bg-brand text-white dark:text-[#0d1510]" : done ? "bg-brand-soft-2 text-brand" : "bg-surface-3 text-ink-3",
                    )}
                  >
                    {done ? <Check className="h-3 w-3" /> : i + 1}
                  </span>
                  {STEP_LABELS[s]}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <Card>
        <CardBody className="space-y-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold">
              Schritt {stepIndex + 1}: {STEP_LABELS[step]}
            </h2>
            <span className="text-xs text-ink-3">
              HCPI am Spieltag: <strong className="tabular text-ink">{formatHcp(startHI)}</strong>
            </span>
          </div>

          {step === "date" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Datum" htmlFor="w-date" hint="Maßgeblich für den Start-HCPI und das gültige Rating.">
                <Input id="w-date" type="date" value={draft.date} max="2100-12-31" onChange={(e) => update({ date: e.target.value }, true)} />
              </Field>
              <Field label="Turniername / Rundentitel" htmlFor="w-title">
                <Input id="w-title" value={draft.title} placeholder="z. B. Monatspreis September" onChange={(e) => update({ title: e.target.value })} />
              </Field>
              {draft.date > todayIso() && (
                <Alert tone="warning" className="sm:col-span-2">
                  Das Datum liegt in der Zukunft. Für Planspiele eignet sich der HCP-Simulator.
                </Alert>
              )}
            </div>
          )}

          {step === "type" && (
            <div className="space-y-5">
              <Field label="Rundentyp">
                <ChoiceCards
                  value={draft.category}
                  onChange={(v) => update({ category: v })}
                  options={[
                    { value: "TOURNAMENT", label: CATEGORY_LABELS.TOURNAMENT, description: "Handicap-relevant ausgeschriebenes Wettspiel." },
                    { value: "RPR", label: CATEGORY_LABELS.RPR, description: "Vorab registrierte Privatrunde (9 oder 18 Löcher)." },
                    { value: "OTHER", label: CATEGORY_LABELS.OTHER, description: "Nicht handicap-relevant – nur für Statistik." },
                  ]}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Spielform">
                  <Select value={draft.format} onChange={(e) => update({ format: e.target.value as Draft["format"] })}>
                    {Object.entries(FORMAT_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Ergebnisart" hint={RESULT_STATUS_LABELS[draft.resultStatus].description}>
                  <Select value={draft.resultStatus} onChange={(e) => update({ resultStatus: e.target.value as Draft["resultStatus"] })}>
                    {Object.entries(RESULT_STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.short !== "–" ? `${v.short} – ` : ""}
                        {v.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </div>
          )}

          {step === "course" && (
            <div className="space-y-4">
              <ChoiceCards
                value={draft.courseMode}
                onChange={(v) => update({ courseMode: v, useManualRating: false })}
                options={[
                  { value: "DB", label: "Golfplatz-Datenbank", description: "Par, CR und Slope werden automatisch geladen.", icon: <Database className="h-4 w-4" /> },
                  { value: "MANUAL", label: "Manuell / Ausland", description: "Anlage und Rating von der offiziellen Scorekarte eingeben.", icon: <Globe2 className="h-4 w-4" /> },
                  { value: "NONE", label: "Nur Score Differential", description: "Ergebnis aus dem offiziellen Scoring Record übernehmen.", icon: <FileInput className="h-4 w-4" /> },
                ]}
              />
              {draft.courseMode === "DB" && (
                <>
                  {draft.course.courseId && (
                    <p className="text-sm">
                      Ausgewählt: <strong>{draft.course.courseName}</strong>
                      {draft.course.city && <> · {draft.course.city}</>}
                    </p>
                  )}
                  {courseError && <Alert tone="warning">{courseError}</Alert>}
                  <CoursePicker
                    selectedId={draft.course.courseId ?? null}
                    onSelect={(c) => {
                      setCourse(c);
                      const active = c.layouts.filter((l) => l.active);
                      setDraft((d) =>
                        d
                          ? applyDbSelection(
                              {
                                ...d,
                                course: {
                                  ...d.course,
                                  courseId: c.id,
                                  courseName: c.name,
                                  city: c.city,
                                  region: c.region,
                                  country: c.country,
                                  layoutId: active.length === 1 ? active[0].id : null,
                                  layoutName: active.length === 1 ? active[0].name : null,
                                  teeColor: null,
                                },
                                dbRating: null,
                              },
                              c,
                            )
                          : d,
                      );
                    }}
                  />
                </>
              )}
              {draft.courseMode === "MANUAL" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Golfanlage" htmlFor="w-cname">
                    <Input id="w-cname" value={draft.course.courseName} onChange={(e) => update((d) => ({ course: { ...d.course, courseName: e.target.value, courseId: null, layoutId: null } }))} />
                  </Field>
                  <Field label="Platz / Layout (optional)" htmlFor="w-lname">
                    <Input id="w-lname" value={draft.course.layoutName ?? ""} onChange={(e) => update((d) => ({ course: { ...d.course, layoutName: e.target.value } }))} />
                  </Field>
                  <Field label="Ort (optional)" htmlFor="w-city">
                    <Input id="w-city" value={draft.course.city ?? ""} onChange={(e) => update((d) => ({ course: { ...d.course, city: e.target.value } }))} />
                  </Field>
                  <Field label="Land" htmlFor="w-country" hint="ISO-Code, z. B. DE, AT, CH, ES">
                    <Input id="w-country" maxLength={2} value={draft.course.country} onChange={(e) => update((d) => ({ course: { ...d.course, country: e.target.value.toUpperCase() } }))} />
                  </Field>
                </div>
              )}
              {draft.courseMode === "NONE" && (
                <Field label="Golfanlage (optional, für die Übersicht)" htmlFor="w-cname2">
                  <Input id="w-cname2" value={draft.course.courseName} onChange={(e) => update((d) => ({ course: { ...d.course, courseName: e.target.value } }))} />
                </Field>
              )}
            </div>
          )}

          {step === "layout" && (
            <div className="space-y-3">
              {!course ? (
                <Alert tone="warning">Anlage wird geladen oder ist nicht verfügbar.</Alert>
              ) : course.layouts.filter((l) => l.active).length === 0 ? (
                <Alert tone="warning" title="Für diese Anlage sind noch keine Plätze hinterlegt">
                  Bitte „Manuell / Ausland“ wählen und das Rating von der offiziellen Scorekarte übernehmen.
                </Alert>
              ) : (
                <ChoiceCards
                  value={draft.course.layoutId ?? null}
                  columns={2}
                  onChange={(id) => {
                    const l = course.layouts.find((x) => x.id === id)!;
                    update(
                      (d) => ({
                        course: { ...d.course, layoutId: l.id, layoutName: l.name, teeColor: null },
                        holesMode: l.holesCount === 9 && d.holesMode === "PARTIAL" ? 9 : d.holesMode,
                      }),
                      true,
                    );
                  }}
                  options={course.layouts
                    .filter((l) => l.active)
                    .map((l) => ({
                      value: l.id,
                      label: l.name,
                      description: `${l.holesCount} Löcher${l.combinationName ? ` · ${l.combinationName}` : ""} · ${l.ratingSets.filter((s) => s.active && s.verified).length} verifizierte Ratings`,
                    }))}
                />
              )}
            </div>
          )}

          {step === "holes" && (
            <div className="space-y-4">
              <ChoiceCards
                value={draft.holesMode}
                onChange={onHolesMode}
                options={[
                  { value: 18, label: "18 Löcher", description: "Vollständige 18-Loch-Runde." },
                  { value: 9, label: "9 Löcher", description: "9-Loch-Runde mit offiziellem 9-Loch-Rating; ergänzt um das erwartete Differential." },
                  {
                    value: "PARTIAL",
                    label: "10–17 Löcher",
                    description: "Abgebrochene 18-Loch-Runde (eigene Berechnung, nur mit Scorekarte).",
                    disabled: draft.courseMode === "NONE" || (layout !== null && layout.holesCount < 18),
                  },
                ]}
              />
              {holes === 9 && draft.courseMode !== "NONE" && (!layout || layout.holesCount >= 18) && (
                <Field label="Welche neun Löcher?" hint="Bei 18-Loch-Plätzen haben Front und Back Nine eigene 9-Loch-Ratings.">
                  <ChoiceCards
                    value={draft.nine}
                    columns={2}
                    onChange={(v) => update(() => ({ nine: v, holeData: blankHoles(9, v === "BACK" ? 9 : 0) }), true)}
                    options={[
                      { value: "FRONT" as NineSide, label: "Front Nine (1–9)" },
                      { value: "BACK" as NineSide, label: "Back Nine (10–18)" },
                    ]}
                  />
                </Field>
              )}
              {draft.holesMode === "PARTIAL" && (
                <Alert tone="info">
                  Bei 10–13 gespielten Löchern werden die vollständig gespielten neun Löcher mit ihrem offiziellen 9-Loch-Rating gewertet und um
                  das erwartete Differential ergänzt. Ab 14 Löchern werden nicht gespielte Löcher mit Netto-Par gewertet.
                </Alert>
              )}
            </div>
          )}

          {step === "gender" && (
            <ChoiceCards
              value={draft.gender}
              columns={2}
              onChange={(g) => update({ gender: g }, true)}
              options={[
                { value: "M", label: "Herren", description: "Ratings für Herren" },
                { value: "F", label: "Damen", description: "Ratings für Damen" },
              ]}
            />
          )}

          {step === "tee" && (
            <div className="space-y-4">
              {draft.courseMode === "DB" && layout && !draft.useManualRating && (
                <>
                  {(() => {
                    const tees = availableTees(layout, { gender: draft.gender, holes, date: draft.date }).filter(
                      (t) => holes === 18 || layout.holesCount < 18 || t.nine === draft.nine,
                    );
                    if (tees.length === 0) {
                      return (
                        <Alert tone="warning" title="Keine Ratingdaten">
                          Für {genderLabel(draft.gender)} · {holes} Loch{holes === 9 && draft.nine ? ` (${draft.nine === "FRONT" ? "Front" : "Back"} Nine)` : ""} sind auf diesem Platz keine
                          Rating-Sets hinterlegt.{" "}
                          {holes === 9 && "Für eine WHS-konforme 9-Loch-Berechnung wird ein gültiges 9-Loch-Rating benötigt – es wird nicht aus dem 18-Loch-Rating abgeleitet."}
                        </Alert>
                      );
                    }
                    return (
                      <ChoiceCards
                        value={draft.course.teeColor ?? null}
                        columns={3}
                        onChange={(tee) => update((d) => ({ course: { ...d.course, teeColor: tee } }), true)}
                        options={tees.map((t) => ({
                          value: t.teeColor,
                          label: (
                            <span className="flex items-center gap-2">
                              <span className="inline-block h-3.5 w-3.5 rounded-full border border-border-strong" style={{ background: TEE_SWATCH[t.teeColor] ?? "#ccc" }} aria-hidden />
                              {t.teeColor}
                              {t.teeName && <span className="font-normal text-ink-3">({t.teeName})</span>}
                            </span>
                          ),
                          description: t.verified
                            ? `CR ${formatDecimal(t.ratingSet.courseRating)} · Slope ${t.ratingSet.slopeRating ?? "–"} · Par ${t.ratingSet.par ?? "–"}`
                            : "Keine verifizierten WHS-Ratingdaten",
                        }))}
                      />
                    );
                  })()}
                  {dbSelection && dbSelection.status !== "OK" && <Alert tone="warning">{RATING_STATUS_TEXTS[dbSelection.status]}</Alert>}
                  {draft.dbRating && <RatingInfo rating={draft.dbRating} />}
                  {draft.holesMode === "PARTIAL" && (
                    <p className="text-xs text-ink-3">
                      9-Loch-Ratings für die Hochrechnung (10–13 Löcher): Front {draft.dbNineRatings.FRONT ? "✓" : "–"} · Back {draft.dbNineRatings.BACK ? "✓" : "–"}
                    </p>
                  )}
                </>
              )}
              {draft.courseMode === "DB" && (
                <Checkbox
                  checked={draft.useManualRating}
                  onChange={(v) => update({ useManualRating: v })}
                  label="Rating selbst von der offiziellen Scorekarte eingeben"
                  description="Nur verwenden, wenn in der Datenbank kein verifiziertes Rating vorliegt. Die Werte werden als manuelle Eingabe gekennzeichnet."
                />
              )}
              {(draft.courseMode === "MANUAL" || draft.useManualRating) && (
                <div className="space-y-4">
                  <Field label="Abschlag">
                    <div className="flex flex-wrap gap-2">
                      {TEE_COLORS.slice(0, 7).map((t) => (
                        <Button key={t} size="sm" variant={draft.course.teeColor === t ? "primary" : "secondary"} onClick={() => update((d) => ({ course: { ...d.course, teeColor: t } }))}>
                          <span className="inline-block h-3 w-3 rounded-full border border-border-strong" style={{ background: TEE_SWATCH[t] }} aria-hidden />
                          {t}
                        </Button>
                      ))}
                    </div>
                  </Field>
                  <ManualRatingFields value={draft.manualRating} onChange={(v) => update({ manualRating: v })} holes={holes} prefix="m" />
                  {holes === 9 && (
                    <Alert tone="info">Bitte das offizielle 9-Loch-Rating eintragen – nicht die Hälfte des 18-Loch-Ratings.</Alert>
                  )}
                  {draft.holesMode === "PARTIAL" && (
                    <details className="rounded-lg border border-border p-3">
                      <summary className="cursor-pointer text-sm font-medium">9-Loch-Ratings für die Hochrechnung (nur bei 10–13 gespielten Löchern nötig)</summary>
                      <div className="mt-3 space-y-3">
                        <p className="text-xs font-semibold text-ink-3">Front Nine</p>
                        <ManualRatingFields value={draft.manualNineRatings.FRONT} onChange={(v) => update((d) => ({ manualNineRatings: { ...d.manualNineRatings, FRONT: v } }))} holes={9} prefix="mf" />
                        <p className="text-xs font-semibold text-ink-3">Back Nine</p>
                        <ManualRatingFields value={draft.manualNineRatings.BACK} onChange={(v) => update((d) => ({ manualNineRatings: { ...d.manualNineRatings, BACK: v } }))} holes={9} prefix="mb" />
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>
          )}

          {step === "score" && (
            <div className="space-y-4">
              {draft.courseMode !== "NONE" && (
                <Field label="Eingabeart">
                  <ChoiceCards value={draft.entryMode} onChange={(v) => update({ entryMode: v })} options={entryModes} columns={3} />
                </Field>
              )}
              {(draft.courseMode === "NONE" || draft.entryMode === "SCORE_DIFFERENTIAL") && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Score Differential" htmlFor="w-sd" hint="Wie im offiziellen Scoring Record angegeben (18-Loch-Wert).">
                    <Input id="w-sd" inputMode="decimal" value={draft.scoreDifferential} onChange={(e) => update({ scoreDifferential: e.target.value })} />
                  </Field>
                  <Field
                    label="Offizieller HCPI nach dieser Runde (optional)"
                    htmlFor="w-off"
                    hint="Übernimmt den offiziellen Verlauf, falls ältere Ergebnisse fehlen."
                  >
                    <Input id="w-off" inputMode="decimal" value={draft.officialHandicapIndexAfter} onChange={(e) => update({ officialHandicapIndexAfter: e.target.value })} />
                  </Field>
                  <div className="sm:col-span-2">
                    <Checkbox
                      checked={draft.suppressEsr}
                      onChange={(v) => update({ suppressEsr: v })}
                      label="Keine automatische ESR-Prüfung für dieses Ergebnis"
                      description="Aktivieren, wenn der übernommene Wert bereits ein angepasstes Differential ist."
                    />
                  </div>
                </div>
              )}
              {draft.courseMode !== "NONE" && draft.entryMode === "AGS" && (
                <Field label={`Gewertetes Bruttoergebnis (GBE, ${holes} Löcher)`} htmlFor="w-ags" hint="Summe der gewerteten Lochscores (max. Netto-Doppelbogey je Loch).">
                  <Input id="w-ags" inputMode="numeric" className="h-12 max-w-40 text-lg" value={draft.ags} onChange={(e) => update({ ags: e.target.value })} />
                </Field>
              )}
              {draft.courseMode !== "NONE" && (draft.entryMode === "HOLE_BY_HOLE" || draft.entryMode === "STABLEFORD_HOLES") && (
                <>
                  {scorecardStrokes && (
                    <p className="text-sm text-ink-2">
                      Course Handicap ({holes} Loch): <strong>{scorecardStrokes.ch.rounded}</strong>{" "}
                      <span className="text-ink-3">(HCPI {formatHcp(startHI)} am Spieltag)</span>
                      {!scorecardStrokes.strokes && <span className="text-warning"> · Stroke Index fehlt für die Schlagverteilung</span>}
                    </p>
                  )}
                  {draft.entryMode === "STABLEFORD_HOLES" && (
                    <Field label="Playing Handicap der Stablefordwertung (optional)" htmlFor="w-ph" hint="Leer = entspricht dem Course Handicap (100 %).">
                      <Input id="w-ph" inputMode="numeric" className="max-w-32" value={draft.stablefordPlayingHandicap} onChange={(e) => update({ stablefordPlayingHandicap: e.target.value })} />
                    </Field>
                  )}
                  <ScorecardInput
                    holes={draft.holeData.slice(0, holes)}
                    onHolesChange={(h) => update({ holeData: h })}
                    scores={draft.holeScores.slice(0, holes)}
                    onScoresChange={(s) => update({ holeScores: s })}
                    points={draft.stablefordPoints.slice(0, holes)}
                    onPointsChange={(p) => update({ stablefordPoints: p })}
                    mode={draft.entryMode === "STABLEFORD_HOLES" ? "stableford" : "strokes"}
                    strokesReceived={scorecardStrokes?.strokes ?? null}
                    allowNotPlayed={draft.holesMode === "PARTIAL"}
                    editableHoleData={draft.courseMode !== "DB" || draft.holeData.some((h) => h.par === 0 || h.strokeIndex === null) || !layout || layout.holes.length === 0}
                  />
                  {draft.holesMode === "PARTIAL" && (
                    <p className="text-sm text-ink-2">
                      Gespielte Löcher: <strong>{countPlayed(draft.holeScores.slice(0, 18))}</strong>
                    </p>
                  )}
                </>
              )}
              {draft.courseMode !== "NONE" && draft.entryMode === "STABLEFORD_TOTAL" && (
                <div className="space-y-3">
                  <Field label="Stableford-Gesamtpunkte" htmlFor="w-stb">
                    <Input id="w-stb" inputMode="numeric" className="max-w-32" value={draft.stablefordTotal} onChange={(e) => update({ stablefordTotal: e.target.value })} />
                  </Field>
                  <Checkbox
                    checked={draft.stablefordFullAllowance}
                    onChange={(v) => update({ stablefordFullAllowance: v })}
                    label="Die Punkte wurden mit 100 % des Course Handicaps (Playing Handicap = Course Handicap) ermittelt"
                    description="Nur dann ist das GBE eindeutig: GBE = Par + Course Handicap + 2 × Löcher − Punkte. Andernfalls bitte Lochscores oder GBE eingeben."
                  />
                </div>
              )}
            </div>
          )}

          {step === "pcc" && (
            <div className="space-y-3">
              <Field
                label="PCC (Playing Conditions Calculation / CR-Korrektur)"
                info="Der PCC wird nach dem Spieltag vom System veröffentlicht (−1 bis +3). Für 9-Loch-Runden wird er nach DGV-Tabelle halbiert."
              >
                <div className="flex flex-wrap gap-2">
                  {([-1, 0, 1, 2, 3] as PccValue[]).map((p) => (
                    <Button key={p} variant={draft.pcc === p ? "primary" : "secondary"} onClick={() => update({ pcc: p })} className="min-w-14">
                      {formatPcc(p)}
                    </Button>
                  ))}
                </div>
              </Field>
              {holes === 9 && draft.pcc !== 0 && (
                <p className="text-sm text-ink-2">
                  Für diese 9-Loch-Runde wird PCC <strong>{formatPcc(defaultRuleSet.nineHolePcc(draft.pcc))}</strong> verwendet.
                </p>
              )}
            </div>
          )}

          {step === "review" && preview && (
            <div className="space-y-4">
              {preview.roundResult && <RoundResultSummary round={preview.round} result={preview.roundResult} />}
              <Field label="Notizen (optional)" htmlFor="w-notes">
                <Textarea id="w-notes" value={draft.notes} onChange={(e) => update({ notes: e.target.value })} />
              </Field>
              {preview.roundResult?.issues.some((i) => i.severity === "error") && (
                <Alert tone="warning" title="Diese Runde kann nicht berechnet werden">
                  Sie kann trotzdem gespeichert werden, fließt aber nicht in den Scoring Record ein:{" "}
                  {preview.roundResult.issues.filter((i) => i.severity === "error").map(issueText).join(" ")}
                </Alert>
              )}
            </div>
          )}

          {blocker && step !== "review" && <p className="text-sm font-medium text-warning">{blocker}</p>}

          <div className="flex justify-between gap-3 border-t border-border pt-4">
            <Button variant="secondary" onClick={goBack} disabled={stepIndex === 0}>
              <ChevronLeft className="h-4 w-4" /> Zurück
            </Button>
            {step === "review" ? (
              <Button onClick={save}>
                <Save className="h-4 w-4" /> {draft.isNew ? "Runde speichern" : "Änderungen speichern"}
              </Button>
            ) : (
              <Button onClick={goNext} disabled={Boolean(blocker)}>
                Weiter <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
