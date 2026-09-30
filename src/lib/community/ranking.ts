/**
 * Ranking nach Handicap Index. Grundlage ist immer der vom Backend berechnete aktuelle HCPI.
 *
 * Gleichstand (COMMUNITY_POLICY.ranking.ties):
 * - COMPETITION: 18,4 · 18,4 · 19,0 → Plätze 1 · 1 · 3
 * - DENSE:       18,4 · 18,4 · 19,0 → Plätze 1 · 1 · 2
 * Innerhalb eines Gleichstands wird nur für die Anzeige nach Namen sortiert – ohne Bevorzugung im Platz.
 * Die Node-Edition rechnet dasselbe in SQL (RANK() bzw. DENSE_RANK()), PHP in _community.php.
 */
import { COMMUNITY_POLICY, type TieMode } from "./policy";

/** Vergleich auf eine Nachkommastelle (so wird der HCPI geführt). */
export const tenths = (hcp: number) => Math.round(hcp * 10);

export interface Rankable {
  publicId: string;
  displayName: string;
  handicapIndex: number;
}

export function compareRankable(a: Rankable, b: Rankable): number {
  return tenths(a.handicapIndex) - tenths(b.handicapIndex) || a.displayName.localeCompare(b.displayName, "de") || a.publicId.localeCompare(b.publicId);
}

export function rankList<T extends Rankable>(items: readonly T[], ties: TieMode = COMMUNITY_POLICY.ranking.ties): (T & { position: number })[] {
  const sorted = [...items].sort(compareRankable);
  const out: (T & { position: number })[] = [];
  let position = 0;
  let dense = 0;
  let previous: number | null = null;
  sorted.forEach((item, index) => {
    const value = tenths(item.handicapIndex);
    if (value !== previous) {
      dense++;
      position = ties === "DENSE" ? dense : index + 1;
      previous = value;
    }
    out.push({ ...item, position });
  });
  return out;
}

/** Position eines HCPI innerhalb einer Liste (für Nicht-Teilnehmer: „wärst du im Ranking“). */
export function positionOf(handicapIndex: number, others: readonly number[], ties: TieMode = COMMUNITY_POLICY.ranking.ties): number {
  const me = tenths(handicapIndex);
  const better = others.map(tenths).filter((v) => v < me);
  return 1 + (ties === "DENSE" ? new Set(better).size : better.length);
}

/** Plätze gewonnen (+) oder verloren (−) gegenüber einem früheren Stand. */
export function trendOf(previous: number | null | undefined, current: number | null | undefined): number | null {
  if (previous === null || previous === undefined || current === null || current === undefined) return null;
  return previous - current;
}
