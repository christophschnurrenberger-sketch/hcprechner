import Foundation
import HCPGolfKit

/// Punkt bzw. Vektor in einer lokalen Ebene (Meter; x = Osten, y = Norden) oder auf dem Bildschirm (Punkte).
public struct Vector2: Hashable, Codable, Sendable {
    public var x: Double
    public var y: Double

    public init(x: Double, y: Double) {
        self.x = x
        self.y = y
    }

    public static let zero = Vector2(x: 0, y: 0)

    public static func + (a: Vector2, b: Vector2) -> Vector2 { Vector2(x: a.x + b.x, y: a.y + b.y) }
    public static func - (a: Vector2, b: Vector2) -> Vector2 { Vector2(x: a.x - b.x, y: a.y - b.y) }
    public static func * (a: Vector2, s: Double) -> Vector2 { Vector2(x: a.x * s, y: a.y * s) }
    public static prefix func - (a: Vector2) -> Vector2 { Vector2(x: -a.x, y: -a.y) }

    public func dot(_ o: Vector2) -> Double { x * o.x + y * o.y }
    /// z-Komponente des Kreuzprodukts: > 0, wenn `o` links von `self` liegt
    public func cross(_ o: Vector2) -> Double { x * o.y - y * o.x }
    public var length: Double { (x * x + y * y).squareRoot() }

    public var normalized: Vector2 {
        let l = length
        return l > 0 ? Vector2(x: x / l, y: y / l) : .zero
    }

    /// Drehung gegen den Uhrzeigersinn (mathematisch positiv) um `radians`.
    public func rotated(by radians: Double) -> Vector2 {
        let c = cos(radians)
        let s = sin(radians)
        return Vector2(x: x * c - y * s, y: x * s + y * c)
    }

    public func distance(to o: Vector2) -> Double { (self - o).length }
}

/// Lokale Tangentialebene um einen Ursprung mit den Krümmungsradien des WGS-84-Ellipsoids (Meridian- und
/// Querkrümmungsradius). Auf einem Golfplatz (unter ~1 km) weicht sie von Vincenty um Millimeter ab – mit dem
/// mittleren Erdradius wären es in Ost-West-Richtung rund 0,3 %. Angezeigte Entfernungen rechnet `Geodesy`.
public struct LocalFrame: Hashable, Sendable {
    public let origin: GeoPoint
    private let metersPerDegreeLatitude: Double
    private let metersPerDegreeLongitude: Double

    public init(origin: GeoPoint) {
        self.origin = origin
        let a = 6_378_137.0
        let f = 1.0 / 298.257223563
        let e2 = f * (2 - f)
        let phi = origin.latitude * Double.pi / 180
        let s = sin(phi)
        let w = (1 - e2 * s * s).squareRoot()
        let meridian = a * (1 - e2) / (w * w * w)
        let primeVertical = a / w
        metersPerDegreeLatitude = meridian * Double.pi / 180
        metersPerDegreeLongitude = max(primeVertical * cos(phi) * Double.pi / 180, 1e-6)
    }

    public func toLocal(_ point: GeoPoint) -> Vector2 {
        var dLon = point.longitude - origin.longitude
        if dLon > 180 { dLon -= 360 }
        if dLon < -180 { dLon += 360 }
        return Vector2(x: dLon * metersPerDegreeLongitude, y: (point.latitude - origin.latitude) * metersPerDegreeLatitude)
    }

    public func toGeo(_ v: Vector2) -> GeoPoint {
        var longitude = origin.longitude + v.x / metersPerDegreeLongitude
        if longitude > 180 { longitude -= 360 }
        if longitude < -180 { longitude += 360 }
        return GeoPoint(latitude: origin.latitude + v.y / metersPerDegreeLatitude, longitude: longitude)
    }
}

/// Ebene Geometrie für Flächen und Linien (Grün, Hindernisse, Fairways) in lokalen Metern.
public enum PlanarGeometry {
    /// Vorzeichenbehaftete Fläche (Gaußsche Trapezformel); positiv bei Umlauf gegen den Uhrzeigersinn.
    public static func signedArea(_ ring: [Vector2]) -> Double {
        guard ring.count >= 3 else { return 0 }
        var sum = 0.0
        for i in ring.indices {
            let a = ring[i]
            let b = ring[(i + 1) % ring.count]
            sum += a.x * b.y - b.x * a.y
        }
        return sum / 2
    }

    public static func area(_ ring: [Vector2]) -> Double { abs(signedArea(ring)) }

