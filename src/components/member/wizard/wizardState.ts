/**
 * Zustand des Runden-Wizards und Umwandlung in die API-Eingabe (RoundInput).
 * Hier wird nur die Eingabe zusammengestellt und auf Vollständigkeit geprüft – berechnet wird im Backend.
 */
import type { ConfirmedRating, RoundInput } from "@/lib/api/types";
import type { RoundVisibility } from "@/lib/community/types";
import { parseDecimal } from "@/lib/courses/csv";
import { hasAnyStat, validateHoleStats } from "@/lib/stats/holeStats";
import type { HoleStat } from "@/lib/stats/types";
import type { Gender, HoleScore, NineSide, PccValue, RoundCategory } from "@/lib/whs/types";

export type Step = "basics" | "course" | "score" | "review";
export const STEPS: { key: Step; label: string }[] = [
  { key: "basics", label: "Runde" },
  { key: "course", label: "Platz" },
  { key: "score", label: "Ergebnis" },
  { key: "review", label: "Prüfen" },
];

export interface ManualCourse {
  courseName: string;
  city: string;
  teeColor: string;
  par: string;
  courseRating: string;
  slopeRating: string;
}

export interface WizardState {
  step: Step;
  date: string;
  category: RoundCategory;
  holes: 9 | 18;
  nine: NineSide | null;
  courseKind: "DB" | "MANUAL";
  courseId: string | null;
  courseName: string | null;
  layoutId: string | null;
  gender: Gender;
  teeColor: string | null;
  /** Ungeprüftes Rating: vom Spieler mit der Scorekarte bestätigte Werte (sonst null). */
  ratingConfirmed: ConfirmedRating | null;
  manual: ManualCourse;
  scoreMode: "GBE" | "HOLES" | "STABLEFORD_TOTAL";
  gbe: string;
  strokes: HoleScore[];
  stableford: string;
  pcc: PccValue;
  notes: string;
  /** „Runde detailliert tracken“: Lochstatistik (Putts, GIR, FIR …) – ändert das Handicap nicht */
  detailed: boolean;
  holeStats: HoleStat[];
  /** Wer darf die Runde sehen? (Vorauswahl aus den Privatsphäre-Einstellungen) */
  visibility: RoundVisibility;
}

export function initialState(today: string, gender: Gender = "M", visibility: RoundVisibility = "PRIVATE"): WizardState {
  return {
    step: "basics",
    date: today,
    category: "RPR",
    holes: 18,
    nine: null,
    courseKind: "DB",
    courseId: null,
    courseName: null,
    layoutId: null,
    gender,
    teeColor: null,
    ratingConfirmed: null,
    manual: { courseName: "", city: "", teeColor: "", par: "", courseRating: "", slopeRating: "" },
    scoreMode: "GBE",
    gbe: "",
    strokes: [],
    stableford: "",
    pcc: 0,
    notes: "",
    detailed: false,
    holeStats: [],
    visibility,
  };
}

/** Prüft, ob der Zustand aus einem Entwurf stammt und vollständig genug ist. */
export function restoreState(raw: unknown, fallback: WizardState): WizardState {
  if (!raw || typeof raw !== "object") return fallback;
  const w = raw as Partial<WizardState>;
  return {
    ...fallback,
    ...w,
    manual: { ...fallback.manual, ...(w.manual ?? {}) },
    strokes: Array.isArray(w.strokes) ? w.strokes : [],
    holeStats: Array.isArray(w.holeStats) ? w.holeStats : [],
    detailed: w.detailed === true,
  };
}

/** Lochstatistik mit den Schlägen der Loch-für-Loch-Eingabe (die fürs Handicap zählen). */
export function statsWithStrokes(s: Pick<WizardState, "holeStats" | "scoreMode" | "strokes">): HoleStat[] {
  if (s.scoreMode !== "HOLES") return s.holeStats;
  return s.holeStats.map((h, i) => ({ ...h, score: typeof s.strokes[i] === "number" ? (s.strokes[i] as number) : null }));
}

/** Felder, deren Änderung eine Bestätigung des Ratings ungültig macht (anderer Abschlag, andere Löcher …). */
const RATING_KEYS: (keyof WizardState)[] = ["courseKind", "courseId", "layoutId", "teeColor", "gender", "holes", "nine", "date"];

/** Übernimmt eine Änderung; betrifft sie den Abschlag, verfällt die Bestätigung des Ratings. */
export function applyPatch(s: WizardState, patch: Partial<WizardState>): WizardState {
  const next = { ...s, ...patch };
  if (!("ratingConfirmed" in patch) && RATING_KEYS.some((k) => k in patch && patch[k] !== s[k])) next.ratingConfirmed = null;
  return next;
}

/** Gespielte Löcher als eine Auswahl: 18 Loch, vordere/hintere neun oder 9 Loch (9-Loch-Platz). */
export type HolesChoice = "18" | "FRONT" | "BACK" | "9";

