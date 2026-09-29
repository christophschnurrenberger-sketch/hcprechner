/**
 * Zentrale Rundungsfunktionen.
 *
 * Es gibt im gesamten Projekt keine andere Stelle, an der WHS-relevante Werte
 * gerundet werden. Jede Funktion ist nach dem Regelwerks-Schritt benannt, an
 * dem gerundet wird, damit Doppelrundungen im Code sichtbar wären.
 *
 * Gleitkomma: 13,15 ist binär 13,1499999… – ein naives Math.round(x*10)/10
 * ergäbe 13,1. Deshalb wird mit einer kleinen, relativen Toleranz gerundet.
 * WHS-Eingaben haben höchstens eine Nachkommastelle, echte Werte liegen daher
 * nie näher als 1e-9 an einer Rundungsgrenze.
 */

export type RoundingMode = "HALF_AWAY_FROM_ZERO" | "HALF_UP";

const RELATIVE_EPSILON = 1e-9;

export function roundWHS(
  value: number,
  decimals = 1,
  mode: RoundingMode = "HALF_AWAY_FROM_ZERO",
): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`roundWHS: ungültiger Wert ${value}`);
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 6) {
    throw new RangeError(`roundWHS: ungültige Nachkommastellen ${decimals}`);
  }
  const factor = 10 ** decimals;
  const scaled = value * factor;
  const epsilon = RELATIVE_EPSILON * Math.max(1, Math.abs(scaled));
  let rounded: number;
  if (mode === "HALF_AWAY_FROM_ZERO") {
    rounded = Math.sign(scaled) * Math.floor(Math.abs(scaled) + 0.5 + epsilon);
  } else {
    rounded = Math.floor(scaled + 0.5 + epsilon);
  }
  const result = rounded / factor;
  return Object.is(result, -0) ? 0 : result;
}

/** Score Differential: auf eine Nachkommastelle. */
export function roundScoreDifferential(
  value: number,
  mode: RoundingMode = "HALF_AWAY_FROM_ZERO",
): number {
  return roundWHS(value, 1, mode);
}

/** Handicap Index (Durchschnitt, Soft Cap): auf eine Nachkommastelle. */
export function roundHandicapIndex(
  value: number,
  mode: RoundingMode = "HALF_AWAY_FROM_ZERO",
): number {
  return roundWHS(value, 1, mode);
}

/** Course Handicap: auf eine ganze Zahl. Erst hier, nie in Zwischenschritten. */
export function roundCourseHandicap(
  value: number,
  mode: RoundingMode = "HALF_AWAY_FROM_ZERO",
): number {
  return roundWHS(value, 0, mode);
}

/** Playing Handicap: Course Handicap × Handicap-Verrechnung, auf eine ganze Zahl. */
export function roundPlayingHandicap(
  value: number,
  mode: RoundingMode = "HALF_AWAY_FROM_ZERO",
): number {
  return roundWHS(value, 0, mode);
}

/**
 * Entfernt reines Gleitkomma-Rauschen aus Summen bereits gerundeter Werte
 * (z. B. 20,3 + 26,8). Ändert keinen fachlichen Wert.
 */
export function normalizeDecimal(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  const result = Math.round(value * factor) / factor;
  return Object.is(result, -0) ? 0 : result;
}
