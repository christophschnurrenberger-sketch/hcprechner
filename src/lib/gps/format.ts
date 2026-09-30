/**
 * Anzeige von Entfernung und GPS-Status: Rundung passend zur Genauigkeit, Einheit, „≈“ und Vorlesetext.
 * Nie „0 m“ – ohne Entfernung erscheint „— m“ bzw. „Nicht verfügbar“.
 */
import { GPS_CONFIG, METERS_PER_YARD } from "./config";
import type { GreenTarget } from "./distanceEngine";
import { formatGpsNumber, gpsText, type GpsLocale } from "./messages";
import type { DistanceUnit, GpsStateKind } from "./types";

export type AccuracyQuality = "good" | "fair" | "poor" | "none";

export function accuracyQuality(accuracy: number | null | undefined): AccuracyQuality {
  if (accuracy === null || accuracy === undefined || !Number.isFinite(accuracy) || accuracy < 0) return "none";
  if (accuracy <= GPS_CONFIG.accuracyGood) return "good";
  if (accuracy <= GPS_CONFIG.accuracyFair) return "fair";
  return "poor";
}

/** Rundungsschritt und „≈“ für eine Genauigkeit (ohne Angabe: auf den Meter, ohne „≈“). */
export function roundingFor(accuracy: number | null | undefined): { step: number; approx: boolean } {
  if (accuracy === null || accuracy === undefined || !Number.isFinite(accuracy)) return { step: 1, approx: false };
  const rule = GPS_CONFIG.rounding.find((r) => accuracy <= r.maxAccuracy) ?? GPS_CONFIG.rounding[GPS_CONFIG.rounding.length - 1];
  return { step: rule.step, approx: rule.approx };
}

export function convertMeters(meters: number, unit: DistanceUnit): number {
  return unit === "YD" ? meters / METERS_PER_YARD : meters;
}

export function unitSymbol(unit: DistanceUnit): "m" | "yd" {
  return unit === "YD" ? "yd" : "m";
}

export interface DistanceDisplay {
  /** Zahl als Text („147“, „1.500“) oder null, wenn keine Entfernung vorliegt */
  value: string | null;
  /** gerundete Zahl in der gewählten Einheit (für Vergleiche) */
  rounded: number | null;
  prefix: "" | "≈" | ">";
  unit: "m" | "yd";
  /** vollständig: „147 m“, „≈ 150 m“, „> 1.500 m“, „— m“ */
  text: string;
  /** für Screenreader: „151 Meter zur Mitte des Grüns“ */
  spoken: string;
  approx: boolean;
  far: boolean;
}

export interface DistanceFormatOptions {
  accuracy: number | null;
  unit: DistanceUnit;
  target: GreenTarget;
  locale?: GpsLocale;
}

export function formatDistance(meters: number | null | undefined, opts: DistanceFormatOptions): DistanceDisplay {
  const unit = unitSymbol(opts.unit);
  const targetSpoken = gpsText(`target.spoken.${opts.target}`, {}, opts.locale);
  const unitSpoken = gpsText(`unit.spoken.${unit}`, {}, opts.locale);
  if (meters === null || meters === undefined || !Number.isFinite(meters) || meters < 0) {
    return { value: null, rounded: null, prefix: "", unit, text: `— ${unit}`, spoken: gpsText("spoken.unavailable", {}, opts.locale), approx: false, far: false };
  }
  if (meters > GPS_CONFIG.maxDisplayMeters) {
    const max = Math.round(convertMeters(GPS_CONFIG.maxDisplayMeters, opts.unit));
    const value = formatGpsNumber(max, opts.locale);
    return {
      value,
      rounded: max,
      prefix: ">",
      unit,
      text: `> ${value} ${unit}`,
      spoken: gpsText("spoken.far", { distance: value, unit: unitSpoken, target: targetSpoken }, opts.locale),
      approx: false,
      far: true,
    };
  }
  const { step, approx } = roundingFor(opts.accuracy);
  // nie „0 m“: mindestens ein Rundungsschritt
  const rounded = Math.max(step, Math.round(convertMeters(meters, opts.unit) / step) * step);
  const value = formatGpsNumber(rounded, opts.locale);
  return {
    value,
    rounded,
    prefix: approx ? "≈" : "",
    unit,
    text: `${approx ? "≈ " : ""}${value} ${unit}`,
    spoken: gpsText(approx ? "spoken.approx" : "spoken.distance", { distance: value, unit: unitSpoken, target: targetSpoken }, opts.locale),
    approx,
    far: false,
  };
}

export interface GpsStatusView {
  kind: GpsStateKind;
  quality: AccuracyQuality;
  /** Hauptzeile: „GPS“, „GPS ungenau“, „GPS wird ermittelt…“, „Kein GPS-Signal“ */
  label: string;
  /** „±5 m“ (nur mit Messung) */
  detail: string | null;
  /** Punkt ● anzeigen (aktive Messung) – nie die einzige Information (Text daneben) */
  dot: boolean;
  spoken: string;
}

export function gpsStatusView(kind: GpsStateKind, accuracy: number | null, locale?: GpsLocale): GpsStatusView {
  const quality = kind === "ACTIVE" ? accuracyQuality(accuracy) : "none";
  const acc = accuracy !== null && Number.isFinite(accuracy) ? Math.max(1, Math.round(accuracy)) : null;
  if (kind === "ACTIVE" && acc !== null) {
    const poor = quality === "poor";
    return {
      kind,
      quality,
      label: poor ? gpsText("gps.poor", {}, locale) : gpsText("gps.label", {}, locale),
      detail: gpsText("gps.accuracy", { accuracy: acc }, locale),
      dot: true,
      spoken: gpsText(poor ? "gps.spoken.poor" : "gps.spoken.good", { accuracy: acc }, locale),
    };
  }
  const label =
    kind === "ACQUIRING" || kind === "ACTIVE"
      ? gpsText("gps.acquiring", {}, locale)
      : kind === "NO_SIGNAL" || kind === "UNAVAILABLE"
        ? gpsText("gps.noSignal", {}, locale)
        : gpsText("gps.off", {}, locale);
  return { kind, quality: "none", label, detail: null, dot: false, spoken: label };
}

/** Alter einer Messung als „m:ss“ (z. B. „1:02“). */
export function formatAge(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
