/**
 * Robuste Positionsverarbeitung: verwirft sehr ungenaue Messungen, prüft unrealistische Sprünge und glättet
 * leicht (Kalman-Filter mit der gemeldeten Genauigkeit), ohne dass die Anzeige träge wird.
 *
 * Es wird nur die aktuelle Schätzung gehalten – kein Bewegungsverlauf.
 */
import { GPS_CONFIG } from "./config";
import type { LocationFix } from "./distanceEngine";
import { fromLocalMeters, geodesicDistance, isGeoPoint, toLocalMeters } from "./geodesy";

export type FilterVerdict = "ACCEPTED" | "RESET" | "REJECTED_ACCURACY" | "REJECTED_INVALID" | "REJECTED_OUT_OF_ORDER" | "PENDING_JUMP";

export interface FilterResult {
  verdict: FilterVerdict;
  /** geglättete Position (Genauigkeit = vom Gerät gemeldet, keine Scheingenauigkeit) oder null */
  fix: LocationFix | null;
}

interface FilterState {
  latitude: number;
  longitude: number;
  /** Varianz der Schätzung (m²) */
  variance: number;
  timestamp: number;
  /** zuletzt gemeldete Genauigkeit */
  accuracy: number;
}

export class PositionFilter {
  private state: FilterState | null = null;
  private suspects: LocationFix[] = [];

  reset(): void {
    this.state = null;
    this.suspects = [];
  }

  /** aktuelle Schätzung (oder null) */
  current(): LocationFix | null {
    const s = this.state;
    return s ? { latitude: s.latitude, longitude: s.longitude, accuracy: s.accuracy, timestamp: s.timestamp } : null;
  }

  push(fix: LocationFix): FilterResult {
    if (!isGeoPoint(fix) || !Number.isFinite(fix.accuracy) || fix.accuracy < 0 || !Number.isFinite(fix.timestamp)) {
      return { verdict: "REJECTED_INVALID", fix: null };
    }
    if (fix.accuracy > GPS_CONFIG.accuracyReject) return { verdict: "REJECTED_ACCURACY", fix: null };
    const s = this.state;
    if (!s) return this.init(fix, "ACCEPTED");
    if (fix.timestamp < s.timestamp) return { verdict: "REJECTED_OUT_OF_ORDER", fix: null };

    const dt = (fix.timestamp - s.timestamp) / 1000;
    const jump = geodesicDistance(s, fix);
    const speed = dt > 0 ? jump / dt : Number.POSITIVE_INFINITY;
    const implausible = jump > fix.accuracy + s.accuracy && speed > GPS_CONFIG.maxPlausibleSpeed;
    if (implausible) {
      // Einzelne Ausreißer ignorieren; bestätigen mehrere Messungen den neuen Ort, gilt er (z. B. Fahrt im Cart).
      const last = this.suspects[this.suspects.length - 1];
      const consistent = last && geodesicDistance(last, fix) <= GPS_CONFIG.jumpConfirmRadius + Math.max(last.accuracy, fix.accuracy);
      this.suspects = consistent ? [...this.suspects, fix] : [fix];
      if (this.suspects.length >= GPS_CONFIG.jumpConfirmations) return this.init(fix, "RESET");
      return { verdict: "PENDING_JUMP", fix: null };
    }
    this.suspects = [];

    // Kalman-Schritt (lokale Meter): Unsicherheit wächst mit der Zeit – mindestens mit Gehgeschwindigkeit, bei
    // schnellerer (plausibler) Bewegung mit der beobachteten Geschwindigkeit, damit die Anzeige z. B. einer
    // Cart-Fahrt ohne Verzögerung folgt. Die Messung zieht entsprechend ihrer Genauigkeit.
    const motion = Math.max(GPS_CONFIG.filterSpeed, Math.min(Number.isFinite(speed) ? speed : 0, GPS_CONFIG.maxPlausibleSpeed));
    const variance = s.variance + dt * motion * motion;
    const measurement = fix.accuracy * fix.accuracy;
    const gain = measurement === 0 ? 1 : variance / (variance + measurement);
    const offset = toLocalMeters(s, fix);
    const next = fromLocalMeters(s, { east: offset.east * gain, north: offset.north * gain });
    this.state = { latitude: next.latitude, longitude: next.longitude, variance: (1 - gain) * variance, timestamp: fix.timestamp, accuracy: fix.accuracy };
    return { verdict: "ACCEPTED", fix: this.current() };
  }

  private init(fix: LocationFix, verdict: FilterVerdict): FilterResult {
    this.state = { latitude: fix.latitude, longitude: fix.longitude, variance: fix.accuracy * fix.accuracy, timestamp: fix.timestamp, accuracy: fix.accuracy };
    this.suspects = [];
    return { verdict, fix: this.current() };
  }
}
