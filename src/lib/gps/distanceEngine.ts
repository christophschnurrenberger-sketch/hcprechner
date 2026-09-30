/**
 * DistanceEngine: Entfernung vom Spieler zum Grün (Luftlinie, geodätisch).
 *
 * Reine Funktionen ohne Browser- oder Serverzugriff – dieselbe Logik läuft auf dem Smartphone und ist in
 * native/apple (HCPGolfKit) für iPhone und Apple Watch mit denselben Testwerten nachgebaut.
 * Fehlt ein Ziel, gibt es nie „0“, sondern einen Status (z. B. NO_TARGET).
 */
import type { GeoPoint, GreenGeo } from "@/lib/courses/types";
import { GPS_CONFIG } from "./config";
import { assertGeoPoint, geodesicDistance, isGeoPoint } from "./geodesy";

/** Ziel auf dem Grün. Die erste Version zeigt die Mitte; vorne/hinten und Fahne sind vorbereitet. */
export type GreenTarget = "green_center" | "green_front" | "green_back" | "pin";

/** Anzeige-Reihenfolge, wenn Front/Center/Back vorhanden sind. */
export const GREEN_TARGET_ORDER: readonly GreenTarget[] = ["green_front", "green_center", "green_back"];

/** Eine Standortmessung (nur im Arbeitsspeicher – es wird kein Verlauf gespeichert). */
export interface LocationFix extends GeoPoint {
  /** Genauigkeit in Metern (Radius) laut Gerät */
  accuracy: number;
  /** Zeitpunkt der Messung (ms seit 1970) */
  timestamp: number;
}

export type DistanceStatus =
  | "valid"
  /** berechnet, aber die Messung ist älter als GPS_CONFIG.positionStaleMs */
  | "STALE"
  /** kein Grünziel für dieses Loch hinterlegt */
  | "NO_TARGET"
  /** keine (brauchbare) Position */
  | "NO_POSITION"
  /** aktuelles Loch unbekannt */
  | "NO_HOLE"
  | "INVALID_POSITION"
  | "INVALID_TARGET";

export interface DistanceResult {
  courseId: string | null;
  /** Lochnummer des Platzes */
  holeId: number | null;
  /** Meter, ungerundet (Anzeige rundet, siehe format.ts); null, wenn keine Entfernung berechnet werden kann */
  distance: number | null;
  unit: "m";
  target: GreenTarget;
  accuracy: number | null;
  /** Zeitpunkt der zugrunde liegenden Messung (ISO) */
  timestamp: string | null;
  status: DistanceStatus;
}

export interface GreenDistances {
  front: number | null;
  center: number | null;
  back: number | null;
  pin: number | null;
}

/** Koordinate eines Ziels (oder null, wenn nicht hinterlegt bzw. ungültig). */
export function targetPoint(green: GreenGeo | null | undefined, target: GreenTarget): GeoPoint | null {
  if (!green) return null;
  const p = target === "green_center" ? green.center : target === "green_front" ? green.front : target === "green_back" ? green.back : green.pin;
  return p ?? null;
}

/** Vorhandene Ziele eines Grüns in Anzeige-Reihenfolge (Front, Mitte, Back; Fahne zuletzt). */
export function availableTargets(green: GreenGeo | null | undefined): GreenTarget[] {
  if (!green) return [];
  const list = GREEN_TARGET_ORDER.filter((t) => isGeoPoint(targetPoint(green, t)));
  if (isGeoPoint(green.pin)) list.push("pin");
  return list;
}

/** Gewünschtes Ziel, sonst Grünmitte (die immer der Standard ist). */
export function resolveTarget(green: GreenGeo | null | undefined, preferred: GreenTarget): GreenTarget {
  return isGeoPoint(targetPoint(green, preferred)) ? preferred : "green_center";
}

/** Entfernung in Metern zwischen Spieler und Ziel. Wirft bei ungültigen Koordinaten (z. B. Breite 999). */
export function calculateDistance(player: GeoPoint, target: GeoPoint): number {
  assertGeoPoint(player, "Spielerposition");
  assertGeoPoint(target, "Zielkoordinate");
  return geodesicDistance(player, target);
}

/** Entfernungen zu allen hinterlegten Grünpunkten (fehlende bzw. ungültige Punkte → null). */
export function calculateGreenDistances(player: GeoPoint, green: GreenGeo | null | undefined): GreenDistances {
  assertGeoPoint(player, "Spielerposition");
  const to = (p: GeoPoint | null | undefined) => (isGeoPoint(p) ? geodesicDistance(player, p) : null);
  return { front: to(green?.front), center: to(green?.center), back: to(green?.back), pin: to(green?.pin) };
}

export interface HoleDistanceInput {
  courseId: string | null;
  holeNumber: number | null;
  green: GreenGeo | null | undefined;
  fix: LocationFix | null;
  target: GreenTarget;
  /** aktuelle Zeit (ms) – für Tests injizierbar */
  now: number;
}

/**
 * Entfernung für das aktuelle Loch. Das Ergebnis ist immer an Loch und Ziel gebunden – beim Lochwechsel
 * wird neu berechnet, ein Wert des vorigen Lochs kann so nie für das neue Loch angezeigt werden.
 */
export function computeHoleDistance(input: HoleDistanceInput): DistanceResult {
  const base: DistanceResult = {
    courseId: input.courseId,
    holeId: input.holeNumber,
    distance: null,
    unit: "m",
    target: input.target,
    accuracy: input.fix && Number.isFinite(input.fix.accuracy) ? input.fix.accuracy : null,
    timestamp: input.fix && Number.isFinite(input.fix.timestamp) ? new Date(input.fix.timestamp).toISOString() : null,
    status: "valid",
  };
  if (input.holeNumber === null || !Number.isInteger(input.holeNumber) || input.holeNumber < 1) return { ...base, status: "NO_HOLE" };
  const point = targetPoint(input.green, input.target);
  if (!point) return { ...base, status: "NO_TARGET" };
  if (!isGeoPoint(point)) return { ...base, status: "INVALID_TARGET" };
  if (!input.fix) return { ...base, status: "NO_POSITION" };
  if (!isGeoPoint(input.fix) || !Number.isFinite(input.fix.accuracy) || input.fix.accuracy < 0) return { ...base, status: "INVALID_POSITION" };
  const age = input.now - input.fix.timestamp;
  if (age > GPS_CONFIG.positionExpiredMs) return { ...base, status: "NO_POSITION" };
  const distance = geodesicDistance(input.fix, point);
  return { ...base, distance, status: age > GPS_CONFIG.positionStaleMs ? "STALE" : "valid" };
}
