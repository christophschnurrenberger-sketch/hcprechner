import Foundation
import HCPGolfKit

/// Entfernungen zum Grün. Front und Back hängen vom Standort ab: Sie liegen dort, wo die Linie vom Spieler zur
/// Grünmitte den Grünrand schneidet (wie ein Annäherungsschlag das Grün tatsächlich sieht). Ohne Grünfläche gelten
/// die festen Punkte Front/Back der Platzdaten.
public struct GreenDistances: Equatable, Sendable {
    public var front: Double?
    public var center: Double?
    public var back: Double?
    public var pin: Double?
    public var frontPoint: GeoPoint?
    public var centerPoint: GeoPoint?
    public var backPoint: GeoPoint?
    /// Spieler steht auf dem Grün (dann gibt es kein „Front“)
    public var playerOnGreen: Bool

    public init(front: Double? = nil, center: Double? = nil, back: Double? = nil, pin: Double? = nil,
                frontPoint: GeoPoint? = nil, centerPoint: GeoPoint? = nil, backPoint: GeoPoint? = nil,
                playerOnGreen: Bool = false) {
        self.front = front
        self.center = center
        self.back = back
        self.pin = pin
        self.frontPoint = frontPoint
        self.centerPoint = centerPoint
        self.backPoint = backPoint
        self.playerOnGreen = playerOnGreen
    }

    public static let none = GreenDistances()

    public var hasAny: Bool { front != nil || center != nil || back != nil || pin != nil }
}

public enum GreenDistanceCalculator {
    public static func distances(from player: GeoPoint, green: GreenGeometry?, pin: GeoPoint? = nil) -> GreenDistances {
        guard player.isValid, let green else { return .none }
        let center = green.resolvedCenter
        var result = GreenDistances()
        result.centerPoint = center
        result.center = center.map { Geodesy.distance(player, $0) }
        if let pin, pin.isValid { result.pin = Geodesy.distance(player, pin) }

        if let outline = green.outline, outline.isValid, let center {
            let frame = LocalFrame(origin: center)
            let ring = outline.points.map(frame.toLocal)
            let p = frame.toLocal(player)
            let inside = PlanarGeometry.contains(p, in: ring)
            let toCenter = Vector2.zero - p
            if toCenter.length < 0.5 {
                // genau auf der Grünmitte: hinterster Randpunkt als Back
                result.playerOnGreen = true
                if let far = PlanarGeometry.farthestPoint(of: ring, from: p) {
                    result.backPoint = frame.toGeo(far)
                    result.back = Geodesy.distance(player, frame.toGeo(far))
                }
                return result
            }
            let direction = toCenter.normalized
            let ts = PlanarGeometry.lineIntersections(origin: p, direction: direction, ring: ring).filter { $0 > 0 }
            if inside {
                result.playerOnGreen = true
                if let tBack = ts.last {
                    let back = frame.toGeo(p + direction * tBack)
                    result.backPoint = back
                    result.back = Geodesy.distance(player, back)
                }
                return result
            }
            if let tFront = ts.first, let tBack = ts.last {
                let front = frame.toGeo(p + direction * tFront)
                let back = frame.toGeo(p + direction * tBack)
                result.frontPoint = front
                result.backPoint = back
                result.front = Geodesy.distance(player, front)
                result.back = Geodesy.distance(player, back)
                return result
            }
        }
        // Rückfall: feste Punkte aus den Platzdaten
        if let front = green.front, front.isValid {
            result.frontPoint = front
            result.front = Geodesy.distance(player, front)
        }
        if let back = green.back, back.isValid {
            result.backPoint = back
            result.back = Geodesy.distance(player, back)
        }
        return result
    }
}

/// Entfernung zu einem Hindernis oder Zielpunkt: bis zum Anfang (erreichen), zur Mitte und bis zum Ende (überspielen).
public struct FeatureDistance: Identifiable, Equatable, Sendable {
    public var id: String
    public var kind: HoleFeatureKind
    public var name: String?
    /// Seite aus Sicht des Spielers (Richtung Grün)
    public var side: FeatureSide
    /// bis zum nächsten Punkt (Anfang)
    public var reach: Double
    /// bis zur Mitte (nur Flächen)
    public var center: Double?
    /// bis zum entferntesten Punkt (Ende, „Carry“) – nur Flächen
    public var carry: Double?
    public var reachPoint: GeoPoint
    public var carryPoint: GeoPoint?
    /// Spieler steht im Hindernis
    public var playerInside: Bool
}

