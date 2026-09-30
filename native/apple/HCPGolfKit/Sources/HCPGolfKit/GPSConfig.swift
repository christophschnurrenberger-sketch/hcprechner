import Foundation

/// Kennzahlen des GPS-Features – identisch mit `src/lib/gps/config.ts` (Zeiten hier in Sekunden).
public enum GPSConfig {
    /// Genauigkeit (m) bis hier: „GPS ●“
    public static let accuracyGood = 10.0
    /// bis hier noch ohne Rundung; darüber „GPS ungenau“
    public static let accuracyFair = 20.0
    /// schlechtere Messungen werden verworfen
    public static let accuracyReject = 100.0

    /// Anzeige-Rundung abhängig von der Genauigkeit (keine Scheingenauigkeit)
    public static let rounding: [(maxAccuracy: Double, step: Int, approx: Bool)] = [
        (20, 1, false),
        (30, 5, true),
        (.infinity, 10, true),
    ]
    /// weiter entfernt: „> 1500 m“
    public static let maxDisplayMeters = 1500.0

    public static let positionStale: TimeInterval = 20
    public static let positionExpired: TimeInterval = 60
    public static let noSignalAfter: TimeInterval = 30

    /// Plausibilität: schneller als 12 m/s bewegt sich auf dem Platz niemand
    public static let maxPlausibleSpeed = 12.0
    public static let jumpConfirmations = 2
    public static let jumpConfirmRadius = 15.0
    /// Glättung: angenommene Gehgeschwindigkeit (m/s)
    public static let filterSpeed = 2.5

    /// Watch: Herzschlag, Verbindungsverlust, Alter anzeigen, veraltet
    public static let watchHeartbeat: TimeInterval = 5
    public static let watchConnectionLost: TimeInterval = 15
    public static let watchShowAgeAfter: TimeInterval = 10
    public static let watchStaleAfter: TimeInterval = 60

    /// iPhone-App: Die Web-Ansicht gilt als aktiv, solange sie spätestens so oft sendet (s); sonst rechnet die App selbst.
    public static let webViewSilentAfter: TimeInterval = 8

    public static let metersPerYard = 0.9144
}
