import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { GreenGeo } from "@/lib/courses/types";
import {
  availableTargets,
  calculateDistance,
  calculateGreenDistances,
  computeHoleDistance,
  resolveTarget,
  type LocationFix,
} from "@/lib/gps/distanceEngine";
import { accuracyQuality, formatAge, formatDistance, gpsStatusView } from "@/lib/gps/format";
import { geodesicDistance, haversineDistance, vincentyDistance } from "@/lib/gps/geodesy";
import { gpsText } from "@/lib/gps/messages";

interface Vectors {
  toleranceMeters: number;
  distances: { name: string; a: { latitude: number; longitude: number }; b: { latitude: number; longitude: number }; meters: number }[];
  format: { meters: number | null; accuracy: number; unit: "M" | "YD"; text: string; approx: boolean; spoken: string }[];
  gpsStatus: { accuracy: number; label: string; detail: string; quality: string }[];
}

const vectors: Vectors = JSON.parse(readFileSync(path.join(__dirname, "../fixtures/gps-vectors.json"), "utf8"));

// Fiktives Grün (gleiche Punkte wie in den Testwerten: 137 m, 151 m, 420 m vom Spieler)
const PLAYER = { latitude: 47.94, longitude: 10.31 };
const byName = (n: string) => vectors.distances.find((d) => d.name.startsWith(n))!.b;
const GREEN: GreenGeo = { front: byName("Golfmaßstab: 137"), center: byName("Golfmaßstab: 151"), back: byName("Golfmaßstab: 420"), polygon: null, pin: null };
const NOW = Date.parse("2026-09-30T14:35:10Z");
const fix = (accuracy = 5, ageMs = 0, p = PLAYER): LocationFix => ({ ...p, accuracy, timestamp: NOW - ageMs });

describe("DistanceEngine – Distanz mit bekannten Koordinaten", () => {
  it.each(vectors.distances.map((d) => [d.name, d] as const))("%s", (_name, d) => {
    expect(Math.abs(calculateDistance(d.a, d.b) - d.meters)).toBeLessThan(vectors.toleranceMeters);
  });

  it("Vincenty ist genauer als die Kugelnäherung (Haversine nur Rückfallebene)", () => {
    const d = vectors.distances[0];
    expect(Math.abs(vincentyDistance(d.a, d.b)! - d.meters)).toBeLessThan(0.001);
    expect(Math.abs(haversineDistance(d.a, d.b) - d.meters)).toBeGreaterThan(1);
    // gegenüberliegende Punkte: Vincenty konvergiert nicht → Haversine
    const a = { latitude: 0, longitude: 0 };
    const b = { latitude: 0.5, longitude: 179.7 };
    expect(geodesicDistance(a, b)).toBeGreaterThan(19_000_000);
  });

  it("Front / Mitte / Back werden getrennt berechnet", () => {
    const r = calculateGreenDistances(PLAYER, GREEN);
    expect(Math.round(r.front!)).toBe(137);
    expect(Math.round(r.center!)).toBe(151);
    expect(Math.round(r.back!)).toBe(420);
    expect(r.pin).toBeNull();
    expect(availableTargets(GREEN)).toEqual(["green_front", "green_center", "green_back"]);
    expect(availableTargets({ ...GREEN, front: null, back: null })).toEqual(["green_center"]);
    expect(resolveTarget({ ...GREEN, front: null }, "green_front")).toBe("green_center");
  });
});

