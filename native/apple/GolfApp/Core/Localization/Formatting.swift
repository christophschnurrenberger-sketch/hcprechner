import Foundation
import GolfCore
import HCPGolfKit

/// Anzeigeformate (lokalisiert über das Gebietsschema des Geräts). Keine Rechenlogik – nur Darstellung.
enum Format {
    static func unitSymbol(_ unit: DistanceFormat.Unit) -> String { unit == .yards ? "yd" : "m" }

    /// Entfernung für die große Anzeige: gerundet nach GPS-Genauigkeit, nie „0“.
    static func distance(_ meters: Double?, accuracy: Double?, unit: DistanceFormat.Unit) -> DistanceValue {
        let r = DistanceFormat.rounded(meters: meters, accuracy: accuracy, unit: unit)
        return DistanceValue(value: r.value, approx: r.approx, far: r.far)
    }

    /// Entfernung als Text mit Einheit („132 m“), metergenau (Karte, Planung).
    static func distanceText(_ meters: Double?, unit: DistanceFormat.Unit) -> String {
        distance(meters, accuracy: nil, unit: unit).text + " " + unitSymbol(unit)
    }

    /// Über/unter Par: „+3“, „±0“ bzw. „E“, „−2“; ohne Wert „–“.
    static func toPar(_ value: Int?) -> String {
        guard let value else { return "–" }
        if value == 0 { return L10n.Score.even }
        return value > 0 ? "+\(value)" : "−\(-value)"
    }

    /// Handicap Index mit einer Nachkommastelle; Plus-Handicaps mit „+“.
    static func handicap(_ value: Double?) -> String {
        guard let value else { return "–" }
        let text = abs(value).formatted(.number.precision(.fractionLength(1)))
        return value < 0 ? "+" + text : text
    }

    static func decimal(_ value: Double?, digits: Int = 1) -> String {
        guard let value else { return "–" }
        return value.formatted(.number.precision(.fractionLength(digits)))
    }

    static func percent(_ value: Double?) -> String {
        guard let value else { return "–" }
        return (value / 100).formatted(.percent.precision(.fractionLength(0)))
    }

    static func date(_ date: LocalDate) -> String {
        date.date().formatted(date: .abbreviated, time: .omitted)
    }

    static func score(_ value: Int?) -> String { value.map(String.init) ?? "–" }
}
