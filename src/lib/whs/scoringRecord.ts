import { getRuleSet } from "@/rules/whs/registry";
import type { WhsRuleSet } from "@/rules/whs/types";
import { addDays, todayIso } from "./dates";
import { evaluateRound, hasBlockingIssue } from "./roundCalculation";
import type {
  CalcIssue,
  DebugInfo,
  ExclusionReason,
  HandicapRevision,
  HandicapStatus,
  HistoryPoint,
  IsoDate,
  PlayerProfile,
  RecordEntry,
  Round,
  RoundEvaluation,
  RoundResult,
  ScoringRecordResult,
  WindowEntry,
} from "./types";

export interface ScoringRecordOptions {
  rules?: WhsRuleSet;
  /** Nur Runden bis einschließlich dieses Datums berücksichtigen. */
  asOf?: IsoDate;
  /** Heutiges Datum (für Status und Warnungen); Standard: Systemdatum. */
  today?: IsoDate;
}

/** Chronologische Reihenfolge: Datum, dann Reihenfolge am Tag, dann Erfassung. */
export function sortRoundsChronologically(rounds: readonly Round[]): Round[] {
  return [...rounds].sort(
    (a, b) =>
      (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
      a.sequence - b.sequence ||
      (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

function isBrakeActive(profile: PlayerProfile, date: IsoDate): boolean {
  return !profile.brake265LiftedAt || date < profile.brake265LiftedAt;
}

function buildWindow(
  record: readonly RecordEntry[],
  windowSize: number,
  usedRoundIds: readonly string[],
): WindowEntry[] {
  const entries = record.slice(-windowSize);
  const ranked = [...entries].sort(
    (a, b) => a.adjustedSD - b.adjustedSD || b.position - a.position,
  );
  const rankOf = new Map(ranked.map((e, i) => [e.roundId, i + 1]));
  return entries.map((e) => ({
    roundId: e.roundId,
    date: e.date,
    originalSD: e.originalSD,
    esrTotal: e.esrAdjustments.reduce((s, a) => s + a.value, 0),
    adjustedSD: e.adjustedSD,
    counted: usedRoundIds.includes(e.roundId),
    rank: rankOf.get(e.roundId) ?? 0,
  }));
}

interface RevisionInput {
  date: IsoDate;
  effectiveFrom: IsoDate;
  trigger: HandicapRevision["trigger"];
  roundIds: string[];
  startHandicapIndex: number;
  record: readonly RecordEntry[];
  history: readonly HistoryPoint[];
  brakeActive: boolean;
  officialOverride: number | null;
  esr: HandicapRevision["esr"];
  rules: WhsRuleSet;
}

/**
 * Neuer Handicap Index nach einem Spieltag:
 * Scoring Record (≤ 20) → kalkulierter HCPI → Low HCPI → Soft Cap → Hard Cap
 * → Maximum 54,0 → 26,5-Bremse → aktueller HCPI.
 */
function computeRevision(input: RevisionInput): HandicapRevision {
  const { rules, record } = input;
  const cfg = rules.config;
  const windowEntries = record.slice(-cfg.handicapIndex.windowSize);
  const index = rules.calculateHandicapIndex(
    windowEntries.map((e) => ({ roundId: e.roundId, position: e.position, adjustedSD: e.adjustedSD })),
  );
  const window = buildWindow(record, cfg.handicapIndex.windowSize, index?.usedRoundIds ?? []);

  let calculatedHandicapIndex: number | null = null;
  let lowHandicapIndex: HandicapRevision["lowHandicapIndex"] = null;
  let softCap: HandicapRevision["softCap"] = null;
  let hardCap: HandicapRevision["hardCap"] = null;
  let capStatus: HandicapRevision["capStatus"] = "NONE";
  let cappedHandicapIndex: number | null = null;
  let brake265: HandicapRevision["brake265"] = null;
  let current = input.startHandicapIndex;
  let noChangeReason: HandicapRevision["noChangeReason"] = null;

  if (index) {
    calculatedHandicapIndex = Math.min(index.value, cfg.handicapIndex.maximum);
    const mostRecentScoreDate = record[record.length - 1].date;
    lowHandicapIndex = rules.calculateLowHandicapIndex({
      mostRecentScoreDate,
      history: input.history,
      totalScores: record.length,
    });
    let value = calculatedHandicapIndex;
    if (lowHandicapIndex) {
      const caps = rules.applyCaps(value, lowHandicapIndex.value);
      softCap = caps.softCap;
      hardCap = caps.hardCap;
      capStatus = caps.status;
      value = caps.value;
    }
    cappedHandicapIndex = Math.min(value, cfg.handicapIndex.maximum);
    brake265 = rules.applyBrake265({
      candidate: cappedHandicapIndex,
      previousCurrent: input.startHandicapIndex,
      active: input.brakeActive,
    });
    current = brake265.after;
  } else {
    noChangeReason = "TOO_FEW_SCORES";
  }

  if (input.officialOverride !== null) {
    current = input.officialOverride;
  }

  return {
    date: input.date,
    effectiveFrom: input.effectiveFrom,
    trigger: input.trigger,
    roundIds: input.roundIds,
    startHandicapIndex: input.startHandicapIndex,
    window,
    recordSize: windowEntries.length,
    totalScores: record.length,
    index,
    calculatedHandicapIndex,
    lowHandicapIndex,
    softCap,
    hardCap,
    capStatus,
    cappedHandicapIndex,
    brake265,
    currentHandicapIndex: current,
    officialOverride: input.officialOverride,
    esr: input.esr,
    noChangeReason,
  };
}

function exclusionReason(
  evaluation: RoundEvaluation,
  inRecord: boolean,
  windowEntry: WindowEntry | undefined,
  windowSize: number,
  minimumScores: number,
): ExclusionReason | null {
  if (!evaluation.relevance.relevant) return "NOT_RELEVANT";
  if (!inRecord) return "NO_DIFFERENTIAL";
  if (!windowEntry) return "OUTSIDE_WINDOW";
  if (windowSize < minimumScores) return "TOO_FEW_SCORES";
  if (!windowEntry.counted) return "NOT_IN_BEST";
  return null;
}

function buildDebug(
  round: Round,
  evaluation: RoundEvaluation,
  revision: HandicapRevision | null,
): DebugInfo {
  const sd = evaluation.scoreDifferential;
  const idx = revision?.index?.value ?? null;
  return {
    startHandicapIndex: evaluation.startHandicapIndex,
    courseRating: sd?.courseRating ?? round.rating.courseRating ?? null,
    slopeRating: sd?.slopeRating ?? round.rating.slopeRating ?? null,
    pcc: round.pcc,
    pccApplied: sd?.pccApplied ?? null,
    grossScore: evaluation.gbe?.rawTotal ?? null,
    adjustedGrossScore: sd?.adjustedGrossScore ?? null,
    scoreDifferential: sd?.value ?? null,
    expectedNineHoleScoreDifferential: sd?.expectedDifferential ?? null,
    exceptionalScoreReduction: evaluation.esr?.reduction ?? 0,
    lowHandicapIndex: revision?.lowHandicapIndex?.value ?? null,
    rawHandicapIndex: idx,
    softCapAdjustment: revision?.softCap ? revision.softCap.after - revision.softCap.before : 0,
    hardCapAdjustment: revision?.hardCap ? revision.hardCap.after - revision.hardCap.before : 0,
    maximumAdjustment:
      idx !== null && revision?.calculatedHandicapIndex !== null && revision?.calculatedHandicapIndex !== undefined
        ? revision.calculatedHandicapIndex - idx
        : 0,
    brake265Adjustment: revision?.brake265 ? revision.brake265.after - revision.brake265.before : 0,
    finalHandicapIndex: revision?.currentHandicapIndex ?? evaluation.startHandicapIndex,
  };
}

/**
 * Rekonstruiert den vollständigen HCPI-Verlauf chronologisch.
 *
 * Tageslogik (DGV): Alle Runden eines Tages erhalten denselben Start-HCPI.
 * Erst nachdem alle Runden des Tages bewertet und in den Scoring Record
 * übernommen wurden (inkl. ESR), wird der neue HCPI bestimmt; er gilt ab dem
 * Folgetag und ist Start-HCPI der nächsten Runde.
 */
export function calculateScoringRecord(
  profile: PlayerProfile,
  rounds: readonly Round[],
  options: ScoringRecordOptions = {},
): ScoringRecordResult {
  const rules = options.rules ?? getRuleSet(profile.ruleSet);
  const cfg = rules.config;
  const today = options.today ?? todayIso();
  const issues: CalcIssue[] = [];

  const sorted = sortRoundsChronologically(rounds).filter(
    (r) => !options.asOf || r.date <= options.asOf,
  );

  const byDay = new Map<IsoDate, Round[]>();
  for (const round of sorted) {
    const list = byDay.get(round.date) ?? [];
    list.push(round);
    byDay.set(round.date, list);
  }
  const eventDays = new Set<IsoDate>(byDay.keys());
  const liftDate = profile.brake265LiftedAt ?? null;
  const horizon = options.asOf ?? today;
  if (liftDate && liftDate <= horizon && sorted.length > 0 && liftDate > sorted[0].date) {
    eventDays.add(liftDate);
  }
  const orderedDays = [...eventDays].sort();

  let current = profile.startHandicapIndex;
  const history: HistoryPoint[] = [
    { effectiveFrom: profile.startDate ?? null, value: current, source: "START" },
  ];
  const record: RecordEntry[] = [];
  const revisions: HandicapRevision[] = [];
  const perRound = new Map<
    string,
    { round: Round; evaluation: RoundEvaluation; inRecord: boolean; revision: HandicapRevision | null }
  >();

  for (const day of orderedDays) {
    const dayRounds = byDay.get(day) ?? [];
    const startHandicapIndex = current;

    const evaluations = dayRounds.map((round) => evaluateRound(round, startHandicapIndex, rules));
    const esrValues: number[] = [];
    const esrRoundIds: string[] = [];
    const recordedIds: string[] = [];

    evaluations.forEach((evaluation, i) => {
      const round = dayRounds[i];
      const inRecord =
        evaluation.relevance.relevant &&
        evaluation.scoreDifferential !== undefined &&
        !hasBlockingIssue(evaluation);
      perRound.set(round.id, { round, evaluation, inRecord, revision: null });
      if (!inRecord) return;
      const sd = evaluation.scoreDifferential!.value;
      record.push({
        roundId: round.id,
        date: round.date,
        sequence: round.sequence,
        originalSD: sd,
        esrAdjustments: [],
        adjustedSD: sd,
        position: record.length,
      });
      recordedIds.push(round.id);
      if (evaluation.esr && evaluation.esr.reduction !== 0) {
        esrValues.push(evaluation.esr.reduction);
        esrRoundIds.push(round.id);
      }
    });

    // Außergewöhnliche Ergebnisse: Abzug auf die jüngsten 20 Score Differentials
    // (einschließlich des außergewöhnlichen) am Ende des Spieltags.
    const esrTotal = rules.combineSameDayReductions(esrValues);
    if (esrTotal !== 0) {
      for (const entry of record.slice(-cfg.esr.appliesToMostRecent)) {
        entry.esrAdjustments.push({ sourceDate: day, sourceRoundIds: [...esrRoundIds], value: esrTotal });
        entry.adjustedSD = rules.rounding.normalizeDecimal(
          entry.originalSD + entry.esrAdjustments.reduce((s, a) => s + a.value, 0),
          1,
        );
      }
    }

    const isLiftEvent = day === liftDate && recordedIds.length === 0;
    if (recordedIds.length === 0 && !(isLiftEvent && record.length > 0)) {
      continue;
    }

    let officialOverride: number | null = null;
    for (const round of dayRounds) {
      const value = round.entry.officialHandicapIndexAfter;
      if (value !== null && value !== undefined && Number.isFinite(value)) officialOverride = value;
    }

    const revision = computeRevision({
      date: day,
      effectiveFrom: isLiftEvent ? day : addDays(day, 1),
      trigger: isLiftEvent ? "BRAKE_LIFTED" : "ROUNDS",
      roundIds: recordedIds,
      startHandicapIndex,
      record,
      history,
      brakeActive: isBrakeActive(profile, day),
      officialOverride,
      esr: esrTotal !== 0 ? { value: esrTotal, roundIds: esrRoundIds } : null,
      rules,
    });
    revisions.push(revision);
    current = revision.currentHandicapIndex;
    history.push({ effectiveFrom: revision.effectiveFrom, value: current, source: "REVISION" });
    for (const round of dayRounds) {
      const entry = perRound.get(round.id);
      if (entry) entry.revision = revision;
    }
  }

  const lastRevision = revisions[revisions.length - 1] ?? null;
  const finalWindow = lastRevision?.window ?? [];
  const finalWindowById = new Map(finalWindow.map((w) => [w.roundId, w]));
  const recordById = new Map(record.map((e) => [e.roundId, e]));

  const roundResults: RoundResult[] = sorted.map((round) => {
    const item = perRound.get(round.id);
    if (!item) {
      // Kann nur bei Runden nach einem asOf-Filter auftreten.
      throw new Error(`Runde ${round.id} wurde nicht bewertet`);
    }
    const { evaluation, inRecord, revision } = item;
    const recordEntry = recordById.get(round.id);
    const windowNow = finalWindowById.get(round.id);
    const windowAtTime = revision?.window.find((w) => w.roundId === round.id);
    return {
      ...evaluation,
      date: round.date,
      sequence: round.sequence,
      inRecord,
      finalAdjustedSD: recordEntry?.adjustedSD ?? null,
      finalEsrTotal: recordEntry ? recordEntry.esrAdjustments.reduce((s, a) => s + a.value, 0) : 0,
      currentlyInWindow: Boolean(windowNow),
      currentlyCounted: Boolean(windowNow?.counted),
      currentExclusionReason: exclusionReason(
        evaluation,
        inRecord,
        windowNow,
        finalWindow.length,
        cfg.handicapIndex.minimumScores,
      ),
      revision,
      recordSizeAtTime: revision?.recordSize ?? 0,
      countedAtTime: Boolean(windowAtTime?.counted),
      exclusionReasonAtTime: exclusionReason(
        evaluation,
        inRecord,
        windowAtTime,
        revision?.recordSize ?? 0,
        cfg.handicapIndex.minimumScores,
      ),
      debug: buildDebug(round, evaluation, revision),
    };
  });

  if (record.length < cfg.handicapIndex.windowSize) {
    issues.push({
      code: "RECORD_BELOW_WINDOW",
      severity: "info",
      params: { count: record.length, windowSize: cfg.handicapIndex.windowSize },
    });
  }
  const futureRounds = sorted.filter((r) => r.date > today).length;
  if (futureRounds > 0) {
    issues.push({ code: "FUTURE_ROUNDS", severity: "warning", params: { count: futureRounds } });
  }
  if (profile.startDate && sorted.length > 0 && sorted[0].date < profile.startDate) {
    issues.push({ code: "ROUNDS_BEFORE_START_DATE", severity: "warning" });
  }

  const status: HandicapStatus = {
    asOf: lastRevision?.date ?? null,
    currentHandicapIndex: current,
    calculatedHandicapIndex: lastRevision?.calculatedHandicapIndex ?? null,
    cappedHandicapIndex: lastRevision?.cappedHandicapIndex ?? null,
    lowHandicapIndex: lastRevision?.lowHandicapIndex ?? null,
    capStatus: lastRevision?.capStatus ?? "NONE",
    brake265Active: isBrakeActive(profile, horizon),
    brake265Applied: Boolean(lastRevision?.brake265?.applied),
    recordSize: lastRevision?.recordSize ?? 0,
    usedCount: lastRevision?.index?.usedCount ?? null,
    adjustment: lastRevision?.index?.adjustment ?? null,
    window: finalWindow,
    officialOverride: lastRevision?.officialOverride ?? null,
  };

  return {
    profile,
    rounds: roundResults,
    revisions,
    record,
    status,
    history,
    issues,
  };
}

/** HCPI, der an einem bestimmten Tag galt (Start-HCPI eines Spieltags). */
export function handicapIndexInEffectOn(result: ScoringRecordResult, date: IsoDate): number {
  let value = result.profile.startHandicapIndex;
  for (const point of result.history) {
    if (point.effectiveFrom === null || point.effectiveFrom <= date) value = point.value;
  }
  return value;
}
