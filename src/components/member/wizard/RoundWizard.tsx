"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, BarChart3, Check, CheckCircle2, Globe2, Loader2, MapPin, PenLine, Star, Trophy, UserRound, Users } from "lucide-react";
import { api } from "@/lib/api/client";
import { ApiError, userMessage } from "@/lib/api/errors";
import type { MemberCourseLists, RoundInput, RoundPreview, RoundSaveResult } from "@/lib/api/types";
import { fetchCourse } from "@/lib/courses/client";
import { availableTees, holesFor, type TeeOption } from "@/lib/courses/ratingSelection";
import { adminCoursePath } from "@/lib/courses/paths";
import { TEE_SWATCH, genderLabel } from "@/lib/courses/tees";
import type { CourseDto, LayoutDto } from "@/lib/courses/types";
import type { CourseSummary } from "@/lib/courses/summary";
import { cn, formatDate, formatDecimal, formatHcp } from "@/lib/format";
import { alignToHoles, hasAnyStat, holeNumbersFor } from "@/lib/stats/holeStats";
import type { RoundStatistics } from "@/lib/stats/types";
import { useApi } from "@/lib/useApi";
import { Alert, Button, ChoiceCards, Field, Input, Segmented } from "@/components/ui";
import { useSession } from "@/components/session/SessionProvider";
import { Spinner, useToast } from "@/components/ui/feedback";
import { CoursePicker } from "@/components/courses/CoursePicker";
import { ChangeBadge } from "@/components/member/HcpHero";
import { roundHref, roundStatsHref } from "@/components/member/RoundList";
import { useMyCommunity, usePublicRoundsEnabled, VisibilityChooser } from "@/components/community/Visibility";
import { DetailedHoleInput } from "@/components/stats/DetailedHoleInput";
import { formatPercent } from "@/components/stats/StatsUi";
import { HoleByHoleInput } from "./HoleByHoleInput";
import { STEPS, applyPatch, draftLabel, holesChoiceOf, holesPatch, stepErrors, toRoundInput, type HolesChoice, type Step, type WizardState } from "./wizardState";

// ---------------------------------------------------------------------------
// Kleine Bausteine
// ---------------------------------------------------------------------------

