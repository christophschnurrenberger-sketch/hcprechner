import Foundation
import HCPGolfKit

/// Abbildung eines Lochs auf den Bildschirm: gedreht, sodass die Spielrichtung (Abschlag → Grün) nach oben zeigt,
/// eingepasst in die Ansicht, mit Zoom und Verschieben – und umkehrbar (Tippen → Koordinate).
/// Bildschirmkoordinaten: x nach rechts, y nach unten (Punkte).
public struct HoleViewport: Equatable, Sendable {
    public let frame: LocalFrame
    /// Drehwinkel (rad), mit dem lokale Koordinaten gedreht werden, damit die Spielrichtung nach oben zeigt
    public let rotation: Double
    public let size: Vector2
    /// Punkte je Meter
    public private(set) var scale: Double
    /// gedrehte lokale Koordinate (m) in der Bildschirmmitte
    public private(set) var center: Vector2

    public init(frame: LocalFrame, rotation: Double, size: Vector2, scale: Double, center: Vector2) {
        self.frame = frame
        self.rotation = rotation
        self.size = size
        self.scale = scale
        self.center = center
    }

    /// Ansicht, in die alle `points` passen; die Achse `from` → `to` zeigt nach oben.
    public static func fitting(_ points: [GeoPoint], axisFrom from: GeoPoint, axisTo to: GeoPoint,
                               size: Vector2, padding: Double = 24) -> HoleViewport? {
        let valid = points.filter(\.isValid)
        guard from.isValid, to.isValid, size.x > 0, size.y > 0, !valid.isEmpty else { return nil }
        let frame = LocalFrame(origin: from)
        let axis = frame.toLocal(to)
        // Achse auf +y (oben) drehen: Zielwinkel π/2, aktueller Winkel atan2(y, x)
        let rotation = axis.length > 0.01 ? Double.pi / 2 - atan2(axis.y, axis.x) : 0
        let rotated = valid.map { frame.toLocal($0).rotated(by: rotation) }
        let minX = rotated.map(\.x).min()!, maxX = rotated.map(\.x).max()!
        let minY = rotated.map(\.y).min()!, maxY = rotated.map(\.y).max()!
        let width = max(maxX - minX, 20)
        let height = max(maxY - minY, 20)
        let usableW = max(size.x - 2 * padding, 1)
        let usableH = max(size.y - 2 * padding, 1)
        let scale = min(usableW / width, usableH / height)
        let center = Vector2(x: (minX + maxX) / 2, y: (minY + maxY) / 2)
        return HoleViewport(frame: frame, rotation: rotation, size: size, scale: scale, center: center)
    }

    public func screenPoint(_ p: GeoPoint) -> Vector2 {
        let r = frame.toLocal(p).rotated(by: rotation)
        return Vector2(x: (r.x - center.x) * scale + size.x / 2, y: size.y / 2 - (r.y - center.y) * scale)
    }

    public func geoPoint(screen s: Vector2) -> GeoPoint {
        let r = Vector2(x: (s.x - size.x / 2) / scale + center.x, y: (size.y / 2 - s.y) / scale + center.y)
        return frame.toGeo(r.rotated(by: -rotation))
    }

    public func points(forMeters meters: Double) -> Double { meters * scale }

    /// Zoom um einen Bildschirmpunkt (der Punkt unter dem Finger bleibt stehen).
    public func zoomed(by factor: Double, anchor: Vector2, minScale: Double = 0.2, maxScale: Double = 40) -> HoleViewport {
        guard factor.isFinite, factor > 0 else { return self }
        let newScale = min(max(scale * factor, minScale), maxScale)
        let anchorLocal = Vector2(x: (anchor.x - size.x / 2) / scale + center.x, y: (size.y / 2 - anchor.y) / scale + center.y)
        var copy = self
        copy.scale = newScale
        copy.center = Vector2(x: anchorLocal.x - (anchor.x - size.x / 2) / newScale,
                              y: anchorLocal.y - (size.y / 2 - anchor.y) / newScale)
        return copy
    }

    /// Verschieben um eine Bildschirmstrecke (Finger zieht die Karte mit).
    public func panned(by translation: Vector2) -> HoleViewport {
        var copy = self
        copy.center = Vector2(x: center.x - translation.x / scale, y: center.y + translation.y / scale)
        return copy
    }

    /// Ansicht auf einen Punkt zentrieren, mit Breite `meters` über die kürzere Bildschirmkante (z. B. Grün-Zoom).
    public func focused(on p: GeoPoint, spanMeters meters: Double) -> HoleViewport {
        var copy = self
        copy.center = frame.toLocal(p).rotated(by: rotation)
        copy.scale = min(size.x, size.y) / max(meters, 5)
        return copy
    }

    /// Bildschirmrichtung der Kompass-Nordrichtung (für eine Nordnadel), als Winkel im Uhrzeigersinn ab „oben“.
    public var northAngle: Double { -rotation }
}

/// Distanzbögen um den Spieler (z. B. 50 / 100 / 150 m).
public enum DistanceArcs {
    public static let defaultMeters = [50, 100, 120, 140, 160, 180]

    /// Radien (m), die bis zum Ziel sinnvoll sind; über das Ziel hinaus höchstens ein Bogen.
    public static func radii(preset: [Int], distanceToTarget: Double?, unit: DistanceFormat.Unit) -> [Double] {
        let factor = unit == .yards ? GPSConfig.metersPerYard : 1
        let sorted = preset.filter { $0 > 0 }.sorted().map { Double($0) * factor }
        guard let distanceToTarget, distanceToTarget.isFinite else { return sorted }
        var out: [Double] = []
        for r in sorted {
            out.append(r)
            if r >= distanceToTarget { break }
        }
        return out
    }
}
