import Foundation
import GolfCore
import HCPGolfKit

/// Simulierte GPS-Messungen für Entwicklung und Tests: Positionen auf einem Loch, eine ganze Runde ablaufen
/// (Abschlag → Schlagpositionen → Grün → nächster Abschlag), mit Rauschen, wählbarer Genauigkeit und GPS-Sprüngen.
public struct CourseWalkSimulator {
    public enum Spot: Equatable, Sendable {
        case tee
        /// auf der Spiellinie, so viele Meter vor der Grünmitte
        case fairway(toGreen: Double)
        case green
        /// Abschlag des nächsten Lochs
        case nextTee
    }

    public struct Config: Sendable {
        /// gemeldete Genauigkeit (m)
        public var accuracy: Double = 5
        /// Streuung der Messungen (m, je Achse)
        public var noise: Double = 1.5
        /// Gehgeschwindigkeit (m/s)
        public var walkingSpeed: Double = 1.3
        /// Abstand der Messungen (s)
        public var interval: TimeInterval = 2
        /// Wartezeit an jeder Schlagposition (s)
        public var shotPause: TimeInterval = 24
        /// Zeit auf dem Grün (s)
        public var greenTime: TimeInterval = 110
        /// Wahrscheinlichkeit eines einzelnen GPS-Sprungs je Messung
        public var jumpProbability: Double = 0

        public init() {}
    }

    /// Position auf einem Loch (Entwicklermenü „Fake GPS“).
    public static func position(_ spot: Spot, hole: Hole, next: Hole? = nil, teeID: TeeID?) -> GeoPoint? {
        switch spot {
        case .tee:
            return hole.teePosition(for: teeID)
        case .green:
            return hole.green?.resolvedCenter
        case .nextTee:
            return next?.teePosition(for: teeID)
        case let .fairway(toGreen):
            guard let line = playLine(hole: hole, teeID: teeID) else { return nil }
            return line.toGeo(line.path.point(at: max(0, line.path.length - toGreen)))
        }
    }

    struct PlayLine {
        let frame: LocalFrame
        let path: Polyline
        func toGeo(_ v: Vector2) -> GeoPoint { frame.toGeo(v) }
    }

    /// Spiellinie vom Abschlag des Spielers zur Grünmitte.
    static func playLine(hole: Hole, teeID: TeeID?) -> PlayLine? {
        guard let tee = hole.teePosition(for: teeID), let green = hole.green?.resolvedCenter else { return nil }
        let frame = LocalFrame(origin: tee)
        var points = [Vector2.zero]
        // Dogleg-Punkte der hinterlegten Spiellinie übernehmen, wenn sie vor dem Abschlag des Spielers liegen
        let line = hole.lineOfPlay.map(frame.toLocal)
        let greenLocal = frame.toLocal(green)
        for corner in line.dropFirst().dropLast() where corner.distance(to: greenLocal) < greenLocal.length {
            points.append(corner)
        }
        points.append(greenLocal)
        return PlayLine(frame: frame, path: Polyline(points))
    }

    /// Schlagpositionen eines Lochs (vom Abschlag aus): Par 3 direkt aufs Grün, Par 4 ein Abschlag, Par 5 mit Layup.
    public static func shotSpots(hole: Hole, teeID: TeeID?, seed: UInt64 = 1) -> [GeoPoint] {
        guard let line = playLine(hole: hole, teeID: teeID) else { return [] }
        var rng = DemoRandom(seed: seed &+ UInt64(hole.number))
        let length = line.path.length
        var distances: [Double] = [0]
        switch hole.par ?? 4 {
        case 3: break
        case 4: distances.append(min(225, length - 120))
        default:
            distances.append(min(230, length - 230))
            distances.append(length - 100)
        }
        return distances.map { d in
            let lateral = d == 0 ? 0 : rng.range(-9, 9)
            return line.toGeo(line.path.point(at: d) + line.path.rightNormal(at: d) * lateral)
        } + [hole.green?.resolvedCenter].compactMap { $0 }
    }

    /// Messungen für eine ganze Runde (oder einzelne Löcher). Deterministisch für einen Seed.
    public static func walk(course: Course, holes: [Int], teeID: TeeID?, start: Date, config: Config = Config(), seed: UInt64 = 42) -> [LocationFix] {
        var rng = DemoRandom(seed: seed)
        var fixes: [LocationFix] = []
        var time = start
        var position: GeoPoint?

        func emit(_ p: GeoPoint) {
            let frame = LocalFrame(origin: p)
            var noisy = frame.toGeo(Vector2(x: gaussian(&rng) * config.noise, y: gaussian(&rng) * config.noise))
            if config.jumpProbability > 0 && rng.chance(config.jumpProbability) {
                noisy = frame.toGeo(Vector2(x: rng.range(-250, 250), y: rng.range(-250, 250)))
            }
            fixes.append(LocationFix(point: noisy, accuracy: config.accuracy, timestamp: time))
            time += config.interval
        }
        func stay(at p: GeoPoint, for seconds: TimeInterval) {
            var t = 0.0
            repeat {
                emit(p)
                t += config.interval
            } while t < seconds
        }
        func walk(to target: GeoPoint) {
            guard let from = position else { position = target; return }
            let frame = LocalFrame(origin: from)
            let delta = frame.toLocal(target)
            let steps = max(1, Int((delta.length / (config.walkingSpeed * config.interval)).rounded(.up)))
            for i in 1...steps {
                emit(frame.toGeo(delta * (Double(i) / Double(steps))))
            }
            position = target
        }

        for (index, number) in holes.enumerated() {
            guard let hole = course.hole(number) else { continue }
            let spots = shotSpots(hole: hole, teeID: teeID, seed: seed)
            guard let tee = spots.first, let green = spots.last else { continue }
            walk(to: tee)
            stay(at: tee, for: config.shotPause)
            for spot in spots.dropFirst().dropLast() {
                walk(to: spot)
                stay(at: spot, for: config.shotPause)
            }
            walk(to: green)
            stay(at: green, for: config.greenTime)
            if index == holes.count - 1 { break }
        }
        return fixes
    }

    static func gaussian(_ rng: inout DemoRandom) -> Double {
        let u1 = max(rng.unit(), 1e-12)
        let u2 = rng.unit()
        return (-2 * log(u1)).squareRoot() * cos(2 * Double.pi * u2)
    }
}
