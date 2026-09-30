/**
 * GPS-Geodaten der Golfplätze: Grün je Loch (unabhängig vom Abschlag), Abdeckung und Prüfung.
 * Teil der bestehenden Platzstruktur (LayoutDto.holeGeo) – kein eigener GPS-Platzdienst.
 *
 * Harte Regel wie bei den Ratings: Koordinaten werden nie erfunden oder geschätzt. Fehlt ein Wert, bleibt er leer.
 */
import { GPS_CONFIG } from "@/lib/gps/config";
import { geodesicDistance, isGeoPoint, isLatitude, isLongitude } from "@/lib/gps/geodesy";
import type { CourseDto, GeoPoint, GreenGeo, HoleGeoDto, LayoutDto } from "./types";

export function emptyGreen(): GreenGeo {
  return { front: null, center: null, back: null, polygon: null, pin: null };
}

/** Grün hat mindestens einen Punkt oder eine Fläche/Fahne. */
export function greenHasData(green: GreenGeo | null | undefined): boolean {
  return Boolean(green && (green.front || green.center || green.back || green.polygon || green.pin));
}

/** Eintrag des Platzes für eine Lochnummer (ohne Umrechnung). */
export function holeGeoFor(layout: Pick<LayoutDto, "holeGeo">, holeNumber: number): HoleGeoDto | null {
  return (layout.holeGeo ?? []).find((g) => g.holeNumber === holeNumber) ?? null;
}

/**
 * Grün für ein gespieltes Loch. Auf einem 9-Loch-Platz, der zweimal gespielt wird (Löcher 10–18 als zweite Runde),
 * ist Loch 10 physisch dasselbe Grün wie Loch 1 – gilt nur, wenn für Loch 10 selbst nichts hinterlegt ist.
 */
export function greenForHole(layout: Pick<LayoutDto, "holeGeo" | "holesCount">, holeNumber: number): GreenGeo | null {
  const own = holeGeoFor(layout, holeNumber);
  if (own && greenHasData(own.green)) return own.green;
  if (layout.holesCount === 9 && holeNumber > 9 && holeNumber <= 18) {
    const loop = holeGeoFor(layout, holeNumber - 9);
    if (loop && greenHasData(loop.green)) return loop.green;
  }
  return null;
}

/** Hat der Platz überhaupt Grün-Koordinaten (sonst bleibt das Distance-Feature ausgeblendet)? */
export function layoutHasGreens(layout: Pick<LayoutDto, "holeGeo"> | null | undefined): boolean {
  return Boolean(layout?.holeGeo?.some((g) => isGeoPoint(g.green.center) || isGeoPoint(g.green.front) || isGeoPoint(g.green.back)));
}

export interface GreenCoverage {
  /** Löcher des Platzes */
  holes: number;
  /** Löcher mit Grünmitte */
  withCenter: number;
  /** Löcher mit Front und Back */
  withFrontBack: number;
  /** Lochnummern ohne Grünmitte */
  missing: number[];
  level: "COMPLETE" | "PARTIAL" | "NONE";
}

export function greenCoverage(layout: Pick<LayoutDto, "holeGeo" | "holesCount">): GreenCoverage {
  const holes = Math.max(0, Math.min(layout.holesCount, 36));
  const missing: number[] = [];
  let withCenter = 0;
  let withFrontBack = 0;
  for (let n = 1; n <= holes; n++) {
    const g = holeGeoFor(layout, n)?.green;
    if (g && isGeoPoint(g.center)) withCenter += 1;
    else missing.push(n);
    if (g && isGeoPoint(g.front) && isGeoPoint(g.back)) withFrontBack += 1;
  }
  return { holes, withCenter, withFrontBack, missing, level: holes > 0 && withCenter === holes ? "COMPLETE" : withCenter > 0 ? "PARTIAL" : "NONE" };
}

