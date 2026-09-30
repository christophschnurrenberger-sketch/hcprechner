/**
 * Rein datenbasierte Hinweise zu einer Runde – nur Fakten, keine Wertung („Du hast 8 von 14 Fairways
 * getroffen.“, nie „Du puttest schlecht.“). Für Runden anderer Mitglieder neutral formuliert.
 */
import type { RoundStatistics } from "./types";

const de = (v: number, digits = 0) => v.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function roundInsights(s: RoundStatistics, options: { self?: boolean } = {}): string[] {
  const self = options.self ?? true;
  const out: string[] = [];
  if (s.fairwayOpportunities > 0) out.push(self ? `Du hast ${s.firs} von ${s.fairwayOpportunities} Fairways getroffen.` : `${s.firs} von ${s.fairwayOpportunities} Fairways getroffen.`);
  if (s.girHoles > 0) out.push(`${self ? "Deine GIR-Quote lag" : "GIR-Quote"} bei ${de((s.girs / s.girHoles) * 100)} % (${s.girs} von ${s.girHoles} Grüns).`);
  if (s.puttHoles > 0 && s.totalPutts !== null) {
    out.push(`${s.totalPutts} Putts auf ${s.puttHoles} Löchern (${de(s.totalPutts / s.puttHoles, 2)} pro Loch).`);
    const n = s.threePutts;
    out.push(self ? (n === 0 ? "Du hattest keinen Drei-Putt." : `Du hattest ${n} ${n === 1 ? "Drei-Putt" : "Drei-Putts"}.`) : n === 0 ? "Kein Drei-Putt." : `${n} ${n === 1 ? "Drei-Putt" : "Drei-Putts"}.`);
  }
  if (s.upAndDownAttempts > 0) out.push(`${s.upAndDowns} von ${s.upAndDownAttempts} Up & Downs geschafft.`);
  if (s.sandAttempts > 0) out.push(`${s.sandSaves} von ${s.sandAttempts} Sand Saves.`);
  if (s.penaltyStrokes !== null && s.penaltyStrokes > 0) out.push(`${s.penaltyStrokes} ${s.penaltyStrokes === 1 ? "Strafschlag" : "Strafschläge"}.`);
  const under = s.birdies + s.eagles;
  if (under > 0) out.push(`${under} ${under === 1 ? "Loch" : "Löcher"} unter Par.`);
  return out;
}

/** Definitionen für die Statistikseite („So zählen wir“). */
export const STAT_DEFINITIONS: { term: string; text: string }[] = [
  { term: "GIR", text: "Grün in Regulation: Der Ball liegt nach Par − 2 Schlägen auf dem Grün (Par 3: 1, Par 4: 2, Par 5: 3). Du markierst es selbst – aus der Schlagzahl wird nichts abgeleitet." },
  { term: "FIR", text: "Fairway getroffen mit dem Abschlag – nur auf Par-4- und Par-5-Löchern. Par 3 zählt nie mit." },
  { term: "Putts", text: "Schläge auf dem Grün. 3-Putts sind Löcher mit drei oder mehr Putts." },
  { term: "Sand Save", text: "Nach einem Bunkerschlag trotzdem Par oder besser. Ohne Bunkerbesuch gibt es keinen Versuch – die Quote bleibt dann leer statt 0 %." },
  { term: "Up & Down", text: "Grün verfehlt und danach Par oder besser. Nur Löcher mit Angabe zählen; ohne Versuch bleibt die Quote leer." },
  { term: "Quoten", text: "Immer aus den erfassten Löchern: Bei 9 Loch z. B. GIR 5 von 9, nie von 18. Über mehrere Runden: Summe aller Treffer ÷ Summe aller Versuche." },
  { term: "Handicap", text: "Statistiken beschreiben deine Spielleistung. Sie verändern weder dein Score Differential noch deinen Handicap Index." },
];
