import Foundation

/// Zentrale Rundung – Swift-Fassung von `src/rules/whs/de/2026/rounding.ts`.
///
/// Es gibt in GolfCore keine andere Stelle, an der WHS-relevante Werte gerundet werden. Jede Funktion ist nach dem
/// Regelwerks-Schritt benannt, an dem gerundet wird. Gleitkomma: 13,15 ist binär 13,1499999… – deshalb wird mit einer
/// kleinen, relativen Toleranz gerundet (WHS-Eingaben haben höchstens eine Nachkommastelle).
public enum WHSRounding {
    static let relativeEpsilon = 1e-9

    /// Die Rechenfunktionen prüfen ihre Eingaben vorher (`WHSError`); ein nicht endlicher Wert wird unverändert
    /// zurückgegeben statt die App zu beenden.
    public static func round(_ value: Double, decimals: Int = 1, mode: WHSRoundingMode = .halfAwayFromZero) -> Double {
        assert(value.isFinite, "roundWHS: ungültiger Wert \(value)")
        assert((0...6).contains(decimals), "roundWHS: ungültige Nachkommastellen \(decimals)")
        guard value.isFinite else { return value }
        let factor = pow(10.0, Double(min(max(decimals, 0), 6)))
        let scaled = value * factor
        let epsilon = relativeEpsilon * max(1, abs(scaled))
        let rounded: Double
        switch mode {
        case .halfAwayFromZero:
            let sign: Double = scaled < 0 ? -1 : 1
            rounded = sign * (abs(scaled) + 0.5 + epsilon).rounded(.down)
        case .halfUp:
            rounded = (scaled + 0.5 + epsilon).rounded(.down)
        }
        let result = rounded / factor
        return result == 0 ? 0 : result // nie −0
    }

    /// Score Differential: auf eine Nachkommastelle.
    public static func scoreDifferential(_ value: Double, mode: WHSRoundingMode = .halfAwayFromZero) -> Double {
        round(value, decimals: 1, mode: mode)
    }

    /// Handicap Index (Durchschnitt, Soft Cap): auf eine Nachkommastelle.
    public static func handicapIndex(_ value: Double, mode: WHSRoundingMode = .halfAwayFromZero) -> Double {
        round(value, decimals: 1, mode: mode)
    }

    /// Course Handicap: auf eine ganze Zahl – erst hier, nie in Zwischenschritten.
    public static func courseHandicap(_ value: Double, mode: WHSRoundingMode = .halfAwayFromZero) -> Int {
        Int(round(value, decimals: 0, mode: mode))
    }

    /// Playing Handicap: Course Handicap × Handicap-Verrechnung, auf eine ganze Zahl.
    public static func playingHandicap(_ value: Double, mode: WHSRoundingMode = .halfAwayFromZero) -> Int {
        Int(round(value, decimals: 0, mode: mode))
    }

    /// Entfernt nur Gleitkomma-Rauschen aus Summen bereits gerundeter Werte (z. B. 20,3 + 26,8).
    /// Wie `Math.round` in JavaScript: .5 Richtung +∞.
    public static func normalizeDecimal(_ value: Double, decimals: Int = 1) -> Double {
        let factor = pow(10.0, Double(decimals))
        let result = (value * factor + 0.5).rounded(.down) / factor
        return result == 0 ? 0 : result
    }
}
