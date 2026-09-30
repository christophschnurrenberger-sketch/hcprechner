/**
 * Domain types for the WHS handicap engine.
 *
 * These types are deliberately free of UI concerns: they describe the data a
 * round carries (as an immutable snapshot) and the structured results the
 * engine produces. All texts shown to the user are derived from codes in
 * `messages.ts`.
 */

export type IsoDate = string; // "YYYY-MM-DD"

export type Gender = "M" | "F";

export type RoundCategory = "TOURNAMENT" | "RPR" | "OTHER";

export type GameFormat =
  | "STROKE"
  | "STABLEFORD"
  | "MAX_SCORE"
  | "PAR_BOGEY"
  | "MATCHPLAY"
  | "TEAM";

/**
 * Result status ("Ergebnisart").
 * Suffix A = Ergebnis anrechenbar (handicap-wirksam), suffix O = ohne Wertung.
 */
export type ResultStatus =
  | "NORMAL"
  | "NA"
  | "TA"
  | "NR_A"
  | "NR_O"
  | "DQ_A"
  | "DQ_O"
  | "PENALTY";

export type EntryMode =
  | "AGS"
  | "HOLE_BY_HOLE"
  | "STABLEFORD_HOLES"
  | "STABLEFORD_TOTAL"
  | "SCORE_DIFFERENTIAL";

export type PccValue = -1 | 0 | 1 | 2 | 3;

export type NineSide = "FRONT" | "BACK";

/** Raw strokes on a hole. "PICKUP" = hole not completed, null = no entry / not played. */
export type HoleScore = number | "PICKUP" | null;

export interface HoleInfo {
  number: number;
  par: number;
  strokeIndex: number | null;
}

/** The rating actually used for a round – stored with the round and never recomputed. */
export interface RatingSnapshot {
  holes: 9 | 18;
  par: number | null;
  courseRating: number | null;
  slopeRating: number | null;
  nine?: NineSide | null;
  ratingSetId?: string | null;
  verified?: boolean;
  sourceType?: string | null;
  sourceUrl?: string | null;
  checkedAt?: IsoDate | null;
  validFrom?: IsoDate | null;
  validTo?: IsoDate | null;
  /** true when the values were typed in by the user (e.g. round abroad). */
  manual?: boolean;
  /** true when an unverified rating from the course database was confirmed by the player against the scorecard. */
  playerConfirmed?: boolean;
}

export interface CourseSnapshot {
  courseId?: string | null;
  layoutId?: string | null;
  courseName: string;
  layoutName?: string | null;
  city?: string | null;
  region?: string | null;
  country: string;
  teeColor?: string | null;
  teeName?: string | null;
  gender?: Gender | null;
}

export interface RoundEntry {
  mode: EntryMode;
  /** GBE entered directly (mode AGS). */
  adjustedGrossScore?: number | null;
  /** Raw strokes per hole, same order as `Round.holeData`. Never modified by the engine. */
  holeScores?: HoleScore[];
  /** Stableford points per hole (mode STABLEFORD_HOLES). */
  stablefordPoints?: (number | null)[];
  /** Total Stableford points (mode STABLEFORD_TOTAL). */
  stablefordTotal?: number | null;
  /**
   * Playing Handicap the Stableford points were calculated with.
   * null/undefined = identical to the Course Handicap (100 % allowance).
   */
  stablefordPlayingHandicap?: number | null;
  /** User confirms the points were calculated with 100 % of the Course Handicap. */
  stablefordFullAllowanceConfirmed?: boolean;
  /** Score Differential taken over from an official scoring record (mode SCORE_DIFFERENTIAL). */
  scoreDifferential?: number | null;
  /** Optional official HCPI after this round (import from DGV record) – overrides reconstruction. */
  officialHandicapIndexAfter?: number | null;
  /** Imported differentials only: do not evaluate an exceptional score for this entry. */
  suppressEsr?: boolean;
}

export interface Round {
  id: string;
  date: IsoDate;
  /** Order of rounds on the same day (0, 1, 2 …). */
  sequence: number;
  title: string;
  category: RoundCategory;
  format: GameFormat;
  resultStatus: ResultStatus;
  /** Rated length of the round: 9-hole round or 18-hole round (incl. incomplete 18-hole rounds). */
  holes: 9 | 18;
  /** Only for incomplete 18-hole rounds: number of holes actually played (10–17). */
  holesPlayed?: number | null;
  course: CourseSnapshot;
  rating: RatingSnapshot;
  /** Official 9-hole ratings of the two nines – only needed for incomplete 18-hole rounds (10–13 holes). */
  nineHoleRatings?: Partial<Record<NineSide, RatingSnapshot>>;
  holeData?: HoleInfo[];
  /** PCC of the day as published for 18 holes. Converted by the rules for 9-hole rounds. */
  pcc: PccValue;
  entry: RoundEntry;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  /** Speicherstatus im Mitgliederbereich (von der Engine nicht ausgewertet; gelöschte Runden werden vorher entfernt). */
  status?: "COMPLETED" | "DELETED";
  deletedAt?: string | null;
  /** Ergebnis-Schnappschuss zum Zeitpunkt der Speicherung (Anzeige in Listen, nicht Grundlage der Berechnung). */
  computed?: RoundComputedSnapshot | null;
}