export function holesChoiceOf(s: Pick<WizardState, "holes" | "nine">, layoutHoles: number | null): HolesChoice {
  if (s.holes === 18) return "18";
  if (layoutHoles !== null && layoutHoles < 18) return "9";
  return s.nine === "BACK" ? "BACK" : "FRONT";
}

export function holesPatch(choice: HolesChoice): Pick<WizardState, "holes" | "nine"> {
  if (choice === "18") return { holes: 18, nine: null };
  if (choice === "9") return { holes: 9, nine: null };
  return { holes: 9, nine: choice };
}

export type StepErrors = Record<string, string>;

function int(value: string): number | null {
  const n = parseDecimal(value);
  return n === null || Number.isNaN(n) ? null : n;
}

/** Fehler des jeweiligen Schritts (für die Anzeige direkt am Feld). */
export function stepErrors(s: WizardState, step: Step): StepErrors {
  const e: StepErrors = {};
  if (step === "basics") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date)) e.date = "Bitte ein Datum wählen.";
  }
  if (step === "course") {
    if (s.courseKind === "DB") {
      if (!s.courseId) e.course = "Bitte einen Golfplatz wählen.";
      else if (!s.layoutId) e.layout = "Bitte den Platz wählen.";
      else if (!s.teeColor) e.tee = "Bitte den Abschlag wählen.";
    } else {
      if (s.manual.courseName.trim().length < 2) e.courseName = "Bitte den Namen des Golfplatzes eingeben.";
      const par = int(s.manual.par);
      const cr = int(s.manual.courseRating);
      const slope = int(s.manual.slopeRating);
      if (par === null || !Number.isInteger(par) || par < 27 || par > 80) e.par = "Par von der Scorekarte (z. B. 72).";
      if (cr === null || cr < 20 || cr > 90) e.courseRating = "Course Rating von der Scorekarte (z. B. 71,8).";
      if (slope === null || !Number.isInteger(slope) || slope < 55 || slope > 155) e.slopeRating = "Slope zwischen 55 und 155.";
    }
  }
  if (step === "score") {
    if (s.scoreMode === "GBE") {
      const g = int(s.gbe);
      if (g === null || !Number.isInteger(g) || g < (s.holes === 9 ? 18 : 36) || g > 250) e.gbe = "Bitte dein Gesamtergebnis (GBE) eingeben.";
    } else if (s.scoreMode === "HOLES") {
      if (s.strokes.length !== s.holes || s.strokes.every((x) => x === null)) e.strokes = "Bitte die Schläge je Loch eingeben.";
    } else {
      const p = int(s.stableford);
      if (p === null || !Number.isInteger(p) || p < 0 || p > 120) e.stableford = "Bitte deine Stableford-Punkte eingeben.";
    }
    if (s.detailed && s.holeStats.length > 0) {
      const stats = statsWithStrokes(s);
      const v = validateHoleStats(stats, stats.map((h) => h.number));
      if (v.errors.length > 0) e.stats = v.errors[0].message;
    }
  }
  return e;
}

export function toRoundInput(s: WizardState): RoundInput {
  const course: RoundInput["course"] =
    s.courseKind === "DB"
      ? { kind: "DB", courseId: s.courseId!, layoutId: s.layoutId!, teeColor: s.teeColor!, gender: s.gender, ...(s.ratingConfirmed ? { confirmRating: s.ratingConfirmed } : {}) }
      : {
          kind: "MANUAL",
          courseName: s.manual.courseName.trim(),
          city: s.manual.city.trim() || null,
          country: "DE",
          teeColor: s.manual.teeColor.trim() || null,
          gender: s.gender,
          par: int(s.manual.par) ?? 0,
          courseRating: int(s.manual.courseRating) ?? 0,
          slopeRating: int(s.manual.slopeRating) ?? 0,
        };
  const score: RoundInput["score"] =
    s.scoreMode === "GBE"
      ? { mode: "GBE", adjustedGrossScore: int(s.gbe) ?? 0 }
      : s.scoreMode === "HOLES"
        ? { mode: "HOLES", strokes: s.strokes }
        : { mode: "STABLEFORD_TOTAL", points: int(s.stableford) ?? 0 };
  return {
    date: s.date,
    category: s.category,
    course,
    holes: s.holes,
    nine: s.holes === 9 ? s.nine : null,
    score,
    pcc: s.pcc,
    notes: s.notes.trim() || undefined,
    visibility: s.visibility,
    // null entfernt eine bisherige Statistik ausdrücklich (Schalter aus)
    holeStats: s.detailed && s.holeStats.some((h) => hasAnyStat(h)) ? statsWithStrokes(s) : null,
  };
}

export function draftLabel(s: WizardState): string {
  const name = s.courseKind === "DB" ? s.courseName : s.manual.courseName.trim();
  const [y, m, d] = s.date.split("-");
  return `${name || "Neue Runde"} · ${d}.${m}.${y}`;
}
