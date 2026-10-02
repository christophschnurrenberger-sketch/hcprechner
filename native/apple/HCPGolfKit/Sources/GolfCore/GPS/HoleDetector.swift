import Foundation
import HCPGolfKit

/// Einstellung „Automatischer Lochwechsel“.
public enum AutoHoleChangeMode: String, Codable, Sendable, CaseIterable {
    /// bei hoher Sicherheit automatisch wechseln, sonst fragen
    case automatic
    /// immer fragen
    case ask
    /// nur manuell
    case off
}

public enum HoleChangeReason: String, Equatable, Sendable {
    /// Spieler steht am nächsten Abschlag, das aktuelle Loch hat aber noch keinen Score
    case scoreMissing
    /// Spieler steht an einem anderen als dem nächsten Loch
    case unexpectedHole
    /// Einstellung „immer fragen“
    case confirmationRequired
}

public enum HoleDetectionDecision: Equatable, Sendable {
    case none
    /// sicher: automatisch wechseln
    case advance(to: Int)
    /// wahrscheinlich, aber nicht sicher genug: „Zum nächsten Loch wechseln?“
    case suggest(to: Int, reason: HoleChangeReason)
}

public struct HoleDetectorConfig: Sendable, Equatable {
    /// Abstand zu einer Abschlagposition, ab dem der Spieler „am Abschlag“ ist (m)
    public var teeRadius = 30.0
    /// zusätzlicher Abstand zum Grünrand, ab dem das Grün als verlassen gilt (m)
    public var greenExitMargin = 8.0
    /// Abstand zum Grün, ab dem das aktuelle Grün als „besucht“ gilt (m)
    public var greenVisitMargin = 25.0
    /// so viele aufeinanderfolgende Messungen am selben Abschlag …
    public var requiredFixes = 3
    /// … über mindestens diese Zeit (s)
    public var requiredDwell: TimeInterval = 12
    /// ungenauere Messungen zählen nicht (m)
    public var maxAccuracy = GPSConfig.accuracyFair
    /// nach einem manuellen Lochwechsel so lange nichts vorschlagen (s)
    public var manualCooldown: TimeInterval = 90
    /// Rückweg Richtung aktuelles Grün um mehr als so viele Meter bricht die Erkennung ab
    public var walkBackTolerance = 10.0

    public init() {}
}

/// Geometrie, die die Erkennung je Loch braucht.
public struct HoleDetectionContext: Sendable, Equatable {
    /// Löcher der Runde in Spielreihenfolge
    public var holes: [Int]
    public var teePositions: [Int: [GeoPoint]]
    public var greens: [Int: GreenGeometry]

    public init(holes: [Int], teePositions: [Int: [GeoPoint]], greens: [Int: GreenGeometry]) {
        self.holes = holes
        self.teePositions = teePositions
        self.greens = greens
    }

    public init(course: Course, holes numbers: [Int]) {
        var tees: [Int: [GeoPoint]] = [:]
        var greens: [Int: GreenGeometry] = [:]
        for n in numbers {
            guard let hole = course.hole(n) else { continue }
            tees[n] = hole.teeBoxes.compactMap(\.position).filter(\.isValid)
            if let g = hole.green { greens[n] = g }
        }
        self.init(holes: numbers, teePositions: tees, greens: greens)
    }

    public func next(after hole: Int) -> Int? {
        guard let i = holes.firstIndex(of: hole), i + 1 < holes.count else { return nil }
        return holes[i + 1]
    }
}

/// Automatischer Lochwechsel. Wechselt nie blind:
/// - nur mit genauen, aktuellen Messungen (≤ 20 m),
/// - erst nach mehreren Messungen und einer Verweildauer am Abschlag,
/// - nicht, solange der Spieler noch am aktuellen Grün steht (Abschlag direkt neben dem Grün),
/// - nicht, wenn er sich wieder Richtung aktuelles Grün bewegt,
/// - nicht kurz nach einem manuellen Lochwechsel.
/// Automatisch nur zum nächsten Loch und nur, wenn das aktuelle Loch erfasst ist; sonst wird gefragt – und eine
/// abgelehnte Frage kommt erst wieder, wenn der Spieler den Abschlag verlassen hat.
public struct HoleDetector: Sendable {
    public let context: HoleDetectionContext
    public let config: HoleDetectorConfig

