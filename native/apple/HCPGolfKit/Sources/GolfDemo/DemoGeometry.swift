import Foundation
import GolfCore
import HCPGolfKit

/// Deterministischer Zufall (SplitMix64): Die Demo-Plätze sehen bei jedem Start gleich aus.
struct DemoRandom {
    private var state: UInt64

    init(seed: UInt64) {
        state = seed
    }

    mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }

    mutating func unit() -> Double { Double(next() >> 11) / Double(UInt64(1) << 53) }
    mutating func range(_ a: Double, _ b: Double) -> Double { a + (b - a) * unit() }
    mutating func chance(_ p: Double) -> Bool { unit() < p }
    mutating func sign() -> Double { chance(0.5) ? 1 : -1 }
}

/// Linienzug in lokalen Metern mit Abstandsparametrisierung.
struct Polyline {
    let points: [Vector2]
    let cumulative: [Double]

    init(_ points: [Vector2]) {
        self.points = points
        var c: [Double] = [0]
        for i in 1..<max(points.count, 1) {
            c.append(c[i - 1] + points[i].distance(to: points[i - 1]))
        }
        self.cumulative = c
    }

    var length: Double { cumulative.last ?? 0 }

    private func segment(at s: Double) -> Int {
        var i = 0
        while i < points.count - 2 && cumulative[i + 1] < s { i += 1 }
        return i
    }

    func point(at s: Double) -> Vector2 {
        guard points.count > 1 else { return points.first ?? .zero }
        let i = segment(at: s)
        let segLength = cumulative[i + 1] - cumulative[i]
        let t = segLength > 0 ? (s - cumulative[i]) / segLength : 0
        return points[i] + (points[i + 1] - points[i]) * t
    }

    /// Richtung (normiert) bei `s`.
    func direction(at s: Double) -> Vector2 {
        guard points.count > 1 else { return Vector2(x: 0, y: 1) }
        let i = segment(at: s)
        return (points[i + 1] - points[i]).normalized
    }

    /// Normale nach rechts (bezogen auf die Laufrichtung).
    func rightNormal(at s: Double) -> Vector2 {
        let d = direction(at: s)
        return Vector2(x: d.y, y: -d.x)
    }

    /// Teilstück zwischen zwei Abständen (inklusive Eckpunkten dazwischen).
    func subpath(from s0: Double, to s1: Double) -> [Vector2] {
        var out = [point(at: s0)]
        for (i, c) in cumulative.enumerated() where c > s0 && c < s1 {
            out.append(points[i])
        }
        out.append(point(at: s1))
        return out
    }
}

/// Schleife eines Platzteils (Achteck mit abgeschrägten Ecken). Die Löcher liegen hintereinander auf dieser Schleife;
/// an den Ecken entstehen Doglegs. Zwei getrennte Schleifen (vordere/hintere neun) überschneiden sich nie.
struct RingLayout {
    /// Begrenzungsrechteck in lokalen Metern (Clubhaus = 0/0)
    var minX: Double
    var minY: Double
    var width: Double
    var height: Double
    var chamfer: Double
    /// im Uhrzeigersinn (Innenseite rechts) – sonst gegen den Uhrzeigersinn
    var clockwise: Bool
    /// Start auf der Westseite, Abstand von unten (m)
    var startFromBottom: Double

    var path: Polyline {
        let x0 = minX, y0 = minY, x1 = minX + width, y1 = minY + height, c = chamfer
        let start = Vector2(x: x0, y: y0 + startFromBottom)
        // Westseite nach Norden, dann im Uhrzeigersinn
        var ring = [
            Vector2(x: x0, y: y1 - c), Vector2(x: x0 + c, y: y1), Vector2(x: x1 - c, y: y1), Vector2(x: x1, y: y1 - c),
            Vector2(x: x1, y: y0 + c), Vector2(x: x1 - c, y: y0), Vector2(x: x0 + c, y: y0), Vector2(x: x0, y: y0 + c),
        ]
        if !clockwise {
            // Westseite nach Süden, dann gegen den Uhrzeigersinn
            ring = [Vector2(x: x0, y: y0 + c), Vector2(x: x0 + c, y: y0), Vector2(x: x1 - c, y: y0), Vector2(x: x1, y: y0 + c),
                    Vector2(x: x1, y: y1 - c), Vector2(x: x1 - c, y: y1), Vector2(x: x0 + c, y: y1), Vector2(x: x0, y: y1 - c)]
        }
        return Polyline([start] + ring + [start])
    }

    /// Innenseite der Schleife: +1 = rechts der Laufrichtung
    var insideSign: Double { clockwise ? 1 : -1 }
}

enum DemoShapes {
    /// Ellipse mit leichter, deterministischer Unregelmäßigkeit (Grün, Bunker, Teich).
    static func blob(center: Vector2, along axis: Vector2, semiLength a: Double, semiWidth b: Double,
                     points n: Int = 24, wobble: Double = 0.06, phase: Double = 0) -> [Vector2] {
        let u = axis.normalized
        let v = Vector2(x: -u.y, y: u.x)
        return (0..<n).map { i in
            let t = Double(i) / Double(n) * 2 * Double.pi
            let r = 1 + wobble * sin(3 * t + phase) + wobble * 0.6 * cos(5 * t + 2 * phase)
            return center + u * (a * cos(t) * r) + v * (b * sin(t) * r)
        }
    }

    /// Fläche entlang eines Linienzugs mit veränderlicher Breite (Fairway, Bach).
    static func ribbon(_ line: Polyline, from s0: Double, to s1: Double, step: Double = 8,
                       halfWidth: (Double) -> (left: Double, right: Double)) -> [Vector2] {
        guard s1 > s0 else { return [] }
        var left: [Vector2] = []
        var right: [Vector2] = []
        var s = s0
        while true {
            let p = line.point(at: s)
            // Normale gemittelt über ±6 m, damit an Doglegs keine Schleifen entstehen
            let n = (line.rightNormal(at: max(0, s - 6)) + line.rightNormal(at: min(line.length, s + 6))).normalized
            let w = halfWidth(s)
            left.append(p - n * w.left)
            right.append(p + n * w.right)
            if s >= s1 { break }
            s = min(s1, s + step)
        }
        return left + right.reversed()
    }
}
