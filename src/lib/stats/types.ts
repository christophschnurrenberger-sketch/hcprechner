/**
 * Golfstatistik (Spielleistung) – bewusst getrennt von den WHS-Daten.
 *
 * Lochstatistiken beschreiben, wie eine Runde gespielt wurde (Putts, Grüns, Fairways, Bunker …).
 * Sie fließen nie in Score Differential, GBE oder Handicap Index ein; maßgeblich für das Handicap
 * bleiben ausschließlich die WHS-Eingaben der Runde (GBE bzw. Schläge je Loch).
 */
import type { IsoDate } from "@/lib/whs/types";

/** Daten eines Lochs. `null` = nicht erfasst bzw. nicht relevant (z. B. Fairway auf Par 3). */
export interface HoleStat {
  /** Lochnummer auf dem Platz (1–18; hintere neun: 10–18). */
  number: number;
  par: number | null;
  strokeIndex?: number | null;
  score: number | null;
  putts: number | null;
  /** Fairway getroffen – nur Par 4/5. */
  fir: boolean | null;
  /** Grün in Regulation erreicht. */
  gir: boolean | null;
  /** Ball war (mindestens einmal) im Bunker. */
  bunkerVisit: boolean | null;
  /** Anzahl Schläge aus dem Bunker (optional). */
  bunkerShots: number | null;
  /** Sand Save: nach Bunkerschlag Par oder besser; null = kein Versuch / nicht relevant. */
  sandSave: boolean | null;
  /** Up & Down: Grün verfehlt, danach Par oder besser; null = nicht relevant. */
  upAndDown: boolean | null;
  penaltyStrokes: number | null;
  /** Persönliche Notiz – standardmäßig privat. */
  note?: string | null;
}

/** Statistik einer Runde (vom Backend berechnet; Prozentwerte 0–100, ungerundet, null = keine Versuche). */
export interface RoundStatistics {
  holes: number;
  /** Löcher mit Schlagzahl */
  holesScored: number;
  /** Löcher mit Schlagzahl, Putts, GIR und Strafschlägen */
  holesTracked: number;
  scorecardComplete: boolean;
  grossScore: number | null;
  parPlayed: number | null;
  totalPutts: number | null;
  puttHoles: number;
  puttsPerHole: number | null;
  puttsOnGir: number | null;
  /** Löcher mit GIR „Ja“ und Putt-Angabe (Nenner von Putts/GIR) */
  girPuttHoles: number;
  puttsPerGir: number | null;
  girs: number;
  girHoles: number;
  girPercentage: number | null;
  firs: number;
  fairwayOpportunities: number;
  firPercentage: number | null;
  sandAttempts: number;
  sandSaves: number;
  sandSavePercentage: number | null;
  upAndDownAttempts: number;
  upAndDowns: number;
  upAndDownPercentage: number | null;
  penaltyStrokes: number | null;
  threePutts: number;
  eagles: number;
  birdies: number;
  pars: number;
  bogeys: number;
  doubleBogeys: number;
  triplePlus: number;
}

/** Zusammenfassung über mehrere Runden (Summen der Zähler → Quoten; nie Durchschnitt von Prozentwerten). */
export interface PerformanceSummary {
  rounds: number;
  roundsWithStats: number;
  holesScored: number;
  averageScore18: number | null;
  averageScore9: number | null;
  totalPutts: number;
  puttHoles: number;
  puttsPerHole: number | null;
  puttsPerGir: number | null;
  girs: number;
  girHoles: number;
  girPercentage: number | null;
  firs: number;
  fairwayOpportunities: number;
  firPercentage: number | null;
  sandAttempts: number;
  sandSaves: number;
  sandSavePercentage: number | null;
  upAndDownAttempts: number;
  upAndDowns: number;
  upAndDownPercentage: number | null;
  penaltyStrokes: number;
  penaltiesPerRound: number | null;
  threePutts: number;
  threePuttsPerRound: number | null;
  distribution: { eagles: number; birdies: number; pars: number; bogeys: number; doubleBogeys: number; triplePlus: number };
}

export interface PerformancePoint {
  roundId: string;
  date: IsoDate;
  courseName: string;
  holes: 9 | 18;
  grossScore: number | null;
  girPercentage: number | null;
  firPercentage: number | null;
  puttsPerHole: number | null;
  threePutts: number;
  upAndDownPercentage: number | null;
  sandSavePercentage: number | null;
}

export type PerformancePeriod = "ALL" | "DAYS_30" | "DAYS_90" | "YEAR";

export interface PerformanceFilter {
  /** Letzte n Runden (mit Statistik); null = alle */
  last?: number | null;
  holes?: 9 | 18 | null;
  courseId?: string | null;
  teeColor?: string | null;
  period?: PerformancePeriod;
}

export interface PerformanceReport {
  filter: Required<PerformanceFilter>;
  summary: PerformanceSummary;
  history: PerformancePoint[];
  /** Auswahl für Filter: gespielte Plätze und Abschläge (nur aus Runden mit Statistik) */
  options: { courses: { id: string; name: string; rounds: number }[]; tees: { teeColor: string; rounds: number }[] };
  /** Runden ohne Lochstatistik (zur Information – kein Fehler) */
  roundsWithoutStats: number;
}
