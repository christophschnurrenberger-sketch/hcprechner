/**
 * Handicap-Ergebnisse für den Mitgliederbereich – die einzige Stelle, an der die WHS-Engine für
 * Mitgliederdaten aufgerufen wird. Node-Edition: auf dem Server; Webspace-Edition: hinter dem
 * API-Adapter (PHP kann TypeScript nicht ausführen). UI-Komponenten rufen diese Funktionen nie direkt auf.
 */
import { apiError } from "@/lib/api/errors";
import type { DashboardData, HcpResult, HistoryPointDto, RoundDetail, RoundListItem, RoundPreview } from "@/lib/api/types";
import { defaultRuleSet, getRuleSet } from "@/rules/whs/registry";
import { calculateScoringRecord } from "@/lib/whs/scoringRecord";
import { hasBlockingIssue } from "@/lib/whs/roundCalculation";
import { EXCLUSION_TEXTS, issueText } from "@/lib/whs/messages";
import { nextSequence } from "@/lib/store/localStore";
import { todayIso } from "@/lib/whs/dates";
import type { HandicapRevision, Round, RoundComputedSnapshot, RoundResult, ScoringRecordResult } from "@/lib/whs/types";
import { activeRounds, withRound, type MemberDoc } from "./doc";
import { engineLabel } from "./engine";
import { roundToInput } from "./roundInput";

const fmt = (v: number) => v.toFixed(1).replace(".", ",");

/** „Durchschnitt der besten 4 von 12 Score Differentials“ */
export function calculationLabel(recordSize: number): string {
  const row = defaultRuleSet.lookupIndexTable(recordSize);
  if (!row) return recordSize === 0 ? "Noch keine handicap-relevanten Ergebnisse" : `${recordSize} von mindestens 3 Ergebnissen – noch kein berechneter HCPI`;
  const adj = row.adjustment !== 0 ? `, Anpassung ${row.adjustment > 0 ? "+" : "−"}${fmt(Math.abs(row.adjustment))}` : "";
  return `${row.count === 1 ? "Bestes" : `Durchschnitt der besten ${row.count}`} von ${recordSize} Score Differentials${adj}`;
}

/** „beste 4 von 12“ */
export function usedLabel(recordSize: number): string {
  const row = defaultRuleSet.lookupIndexTable(recordSize);
  if (!row) return `${recordSize} von mindestens 3 Ergebnissen`;
  return `beste ${row.count} von ${recordSize}`;
}

/** Warum weichen kalkulierter und aktueller HCPI ab? */
export function deviationReasons(revision: HandicapRevision | null): string[] {
  if (!revision) return [];
  const reasons: string[] = [];
  if (revision.softCap?.applied) reasons.push("Soft Cap (Begrenzung eines schnellen Anstiegs)");
  if (revision.hardCap?.applied) reasons.push("Hard Cap (höchstens 5,0 über dem Low Handicap Index)");
  if (revision.index && revision.calculatedHandicapIndex !== null && revision.index.value > revision.calculatedHandicapIndex) reasons.push("Höchstwert 54,0");
  if (revision.brake265?.applied) reasons.push("26,5-Bremse (Erhöhungen werden begrenzt)");
  if (revision.officialOverride !== null) reasons.push("offiziell übernommener Handicap Index");
  return reasons;
}

export function scoringRecordOf(doc: Pick<MemberDoc, "profile" | "rounds">, today = todayIso()): ScoringRecordResult {
  return calculateScoringRecord(doc.profile, activeRounds(doc), { rules: getRuleSet(doc.profile.ruleSet), today });
}

function noteFor(result: RoundResult): string | null {
  if (!result.relevance.relevant) return "Nicht handicap-relevant";
  if (result.currentlyCounted) return null;
  if (result.currentExclusionReason) return EXCLUSION_TEXTS[result.currentExclusionReason];
  return result.scoreDifferential ? null : "Kein Score Differential berechenbar";
}