function StepIndicator({ step }: { step: Step }) {
  const index = STEPS.findIndex((s) => s.key === step);
  return (
    <ol className="flex items-center gap-2" aria-label="Fortschritt">
      {STEPS.map((s, i) => (
        <li key={s.key} className="flex flex-1 flex-col gap-1.5" aria-current={i === index ? "step" : undefined}>
          <span className={cn("h-1.5 rounded-full", i <= index ? "bg-brand" : "bg-surface-3")} />
          <span className={cn("text-[11px] font-medium", i === index ? "text-ink" : "text-ink-3")}>{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

function Question({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {hint && <p className="mt-0.5 text-sm text-ink-3">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function TeeSwatch({ color }: { color: string }) {
  return <span className="inline-block h-4 w-4 shrink-0 rounded-full border border-border-strong" style={{ background: TEE_SWATCH[color] ?? "var(--surface-3)" }} aria-hidden />;
}

function QuickCourses({ lists, onPick }: { lists: MemberCourseLists | undefined; onPick: (id: string) => void }) {
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
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-ink-2">Schnellauswahl</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.slice(0, 6).map(({ course, tag }) => (
          <button key={course.id} type="button" onClick={() => onPick(course.id)} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 text-left hover:border-border-strong">
            {tag === "Heimatplatz" ? <MapPin className="h-4 w-4 shrink-0 text-brand" aria-hidden /> : <Star className="h-4 w-4 shrink-0 text-accent" aria-hidden />}
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-ink">{course.name}</span>
              <span className="block text-xs text-ink-3">{tag}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Der im Wizard gewählte Abschlag (Rating-Set passend zu Geschlecht, Löchern, Hälfte und Datum). */
function selectedTeeOf(layout: LayoutDto | null, s: WizardState): TeeOption | null {
  if (!layout || !s.teeColor) return null;
  const splitNine = s.holes === 9 && layout.holesCount >= 18;
  return (
    availableTees(layout, { gender: s.gender, holes: s.holes, date: s.date }).find((t) => t.teeColor === s.teeColor && (!splitNine || t.nine === (s.nine ?? "FRONT"))) ?? null
  );
}

/** Ungeprüftes Rating: Werte anzeigen und vom Spieler mit der Scorekarte bestätigen lassen. */
function ConfirmRating({ tee, state, update, onManual, error }: { tee: TeeOption; state: WizardState; update: (p: Partial<WizardState>) => void; onManual: () => void; error?: string }) {
  const r = tee.ratingSet;
  const values = [
    { label: "Par", value: String(r.par ?? "–") },
    { label: "Course Rating", value: formatDecimal(r.courseRating) },
    { label: "Slope", value: String(r.slopeRating ?? "–") },
  ];
  if (state.ratingConfirmed) {
    return (
      <Alert tone="success" title="Werte bestätigt">
        Du hast Par {values[0].value}, Course Rating {values[1].value} und Slope {values[2].value} mit deiner Scorekarte verglichen.{" "}
        <button type="button" className="font-medium text-brand hover:underline" onClick={() => update({ ratingConfirmed: null })}>
          Zurücknehmen
        </button>
      </Alert>
    );
  }
  return (
    <div className="space-y-3 rounded-2xl border border-warning/40 bg-warning-soft/60 p-4" role="group" aria-labelledby="confirm-rating-title">
      <div>
        <p id="confirm-rating-title" className="font-semibold text-ink">Stimmen diese Werte mit deiner Scorekarte überein?</p>
        <p className="mt-0.5 text-sm text-ink-2">Dieses Rating ist noch nicht geprüft. Vergleiche es kurz mit der Scorekarte deines Abschlags.</p>
      </div>
      <dl className="grid grid-cols-3 gap-2">
        {values.map((v) => (
          <div key={v.label} className="rounded-xl bg-surface px-3 py-2 text-center">
            <dt className="text-xs text-ink-3">{v.label}</dt>
            <dd className="tabular text-lg font-semibold text-ink">{v.value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={() => update({ ratingConfirmed: { par: r.par!, courseRating: r.courseRating!, slopeRating: r.slopeRating! } })}>
          <Check className="h-4 w-4" aria-hidden /> Ja, Werte stimmen
        </Button>
        <Button variant="secondary" onClick={onManual}>
          Nein, andere Werte eingeben
        </Button>
      </div>
      {error && <p className="text-sm font-medium text-critical">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Schritt: Platz
// ---------------------------------------------------------------------------

function CourseStep({
  state,
  update,
  course,
  setCourse,
  lists,
  errors,
}: {
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
  course: CourseDto | null;
  setCourse: (c: CourseDto | null) => void;
  lists: MemberCourseLists | undefined;
  errors: Record<string, string>;
}) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { can } = useSession();

  async function pickById(id: string) {
    setLoadingId(id);
    setLoadError(null);
    try {
      choose(await fetchCourse(id));
    } catch (error) {
      setLoadError(userMessage(error instanceof ApiError ? error : new ApiError("NETWORK")));
    } finally {
      setLoadingId(null);
    }
  }

  function choose(c: CourseDto) {
    setCourse(c);
    const layouts = c.layouts.filter((l) => l.active);
    update({ courseKind: "DB", courseId: c.id, courseName: c.name, layoutId: layouts.length === 1 ? layouts[0].id : null, teeColor: null });
  }

  function toManual(prefill = false) {
    update({
      courseKind: "MANUAL",
      courseId: null,
      layoutId: null,
      teeColor: null,
      manual: prefill && course ? { ...state.manual, courseName: course.name, city: course.city ?? "", teeColor: state.teeColor ?? "", par: "", courseRating: "", slopeRating: "" } : state.manual,
      scoreMode: state.scoreMode === "HOLES" ? "GBE" : state.scoreMode,
    });
    setCourse(null);
  }

  if (state.courseKind === "MANUAL") {
    const m = state.manual;
    const setM = (key: keyof typeof m) => (e: React.ChangeEvent<HTMLInputElement>) => update({ manual: { ...m, [key]: e.target.value } });
    return (
      <Question title="Platz manuell eingeben" hint="Übernimm Par, Course Rating und Slope genau von der offiziellen Scorekarte deines Abschlags.">
        <div className="space-y-4 rounded-2xl border border-border bg-surface p-4">
          <Field label="Golfplatz" htmlFor="m-name" error={errors.courseName}>
            <Input id="m-name" value={m.courseName} onChange={setM("courseName")} placeholder="z. B. Golfclub Beispiel" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ort (optional)" htmlFor="m-city">
              <Input id="m-city" value={m.city} onChange={setM("city")} />
            </Field>
            <Field label="Abschlag (optional)" htmlFor="m-tee">
              <Input id="m-tee" value={m.teeColor} onChange={setM("teeColor")} placeholder="z. B. Gelb" />
            </Field>
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium text-ink">Gespielt als</p>
            <Segmented name="Geschlecht" value={state.gender} onChange={(gender) => update({ gender })} options={[{ value: "M", label: "Herren" }, { value: "F", label: "Damen" }]} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Par" htmlFor="m-par" error={errors.par}>
              <Input id="m-par" inputMode="numeric" value={m.par} onChange={setM("par")} placeholder="72" />
            </Field>
            <Field label="Course Rating" htmlFor="m-cr" error={errors.courseRating}>
              <Input id="m-cr" inputMode="decimal" value={m.courseRating} onChange={setM("courseRating")} placeholder="71,8" />
            </Field>
            <Field label="Slope" htmlFor="m-slope" error={errors.slopeRating}>
              <Input id="m-slope" inputMode="numeric" value={m.slopeRating} onChange={setM("slopeRating")} placeholder="135" />
            </Field>
          </div>
          {state.holes === 9 && <Alert tone="info">Bei 9 Loch bitte das offizielle 9-Loch-Rating von der Scorekarte eingeben – nicht den halben 18-Loch-Wert.</Alert>}
        </div>
        <button type="button" onClick={() => update({ courseKind: "DB" })} className="text-sm font-medium text-brand hover:underline">
          Doch aus der Golfplatzdatenbank wählen
        </button>
      </Question>
    );
  }

  if (!course) {
    return (
      <Question title="Wo hast du gespielt?" hint="Suche nach Club, Ort oder Postleitzahl.">
        {loadingId && <Spinner />}
        {loadError && <Alert tone="error">{loadError}</Alert>}
        <QuickCourses lists={lists} onPick={pickById} />
        <CoursePicker selectedId={state.courseId} onSelect={choose} />
        {errors.course && <p className="text-sm font-medium text-critical">{errors.course}</p>}
        <button type="button" onClick={() => toManual()} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline">
          <Globe2 className="h-4 w-4" aria-hidden /> Platz nicht gefunden oder im Ausland? Manuell eingeben
        </button>
      </Question>
    );
  }

  const layouts = course.layouts.filter((l) => l.active);
  const layout: LayoutDto | null = layouts.find((l) => l.id === state.layoutId) ?? null;
  const splitNine = state.holes === 9 && layout !== null && layout.holesCount >= 18;
  const tees = layout
    ? availableTees(layout, { gender: state.gender, holes: state.holes, date: state.date }).filter((t) => (state.holes === 9 && splitNine ? t.nine === (state.nine ?? "FRONT") : true))
    : [];
  const selectedTee = selectedTeeOf(layout, state);
  const holeOptions: { value: HolesChoice; label: string }[] =
    layout && layout.holesCount >= 18
      ? [
          { value: "18", label: "18 Loch" },
          { value: "FRONT", label: "Loch 1–9" },
          { value: "BACK", label: "Loch 10–18" },
        ]
      : [
          { value: "9", label: "9 Loch" },
          { value: "18", label: "18 Loch" },
        ];
  const anyEighteen = layout ? availableTees(layout, { gender: state.gender, holes: 18, date: state.date }).length > 0 : false;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-brand-2/40 bg-brand-soft/60 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{course.name}</p>
          <p className="text-xs text-ink-3">{[course.postalCode, course.city].filter(Boolean).join(" ")}</p>
        </div>
        <button type="button" onClick={() => { setCourse(null); update({ courseId: null, courseName: null, layoutId: null, teeColor: null }); }} className="text-sm font-medium text-brand hover:underline">
          ändern
        </button>
      </div>

      {layouts.length > 1 && (
        <Question title="Welcher Platz?">
          <ChoiceCards
            columns={2}
            value={state.layoutId}
            onChange={(layoutId) => update({ layoutId, teeColor: null })}
            options={layouts.map((l) => ({ value: l.id, label: l.name, description: `${l.holesCount} Löcher${l.combinationName ? ` · ${l.combinationName}` : ""}` }))}
          />
          {errors.layout && <p className="text-sm font-medium text-critical">{errors.layout}</p>}
        </Question>
      )}

      {layout && (
        <>
          <Question title="Gespielte Löcher">
            <Segmented name="Gespielte Löcher" value={holesChoiceOf(state, layout.holesCount)} onChange={(choice) => update({ ...holesPatch(choice), teeColor: null, strokes: [] })} options={holeOptions} />
          </Question>
          <Question title="Gespielt als">
            <Segmented name="Geschlecht" value={state.gender} onChange={(gender) => update({ gender, teeColor: null })} options={[{ value: "M", label: "Herren" }, { value: "F", label: "Damen" }]} />
          </Question>
          <Question title="Von welchem Abschlag?" hint="Es werden nur Abschläge angezeigt, für die ein Rating hinterlegt ist.">
            {tees.length === 0 ? (
              <Alert tone="warning" title={state.holes === 9 ? "Kein 9-Loch-Rating vorhanden" : "Kein Rating vorhanden"}>
                {state.holes === 9 && anyEighteen
                  ? "Für diese neun Löcher ist noch kein offizielles 9-Loch-Rating hinterlegt. Clubs veröffentlichen es meist in ihrer Vorgabentabelle (Loch 1–9 bzw. 10–18). Das 18-Loch-Rating darf nicht halbiert werden."
                  : `Für ${genderLabel(state.gender)} ist für dieses Datum kein Rating hinterlegt.`}
                <div className="mt-2 flex flex-wrap gap-3">
                  {state.holes === 9 && anyEighteen && (
                    <button type="button" className="font-medium text-brand hover:underline" onClick={() => update({ holes: 18, nine: null, teeColor: null })}>
                      18 Loch wählen
                    </button>
                  )}
                  <button type="button" className="font-medium text-brand hover:underline" onClick={() => toManual(true)}>
                    Werte von der Scorekarte eingeben
                  </button>
                  {can("courses.write") && (
                    <Link href={adminCoursePath(course.id)} className="font-medium text-brand hover:underline">
                      Rating im Admin-Bereich ergänzen
                    </Link>
                  )}
                </div>
              </Alert>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {tees.map((t) => {
                  const active = state.teeColor === t.teeColor;
                  return (
                    <button
                      key={`${t.teeColor}-${t.nine ?? ""}`}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => update({ teeColor: t.teeColor })}
                      className={cn("flex items-center gap-3 rounded-xl border p-3 text-left", active ? "border-brand-2 bg-brand-soft ring-1 ring-brand-2" : "border-border bg-surface hover:border-border-strong")}
                    >
                      <TeeSwatch color={t.teeColor} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-ink">{t.teeName ?? t.teeColor}</span>
                        <span className="tabular block text-xs text-ink-3">
                          CR {formatDecimal(t.ratingSet.courseRating)} · Slope {t.ratingSet.slopeRating ?? "–"} · Par {t.ratingSet.par ?? "–"}
                        </span>
                      </span>
                      {!t.verified && <span className="rounded-md bg-warning-soft px-1.5 py-0.5 text-[11px] font-medium text-warning">ungeprüft</span>}
                      {active && <Check className="h-4 w-4 text-brand" aria-hidden />}
                    </button>
                  );
                })}
              </div>
            )}
            {errors.tee && <p className="text-sm font-medium text-critical">{errors.tee}</p>}
            {selectedTee && !selectedTee.verified && <ConfirmRating tee={selectedTee} state={state} update={update} onManual={() => toManual(true)} error={errors.confirm} />}
          </Question>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lochstatistik (optional)
// ---------------------------------------------------------------------------

function DetailToggle({ checked, onChange, removing }: { checked: boolean; onChange: (v: boolean) => void; removing: boolean }) {
  return (
    <div className="space-y-2">
      <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3", checked ? "border-brand-2 bg-brand-soft/60" : "border-border bg-surface hover:border-border-strong")}>
        <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[var(--brand)]" />
        <span>
          <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <BarChart3 className="h-4 w-4 text-brand" aria-hidden /> Runde detailliert tracken
          </span>
          <span className="mt-0.5 block text-xs leading-relaxed text-ink-3">Putts, Fairways, Grüns, Bunker und Strafschläge je Loch – für deine Statistik. Ändert dein Handicap nicht und lässt sich auch später ergänzen.</span>
        </span>
      </label>
      {removing && <p className="text-sm text-warning">Die bisher erfasste Lochstatistik wird beim Speichern entfernt.</p>}
    </div>
  );
}

function StatsPreview({ stats }: { stats: RoundStatistics }) {
  const items = [
    { label: "Putts", value: stats.totalPutts ?? "–" },
    { label: "GIR", value: formatPercent(stats.girPercentage) },
    { label: "Fairways", value: formatPercent(stats.firPercentage) },
  ];
  return (
    <dl className="grid grid-cols-3 gap-2">
      {items.map((k) => (
        <div key={k.label} className="rounded-xl bg-surface-2 py-2 text-center">
          <dt className="text-xs text-ink-3">{k.label}</dt>
          <dd className="tabular text-lg font-semibold text-ink">{k.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------------------------------------------------------------------------
// Schritt: Prüfen (Vorschau vom Backend)
// ---------------------------------------------------------------------------

function ReviewStep({ input, editId, state, update, onFix }: { input: RoundInput; editId: string | null; state: WizardState; update: (p: Partial<WizardState>) => void; onFix: (step: Step, manual?: boolean) => void }) {
  // Die Sichtbarkeit beeinflusst die Berechnung nicht – ein Wechsel löst keine neue Vorschau aus.
  const previewInput: RoundInput = { ...input, visibility: undefined };
  const key = JSON.stringify(previewInput);
  const preview = useApi<RoundPreview>(() => api.member.previewRound(previewInput, editId ?? undefined), key);
  const error = preview.error;
  const p = preview.data;
  const publicRounds = usePublicRoundsEnabled();
  const community = useMyCommunity();
  const statsError = error instanceof ApiError && error.code === "VALIDATION" && Boolean(error.fields?.holeStats);

  return (
    <div className="space-y-5">
      <Question title="Dein Ergebnis" hint="So wirkt sich die Runde aus. Gespeichert wird erst im nächsten Schritt.">
        {preview.loading && !p && (
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface p-6 text-sm text-ink-3">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Wird berechnet …
          </div>
        )}
        {error && statsError ? (
          <Alert tone="error" title="Bitte die Lochstatistik prüfen">
            {userMessage(error)}
            <div className="mt-2">
              <button type="button" className="font-medium text-brand hover:underline" onClick={() => onFix("score")}>
                Statistik korrigieren
              </button>
            </div>
          </Alert>
        ) : error ? (
          <Alert tone="error" title="So kann die Runde nicht berechnet werden">
            {userMessage(error)}
            <div className="mt-2 flex flex-wrap gap-3">
              {error instanceof ApiError && (error.code === "RATING_NOT_VERIFIED" || error.code === "RATING_CHANGED" || error.code === "COURSE_RATING_MISSING" || error.code === "NINE_HOLE_RATING_MISSING") && (
                <button type="button" className="font-medium text-brand hover:underline" onClick={() => onFix("course", true)}>
                  Werte von der Scorekarte eingeben
                </button>
              )}
              {error instanceof ApiError && error.code === "HOLE_DATA_MISSING" && (
                <button type="button" className="font-medium text-brand hover:underline" onClick={() => { update({ scoreMode: "GBE" }); onFix("score"); }}>
                  Gesamtergebnis eingeben
                </button>
              )}
              <button type="button" className="font-medium text-brand hover:underline" onClick={() => onFix("course")}>
                Angaben ändern
              </button>
            </div>
          </Alert>
        ) : p ? (
          <div className={cn("overflow-hidden rounded-2xl border border-border bg-surface", preview.loading && "opacity-60")}>
            <div className="grid grid-cols-2 divide-x divide-border">
              <div className="p-4 text-center sm:p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-3">Score Differential</p>
                <p className="tabular mt-1 text-4xl font-semibold text-ink">{formatDecimal(p.item.scoreDifferential)}</p>
                <p className="tabular mt-1 text-xs text-ink-3">GBE {p.item.adjustedGrossScore ?? "–"}</p>
              </div>
              <div className="p-4 text-center sm:p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-3">Handicap Index</p>
                <p className="tabular mt-1 text-4xl font-semibold text-brand">{formatHcp(p.hcpAfter)}</p>
                <p className="mt-1 flex items-center justify-center gap-1.5 text-xs text-ink-3">
                  vorher {formatHcp(p.hcpBefore)} <ChangeBadge delta={Math.round((p.hcpAfter - p.hcpBefore) * 10) / 10} className="text-xs" />
                </p>
              </div>
            </div>
            <div className="space-y-2 border-t border-border p-4 text-sm">
              <p className="flex items-center gap-2">
                {p.item.relevant ? <CheckCircle2 className="h-4 w-4 text-good" aria-hidden /> : <span className="h-4 w-4 rounded-full border border-border-strong" aria-hidden />}
                {p.item.relevant ? (p.item.counted ? "Zählt für deinen Handicap Index" : `Handicaprelevant – ${p.item.note ?? "zählt aktuell nicht zu den besten Ergebnissen"}`) : "Nicht handicaprelevant"}
              </p>
              {state.holes === 9 && p.result.scoreDifferential?.expectedDifferential !== undefined && (
                <p className="text-ink-3">9-Loch-Runde: ergänzt um ein erwartetes Ergebnis von {formatDecimal(p.result.scoreDifferential.expectedDifferential)} für die anderen neun Löcher.</p>
              )}
              {p.issues.length > 0 && (
                <ul className="list-disc space-y-1 pl-5 text-ink-2">
                  {p.issues.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </Question>

      {p && (p.stats || p.statsWarnings.length > 0) && (
        <Question title="Deine Statistik" hint="Nur für dich – beeinflusst das Handicap nicht.">
          {p.stats && state.detailed && <StatsPreview stats={p.stats} />}
          {p.statsWarnings.length > 0 && (
            <Alert tone="warning">
              <ul className="list-disc space-y-0.5 pl-4">
                {p.statsWarnings.slice(0, 6).map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
              {state.detailed && (
                <button type="button" className="mt-1 font-medium text-brand hover:underline" onClick={() => onFix("score")}>
                  Statistik ansehen
                </button>
              )}
            </Alert>
          )}
        </Question>
      )}

      {publicRounds && (
        <Question title="Wer darf diese Runde sehen?" hint="Notizen bleiben privat. Du kannst das später in der Rundenansicht ändern.">
          <VisibilityChooser value={state.visibility} onChange={(visibility) => update({ visibility })} community={community.data} onCommunity={(c) => community.setData(c)} />
        </Question>
      )}

      <details className="group rounded-2xl border border-border bg-surface">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">Weitere Angaben (PCC, Notiz)</summary>
        <div className="space-y-4 px-4 pb-4">
          <Field label="Spielbedingungen (PCC)" hint="Nur ändern, wenn der Club für den Tag einen PCC-Wert veröffentlicht hat.">
            <Segmented name="PCC" size="sm" value={state.pcc} onChange={(pcc) => update({ pcc })} options={[-1, 0, 1, 2, 3].map((v) => ({ value: v as WizardState["pcc"], label: v > 0 ? `+${v}` : String(v) }))} />
          </Field>
          <Field label="Notiz (optional, privat)" htmlFor="notes">
            <Input id="notes" value={state.notes} onChange={(e) => update({ notes: e.target.value })} maxLength={500} placeholder="z. B. Wetter, Flight …" />
          </Field>
        </div>
      </details>
      {p?.blocking && <Alert tone="error">Diese Runde kann so nicht gespeichert werden. Bitte prüfe die Angaben.</Alert>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ergebnis nach dem Speichern
// ---------------------------------------------------------------------------

function SavedView({ result, editing }: { result: RoundSaveResult; editing: boolean }) {
  const delta = Math.round((result.hcpAfter - result.hcpBefore) * 10) / 10;
  return (
    <div className="mx-auto max-w-lg space-y-5 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-good-soft">
        <CheckCircle2 className="h-9 w-9 text-good" aria-hidden />
      </div>
      <div>
        <h1 className="text-2xl font-semibold text-ink">{editing ? "Runde aktualisiert" : "Runde gespeichert"}</h1>
        <p className="mt-1 text-sm text-ink-3">
          {result.item.courseName} · {formatDate(result.item.date)}
        </p>
      </div>
      <div className="rounded-3xl border border-border bg-surface p-6">
        <p className="text-sm font-medium text-ink-3">Dein Handicap Index</p>
        <p className="tabular mt-1 text-6xl font-semibold text-brand">{formatHcp(result.hcpAfter)}</p>
        <p className="mt-2 flex items-center justify-center gap-2 text-sm text-ink-2">
          vorher {formatHcp(result.hcpBefore)} <ChangeBadge delta={delta} />
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-surface-2 py-3">
            <p className="text-xs text-ink-3">Score Differential</p>
            <p className="tabular text-xl font-semibold">{formatDecimal(result.item.scoreDifferential)}</p>
          </div>
          <div className="rounded-xl bg-surface-2 py-3">
            <p className="text-xs text-ink-3">zählt</p>
            <p className="text-xl font-semibold">{result.item.counted ? "ja" : "nein"}</p>
          </div>
        </div>
        {!result.changed && <p className="mt-4 text-sm text-ink-3">{result.item.relevant ? "Dein Handicap Index bleibt unverändert – die Runde gehört nicht zu deinen besten Ergebnissen." : "Diese Runde ist nicht handicaprelevant."}</p>}
      </div>
      {result.stats ? (
        <div className="space-y-3 rounded-3xl border border-border bg-surface p-5 text-left">
          <p className="text-sm font-medium text-ink">Deine Statistik</p>
          <StatsPreview stats={result.stats} />
          <Link href={`${roundHref(result.roundId)}&tab=stats`} className="text-sm font-medium text-brand hover:underline">
            Ganze Statistik ansehen
          </Link>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border-strong bg-surface p-5">
          <p className="font-semibold text-ink">Möchtest du diese Runde detailliert tracken?</p>
          <p className="text-sm text-ink-3">Putts, Grüns und Fairways je Loch ergänzen – dein Handicap bleibt unverändert.</p>
          <Link href={roundStatsHref(result.roundId)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-soft px-4 text-sm font-semibold text-brand hover:bg-brand-soft-2">
            <BarChart3 className="h-4 w-4" aria-hidden /> Statistiken ergänzen
          </Link>
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Link href={roundHref(result.roundId)} className="inline-flex h-11 items-center justify-center rounded-xl border border-border-strong px-5 font-medium text-ink hover:bg-surface-2">
          Details ansehen
        </Link>
        <Link href="/member" className="inline-flex h-11 items-center justify-center rounded-xl bg-brand px-5 font-semibold text-white hover:bg-brand-hover dark:text-[#0d1510]">
          Zum Dashboard
        </Link>
      </div>
      {!editing && (
        <a href="" className="text-sm font-medium text-brand hover:underline" onClick={(e) => { e.preventDefault(); window.location.assign(window.location.pathname); }}>
          Weitere Runde erfassen
        </a>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wizard
// ---------------------------------------------------------------------------

export interface WizardProps {
  initial: WizardState;
  initialCourse: CourseDto | null;
  editId: string | null;
  draftId: string;
  lists: MemberCourseLists | undefined;
}

/**
 * „+ Runde erfassen“: eine Frage pro Schritt, große Bedienelemente, automatische Entwürfe.
 * Die Vorschau („Dein Ergebnis“) und die Speicherung berechnet das Backend.
 */
export function RoundWizard({ initial, initialCourse, editId, draftId, lists }: WizardProps) {
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = useState<WizardState>(initial);
  const [course, setCourse] = useState<CourseDto | null>(initialCourse);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<RoundSaveResult | null>(null);
  const [draftSaved, setDraftSaved] = useState<string | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const update = (patch: Partial<WizardState>) => setState((s) => applyPatch(s, patch));
  const index = STEPS.findIndex((s) => s.key === state.step);

  // Lochdaten des gewählten Abschlags (für die Loch-für-Loch-Eingabe)
  const layout = course?.layouts.find((l) => l.id === state.layoutId) ?? null;
  const holeInfo = useMemo(
    () => (state.courseKind === "DB" && layout && state.teeColor ? holesFor(layout, { gender: state.gender, teeColor: state.teeColor, holes: state.holes, nine: state.holes === 9 && layout.holesCount >= 18 ? state.nine ?? "FRONT" : null }) : null),
    [state.courseKind, layout, state.teeColor, state.gender, state.holes, state.nine],
  );

  // Lochstatistik: immer passend zu den gespielten Löchern (Par/Handicap aus den Platzdaten, falls vorhanden)
  const statsBase = useMemo(
    () =>
      holeInfo
        ? holeInfo.map((h) => ({ number: h.number, par: h.par, strokeIndex: h.strokeIndex ?? null }))
        : holeNumbersFor(state.holes, state.holes === 9 ? state.nine : null).map((n) => ({ number: n, par: null, strokeIndex: null })),
    [holeInfo, state.holes, state.nine],
  );
  const holeStats = useMemo(() => alignToHoles(state.holeStats, statsBase), [state.holeStats, statsBase]);
  const aligned: WizardState = { ...state, holeStats };
  const [hadStats] = useState(() => initial.holeStats.some((h) => hasAnyStat(h)));

  // Entwurf automatisch speichern (nur neue Runden)
  const progressed = !editId && !saved && (state.step !== "basics" || state.courseId !== null || state.manual.courseName !== "");
  useEffect(() => {
    if (!progressed) return;
    const timer = setTimeout(() => {
      api.member
        .saveDraft({ id: draftId, label: draftLabel(state), input: { wizard: state, step: state.step } })
        .then(() => setDraftSaved(new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })))
        .catch(() => undefined);
    }, 1200);
    return () => clearTimeout(timer);
  }, [state, progressed, draftId]);

  function go(step: Step) {
    setErrors({});
    setSaveError(null);
    update({ step });
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function next() {
    const e = stepErrors(aligned, state.step);
    if (state.step === "course" && state.courseKind === "DB" && !e.tee) {
      const tee = selectedTeeOf(layout, state);
      if (tee && !tee.verified && !state.ratingConfirmed) e.confirm = "Bitte bestätige die Werte oder gib sie von der Scorekarte ein.";
    }
    if (Object.keys(e).length > 0) {
      setErrors(e);
      return;
    }
    if (state.step === "course" && state.scoreMode === "HOLES" && !holeInfo) update({ scoreMode: "GBE" });
    if (state.step === "score" && state.scoreMode === "HOLES" && state.strokes.length !== state.holes) update({ strokes: Array(state.holes).fill(null) });
    go(STEPS[index + 1].key);
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const input = toRoundInput(aligned);
      const result = editId ? await api.member.updateRound(editId, input) : await api.member.createRound(input, draftId);
      setSaved(result);
      toast(editId ? "Runde aktualisiert." : "Runde gespeichert.");
      window.scrollTo({ top: 0 });
    } catch (error) {
      setSaveError(userMessage(error));
    } finally {
      setSaving(false);
    }
  }

  if (saved) return <SavedView result={saved} editing={Boolean(editId)} />;

  const input = state.step === "review" ? toRoundInput(aligned) : null;
  const strokes = state.strokes.length === state.holes ? state.strokes : Array(state.holes).fill(null);

  return (
    <div ref={topRef} className="mx-auto max-w-2xl scroll-mt-20 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => (index > 0 ? go(STEPS[index - 1].key) : router.push(editId ? roundHref(editId) : "/member"))} className="inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink">
          <ArrowLeft className="h-4 w-4" aria-hidden /> {index > 0 ? "Zurück" : "Abbrechen"}
        </button>
        <p className="text-sm font-semibold text-ink">{editId ? "Runde bearbeiten" : "Runde erfassen"}</p>
        <span className="w-16 text-right text-[11px] text-ink-3">{draftSaved ? `gesichert ${draftSaved}` : ""}</span>
      </div>
      <StepIndicator step={state.step} />

      {state.step === "basics" && (
        <div className="space-y-6">
          <Question title="Wie viele Löcher hast du gespielt?">
            <ChoiceCards
              columns={2}
              value={state.holes}
              onChange={(holes) => update({ holes, nine: holes === 9 ? state.nine ?? "FRONT" : null, teeColor: null, strokes: [] })}
              options={[
                { value: 18, label: "18 Loch", description: "Ganze Runde" },
                { value: 9, label: "9 Loch", description: "Vordere oder hintere neun – Auswahl beim Platz" },
              ]}
            />
            {state.holes === 9 && <p className="text-sm text-ink-3">9-Loch-Runden werden mit einem erwarteten Ergebnis zu einem 18-Loch-Wert ergänzt. Dafür braucht der Platz ein offizielles 9-Loch-Rating.</p>}
          </Question>
          <Question title="Wann hast du gespielt?">
            <Input type="date" value={state.date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => update({ date: e.target.value, teeColor: null })} aria-label="Spieldatum" className="h-12 text-base" />
            {errors.date && <p className="text-sm font-medium text-critical">{errors.date}</p>}
          </Question>
          <Question title="Was für eine Runde?" hint="Nur Turniere und vorher angemeldete Privatrunden zählen fürs Handicap.">
            <ChoiceCards
              value={state.category}
              onChange={(category) => update({ category })}
              options={[
                { value: "TOURNAMENT", label: "Turnier", description: "Vorgabewirksames Wettspiel", icon: <Trophy className="h-4 w-4" /> },
                { value: "RPR", label: "Privatrunde", description: "Vorher im Club registriert (RPR)", icon: <Users className="h-4 w-4" /> },
                { value: "OTHER", label: "Sonstige", description: "Training, zählt nicht fürs Handicap", icon: <UserRound className="h-4 w-4" /> },
              ]}
            />
          </Question>
        </div>
      )}

      {state.step === "course" && <CourseStep state={state} update={update} course={course} setCourse={setCourse} lists={lists} errors={errors} />}

      {state.step === "score" && (
        <div className="space-y-6">
          <Question title="Wie willst du dein Ergebnis eingeben?">
            <ChoiceCards
              columns={3}
              value={state.scoreMode}
              onChange={(scoreMode) => update({ scoreMode, strokes: scoreMode === "HOLES" && state.strokes.length !== state.holes ? Array(state.holes).fill(null) : state.strokes })}
              options={[
                { value: "GBE", label: "Gesamtergebnis", description: "Dein GBE von der Scorekarte", icon: <PenLine className="h-4 w-4" /> },
                { value: "HOLES", label: "Loch für Loch", description: holeInfo ? "Schläge je Loch eintippen" : "Für diesen Platz fehlen die Lochdaten", disabled: !holeInfo },
                { value: "STABLEFORD_TOTAL", label: "Stableford", description: "Nettopunkte mit voller Vorgabe" },
              ]}
            />
          </Question>
          {state.scoreMode === "GBE" && (
            <Field label="Gewertetes Bruttoergebnis (GBE)" htmlFor="gbe" hint="Schlagzahl nach Begrenzung auf Netto-Doppelbogey – steht meist auf der Scorekarte." error={errors.gbe}>
              <Input id="gbe" inputMode="numeric" value={state.gbe} onChange={(e) => update({ gbe: e.target.value })} className="tabular h-14 max-w-[10rem] text-2xl font-semibold" placeholder={state.holes === 9 ? "45" : "90"} autoFocus />
            </Field>
          )}
          {state.scoreMode === "HOLES" && holeInfo && !state.detailed && (
            <>
              <HoleByHoleInput holes={holeInfo} scores={strokes} onChange={(next) => update({ strokes: next })} />
              {errors.strokes && <p className="text-sm font-medium text-critical">{errors.strokes}</p>}
            </>
          )}
          {state.scoreMode === "STABLEFORD_TOTAL" && (
            <Field label="Stableford-Nettopunkte" htmlFor="stb" hint="Mit voller Spielvorgabe gespielt." error={errors.stableford}>
              <Input id="stb" inputMode="numeric" value={state.stableford} onChange={(e) => update({ stableford: e.target.value })} className="tabular h-14 max-w-[10rem] text-2xl font-semibold" placeholder="36" />
            </Field>
          )}
          <DetailToggle checked={state.detailed} onChange={(detailed) => update({ detailed })} removing={Boolean(editId) && hadStats && !state.detailed} />
          {state.detailed && (
            <section className="space-y-3" aria-label="Lochstatistik">
              {state.scoreMode !== "HOLES" && <p className="text-sm text-ink-3">Die Schläge je Loch dienen hier nur der Statistik – fürs Handicap zählt dein Gesamtergebnis.</p>}
              {!holeInfo && <Alert tone="info">Für diesen Platz fehlen die Lochdaten. Wähle das Par je Loch – es dient nur der Statistik.</Alert>}
              <DetailedHoleInput
                stats={holeStats}
                onChange={(next) => update({ holeStats: next })}
                strokes={state.scoreMode === "HOLES" && holeInfo ? strokes : undefined}
                onStrokes={state.scoreMode === "HOLES" && holeInfo ? (next) => update({ strokes: next }) : undefined}
                parEditable={!holeInfo}
              />
              {state.scoreMode === "HOLES" && errors.strokes && <p className="text-sm font-medium text-critical">{errors.strokes}</p>}
              {errors.stats && <p className="text-sm font-medium text-critical">{errors.stats}</p>}
            </section>
          )}
        </div>
      )}

      {state.step === "review" && input && <ReviewStep input={input} editId={editId} state={state} update={update} onFix={(step, manual) => { if (manual) { update({ courseKind: "MANUAL", manual: { ...state.manual, courseName: course?.name ?? state.manual.courseName, city: course?.city ?? state.manual.city, teeColor: state.teeColor ?? state.manual.teeColor }, courseId: null, layoutId: null, scoreMode: state.scoreMode === "HOLES" ? "GBE" : state.scoreMode }); setCourse(null); } go(step); }} />}

      {saveError && <Alert tone="error">{saveError}</Alert>}

      <div className="sticky bottom-0 -mx-4 border-t border-border bg-surface-2/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        {state.step !== "review" ? (
          <Button size="lg" className="w-full sm:w-auto" onClick={next}>
            Weiter <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        ) : (
          <Button size="lg" className="w-full sm:w-auto" onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {editId ? "Änderungen speichern" : "Runde speichern"}
          </Button>
        )}
      </div>
    </div>
  );
}
