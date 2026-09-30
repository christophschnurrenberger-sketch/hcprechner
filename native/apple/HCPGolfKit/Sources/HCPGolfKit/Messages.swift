import Foundation

/// Texte der Watch-Anzeige – gleiche Schlüssel und Inhalte wie `src/lib/gps/messages.ts` (Deutsch primär, Englisch vorbereitet).
public enum GPSMessages {
    public enum Locale: String, Sendable {
        case de, en
    }

    static let de: [String: String] = [
        "target.short.green_center": "Mitte",
        "target.short.green_front": "Front",
        "target.short.green_back": "Back",
        "target.spoken.green_center": "zur Mitte des Grüns",
        "target.spoken.green_front": "zum vorderen Rand des Grüns",
        "target.spoken.green_back": "zum hinteren Rand des Grüns",
        "unit.spoken.m": "Meter",
        "unit.spoken.yd": "Yards",
        "spoken.distance": "{distance} {unit} {target}",
        "spoken.approx": "ungefähr {distance} {unit} {target}",
        "gps.label": "GPS",
        "gps.accuracy": "±{accuracy} m",
        "gps.poor": "GPS ungenau",
        "hole": "Loch {n}",
        "par": "Par {par}",
        "watch.noRound": "Keine aktive Runde",
        "watch.acquiring": "GPS wird ermittelt…",
        "watch.noData": "Keine GPS-Daten",
        "watch.checkPhone": "iPhone prüfen",
        "watch.connectionLost": "Verbindung verloren",
        "watch.notCurrent": "nicht aktuell",
        "watch.stale": "GPS-Daten veraltet",
        "watch.age": "vor {age} min",
        "watch.noGreen": "Keine Gründaten",
    ]

    static let en: [String: String] = [
        "target.short.green_center": "Center",
        "target.short.green_front": "Front",
        "target.short.green_back": "Back",
        "target.spoken.green_center": "to the center of the green",
        "target.spoken.green_front": "to the front of the green",
        "target.spoken.green_back": "to the back of the green",
        "unit.spoken.m": "meters",
        "unit.spoken.yd": "yards",
        "spoken.distance": "{distance} {unit} {target}",
        "spoken.approx": "about {distance} {unit} {target}",
        "gps.label": "GPS",
        "gps.accuracy": "±{accuracy} m",
        "gps.poor": "GPS inaccurate",
        "hole": "Hole {n}",
        "par": "Par {par}",
        "watch.noRound": "No active round",
        "watch.acquiring": "Locating GPS…",
        "watch.noData": "No GPS data",
        "watch.checkPhone": "Check iPhone",
        "watch.connectionLost": "Connection lost",
        "watch.notCurrent": "not current",
        "watch.stale": "GPS data outdated",
        "watch.age": "{age} min ago",
        "watch.noGreen": "No green data",
    ]

    public static func text(_ key: String, _ params: [String: String] = [:], locale: Locale = .de) -> String {
        var template = (locale == .en ? en[key] : de[key]) ?? de[key] ?? key
        for (name, value) in params {
            template = template.replacingOccurrences(of: "{\(name)}", with: value)
        }
        return template
    }

    /// Sprache des Geräts (Deutsch als Standard)
    public static var deviceLocale: Locale {
        (Foundation.Locale.preferredLanguages.first ?? "de").hasPrefix("en") ? .en : .de
    }
}