export function toListItem(round: Round, result: RoundResult | undefined): RoundListItem {
  const sd = result?.scoreDifferential ?? null;
  return {
    id: round.id,
    date: round.date,
    title: round.title,
    courseName: round.course.courseName,
    courseId: round.course.courseId ?? null,
    layoutName: round.course.layoutName ?? null,
    teeColor: round.course.teeColor ?? null,
    gender: round.course.gender ?? null,
    holes: round.holes,
    holesPlayed: round.holesPlayed ?? null,
    category: round.category,
    adjustedGrossScore: sd?.adjustedGrossScore ?? result?.gbe?.total ?? null,
    scoreDifferential: sd?.value ?? null,
    adjustedScoreDifferential: result?.finalAdjustedSD ?? null,
    handicapIndexBefore: result?.startHandicapIndex ?? 0,
    handicapIndexAfter: result?.revision?.currentHandicapIndex ?? null,
    relevant: Boolean(result?.inRecord),
    counted: Boolean(result?.currentlyCounted),
    inWindow: Boolean(result?.currentlyInWindow),
    esr: result?.finalEsrTotal ?? 0,
    note: result ? noteFor(result) : null,
  };
}

function byNewest(a: Round, b: Round): number {
  return b.date.localeCompare(a.date) || b.sequence - a.sequence;
}

export function computeHcp(doc: Pick<MemberDoc, "profile" | "rounds">, today = todayIso()): HcpResult {
  const sr = scoringRecordOf(doc, today);
  const rounds = activeRounds(doc);
  const byId = new Map(rounds.map((r) => [r.id, r]));
  const resultById = new Map(sr.rounds.map((r) => [r.roundId, r]));
  const status = sr.status;
  const latest = sr.revisions.at(-1) ?? null;
  const roundRevisions = sr.revisions.filter((r) => r.trigger === "ROUNDS");
  const lastRoundRevision = roundRevisions.at(-1) ?? null;

  const counted = status.window
    .filter((w) => w.counted)
    .sort((a, b) => a.adjustedSD - b.adjustedSD)
    .map((w) => ({ roundId: w.roundId, date: w.date, courseName: byId.get(w.roundId)?.course.courseName ?? "", value: w.adjustedSD, esr: w.esrTotal }));

  const deviation =
    status.calculatedHandicapIndex !== null && status.calculatedHandicapIndex !== status.currentHandicapIndex
      ? {
          reasons: deviationReasons(latest),
          text: "Der aktuelle Handicap Index kann vom rechnerisch ermittelten Wert abweichen, wenn eine WHS-Sonderregel greift.",
        }
      : null;

  const history: HistoryPointDto[] = [];
  const start = sr.history.find((h) => h.source === "START");
  const firstDate = rounds.map((r) => r.date).sort()[0] ?? null;
  if (start) {
    history.push({ date: doc.profile.startDate ?? firstDate ?? today, value: start.value, calculated: null, roundId: null, courseName: null, scoreDifferential: null });
  }
  for (const rev of sr.revisions) {
    const lastId = rev.roundIds.at(-1) ?? null;
    const round = lastId ? byId.get(lastId) : undefined;
    const res = lastId ? resultById.get(lastId) : undefined;
    history.push({
      date: rev.date,
      value: rev.currentHandicapIndex,
      calculated: rev.calculatedHandicapIndex,
      roundId: lastId,
      courseName: round?.course.courseName ?? null,
      scoreDifferential: res?.scoreDifferential?.value ?? null,
    });
  }

  const record = sr.rounds
    .filter((r) => r.currentlyInWindow)
    .map((r) => toListItem(byId.get(r.roundId)!, r))
    .sort((a, b) => b.date.localeCompare(a.date));

  const newest = [...rounds].sort(byNewest)[0];

  return {
    status: sr.record.length > 0 ? "ACTIVE" : "INITIAL",
    currentHandicapIndex: status.currentHandicapIndex,
    calculatedHandicapIndex: status.calculatedHandicapIndex,
    startHandicapIndex: doc.profile.startHandicapIndex,
    lowHandicapIndex: status.lowHandicapIndex?.value ?? null,
    scoringRecordCount: status.recordSize,
    totalRelevantRounds: sr.record.length,
    usedCount: status.usedCount,
    adjustment: status.adjustment,
    averageUnrounded: latest?.index?.averageUnrounded ?? null,
    calculationLabel: calculationLabel(status.recordSize),
    countedScoreDifferentials: counted,
    deviation,
    changeSinceLastRound: lastRoundRevision
      ? {
          before: lastRoundRevision.startHandicapIndex,
          after: lastRoundRevision.currentHandicapIndex,
          delta: Math.round((lastRoundRevision.currentHandicapIndex - lastRoundRevision.startHandicapIndex) * 10) / 10,
          date: lastRoundRevision.date,
        }
      : null,
    brake265Active: status.brake265Active,
    history,
    record,
    lastRound: newest ? toListItem(newest, resultById.get(newest.id)) : null,
    latestRevision: latest,
    asOf: status.asOf,
  };
}

