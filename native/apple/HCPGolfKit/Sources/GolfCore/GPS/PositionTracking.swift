import Foundation
import HCPGolfKit

/// Kennzahlen der GPS-Auswertung der nativen App (ergänzt `GPSConfig` aus HCPGolfKit, dessen Schwellen gelten).
public enum GolfGPSConfig {
    /// Genauigkeit (m) bis hier: „Sehr gut“
    public static let accuracyExcellent = 5.0
    /// Hysterese der Anzeige: Eine neue Zahl erscheint erst, wenn sich der Wert um diesen Anteil eines
    /// Rundungsschritts von der angezeigten Zahl entfernt hat (verhindert Flackern zwischen 131 und 132 m).
    public static let displayHysteresis = 0.75
}

/// GPS-Qualität für die Anzeige („GPS: Sehr gut / Gut / Schwach“).
public enum GPSQuality: String, Sendable, Equatable {
    case excellent
    case good
    /// ungenau – Entfernungen werden gröber gerundet und mit „≈“ angezeigt
    case weak
    /// letzte zuverlässige Position ist älter als `GPSConfig.positionStale`
    case stale
    /// keine (verwertbare) Position
    case unavailable

    public static func classify(accuracy: Double?) -> GPSQuality {
        guard let accuracy, accuracy.isFinite, accuracy >= 0 else { return .unavailable }
        if accuracy <= GolfGPSConfig.accuracyExcellent { return .excellent }
        if accuracy <= GPSConfig.accuracyGood { return .good }
        return .weak
    }

    public var isUsable: Bool { self != .unavailable }
}

/// Aktuelle Spielerposition nach Filterung.
public struct PlayerPosition: Equatable, Sendable {
    public var point: GeoPoint
    public var accuracy: Double
    public var timestamp: Date
    public var quality: GPSQuality
    /// Die Position stammt aus einer früheren, zuverlässigen Messung („Wir verwenden die letzte zuverlässige Position“)
    public var isStale: Bool
    /// Zuletzt verworfene Messung war ungenau oder ein Sprung (Hinweis „GPS-Signal schwach“)
    public var lastFixRejected: Bool
}

/// Verarbeitet rohe Standortmessungen: verwirft ungenaue Messungen und Sprünge (PositionFilter aus HCPGolfKit),
/// glättet leicht und bewertet Qualität und Alter. Hält nur die aktuelle Position – keinen Bewegungsverlauf.
/// Nicht threadsicher: gehört einem Besitzer (in der App dem Standortdienst auf dem Main Actor).
public final class PositionTracker {
    private let filter = PositionFilter()
    public private(set) var lastAccepted: LocationFix?
    private var lastRejected = false

    public init() {}

    public func reset() {
        filter.reset()
        lastAccepted = nil
        lastRejected = false
    }

    /// Messung verarbeiten; liefert, ob sie übernommen wurde.
    @discardableResult
    public func push(_ fix: LocationFix) -> Bool {
        if let accepted = filter.push(fix).fix {
            lastAccepted = accepted
            lastRejected = false
            return true
        }
        lastRejected = true
        return false
    }

    /// Position zum Zeitpunkt `now` (mit Alter und Qualität); `nil`, wenn keine Messung oder die letzte zu alt ist.
    public func position(at now: Date) -> PlayerPosition? {
        guard let fix = lastAccepted else { return nil }
        let age = now.timeIntervalSince(fix.timestamp)
        if age > GPSConfig.positionExpired { return nil }
        let stale = age > GPSConfig.positionStale
        return PlayerPosition(point: fix.point, accuracy: fix.accuracy, timestamp: fix.timestamp,
                              quality: stale ? .stale : GPSQuality.classify(accuracy: fix.accuracy),
                              isStale: stale, lastFixRejected: lastRejected)
    }
}

/// Ruhige Anzeige einer Entfernung: Die angezeigte Zahl wechselt erst, wenn der neue Wert deutlich (Hysterese)
/// von ihr abweicht. Rundung abhängig von der Genauigkeit wie in der Web-App (`DistanceFormat`).
public struct DistanceStabilizer: Sendable {
    public private(set) var shown: Int?
    private var unit: DistanceFormat.Unit

    public init(unit: DistanceFormat.Unit = .meters) {
        self.unit = unit
    }

    public mutating func reset(unit: DistanceFormat.Unit? = nil) {
        shown = nil
        if let unit { self.unit = unit }
    }

    /// Neuer Messwert (m) → anzuzeigende Zahl in der Einheit.
    public mutating func update(meters: Double?, accuracy: Double?) -> (value: Int?, approx: Bool, far: Bool) {
        let r = DistanceFormat.rounded(meters: meters, accuracy: accuracy, unit: unit)
        guard let value = r.value, let meters, !r.far else {
            shown = r.value
            return r
        }
        let step = Double(DistanceFormat.rounding(accuracy: accuracy).step)
        let raw = unit == .yards ? meters / GPSConfig.metersPerYard : meters
        if let current = shown, current % Int(step) == 0, abs(raw - Double(current)) < step * GolfGPSConfig.displayHysteresis {
            return (current, r.approx, false)
        }
        shown = value
        return (value, r.approx, false)
    }
}