export interface RoundComputedSnapshot {
  scoreDifferential: number | null;
  adjustedGrossScore: number | null;
  handicapIndexBefore: number;
  handicapIndexAfter: number;
  /** Regelwerk und Engine-Version, mit der gerechnet wurde. */
  engine: string;
  computedAt: string;
}

export interface PlayerProfile {
  id: string;
  displayName?: string;
  gender: Gender;
  /** Handicap Index in effect before the first recorded round. */
  startHandicapIndex: number;
  /** Date from which the start HCPI was in effect (optional). */
  startDate?: IsoDate | null;
  /** 26,5-Bremse permanently lifted from this date on (null = brake active). */
  brake265LiftedAt?: IsoDate | null;
  homeCourseId?: string | null;
  ruleSet: RuleSetRef;
}

export interface RuleSetRef {
  country: string;
  version: string;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export type IssueSeverity = "error" | "warning" | "info";

export interface CalcIssue {
  code: string;
  severity: IssueSeverity;
  params?: Record<string, string | number>;
}

export interface CourseHandicapResult {
  kind: 9 | 18;
  handicapIndex: number;
  /** 9 holes only: HCPI / 2, rounded to one decimal before further use. */
  halvedHandicapIndex?: number;
  slopeRating: number;
  courseRating: number;
  par: number;
  unrounded: number;
  rounded: number;
}

export type HoleAdjustmentReason =
  | "UNCHANGED"
  | "NET_DOUBLE_BOGEY_LIMIT"
  | "NOT_COMPLETED"
  | "NOT_PLAYED_NET_PAR"
  | "FROM_STABLEFORD"
  | "FROM_STABLEFORD_ZERO_POINTS"
  | "NOT_COUNTED";

export interface HoleAdjustment {
  number: number;
  par: number;
  strokeIndex: number | null;
  strokesReceived: number;
  netDoubleBogey: number;
  netPar: number;
  raw: HoleScore;
  stablefordPoints?: number | null;
  /** Hole score used for handicap purposes (null when the hole is not counted). */
  adjusted: number | null;
  reason: HoleAdjustmentReason;
}

export interface GbeResult {
  holes: HoleAdjustment[];
  total: number;
  /** Sum of raw strokes where every hole has a numeric score, otherwise null. */
  rawTotal: number | null;
  courseHandicap: CourseHandicapResult;
}

export type DifferentialMethod =
  | "EIGHTEEN"
  | "NINE_EXPECTED"
  | "PARTIAL_NINE_EXPECTED"
  | "PARTIAL_NET_PAR"
  | "DIRECT";

export interface ScoreDifferentialResult {
  method: DifferentialMethod;
  adjustedGrossScore: number | null;
  courseRating: number | null;
  slopeRating: number | null;
  par: number | null;
  /** PCC as published for the day (18 holes). */
  pcc: number;
  /** PCC actually used in the formula (halved for 9 holes). */
  pccApplied: number;
  /** 9-hole methods: differential of the nine holes played. */
  playedDifferentialUnrounded?: number;
  playedDifferential?: number;
  /** 9-hole methods: expected differential of the nine holes not played. */
  expectedDifferentialUnrounded?: number;
  expectedDifferential?: number;
  handicapIndexForExpected?: number;
  /** Partial rounds: which nine was used (10–13 holes). */
  nineUsed?: NineSide;
  unrounded: number;
  value: number;
}

export interface RelevanceCheck {
  code: string;
  ok: boolean;
  params?: Record<string, string | number>;
}

export interface RelevanceResult {
  relevant: boolean;
  checks: RelevanceCheck[];
}

export interface EsrResult {
  difference: number;
  reduction: 0 | -1 | -2;
}

export interface RoundEvaluation {
  roundId: string;
  relevance: RelevanceResult;
  issues: CalcIssue[];
  startHandicapIndex: number;
  courseHandicap?: CourseHandicapResult;
  gbe?: GbeResult;
  scoreDifferential?: ScoreDifferentialResult;
  esr: EsrResult | null;
}

export interface EsrAdjustment {
  sourceDate: IsoDate;
  sourceRoundIds: string[];
  value: number;
}

export interface RecordEntry {
  roundId: string;
  date: IsoDate;
  sequence: number;
  originalSD: number;
  esrAdjustments: EsrAdjustment[];
  adjustedSD: number;
  /** Position in the complete chronological record (0-based). */
  position: number;
}

export interface WindowEntry {
  roundId: string;
  date: IsoDate;
  originalSD: number;
  esrTotal: number;
  adjustedSD: number;
  counted: boolean;
  /** Rank by adjusted SD within the window (1 = best). */
  rank: number;
}

export interface IndexTableRow {
  minScores: number;
  maxScores: number;
  count: number;
  adjustment: number;
}

export interface HandicapIndexCalculation {
  recordSize: number;
  usedCount: number;
  adjustment: number;
  usedRoundIds: string[];
  averageUnrounded: number;
  /** average + adjustment, rounded (not yet limited to the maximum). */
  value: number;
}

export interface LowHandicapIndexResult {
  value: number;
  /** Date from which this HCPI was in effect. */
  effectiveFrom: IsoDate | null;
  windowStart: IsoDate;
  windowEnd: IsoDate;
}

export interface CapStep {
  applied: boolean;
  before: number;
  after: number;
}

export interface BrakeStep {
  active: boolean;
  applied: boolean;
  upperBound: number | null;
  before: number;
  after: number;
}

export type CapStatus = "NONE" | "SOFT" | "HARD";

export interface DebugInfo {
  startHandicapIndex: number;
  courseRating: number | null;
  slopeRating: number | null;
  pcc: number;
  pccApplied: number | null;
  grossScore: number | null;
  adjustedGrossScore: number | null;
  scoreDifferential: number | null;
  expectedNineHoleScoreDifferential: number | null;
  exceptionalScoreReduction: number;
  lowHandicapIndex: number | null;
  rawHandicapIndex: number | null;
  softCapAdjustment: number;
  hardCapAdjustment: number;
  maximumAdjustment: number;
  brake265Adjustment: number;
  finalHandicapIndex: number;
}

export interface HandicapRevision {
  /** Day whose results are processed (the revision is in effect from the next day). */
  date: IsoDate;
  effectiveFrom: IsoDate;
  trigger: "ROUNDS" | "BRAKE_LIFTED";
  roundIds: string[];
  startHandicapIndex: number;
  window: WindowEntry[];
  recordSize: number;
  totalScores: number;
  index: HandicapIndexCalculation | null;
  /** Kalkulierter HCPI: rechnerisch aus dem Scoring Record (vor Cap und Bremse, max. 54,0). */
  calculatedHandicapIndex: number | null;
  lowHandicapIndex: LowHandicapIndexResult | null;
  softCap: CapStep | null;
  hardCap: CapStep | null;
  capStatus: CapStatus;
  /** HCPI after caps and maximum, before the 26,5-Bremse. */
  cappedHandicapIndex: number | null;
  brake265: BrakeStep | null;
  /** Aktueller HCPI (in effect from `effectiveFrom`). */
  currentHandicapIndex: number;
  officialOverride: number | null;
  esr: { value: number; roundIds: string[] } | null;
  noChangeReason: "TOO_FEW_SCORES" | null;
}

export type ExclusionReason =
  | "NOT_RELEVANT"
  | "NO_DIFFERENTIAL"
  | "NOT_IN_BEST"
  | "OUTSIDE_WINDOW"
  | "TOO_FEW_SCORES";

export interface RoundResult extends RoundEvaluation {
  date: IsoDate;
  sequence: number;
  inRecord: boolean;
  /** Current state of the entry in the scoring record (after later ESRs). */
  finalAdjustedSD: number | null;
  finalEsrTotal: number;
  currentlyInWindow: boolean;
  currentlyCounted: boolean;
  currentExclusionReason: ExclusionReason | null;
  /** State at the revision of the day the round was played. */
  revision: HandicapRevision | null;
  recordSizeAtTime: number;
  countedAtTime: boolean;
  exclusionReasonAtTime: ExclusionReason | null;
  debug: DebugInfo;
}

export interface HandicapStatus {
  asOf: IsoDate | null;
  currentHandicapIndex: number;
  calculatedHandicapIndex: number | null;
  cappedHandicapIndex: number | null;
  lowHandicapIndex: LowHandicapIndexResult | null;
  capStatus: CapStatus;
  brake265Active: boolean;
  brake265Applied: boolean;
  recordSize: number;
  usedCount: number | null;
  adjustment: number | null;
  window: WindowEntry[];
  officialOverride: number | null;
}

export interface HistoryPoint {
  effectiveFrom: IsoDate | null;
  value: number;
  source: "START" | "REVISION";
}

export interface ScoringRecordResult {
  profile: PlayerProfile;
  rounds: RoundResult[];
  revisions: HandicapRevision[];
  record: RecordEntry[];
  status: HandicapStatus;
  history: HistoryPoint[];
  issues: CalcIssue[];
}