/** Abdeckung einer Anlage über alle aktiven Plätze („Green GPS: 18/18 ✓“). */
export function courseGreenCoverage(course: Pick<CourseDto, "layouts">): GreenCoverage {
  const layouts = course.layouts.filter((l) => l.active);
  const parts = layouts.map((l) => greenCoverage(l));
  const holes = parts.reduce((s, p) => s + p.holes, 0);
  const withCenter = parts.reduce((s, p) => s + p.withCenter, 0);
  return {
    holes,
    withCenter,
    withFrontBack: parts.reduce((s, p) => s + p.withFrontBack, 0),
    missing: parts.length === 1 ? parts[0].missing : [],
    level: holes > 0 && withCenter === holes ? "COMPLETE" : withCenter > 0 ? "PARTIAL" : "NONE",
  };
}

/** Kurzform für Listen: „18/18 ✓“, „11/18 ⚠“, „–“. */
export function coverageLabel(c: GreenCoverage): string {
  if (c.holes === 0 || c.level === "NONE") return "–";
  return `${c.withCenter}/${c.holes} ${c.level === "COMPLETE" ? "✓" : "⚠"}`;
}

// ---------------------------------------------------------------------------
// Eingabe
// ---------------------------------------------------------------------------

/**
 * Liest „Breite, Länge“ in Dezimalgrad, wie es Kartendienste beim Kopieren liefern
 * („47.941234, 10.312345“, „47,941234; 10,312345“, „47.941234 10.312345“).
 * Leer → null, nicht lesbar oder außerhalb des Wertebereichs → "INVALID".
 */
const COORDINATE_PAIR = /^(-?\d{1,3}(?:[.,]\d+)?)\s*(?:;|,|\s)\s*(-?\d{1,3}(?:[.,]\d+)?)$/;

export function parseCoordinatePair(text: string | null | undefined): GeoPoint | null | "INVALID" {
  const raw = (text ?? "").trim();
  if (raw === "") return null;
  const m = raw.match(COORDINATE_PAIR);
  if (!m) return "INVALID";
  const latitude = Number(m[1].replace(",", "."));
  const longitude = Number(m[2].replace(",", "."));
  if (!isLatitude(latitude) || !isLongitude(longitude)) return "INVALID";
  return { latitude, longitude };
}

/** Einzelwert (Dezimalpunkt oder -komma) für CSV/Formulare: leer → null, sonst Zahl oder NaN. */
export function parseCoordinate(text: string | null | undefined): number | null {
  const raw = (text ?? "").trim().replace(/\s/g, "");
  if (raw === "") return null;
  const normalized = raw.replace(",", ".");
  return /^-?\d{1,3}(\.\d+)?$/.test(normalized) ? Number(normalized) : Number.NaN;
}

/** Anzeige „47.941234, 10.312345“ (6 Nachkommastellen ≈ 0,1 m). */
export function formatCoordinatePair(p: GeoPoint | null | undefined): string {
  return p ? `${p.latitude.toFixed(6)}, ${p.longitude.toFixed(6)}` : "";
}

/** Link zur Kontrolle eines Punktes auf OpenStreetMap. */
export function osmLink(p: GeoPoint): string {
  return `https://www.openstreetmap.org/?mlat=${p.latitude.toFixed(6)}&mlon=${p.longitude.toFixed(6)}#map=19/${p.latitude.toFixed(6)}/${p.longitude.toFixed(6)}`;
}

// ---------------------------------------------------------------------------
// Übernahme (gemeinsam für Node-Repository und Webspace-Datensatz)
// ---------------------------------------------------------------------------

const samePoint = (a: GeoPoint | null, b: GeoPoint | null) => (a === null || b === null ? a === b : a.latitude === b.latitude && a.longitude === b.longitude);

/** Erlaubte Lochnummern eines Platzes (inkl. zweiter Runde 10–18 auf 9-Loch-Plätzen mit eigenen Lochdaten). */
export function maxHoleNumber(layout: Pick<LayoutDto, "holesCount" | "holes">): number {
  return Math.min(36, Math.max(layout.holesCount, ...layout.holes.map((h) => h.holeNumber)));
}