export function listRounds(doc: Pick<MemberDoc, "profile" | "rounds">, filter: { holes?: 9 | 18 | null } = {}): RoundListItem[] {
  const sr = scoringRecordOf(doc);
  const resultById = new Map(sr.rounds.map((r) => [r.roundId, r]));
  return activeRounds(doc)
    .filter((r) => !filter.holes || r.holes === filter.holes)
    .sort(byNewest)
    .map((r) => toListItem(r, resultById.get(r.id)));
}

export function roundDetail(doc: Pick<MemberDoc, "profile" | "rounds">, roundId: string): RoundDetail {
  const round = activeRounds(doc).find((r) => r.id === roundId);
  if (!round) throw apiError("ROUND_NOT_FOUND");
  const sr = scoringRecordOf(doc);
  const result = sr.rounds.find((r) => r.roundId === roundId);
  if (!result) throw apiError("ROUND_NOT_FOUND");
  return { item: toListItem(round, result), round, input: roundToInput(round), result, recordLabelAtTime: usedLabel(result.recordSizeAtTime) };
}

export function dashboardData(doc: MemberDoc, firstName: string): DashboardData {
  return { user: { firstName }, hcp: computeHcp(doc), roundsCount: activeRounds(doc).length, drafts: doc.drafts };
}

/** Tagesreihenfolge: neue Runden ans Ende des Spieltags; bei Datumsänderung neu einsortieren. */
export function sequenceFor(doc: MemberDoc, round: Pick<Round, "id" | "date">): number {
  const existing = doc.rounds.find((r) => r.id === round.id);
  if (existing && existing.date === round.date && existing.status !== "DELETED") return existing.sequence;
  return nextSequence(activeRounds(doc), round.date, round.id);
}

function snapshot(result: RoundResult, hcpBefore: number, hcpAfter: number): RoundComputedSnapshot {
  return {
    scoreDifferential: result.scoreDifferential?.value ?? null,
    adjustedGrossScore: result.scoreDifferential?.adjustedGrossScore ?? result.gbe?.total ?? null,
    handicapIndexBefore: hcpBefore,
    handicapIndexAfter: hcpAfter,
    engine: engineLabel(),
    computedAt: new Date().toISOString(),
  };
}

/**
 * Berechnet die Runde im Kontext des gesamten Scoring Records (vorher/nachher). Bei Änderungen an älteren
 * Runden wird der komplette Verlauf chronologisch neu bestimmt.
 */
export function previewRound(doc: MemberDoc, round: Round): RoundPreview {
  const before = scoringRecordOf(doc).status.currentHandicapIndex;
  const nextDoc = withRound(doc, round);
  const sr = scoringRecordOf(nextDoc, round.date > todayIso() ? round.date : todayIso());
  const result = sr.rounds.find((r) => r.roundId === round.id);
  if (!result) throw apiError("ROUND_INVALID");
  const after = sr.status.currentHandicapIndex;
  const errors = result.issues.filter((i) => i.severity === "error").map(issueText);
  const warnings = result.issues.filter((i) => i.severity === "warning").map(issueText);
  return {
    item: toListItem(round, result),
    result,
    hcpBefore: before,
    hcpAfter: after,
    changed: Math.abs(after - before) >= 0.05,
    issues: [...errors, ...warnings],
    blocking: hasBlockingIssue(result),
  };
}

/** Speichert (neu oder geändert) und liefert das Ergebnis. Blockierende Fehler → ROUND_INVALID. */
export function saveRound(doc: MemberDoc, round: Round): { doc: MemberDoc; preview: RoundPreview } {
  const preview = previewRound(doc, round);
  if (preview.blocking) throw apiError("ROUND_INVALID", preview.issues[0] ?? undefined, { form: preview.issues.join(" ") });
  const stored: Round = { ...round, computed: snapshot(preview.result, preview.hcpBefore, preview.hcpAfter) };
  return { doc: withRound(doc, stored), preview };
}
