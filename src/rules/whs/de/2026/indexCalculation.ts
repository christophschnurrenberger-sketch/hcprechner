import type { HandicapIndexCalculation, IndexTableRow } from "@/lib/whs/types";
import type { WhsRuleConfig } from "./config";
import { roundHandicapIndex } from "./rounding";

/**
 * Einzige Stelle, an der die WHS-Tabelle „Anzahl Ergebnisse → beste X,
 * Anpassung“ ausgewertet wird. Unter 3 Ergebnissen gibt es keinen
 * berechneten Handicap Index (null).
 */
export function lookupIndexTable(recordSize: number, cfg: WhsRuleConfig): IndexTableRow | null {
  if (!Number.isInteger(recordSize) || recordSize < cfg.handicapIndex.minimumScores) {
    return null;
  }
  const size = Math.min(recordSize, cfg.handicapIndex.windowSize);
  return (
    cfg.handicapIndex.table.find((row) => size >= row.minScores && size <= row.maxScores) ?? null
  );
}

export interface IndexInputEntry {
  roundId: string;
  /** Datum und Position: bei gleichen Werten zählt das jüngere Ergebnis. */
  position: number;
  adjustedSD: number;
}

/** Wählt die besten Score Differentials gemäß Tabelle. */
export function selectBestDifferentials(
  entries: readonly IndexInputEntry[],
  count: number,
): IndexInputEntry[] {
  return [...entries]
    .sort((a, b) => a.adjustedSD - b.adjustedSD || b.position - a.position)
    .slice(0, count);
}

/**
 * Handicap Index aus den (maximal 20) jüngsten Score Differentials:
 * Durchschnitt der besten X + Anpassung, auf 0,1 gerundet.
 * Das Maximum 54,0 wird im Scoring-Record-Algorithmus angewendet.
 */
export function calculateHandicapIndex(
  window: readonly IndexInputEntry[],
  cfg: WhsRuleConfig,
): HandicapIndexCalculation | null {
  if (window.length > cfg.handicapIndex.windowSize) {
    throw new RangeError(
      `Das Scoring Record umfasst höchstens ${cfg.handicapIndex.windowSize} Ergebnisse`,
    );
  }
  const row = lookupIndexTable(window.length, cfg);
  if (!row) return null;
  const best = selectBestDifferentials(window, row.count);
  const averageUnrounded = best.reduce((sum, e) => sum + e.adjustedSD, 0) / best.length;
  return {
    recordSize: window.length,
    usedCount: row.count,
    adjustment: row.adjustment,
    usedRoundIds: best.map((e) => e.roundId),
    averageUnrounded,
    value: roundHandicapIndex(averageUnrounded + row.adjustment, cfg.rounding.mode),
  };
}