    /// Flächenschwerpunkt; bei entarteten Flächen der Mittelwert der Punkte.
    public static func centroid(_ ring: [Vector2]) -> Vector2? {
        guard !ring.isEmpty else { return nil }
        let a = signedArea(ring)
        if abs(a) < 1e-9 {
            let sum = ring.reduce(Vector2.zero, +)
            return sum * (1.0 / Double(ring.count))
        }
        var cx = 0.0
        var cy = 0.0
        for i in ring.indices {
            let p = ring[i]
            let q = ring[(i + 1) % ring.count]
            let f = p.x * q.y - q.x * p.y
            cx += (p.x + q.x) * f
            cy += (p.y + q.y) * f
        }
        return Vector2(x: cx / (6 * a), y: cy / (6 * a))
    }

    /// Schwerpunkt einer WGS-84-Fläche.
    public static func centroid(of polygon: GeoPolygon) -> GeoPoint? {
        guard let first = polygon.points.first, polygon.isValid else { return nil }
        let frame = LocalFrame(origin: first)
        return centroid(polygon.points.map(frame.toLocal)).map(frame.toGeo)
    }

    /// Punkt in Fläche (Strahlverfahren); Punkte auf dem Rand gelten als innen.
    public static func contains(_ p: Vector2, in ring: [Vector2]) -> Bool {
        guard ring.count >= 3 else { return false }
        var inside = false
        var j = ring.count - 1
        for i in ring.indices {
            let a = ring[i]
            let b = ring[j]
            if distanceToSegment(p, a, b) < 1e-9 { return true }
            if (a.y > p.y) != (b.y > p.y) {
                let xCross = (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x
                if p.x < xCross { inside.toggle() }
            }
            j = i
        }
        return inside
    }

    /// Nächster Punkt auf der Strecke a–b.
    public static func closestPointOnSegment(_ p: Vector2, _ a: Vector2, _ b: Vector2) -> Vector2 {
        let ab = b - a
        let len2 = ab.dot(ab)
        guard len2 > 0 else { return a }
        let t = max(0, min(1, (p - a).dot(ab) / len2))
        return a + ab * t
    }

    public static func distanceToSegment(_ p: Vector2, _ a: Vector2, _ b: Vector2) -> Double {
        closestPointOnSegment(p, a, b).distance(to: p)
    }

    /// Nächster Punkt auf dem Rand einer Fläche (`closed`) bzw. auf einer Linie.
    public static func closestPoint(on path: [Vector2], to p: Vector2, closed: Bool) -> Vector2? {
        guard let first = path.first else { return nil }
        guard path.count > 1 else { return first }
        var best = first
        var bestDistance = Double.infinity
        let count = closed ? path.count : path.count - 1
        for i in 0..<count {
            let c = closestPointOnSegment(p, path[i], path[(i + 1) % path.count])
            let d = c.distance(to: p)
            if d < bestDistance {
                bestDistance = d
                best = c
            }
        }
        return best
    }

    /// Schnittparameter t der Geraden `origin + t · direction` mit den Kanten einer Fläche (aufsteigend sortiert).
    /// `direction` sollte normiert sein, dann ist t der Abstand in Metern.
    public static func lineIntersections(origin: Vector2, direction: Vector2, ring: [Vector2]) -> [Double] {
        guard ring.count >= 3 else { return [] }
        var ts: [Double] = []
        for i in ring.indices {
            let a = ring[i]
            let b = ring[(i + 1) % ring.count]
            let e = b - a
            let denom = direction.cross(e)
            if abs(denom) < 1e-12 { continue } // parallel
            let ao = a - origin
            let t = ao.cross(e) / denom
            let u = ao.cross(direction) / denom
            if u >= -1e-9 && u <= 1 + 1e-9 { ts.append(t) }
        }
        return ts.sorted()
    }

    /// Entferntester Punkt einer Punktfolge.
    public static func farthestPoint(of points: [Vector2], from p: Vector2) -> Vector2? {
        points.max { $0.distance(to: p) < $1.distance(to: p) }
    }

    /// Richtungswinkel (rad) eines Vektors gegenüber Norden, im Uhrzeigersinn (0 = Nord, π/2 = Ost).
    public static func bearing(of v: Vector2) -> Double {
        atan2(v.x, v.y)
    }

    /// Kompassrichtung (Grad, 0–360) von a nach b.
    public static func bearingDegrees(from a: GeoPoint, to b: GeoPoint) -> Double {
        let v = LocalFrame(origin: a).toLocal(b)
        let deg = bearing(of: v) * 180 / Double.pi
        return deg < 0 ? deg + 360 : deg
    }
}
