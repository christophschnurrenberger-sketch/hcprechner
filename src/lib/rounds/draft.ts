/**
 * Formularzustand des Runden-Wizards und Umwandlung in eine gespeicherte Runde.
 * Rein funktional – ohne React –, damit testbar.
 */
import { parseDecimal } from "@/lib/courses/csv";
import { todayIso } from "@/lib/whs/dates";
import type {
  CourseSnapshot,
  EntryMode,
  GameFormat,
  Gender,
  HoleInfo,
  HoleScore,
  NineSide,
  PccValue,
  PlayerProfile,
  RatingSnapshot,
  ResultStatus,
  Round,
  RoundCategory,
} from "@/lib/whs/types";

export type CourseMode = "DB" | "MANUAL" | "NONE";
export type HolesMode = 9 | 18 | "PARTIAL";

export interface ManualRating {
  courseRating: string;
  slopeRating: string;
  par: string;
}

export interface Draft {
  id: string;
  isNew: boolean;
  createdAt: string;
  sequence: number;
  date: string;
  title: string;
  category: RoundCategory;
  format: GameFormat;
  resultStatus: ResultStatus;
  courseMode: CourseMode;
  course: CourseSnapshot;
  holesMode: HolesMode;
  nine: NineSide | null;
  gender: Gender;
  /** Rating aus der Datenbank (Snapshot) – null bei manueller Eingabe. */
  dbRating: RatingSnapshot | null;
  dbNineRatings: Partial<Record<NineSide, RatingSnapshot>>;
  useManualRating: boolean;
  manualRating: ManualRating;
  manualNineRatings: Record<NineSide, ManualRating>;
  entryMode: EntryMode;
  ags: string;
  holeData: HoleInfo[];
  holeScores: HoleScore[];
  stablefordPoints: (number | null)[];
  stablefordTotal: string;
  stablefordFullAllowance: boolean;
  stablefordPlayingHandicap: string;
  scoreDifferential: string;
  officialHandicapIndexAfter: string;
  suppressEsr: boolean;
  pcc: PccValue;
  notes: string;
}

const emptyManual = (): ManualRating => ({ courseRating: "", slopeRating: "", par: "" });

export function blankHoles(count: number, offset = 0): HoleInfo[] {
  return Array.from({ length: count }, (_, i) => ({ number: offset + i + 1, par: 0, strokeIndex: null }));
}

export function emptyDraft(profile: PlayerProfile, id: string): Draft {
  return {
    id,
    isNew: true,
    createdAt: new Date().toISOString(),
    sequence: 0,
    date: todayIso(),
    title: "",
    category: "TOURNAMENT",
    format: "STROKE",
    resultStatus: "NORMAL",
    courseMode: "DB",
    course: { courseName: "", country: "DE", gender: profile.gender },
    holesMode: 18,
    nine: null,
    gender: profile.gender,
    dbRating: null,
    dbNineRatings: {},
    useManualRating: false,
    manualRating: emptyManual(),
    manualNineRatings: { FRONT: emptyManual(), BACK: emptyManual() },
    entryMode: "AGS",
    ags: "",
    holeData: blankHoles(18),
    holeScores: Array(18).fill(null),
    stablefordPoints: Array(18).fill(null),
    stablefordTotal: "",
    stablefordFullAllowance: false,
    stablefordPlayingHandicap: "",
    scoreDifferential: "",
    officialHandicapIndexAfter: "",
    suppressEsr: false,
    pcc: 0,
    notes: "",
  };
}

const str = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v).replace(".", ","));

function manualFrom(r: RatingSnapshot | undefined): ManualRating {
  return r ? { courseRating: str(r.courseRating), slopeRating: str(r.slopeRating), par: str(r.par) } : emptyManual();
}

export function draftFromRound(round: Round): Draft {
  const holes = round.holes === 9 ? 9 : 18;
  const partial = round.holes === 18 && round.holesPlayed != null && round.holesPlayed < 18;
  const courseMode: CourseMode =
    round.entry.mode === "SCORE_DIFFERENTIAL" && round.rating.courseRating == null ? "NONE" : round.course.courseId ? "DB" : "MANUAL";
  const manual = Boolean(round.rating.manual) || courseMode === "MANUAL";
  return {
    id: round.id,
    isNew: false,
    createdAt: round.createdAt,
    sequence: round.sequence,
    date: round.date,
    title: round.title,
    category: round.category,
    format: round.format,
    resultStatus: round.resultStatus,
    courseMode,
    course: { ...round.course },
    holesMode: partial ? "PARTIAL" : round.holes,
    nine: round.rating.nine ?? null,
    gender: round.course.gender ?? "M",
    dbRating: manual ? null : round.rating,
    dbNineRatings: manual ? {} : { ...(round.nineHoleRatings ?? {}) },
    useManualRating: manual && courseMode !== "NONE",
    manualRating: manualFrom(round.rating),
    manualNineRatings: { FRONT: manualFrom(round.nineHoleRatings?.FRONT), BACK: manualFrom(round.nineHoleRatings?.BACK) },
    entryMode: round.entry.mode,
    ags: str(round.entry.adjustedGrossScore),
    holeData: round.holeData?.length ? round.holeData.map((h) => ({ ...h })) : blankHoles(holes),
    holeScores: round.entry.holeScores?.length ? [...round.entry.holeScores] : Array(holes).fill(null),
    stablefordPoints: round.entry.stablefordPoints?.length ? [...round.entry.stablefordPoints] : Array(holes).fill(null),
    stablefordTotal: str(round.entry.stablefordTotal),
    stablefordFullAllowance: Boolean(round.entry.stablefordFullAllowanceConfirmed),
    stablefordPlayingHandicap: str(round.entry.stablefordPlayingHandicap),
    scoreDifferential: str(round.entry.scoreDifferential),
    officialHandicapIndexAfter: str(round.entry.officialHandicapIndexAfter),
    suppressEsr: Boolean(round.entry.suppressEsr),
    pcc: round.pcc,
    notes: round.notes ?? "",
  };
}