    private var candidate: Int?
    private var streak = 0
    private var streakStart: Date?
    private var greenDistanceAtStart: Double?
    private var visitedGreenOf: Int?
    private var declined: Set<Int> = []
    private var lastManualChange: Date?

    public init(context: HoleDetectionContext, config: HoleDetectorConfig = HoleDetectorConfig()) {
        self.context = context
        self.config = config
    }

    /// Manueller Lochwechsel durch den Spieler (oder bestätigter Vorschlag).
    public mutating func noteManualChange(at date: Date) {
        lastManualChange = date
        resetStreak()
        declined = []
    }

    /// Spieler hat „Nein“ gewählt.
    public mutating func decline(_ hole: Int) {
        declined.insert(hole)
        resetStreak()
    }

    private mutating func resetStreak() {
        candidate = nil
        streak = 0
        streakStart = nil
        greenDistanceAtStart = nil
    }

    /// Abstand zum Grün (Mitte) und „Radius“ des Grüns (Mitte bis entferntester Randpunkt).
    private func green(_ hole: Int, from p: GeoPoint) -> (distance: Double, radius: Double)? {
        guard let g = context.greens[hole], let center = g.resolvedCenter else { return nil }
        var radius = 15.0
        if let outline = g.outline, outline.isValid {
            radius = outline.points.map { Geodesy.distance(center, $0) }.max() ?? radius
        }
        return (Geodesy.distance(p, center), radius)
    }

    private func teeDistance(_ hole: Int, from p: GeoPoint) -> Double? {
        context.teePositions[hole]?.map { Geodesy.distance(p, $0) }.min()
    }

    public mutating func process(position: PlayerPosition, currentHole: Int, currentHoleScored: Bool,
                                 mode: AutoHoleChangeMode, now: Date) -> HoleDetectionDecision {
        guard mode != .off else { return .none }
        let p = position.point
        // Besuch des aktuellen Grüns merken (Voraussetzung für Vorschläge ohne erfassten Score)
        if let g = green(currentHole, from: p), g.distance <= g.radius + config.greenVisitMargin {
            visitedGreenOf = currentHole
        }
        guard !position.isStale, position.accuracy <= config.maxAccuracy else {
            resetStreak()
            return .none
        }
        if let manual = lastManualChange, now.timeIntervalSince(manual) < config.manualCooldown {
            return .none
        }
        // Noch am aktuellen Grün: kein Wechsel
        let currentGreen = green(currentHole, from: p)
        if let g = currentGreen, g.distance <= g.radius + config.greenExitMargin {
            resetStreak()
            return .none
        }
        // Abschlag in der Nähe (der nächste Loch hat Vorrang)
        let next = context.next(after: currentHole)
        var found: Int?
        if let next, let d = teeDistance(next, from: p), d <= config.teeRadius {
            found = next
        } else {
            found = context.holes
                .filter { $0 != currentHole }
                .compactMap { hole in teeDistance(hole, from: p).map { (hole, $0) } }
                .filter { $0.1 <= config.teeRadius }
                .min { $0.1 < $1.1 }?.0
        }
        guard let target = found else {
            resetStreak()
            declined = [] // Abschlagbereich verlassen: Fragen sind wieder erlaubt
            return .none
        }
        if declined.contains(target) { return .none }

        if target == candidate {
            streak += 1
            // Richtung: zurück zum aktuellen Grün bricht ab
            if let start = greenDistanceAtStart, let g = currentGreen, g.distance < start - config.walkBackTolerance {
                resetStreak()
                return .none
            }
        } else {
            candidate = target
            streak = 1
            streakStart = now
            greenDistanceAtStart = currentGreen?.distance
        }
        guard streak >= config.requiredFixes, let start = streakStart, now.timeIntervalSince(start) >= config.requiredDwell else {
            return .none
        }
        resetStreak()

        guard target == next else {
            declined.insert(target) // nur einmal fragen
            return .suggest(to: target, reason: .unexpectedHole)
        }
        if !currentHoleScored {
            // Ohne Score und ohne Besuch am Grün spielt der Spieler vermutlich noch das aktuelle Loch
            guard visitedGreenOf == currentHole else { return .none }
            declined.insert(target)
            return .suggest(to: target, reason: .scoreMissing)
        }
        if mode == .ask {
            declined.insert(target)
            return .suggest(to: target, reason: .confirmationRequired)
        }
        return .advance(to: target)
    }
}
