import Foundation

/// Ziel auf dem Grün (erste Version: Mitte; vorne/hinten vorbereitet, Fahne später).
public enum GreenTarget: String, Codable, CaseIterable, Sendable {
    case greenCenter = "green_center"
    case greenFront = "green_front"
    case greenBack = "green_back"
}

/// Grün eines Lochs – unabhängig vom Abschlag.
public struct GreenGeo: Codable, Equatable, Sendable {
    public var front: GeoPoint?
    public var center: GeoPoint?
    public var back: GeoPoint?

    public init(front: GeoPoint? = nil, center: GeoPoint? = nil, back: GeoPoint? = nil) {
        self.front = front
        self.center = center
        self.back = back
    }

    public func point(_ target: GreenTarget) -> GeoPoint? {
        switch target {
        case .greenCenter: return center
        case .greenFront: return front
        case .greenBack: return back
        }
    }

    /// Front oder Back vorhanden → Anzeige in drei Zeilen
    public var hasFrontOrBack: Bool { front?.isValid == true || back?.isValid == true }
}

/// Eine Standortmessung (nur im Speicher, kein Verlauf).
public struct LocationFix: Equatable, Sendable {
    public var point: GeoPoint
    /// Genauigkeit in Metern (Radius)
    public var accuracy: Double
    public var timestamp: Date

    public init(point: GeoPoint, accuracy: Double, timestamp: Date) {
        self.point = point
        self.accuracy = accuracy
        self.timestamp = timestamp
    }
}

public enum DistanceError: Error, Equatable {
    case invalidCoordinate(String)
}

/// DistanceEngine – identisch mit `src/lib/gps/distanceEngine.ts`. Fehlt ein Ziel, gibt es nie 0, sondern nil.
public enum DistanceEngine {
    /// Entfernung in Metern; wirft bei ungültigen Koordinaten (z. B. Breite 999).
    public static func calculateDistance(_ player: GeoPoint, _ target: GeoPoint) throws -> Double {
        guard player.isValid else { throw DistanceError.invalidCoordinate("Spielerposition") }
        guard target.isValid else { throw DistanceError.invalidCoordinate("Zielkoordinate") }
        return Geodesy.distance(player, target)
    }

    public static func greenDistances(_ player: GeoPoint, _ green: GreenGeo?) -> (front: Double?, center: Double?, back: Double?) {
        func to(_ p: GeoPoint?) -> Double? {
            guard let p = p, p.isValid, player.isValid else { return nil }
            return Geodesy.distance(player, p)
        }
        return (to(green?.front), to(green?.center), to(green?.back))
    }

    /// Gewünschtes Ziel, sonst Grünmitte.
    public static func resolveTarget(_ green: GreenGeo?, preferred: GreenTarget) -> GreenTarget {
        green?.point(preferred)?.isValid == true ? preferred : .greenCenter
    }
}

/// Anzeige-Rundung – identisch mit `src/lib/gps/format.ts`.
public enum DistanceFormat {
    public enum Unit: String, Codable, Sendable {
        case meters = "m"
        case yards = "yd"
    }

    public static func rounding(accuracy: Double?) -> (step: Int, approx: Bool) {
        guard let accuracy = accuracy, accuracy.isFinite else { return (1, false) }
        let rule = GPSConfig.rounding.first { accuracy <= $0.maxAccuracy } ?? GPSConfig.rounding[GPSConfig.rounding.count - 1]
        return (rule.step, rule.approx)
    }

    /// Gerundeter Wert in der Einheit; nil ohne Entfernung (nie 0), `far` über 1500 m.
    public static func rounded(meters: Double?, accuracy: Double?, unit: Unit) -> (value: Int?, approx: Bool, far: Bool) {
        guard let meters = meters, meters.isFinite, meters >= 0 else { return (nil, false, false) }
        func convert(_ m: Double) -> Double { unit == .yards ? m / GPSConfig.metersPerYard : m }
        if meters > GPSConfig.maxDisplayMeters {
            return (Int(convert(GPSConfig.maxDisplayMeters).rounded()), false, true)
        }
        let r = rounding(accuracy: accuracy)
        let steps = (convert(meters) / Double(r.step)).rounded(.toNearestOrAwayFromZero)
        return (max(r.step, Int(steps) * r.step), r.approx, false)
    }

    /// Alter als „m:ss“
    public static func age(_ seconds: TimeInterval) -> String {
        let total = max(0, Int(seconds.rounded(.down)))
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}
