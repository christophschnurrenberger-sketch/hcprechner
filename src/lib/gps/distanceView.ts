/**
 * Was der Distance-Screen zeigt – als reine Funktion aus Loch, Grün, Position und GPS-Zustand.
 * Enthält eine Signatur: Die Oberfläche wird nur neu gezeichnet, wenn sich etwas Sichtbares ändert.
 */
import type { GreenGeo } from "@/lib/courses/types";
import { GPS_CONFIG } from "./config";
import { availableTargets, computeHoleDistance, resolveTarget, type DistanceResult, type GreenTarget, type LocationFix } from "./distanceEngine";
import { formatDistance, gpsStatusView, type DistanceDisplay, type GpsStatusView } from "./format";
import { gpsText, type GpsLocale } from "./messages";
import type { DistanceUnit, GpsStateKind } from "./types";

export interface DistanceViewInput {
  courseId: string | null;
  holeNumber: number | null;
  green: GreenGeo | null;
  preferredTarget: GreenTarget;
  unit: DistanceUnit;
  gpsKind: GpsStateKind;
  /** geglättete Position (oder null) */
  fix: LocationFix | null;
  /** Zeitpunkt des letzten Lochwechsels (für „GPS wird aktualisiert…“) */
  holeChangedAt: number | null;
  now: number;
  locale?: GpsLocale;
}

export interface TargetDistanceView {
  target: GreenTarget;
  result: DistanceResult;
  display: DistanceDisplay;
  primary: boolean;
}

export interface DistanceViewState {
  hole: number | null;
  target: GreenTarget;
  /** Front/Mitte/Back (soweit hinterlegt, sonst nur Mitte) in Anzeige-Reihenfolge */
  targets: TargetDistanceView[];
  /** Hauptziel (Standard: Mitte) */
  result: DistanceResult;
  display: DistanceDisplay;
  gps: GpsStatusView;
  /** nach Lochwechsel noch keine frische Messung */
  updating: boolean;
  /** Messung älter als GPS_CONFIG.positionStaleMs (Zahl abgeblendet) */
  stale: boolean;
  noGreen: boolean;
  far: boolean;
  signature: string;
}

const RUNNING: readonly GpsStateKind[] = ["ACQUIRING", "ACTIVE", "NO_SIGNAL"];

export function buildDistanceView(input: DistanceViewInput): DistanceViewState {
  const { green, now, locale } = input;
  const target = resolveTarget(green, input.preferredTarget);
  const running = RUNNING.includes(input.gpsKind);
  const fix = running ? input.fix : null;
  // Lochwechsel: alte Entfernung sofort verwerfen – nur eine frische Messung darf für das neue Loch rechnen
  const updating = running && input.holeChangedAt !== null && (!fix || fix.timestamp < input.holeChangedAt - GPS_CONFIG.freshFixMs);
  const usable = updating ? null : fix;
  const compute = (t: GreenTarget) => computeHoleDistance({ courseId: input.courseId, holeNumber: input.holeNumber, green, fix: usable, target: t, now });
  const format = (r: DistanceResult) =>
    formatDistance(r.status === "valid" || r.status === "STALE" ? r.distance : null, { accuracy: r.accuracy, unit: input.unit, target: r.target, locale });

  const list = availableTargets(green).filter((t) => t !== "pin");
  const shown = list.length > 1 ? list : [target];
  const targets: TargetDistanceView[] = shown.map((t) => {
    const result = compute(t);
    return { target: t, result, display: format(result), primary: t === target };
  });
  const primary = targets.find((t) => t.primary) ?? (() => {
    const result = compute(target);
    return { target, result, display: format(result), primary: true };
  })();

  const stale = primary.result.status === "STALE";
  // Aktive Messung, aber veraltet → „GPS wird ermittelt…“, nach längerer Zeit → „Kein GPS-Signal“
  const age = fix ? now - fix.timestamp : Number.POSITIVE_INFINITY;
  const kind: GpsStateKind =
    input.gpsKind === "ACTIVE" && fix && age > GPS_CONFIG.noSignalAfterMs
      ? "NO_SIGNAL"
      : input.gpsKind === "ACTIVE" && age > GPS_CONFIG.positionStaleMs
        ? "ACQUIRING"
        : input.gpsKind;
  let gps = gpsStatusView(kind, kind === "ACTIVE" ? (fix?.accuracy ?? null) : null, locale);
  if (updating && kind !== "NO_SIGNAL") gps = { ...gps, label: gpsText("gps.updating", {}, locale), spoken: gpsText("gps.updating", {}, locale), detail: null, dot: false };

  const noGreen = input.holeNumber !== null && primary.result.status === "NO_TARGET";
  const far = primary.display.far;
  const signature = JSON.stringify([
    input.holeNumber,
    target,
    input.unit,
    updating,
    stale,
    gps.label,
    gps.detail,
    targets.map((t) => t.display.text),
    noGreen,
  ]);
  return { hole: input.holeNumber, target, targets, result: primary.result, display: primary.display, gps, updating, stale, noGreen, far, signature };
}