public enum FeatureDistanceCalculator {
    /// Seitlicher Abstand (m), bis zu dem ein Element als „mittig“ gilt
    public static let centerTolerance = 8.0
    /// Elemente hinter dem Ziel werden bis zu diesem Abstand (m) angezeigt (z. B. Bunker hinter dem Grün)
    public static let beyondTargetMargin = 40.0

    /// Relevante Hindernisse/Zielpunkte vor dem Spieler, nach Entfernung bis zum Anfang sortiert.
    /// - Parameter target: Richtung, in die der Spieler spielt (meist Grünmitte); ohne Ziel alle Elemente.
    public static func distances(from player: GeoPoint, features: [HoleFeature], toward target: GeoPoint?) -> [FeatureDistance] {
        guard player.isValid else { return [] }
        let frame = LocalFrame(origin: player)
        let targetLocal = target.map(frame.toLocal)
        let axis = targetLocal?.normalized
        let limit = targetLocal.map { $0.length + beyondTargetMargin }

        var out: [FeatureDistance] = []
        for feature in features where feature.geometry.isValid {
            let pts = feature.geometry.points.map(frame.toLocal)
            let origin = Vector2.zero
            let reachLocal: Vector2
            var centerLocal: Vector2?
            var carryLocal: Vector2?
            var inside = false
            switch feature.geometry.shape {
            case .point:
                reachLocal = pts[0]
            case .polyline:
                reachLocal = PlanarGeometry.closestPoint(on: pts, to: origin, closed: false) ?? pts[0]
            case .polygon:
                inside = PlanarGeometry.contains(origin, in: pts)
                reachLocal = inside ? origin : (PlanarGeometry.closestPoint(on: pts, to: origin, closed: true) ?? pts[0])
                centerLocal = PlanarGeometry.centroid(pts)
                carryLocal = PlanarGeometry.farthestPoint(of: pts, from: origin)
            }
            // Nur Elemente vor dem Spieler (Projektion auf die Spielrichtung) und nicht weit hinter dem Ziel
            if let axis, let limit {
                let ahead = (carryLocal ?? centerLocal ?? reachLocal).dot(axis)
                if ahead < 0 && !inside { continue }
                if reachLocal.dot(axis) > limit { continue }
            }
            let reference = centerLocal ?? reachLocal
            let side: FeatureSide
            if let axis {
                let lateral = axis.cross(reference) // > 0: links der Spielrichtung
                side = abs(lateral) <= centerTolerance ? .center : (lateral > 0 ? .left : .right)
            } else {
                side = feature.side ?? .center
            }
            let reachPoint = frame.toGeo(reachLocal)
            let carryPoint = carryLocal.map(frame.toGeo)
            out.append(FeatureDistance(
                id: feature.id,
                kind: feature.kind,
                name: feature.name,
                side: side,
                reach: inside ? 0 : Geodesy.distance(player, reachPoint),
                center: centerLocal.map { Geodesy.distance(player, frame.toGeo($0)) },
                carry: carryPoint.map { Geodesy.distance(player, $0) },
                reachPoint: reachPoint,
                carryPoint: carryPoint,
                playerInside: inside
            ))
        }
        return out.sorted { $0.reach < $1.reach }
    }
}

/// Entfernung zu einem frei gewählten Punkt (Tippen auf die Karte) und weiter zum Grün.
public struct TargetMeasurement: Equatable, Sendable {
    public var target: GeoPoint
    /// vom Spieler (bzw. Abschlag) zum Punkt
    public var fromOrigin: Double
    /// vom Punkt zur Grünmitte
    public var toGreen: Double?

    public static func measure(from origin: GeoPoint, to target: GeoPoint, greenCenter: GeoPoint?) -> TargetMeasurement? {
        guard origin.isValid, target.isValid else { return nil }
        return TargetMeasurement(
            target: target,
            fromOrigin: Geodesy.distance(origin, target),
            toGreen: greenCenter.flatMap { $0.isValid ? Geodesy.distance(target, $0) : nil }
        )
    }
}
