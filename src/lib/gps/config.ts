/**
 * Alle Kennzahlen des GPS-Features an einer Stelle (Schwellen, Zeiten, Rundung).
 * Keine dieser Zahlen wird an anderer Stelle wiederholt.
 */
export const GPS_CONFIG = {
  /** Genauigkeit (Radius in Metern, wie vom Gerät gemeldet): bis hier „GPS ●“ ohne Einschränkung. */
  accuracyGood: 10,
  /** bis hier noch brauchbar (Anzeige ohne Rundung, Genauigkeit wird genannt). Darüber: „GPS ungenau“. */
  accuracyFair: 20,
  /** Messungen mit schlechterer Genauigkeit werden verworfen (z. B. reine WLAN-/Funkzellenortung). */
  accuracyReject: 100,

  /**
   * Anzeige-Rundung abhängig von der Genauigkeit – keine Scheingenauigkeit (±35 m → „≈ 150 m“ statt „147 m“).
   * Die interne Berechnung bleibt ungerundet.
   */
  rounding: [
    { maxAccuracy: 20, step: 1, approx: false },
    { maxAccuracy: 30, step: 5, approx: true },
    { maxAccuracy: Number.POSITIVE_INFINITY, step: 10, approx: true },
  ],
  /** Weiter entfernt ist kein Grün eines Golflochs: Anzeige „> 1500 m“ (Hinweis: richtiges Loch?). */
  maxDisplayMeters: 1500,

  /** Ohne neue Messung gilt die Position nach … ms als veraltet („GPS wird ermittelt…“, Zahl abgeblendet). */
  positionStaleMs: 20_000,
  /** … und wird nach … ms nicht mehr für eine Entfernung verwendet („— m“). */
  positionExpiredMs: 60_000,
  /** Lochwechsel: eine Messung bis zu diesem Alter wird sofort für das neue Loch verwendet. */
  freshFixMs: 10_000,
  /** Ohne jede Messung seit dem Start bzw. seit dem letzten Fix: „Kein GPS-Signal“ nach … ms. */
  noSignalAfterMs: 30_000,

  /** Plausibilität: schneller als 12 m/s (≈ 43 km/h) bewegt sich auf dem Platz niemand. */
  maxPlausibleSpeed: 12,
  /** Ein unplausibler Sprung wird erst übernommen, wenn so viele Messungen in Folge ihn bestätigen. */
  jumpConfirmations: 2,
  /** Zwei Messungen gelten als „am selben Ort“, wenn sie höchstens so weit (plus Genauigkeit) auseinander liegen. */
  jumpConfirmRadius: 15,
  /** Glättung (Kalman-Filter): angenommene Gehgeschwindigkeit in m/s – bestimmt, wie schnell der Filter folgt. */
  filterSpeed: 2.5,

  /** Anzeige höchstens so oft aktualisieren (ms), und nur wenn sich der gerundete Wert ändert. */
  minRenderIntervalMs: 800,

  /** Optionen für die Standortabfrage des Browsers bzw. Geräts. */
  watch: { enableHighAccuracy: true, maximumAge: 3_000, timeout: 20_000 },
  /** Einmalige Abfrage (Admin „GPS-Position verwenden“, Platzsuche). */
  single: { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },

  /** Apple Watch: das iPhone meldet sich mindestens so oft (ms), auch ohne Änderung. */
  watchHeartbeatMs: 5_000,
  /** Ohne Nachricht so lange (ms) → „Verbindung verloren“. */
  watchConnectionLostMs: 15_000,
  /** Entfernung älter als … ms → Alter anzeigen („vor 0:18 min“). */
  watchShowAgeAfterMs: 10_000,
  /** Entfernung älter als … ms → „GPS-Daten veraltet“ / „nicht aktuell“. */
  watchStaleAfterMs: 60_000,

  /** Admin: Warnung, wenn eine Grünkoordinate so weit (m) von der Anlage entfernt liegt. */
  adminFarFromCourseMeters: 5_000,
  /** Admin: Warnung, wenn Front/Back so weit (m) von der Grünmitte entfernt liegen. */
  adminFrontBackMaxMeters: 80,
  /** Admin „GPS-Position verwenden“: schlechtere Genauigkeit (m) nur nach Rückfrage übernehmen. */
  adminCaptureMaxAccuracy: 10,
} as const;

/** 1 Yard = 0,9144 m (exakt). */
export const METERS_PER_YARD = 0.9144;