export interface GreenUpdate {
  holeNumber: number;
  front: GeoPoint | null;
  center: GeoPoint | null;
  back: GeoPoint | null;
  source: HoleGeoDto["source"];
}

/**
 * Setzt Front/Mitte/Back für die übergebenen Löcher. Andere Löcher, Grünfläche, Fahne und Abschlagpositionen
 * bleiben unverändert; ein Loch ohne jegliche Daten entfällt. Liefert die neue Liste und die geänderten Löcher.
 */
export function mergeGreenUpdates(
  layout: Pick<LayoutDto, "id" | "holeGeo" | "holesCount" | "holes">,
  updates: readonly GreenUpdate[],
  now: string,
): { holeGeo: HoleGeoDto[]; changed: number[]; removed: number[] } {
  const max = maxHoleNumber(layout);
  const seen = new Set<number>();
  for (const u of updates) {
    if (u.holeNumber < 1 || u.holeNumber > max) throw new Error(`Loch ${u.holeNumber} gibt es auf diesem Platz nicht (1–${max})`);
    if (seen.has(u.holeNumber)) throw new Error(`Loch ${u.holeNumber} ist doppelt angegeben`);
    seen.add(u.holeNumber);
  }
  const byHole = new Map((layout.holeGeo ?? []).map((g) => [g.holeNumber, g]));
  const changed: number[] = [];
  const removed: number[] = [];
  for (const u of updates) {
    const existing = byHole.get(u.holeNumber) ?? null;
    const before = existing?.green ?? emptyGreen();
    if (samePoint(before.front, u.front) && samePoint(before.center, u.center) && samePoint(before.back, u.back)) continue;
    const green: GreenGeo = { ...before, front: u.front, center: u.center, back: u.back };
    const tees = existing?.tees ?? [];
    if (!greenHasData(green) && tees.length === 0) {
      if (existing) {
        byHole.delete(u.holeNumber);
        removed.push(u.holeNumber);
      }
      continue;
    }
    byHole.set(u.holeNumber, { layoutId: layout.id, holeNumber: u.holeNumber, green, tees, source: u.source ?? "MANUAL", updatedAt: now });
    changed.push(u.holeNumber);
  }
  return { holeGeo: [...byHole.values()].sort((a, b) => a.holeNumber - b.holeNumber), changed, removed };
}

/** Plausibilitätshinweise (keine Fehler): weit von der Anlage entfernt, Breite/Länge vertauscht, Front/Back weit weg. */
export function greenWarnings(green: Pick<GreenGeo, "front" | "center" | "back">, course: Pick<CourseDto, "latitude" | "longitude"> | null): string[] {
  const warnings: string[] = [];
  const anchor = course && isLatitude(course.latitude) && isLongitude(course.longitude) ? { latitude: course.latitude, longitude: course.longitude } : null;
  const points: [string, GeoPoint | null][] = [
    ["Front", green.front],
    ["Mitte", green.center],
    ["Back", green.back],
  ];
  for (const [label, p] of points) {
    if (!p || !isGeoPoint(p)) continue;
    if (anchor) {
      const d = geodesicDistance(anchor, p);
      if (d > GPS_CONFIG.adminFarFromCourseMeters) {
        const swapped = isLatitude(p.longitude) && isLongitude(p.latitude) ? geodesicDistance(anchor, { latitude: p.longitude, longitude: p.latitude }) : Infinity;
        warnings.push(
          swapped <= GPS_CONFIG.adminFarFromCourseMeters
            ? `${label}: Breite und Länge vertauscht?`
            : `${label}: ${Math.round(d / 1000)} km von der Anlage entfernt – bitte prüfen`,
        );
      }
    }
    if (label !== "Mitte" && green.center && isGeoPoint(green.center) && geodesicDistance(green.center, p) > GPS_CONFIG.adminFrontBackMaxMeters) {
      warnings.push(`${label}: mehr als ${GPS_CONFIG.adminFrontBackMaxMeters} m von der Grünmitte entfernt`);
    }
  }
  return warnings;
}