export function holesCountFor(draft: Pick<Draft, "holesMode">): 9 | 18 {
  return draft.holesMode === 9 ? 9 : 18;
}

function num(value: string): number | null {
  const n = parseDecimal(value);
  return n === null || Number.isNaN(n) ? null : n;
}

function manualSnapshot(m: ManualRating, holes: 9 | 18, nine: NineSide | null): RatingSnapshot {
  const cr = num(m.courseRating);
  const slope = num(m.slopeRating);
  const par = num(m.par);
  return {
    holes,
    courseRating: cr,
    slopeRating: slope !== null && Number.isInteger(slope) ? slope : slope === null ? null : Math.round(slope),
    par: par !== null && Number.isInteger(par) ? par : null,
    nine,
    manual: true,
    verified: false,
    sourceType: "MANUAL_IMPORT",
  };
}

export function draftRating(draft: Draft): RatingSnapshot {
  const holes = holesCountFor(draft);
  if (draft.courseMode === "NONE") return { holes, par: null, courseRating: null, slopeRating: null };
  if (draft.courseMode === "MANUAL" || draft.useManualRating || !draft.dbRating) {
    return manualSnapshot(draft.manualRating, holes, holes === 9 ? draft.nine : null);
  }
  return draft.dbRating;
}

export function draftNineRatings(draft: Draft): Partial<Record<NineSide, RatingSnapshot>> | undefined {
  if (draft.holesMode !== "PARTIAL") return undefined;
  if (draft.courseMode === "DB" && !draft.useManualRating) return draft.dbNineRatings;
  const out: Partial<Record<NineSide, RatingSnapshot>> = {};
  for (const side of ["FRONT", "BACK"] as NineSide[]) {
    const snap = manualSnapshot(draft.manualNineRatings[side], 9, side);
    if (snap.courseRating !== null || snap.slopeRating !== null) out[side] = snap;
  }
  return out;
}

export function countPlayed(scores: HoleScore[]): number {
  return scores.filter((s) => s !== null && s !== undefined).length;
}

/** Baut die zu speichernde Runde (unveränderlicher Snapshot der verwendeten Daten). */
export function buildRound(draft: Draft): Round {
  const holes = holesCountFor(draft);
  const now = new Date().toISOString();
  const entryMode: EntryMode = draft.courseMode === "NONE" ? "SCORE_DIFFERENTIAL" : draft.entryMode;
  const usesHoles = entryMode === "HOLE_BY_HOLE" || entryMode === "STABLEFORD_HOLES";
  const holeData = draft.holeData.slice(0, holes);
  return {
    id: draft.id,
    date: draft.date,
    sequence: draft.sequence,
    title: draft.title.trim() || "Runde",
    category: draft.category,
    format: draft.format,
    resultStatus: draft.resultStatus,
    holes,
    holesPlayed: draft.holesMode === "PARTIAL" ? countPlayed(draft.holeScores.slice(0, 18)) : null,
    course: {
      ...draft.course,
      courseName: draft.course.courseName.trim() || (draft.courseMode === "NONE" ? "Ohne Platzangabe" : "Unbekannter Platz"),
      gender: draft.gender,
      courseId: draft.courseMode === "DB" ? draft.course.courseId ?? null : null,
      layoutId: draft.courseMode === "DB" ? draft.course.layoutId ?? null : null,
    },
    rating: draftRating(draft),
    nineHoleRatings: draftNineRatings(draft),
    holeData: usesHoles ? holeData : undefined,
    pcc: draft.courseMode === "NONE" ? 0 : draft.pcc,
    entry: {
      mode: entryMode,
      adjustedGrossScore: entryMode === "AGS" ? num(draft.ags) : null,
      holeScores: entryMode === "HOLE_BY_HOLE" || entryMode === "STABLEFORD_HOLES" ? draft.holeScores.slice(0, holes) : undefined,
      stablefordPoints: entryMode === "STABLEFORD_HOLES" ? draft.stablefordPoints.slice(0, holes) : undefined,
      stablefordTotal: entryMode === "STABLEFORD_TOTAL" ? num(draft.stablefordTotal) : null,
      stablefordFullAllowanceConfirmed: entryMode === "STABLEFORD_TOTAL" ? draft.stablefordFullAllowance : undefined,
      stablefordPlayingHandicap:
        entryMode === "STABLEFORD_HOLES" || entryMode === "STABLEFORD_TOTAL" ? num(draft.stablefordPlayingHandicap) : null,
      scoreDifferential: entryMode === "SCORE_DIFFERENTIAL" ? num(draft.scoreDifferential) : null,
      officialHandicapIndexAfter: entryMode === "SCORE_DIFFERENTIAL" ? num(draft.officialHandicapIndexAfter) : null,
      suppressEsr: entryMode === "SCORE_DIFFERENTIAL" ? draft.suppressEsr : undefined,
    },
    notes: draft.notes.trim() || undefined,
    createdAt: draft.createdAt,
    updatedAt: now,
  };
}
