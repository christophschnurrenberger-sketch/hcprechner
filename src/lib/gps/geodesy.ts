/**
 * Geodätische Entfernung zwischen zwei WGS-84-Koordinaten.
 *
 * Primär Vincenty (inverse Aufgabe auf dem WGS-84-Ellipsoid, Genauigkeit im Millimeterbereich),
 * Rückfallebene Haversine (Kugel) für den seltenen Fall, dass Vincenty nicht konvergiert
 * (fast gegenüberliegende Punkte – auf einem Golfplatz ausgeschlossen).
 *
 * Ergebnis ist immer die Luftlinie zwischen den Punkten, keine Entfernung entlang des Fairways.
 */
import type { GeoPoint } from "@/lib/courses/types";

const WGS84_A = 6_378_137.0;
const WGS84_F = 1 / 298.257223563;
const WGS84_B = WGS84_A * (1 - WGS84_F);
/** Mittlerer Erdradius (IUGG R1) für Haversine. */
const MEAN_EARTH_RADIUS = 6_371_008.8;
const RAD = Math.PI / 180;

export function isLatitude(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isLongitude(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -180 && value <= 180;
}

export function isGeoPoint(point: unknown): point is GeoPoint {
  const p = point as GeoPoint | null;
  return Boolean(p) && typeof p === "object" && isLatitude(p!.latitude) && isLongitude(p!.longitude);
}

/** Wirft bei ungültigen Koordinaten (z. B. Breite 999) – es wird nie mit ungültigen Werten gerechnet. */
export function assertGeoPoint(point: unknown, label = "Koordinate"): asserts point is GeoPoint {
  if (!isGeoPoint(point)) throw new RangeError(`${label} ungültig (Breite −90…90, Länge −180…180)`);
}

/** Großkreisentfernung auf der Kugel (Meter). */
export function haversineDistance(a: GeoPoint, b: GeoPoint): number {
  const dLat = (b.latitude - a.latitude) * RAD;
  const dLon = (b.longitude - a.longitude) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * RAD) * Math.cos(b.latitude * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * MEAN_EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Vincenty (inverse Aufgabe) auf dem WGS-84-Ellipsoid (Meter). `null`, wenn die Iteration nicht konvergiert. */
export function vincentyDistance(a: GeoPoint, b: GeoPoint): number | null {
  if (a.latitude === b.latitude && a.longitude === b.longitude) return 0;
  const f = WGS84_F;
  // Längendifferenz auf −180…180° bringen (Datumsgrenze)
  const L = ((((b.longitude - a.longitude) % 360) + 540) % 360 - 180) * RAD;
  const tanU1 = (1 - f) * Math.tan(a.latitude * RAD);
  const cosU1 = 1 / Math.sqrt(1 + tanU1 * tanU1);
  const sinU1 = tanU1 * cosU1;
  const tanU2 = (1 - f) * Math.tan(b.latitude * RAD);
  const cosU2 = 1 / Math.sqrt(1 + tanU2 * tanU2);
  const sinU2 = tanU2 * cosU2;

  let lambda = L;
  let sinSigma = 0;
  let cosSigma = 0;
  let sigma = 0;
  let cosSqAlpha = 0;
  let cos2SigmaM = 0;
  for (let i = 0; i < 200; i++) {
    const sinLambda = Math.sin(lambda);
    const cosLambda = Math.cos(lambda);
    const sinSqSigma = (cosU2 * sinLambda) ** 2 + (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) ** 2;
    if (sinSqSigma < 1e-24) return 0; // praktisch identische Punkte
    sinSigma = Math.sqrt(sinSqSigma);
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);
    const sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma;
    cosSqAlpha = 1 - sinAlpha * sinAlpha;
    cos2SigmaM = cosSqAlpha !== 0 ? cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha : 0; // auf dem Äquator: cos²α = 0
    const C = (f / 16) * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha));
    const previous = lambda;
    lambda = L + (1 - C) * f * sinAlpha * (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
    if (Math.abs(lambda) > Math.PI * 1.5) return null;
    if (Math.abs(lambda - previous) < 1e-12) {
      const uSq = (cosSqAlpha * (WGS84_A * WGS84_A - WGS84_B * WGS84_B)) / (WGS84_B * WGS84_B);
      const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
      const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
      const deltaSigma =
        B *
        sinSigma *
        (cos2SigmaM +
          (B / 4) *
            (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) - (B / 6) * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));
      return WGS84_B * A * (sigma - deltaSigma);
    }
  }
  return null;
}

/** Geodätische Entfernung in Metern (Vincenty, sonst Haversine). Erwartet gültige Koordinaten. */
export function geodesicDistance(a: GeoPoint, b: GeoPoint): number {
  return vincentyDistance(a, b) ?? haversineDistance(a, b);
}

/**
 * Lokale Näherung für kleine Abstände: Versatz (Meter Ost/Nord) von `origin` nach `point`.
 * Für den Positionsfilter (Glättung) – nicht für angezeigte Entfernungen.
 */
export function toLocalMeters(origin: GeoPoint, point: GeoPoint): { east: number; north: number } {
  const north = (point.latitude - origin.latitude) * RAD * MEAN_EARTH_RADIUS;
  let dLon = point.longitude - origin.longitude;
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;
  const east = dLon * RAD * MEAN_EARTH_RADIUS * Math.cos(origin.latitude * RAD);
  return { east, north };
}

/** Umkehrung von `toLocalMeters`. */
export function fromLocalMeters(origin: GeoPoint, offset: { east: number; north: number }): GeoPoint {
  const latitude = origin.latitude + offset.north / MEAN_EARTH_RADIUS / RAD;
  let longitude = origin.longitude + offset.east / (MEAN_EARTH_RADIUS * Math.cos(origin.latitude * RAD)) / RAD;
  if (longitude > 180) longitude -= 360;
  if (longitude < -180) longitude += 360;
  return { latitude, longitude };
}
