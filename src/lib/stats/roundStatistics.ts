/**
 * Statistik einer Runde aus den Lochdaten. Definitionen (siehe auch docs/COMMUNITY.md):
 *
 * - Nenner sind immer die tatsächlich erfassten Löcher: 9 Loch → GIR x/9, nicht x/18.
 * - GIR-Quote   = Löcher mit GIR „Ja“ ÷ Löcher mit GIR-Angabe.
 * - FIR-Quote   = Fairways „Ja“ ÷ Par-4/5-Löcher mit FIR-Angabe (Par 3 nie im Nenner).
 * - Sand Save   = Sand Saves ÷ Löcher mit Bunkerbesuch; ohne Bunkerbesuch „–“ (nicht 0 %).
 * - Up & Down   = Up & Downs ÷ Löcher mit Up-&-Down-Angabe; ohne Versuch „–“.
 * - 3-Putts     = Löcher mit 3 oder mehr Putts.
 * - Putts/GIR   = Putts auf Löchern mit GIR „Ja“ ÷ Anzahl dieser Löcher.
 * - Verteilung  = Schläge gegenüber Par (Eagle oder besser, Birdie, Par, Bogey, Doppelbogey, Triple+).
 */
import { isHoleTracked } from "./holeStats";
import type { HoleStat, RoundStatistics } from "./types";

export function ratio(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

export function percent(part: number, whole: number): number | null {
  return whole > 0 ? (part / whole) * 100 : null;
}

export function roundStatistics(holes: readonly HoleStat[]): RoundStatistics {
  let holesScored = 0;
  let holesTracked = 0;
  let scoreSum = 0;
  let parSum = 0;
  let parKnownForAllScored = true;
  let totalPutts = 0;
  let puttHoles = 0;
  let puttsOnGir = 0;
  let girPuttHoles = 0;
  let girs = 0;
  let girHoles = 0;
  let firs = 0;
  let fairwayOpportunities = 0;
  let sandAttempts = 0;
  let sandSaves = 0;
  let upAndDownAttempts = 0;
  let upAndDowns = 0;
  let penalties = 0;
  let penaltyHoles = 0;
  let threePutts = 0;
  const dist = { eagles: 0, birdies: 0, pars: 0, bogeys: 0, doubleBogeys: 0, triplePlus: 0 };

  for (const h of holes) {
    if (isHoleTracked(h)) holesTracked++;
    if (h.score !== null) {
      holesScored++;
      scoreSum += h.score;
      if (h.par !== null) {
        parSum += h.par;
        const diff = h.score - h.par;
        if (diff <= -2) dist.eagles++;
        else if (diff === -1) dist.birdies++;
        else if (diff === 0) dist.pars++;
        else if (diff === 1) dist.bogeys++;
        else if (diff === 2) dist.doubleBogeys++;
        else dist.triplePlus++;
      } else {
        parKnownForAllScored = false;
      }
    }
    if (h.putts !== null) {
      totalPutts += h.putts;
      puttHoles++;
      if (h.putts >= 3) threePutts++;
      if (h.gir === true) {
        puttsOnGir += h.putts;
        girPuttHoles++;
      }
    }
    if (h.gir !== null) {
      girHoles++;
      if (h.gir) girs++;
    }
    if (h.fir !== null && h.par !== 3) {
      fairwayOpportunities++;
      if (h.fir) firs++;
    }
    if (h.bunkerVisit === true) {
      sandAttempts++;
      if (h.sandSave === true) sandSaves++;
    }
    if (h.upAndDown !== null) {
      upAndDownAttempts++;
      if (h.upAndDown) upAndDowns++;
    }
    if (h.penaltyStrokes !== null) {
      penalties += h.penaltyStrokes;
      penaltyHoles++;
    }
  }

  const complete = holes.length > 0 && holesScored === holes.length;
  return {
    holes: holes.length,
    holesScored,
    holesTracked,
    scorecardComplete: complete,
    grossScore: complete ? scoreSum : null,
    parPlayed: complete && parKnownForAllScored ? parSum : null,
    totalPutts: puttHoles > 0 ? totalPutts : null,
    puttHoles,
    puttsPerHole: ratio(totalPutts, puttHoles),
    puttsOnGir: girPuttHoles > 0 ? puttsOnGir : null,
    girPuttHoles,
    puttsPerGir: ratio(puttsOnGir, girPuttHoles),
    girs,
    girHoles,
    girPercentage: percent(girs, girHoles),
    firs,
    fairwayOpportunities,
    firPercentage: percent(firs, fairwayOpportunities),
    sandAttempts,
    sandSaves,
    sandSavePercentage: percent(sandSaves, sandAttempts),
    upAndDownAttempts,
    upAndDowns,
    upAndDownPercentage: percent(upAndDowns, upAndDownAttempts),
    penaltyStrokes: penaltyHoles > 0 ? penalties : null,
    threePutts,
    ...dist,
  };
}

/** Enthält die Runde nennenswerte Lochstatistik (mehr als nur Par/Handicap)? */
export function hasStatistics(stats: RoundStatistics | null | undefined): stats is RoundStatistics {
  return Boolean(stats && (stats.holesScored > 0 || stats.puttHoles > 0 || stats.girHoles > 0 || stats.fairwayOpportunities > 0));
}
