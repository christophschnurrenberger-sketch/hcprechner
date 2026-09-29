import { addDays } from "@/lib/whs/dates";
import type { HistoryPoint, IsoDate, LowHandicapIndexResult } from "@/lib/whs/types";
import type { WhsRuleConfig } from "./config";

/**
 * Low Handicap Index: niedrigster Handicap Index, der innerhalb der 365 Tage
 * vor dem Tag des jüngsten Ergebnisses im Scoring Record gegolten hat.
 *
 * Berücksichtigt werden
 *  - der HCPI, der zu Beginn des Zeitraums galt, und
 *  - alle HCPI-Revisionen, die innerhalb des Zeitraums wirksam wurden,
 *    einschließlich des HCPI, mit dem am Tag des jüngsten Ergebnisses gespielt wurde.
 *
 * Erst ab 20 Ergebnissen im Scoring Record (sonst null).
 * `history` enthält den jeweils AKTUELLEN (offiziellen) HCPI mit Wirksamkeitsdatum.
 */
export function calculateLowHandicapIndex(
  input: {
    mostRecentScoreDate: IsoDate;
    history: readonly HistoryPoint[];
    totalScores: number;
  },
  cfg: WhsRuleConfig,
): LowHandicapIndexResult | null {
  if (input.totalScores < cfg.lowHandicapIndex.minimumScores) return null;
  const windowEnd = input.mostRecentScoreDate;
  const windowStart = addDays(windowEnd, -cfg.lowHandicapIndex.windowDays);

  // HCPI, der zu Beginn des Zeitraums galt: letzter Eintrag mit Wirksamkeit ≤ windowStart.
  let inEffectAtStart: HistoryPoint | null = null;
  const inside: HistoryPoint[] = [];
  for (const point of input.history) {
    const from = point.effectiveFrom;
    if (from === null || from <= windowStart) {
      if (
        inEffectAtStart === null ||
        (inEffectAtStart.effectiveFrom ?? "") <= (from ?? "")
      ) {
        inEffectAtStart = point;
      }
    } else if (from <= windowEnd) {
      inside.push(point);
    }
  }
  const candidates = inEffectAtStart ? [inEffectAtStart, ...inside] : inside;
  if (candidates.length === 0) return null;
  let low = candidates[0];
  for (const c of candidates) {
    if (c.value < low.value) low = c;
  }
  return { value: low.value, effectiveFrom: low.effectiveFrom, windowStart, windowEnd };
}