describe("DistanceEngine – Fehlerfälle", () => {
  it("ungültige Koordinaten (Breite 999) werden abgelehnt", () => {
    expect(() => calculateDistance({ latitude: 999, longitude: 10 }, PLAYER)).toThrow(RangeError);
    expect(() => calculateDistance(PLAYER, { latitude: 47, longitude: 181 })).toThrow(RangeError);
    expect(() => calculateDistance({ latitude: Number.NaN, longitude: 10 }, PLAYER)).toThrow(RangeError);
    const r = computeHoleDistance({ courseId: "c1", holeNumber: 7, green: GREEN, fix: { ...fix(), latitude: 999 }, target: "green_center", now: NOW });
    expect(r).toMatchObject({ status: "INVALID_POSITION", distance: null });
    const bad = computeHoleDistance({ courseId: "c1", holeNumber: 7, green: { ...GREEN, center: { latitude: 999, longitude: 10 } }, fix: fix(), target: "green_center", now: NOW });
    expect(bad).toMatchObject({ status: "INVALID_TARGET", distance: null });
  });

  it("fehlendes Grün (green_center = null) → NO_TARGET, nicht 0", () => {
    const r = computeHoleDistance({ courseId: "c1", holeNumber: 7, green: { ...GREEN, center: null }, fix: fix(), target: "green_center", now: NOW });
    expect(r.status).toBe("NO_TARGET");
    expect(r.distance).toBeNull();
    expect(computeHoleDistance({ courseId: "c1", holeNumber: 7, green: null, fix: fix(), target: "green_center", now: NOW }).status).toBe("NO_TARGET");
    const display = formatDistance(r.distance, { accuracy: 5, unit: "M", target: "green_center" });
    expect(display.text).toBe("— m");
    expect(display.text).not.toMatch(/^0/);
  });

  it("unbekanntes Loch, keine Position, veraltete Position", () => {
    expect(computeHoleDistance({ courseId: "c1", holeNumber: null, green: GREEN, fix: fix(), target: "green_center", now: NOW }).status).toBe("NO_HOLE");
    expect(computeHoleDistance({ courseId: "c1", holeNumber: 7, green: GREEN, fix: null, target: "green_center", now: NOW }).status).toBe("NO_POSITION");
    const stale = computeHoleDistance({ courseId: "c1", holeNumber: 7, green: GREEN, fix: fix(5, 30_000), target: "green_center", now: NOW });
    expect(stale.status).toBe("STALE");
    expect(Math.round(stale.distance!)).toBe(151);
    expect(computeHoleDistance({ courseId: "c1", holeNumber: 7, green: GREEN, fix: fix(5, 90_000), target: "green_center", now: NOW }).status).toBe("NO_POSITION");
  });

  it("Ergebnis enthält Loch, Einheit, Ziel, Genauigkeit und Zeitpunkt", () => {
    const r = computeHoleDistance({ courseId: "ottobeuren", holeNumber: 7, green: GREEN, fix: fix(5), target: "green_center", now: NOW });
    expect(r).toMatchObject({ courseId: "ottobeuren", holeId: 7, unit: "m", target: "green_center", accuracy: 5, timestamp: "2026-09-30T14:35:10.000Z", status: "valid" });
    expect(Math.round(r.distance!)).toBe(151);
  });
});

describe("Anzeige: Rundung, Einheit, keine Scheingenauigkeit", () => {
  it.each(vectors.format.map((f) => [`${f.meters} m, ±${f.accuracy} m, ${f.unit} → ${f.text}`, f] as const))("%s", (_n, f) => {
    const d = formatDistance(f.meters, { accuracy: f.accuracy, unit: f.unit, target: "green_center", locale: "de" });
    expect(d.text).toBe(f.text);
    expect(d.approx).toBe(f.approx);
    expect(d.spoken).toBe(f.spoken);
  });

  it.each(vectors.gpsStatus.map((s) => [s.accuracy, s] as const))("GPS-Genauigkeit ±%s m", (_a, s) => {
    const v = gpsStatusView("ACTIVE", s.accuracy, "de");
    expect(v.label).toBe(s.label);
    expect(v.detail).toBe(s.detail);
    expect(v.quality).toBe(s.quality);
    expect(v.dot).toBe(true);
    expect(accuracyQuality(s.accuracy)).toBe(s.quality);
  });

  it("Status ohne Messung; Englisch vorbereitet; Alter m:ss", () => {
    expect(gpsStatusView("ACQUIRING", null, "de").label).toBe("GPS wird ermittelt…");
    expect(gpsStatusView("NO_SIGNAL", null, "de").label).toBe("Kein GPS-Signal");
    expect(gpsStatusView("OFF", null, "de").label).toBe("GPS aus");
    expect(formatDistance(151, { accuracy: 5, unit: "M", target: "green_center", locale: "en" }).spoken).toBe("151 meters to the center of the green");
    expect(gpsText("noGreen", {}, "en")).toMatch(/No GPS green data/);
    expect(formatAge(62_000)).toBe("1:02");
    expect(formatAge(18_000)).toBe("0:18");
  });
});
