/** Gemeinsame Typen des GPS-Features (Smartphone, Admin, Watch-Protokoll). */

/** Distanzeinheit (Konto-Einstellung). Standard: Meter. */
export type DistanceUnit = "M" | "YD";
export const DISTANCE_UNITS: readonly DistanceUnit[] = ["M", "YD"];

/** Zentraler Berechtigungsstatus – vom Browser bzw. Gerät abgeleitet. */
export type LocationPermission = "UNKNOWN" | "DENIED" | "AUTHORIZED" | "RESTRICTED" | "UNAVAILABLE";

/** Zustand der Standortbestimmung. */
export type LocationStatus =
  /** Standortdienst aus (keine aktive Runde, pausiert oder beendet) */
  | "OFF"
  /** gestartet, noch keine Messung */
  | "ACQUIRING"
  /** aktuelle Messung vorhanden */
  | "ACTIVE"
  /** Messungen bleiben aus (Signal verloren, Position nicht verfügbar) */
  | "NO_SIGNAL"
  /** Start nicht möglich (Berechtigung fehlt, nicht unterstützt) */
  | "ERROR";

/**
 * Rundenstatus aus Sicht des GPS-Features. Standort läuft nur bei ACTIVE –
 * PAUSED (Runde verlassen, App im Hintergrund) und COMPLETED schalten ihn aus.
 */
export type RoundStatus = "NOT_STARTED" | "ACTIVE" | "PAUSED" | "COMPLETED";

/** Was der Spieler über den GPS-Zustand sieht. */
export type GpsStateKind =
  | "OFF"
  /** Erstnutzung: Erklärung + „Standort aktivieren“ */
  | "PERMISSION_REQUIRED"
  | "DENIED"
  | "RESTRICTED"
  | "UNAVAILABLE"
  | "ACQUIRING"
  | "ACTIVE"
  | "NO_SIGNAL";
