import Foundation
import GolfCore
import HCPGolfKit
import Observation

/// Zustand des Rundenmodus. Rechnet nichts selbst: Entfernungen, Hindernisse, Lochwechsel und Wertung kommen aus
/// GolfCore; das Model verbindet sie mit Standort, Einstellungen und Speicherung.
@MainActor
@Observable
final class RoundModel {
    enum LoadState { case loading, ready, failed }
    enum ViewMode: Hashable { case map, distances }

    struct HoleSuggestion: Equatable {
        var hole: Int
        var reason: HoleChangeReason
    }

    let roundID: UUID
    private(set) var loadState: LoadState = .loading
    private(set) var round: Round?
    private(set) var course: Course?
    private(set) var navigator = HoleNavigator(holes: [1])
    var viewMode: ViewMode = .map

    // Entfernungen (angezeigt, stabilisiert)
    private(set) var green = GreenDistances.none
    private(set) var front = DistanceValue()
    private(set) var center = DistanceValue()
    private(set) var back = DistanceValue()
    private(set) var pinDistance = DistanceValue()
    private(set) var hazards: [FeatureDistance] = []
    /// Spieler ist weit vom Loch entfernt → Entfernungen vom Abschlag
    private(set) var measuringFromTee = false
    /// Zielpunkt (Tippen auf die Karte)
    var target: GeoPoint?
    /// Fahnenposition des Tages (langes Drücken auf dem Grün)
    private(set) var dayPins: [Int: GeoPoint] = [:]
    var suggestion: HoleSuggestion?
    /// Zähler für haptisches Feedback beim Lochwechsel
    private(set) var holeChangeTick = 0

    @ObservationIgnored private var detector: HoleDetector?
    @ObservationIgnored private var stabilizers: [String: DistanceStabilizer] = [:]
    @ObservationIgnored private var lastPosition: PlayerPosition?
    @ObservationIgnored private var unit: DistanceFormat.Unit = .meters

    init(roundID: UUID) {
        self.roundID = roundID
    }

    /// Ab dieser Entfernung zum Loch gilt der Spieler als „nicht auf dem Platz“ (m).
    static let offCourseDistance = 1500.0

    // MARK: Laden

    func load(env: AppEnvironment) async {
        guard loadState != .ready else { return }
        if env.round(roundID) == nil { await env.refreshRounds() }
        guard let round = env.round(roundID) else {
            loadState = .failed
            return
        }
        do {
            let course = try await env.loadCourse(round.header.courseID)
            self.course = course
            self.round = round
            let holes = round.header.holeNumbers
            navigator = HoleNavigator(holes: holes, current: round.firstOpenHole ?? holes.first)
            detector = HoleDetector(context: HoleDetectionContext(course: course, holes: holes))
            unit = env.settings.data.unit
            loadState = .ready
            recompute()
        } catch {
            loadState = .failed
        }
    }

    // MARK: Lesen

    var header: RoundHeader? { round?.header }
    var owner: RoundPlayer? { round?.owner }
    var holeNumber: Int { navigator.current }
    var currentHole: Hole? { course?.hole(holeNumber) }
    var playedHole: PlayedHole? { round?.header.hole(holeNumber) }
    var teeID: TeeID? { owner?.teeID }
    var dayPin: GeoPoint? { dayPins[holeNumber] }
    var scoring: ScoringMode { round?.header.scoring ?? .full }

    func score(player: UUID, hole: Int) -> HoleScore {
        round?.score(player: player, hole: hole) ?? .empty
    }

    func ownerScored(_ hole: Int) -> Bool {
        guard let owner else { return false }
        return score(player: owner.id, hole: hole).isScored
    }

    func scorecards(rules: WHSRuleSet) -> [PlayerScorecard] {
        round.map { ScoringEngine.scorecards(for: $0, rules: rules) } ?? []
    }

    /// Zwischenstand des Besitzers: „+3“ über Par bzw. Stablefordpunkte.
    func summary(rules: WHSRuleSet) -> String? {
        guard let round, let owner, round.header.scoring.hasScorecard else { return nil }
        let card = ScoringEngine.scorecard(for: owner, round: round, rules: rules)
        guard card.total.scored > 0 else { return nil }
        if round.header.format == .stableford, let points = card.total.stableford { return L10n.Score.points(String(points)) }
        return Format.toPar(card.total.toPar)
    }

    var lengthFromTee: Int? { currentHole?.teeBox(teeID)?.lengthMeters }

    // MARK: Navigation

    func goTo(_ hole: Int) {
        guard navigator.go(to: hole) else { return }
        detector?.noteManualChange(at: Date())
        holeChanged()
    }

    func next() { if let n = navigator.next { goTo(n) } }
    func previous() { if let p = navigator.previous { goTo(p) } }

    func acceptSuggestion() {
        guard let s = suggestion else { return }
        suggestion = nil
        goTo(s.hole)
    }

    func declineSuggestion() {
        guard let s = suggestion else { return }
        suggestion = nil
        detector?.decline(s.hole)
    }

    private func holeChanged() {
        target = nil
        stabilizers = [:]
        holeChangeTick += 1
        recompute()
    }

    // MARK: Standort

    func update(position: PlayerPosition?, settings: SettingsData) {
        lastPosition = position
        if unit != settings.unit {
            unit = settings.unit
            stabilizers = [:]
        }
        recompute()
        guard let position, let round, var detector else { return }
        let scored = !round.header.scoring.hasScorecard || ownerScored(holeNumber)
        let decision = detector.process(position: position, currentHole: holeNumber, currentHoleScored: scored,
                                        mode: settings.autoHoleChange, now: Date())
        self.detector = detector
        switch decision {
        case .none:
            break
        case let .advance(to):
            if navigator.go(to: to) { holeChanged() }
        case let .suggest(to, reason):
            if suggestion == nil { suggestion = HoleSuggestion(hole: to, reason: reason) }
        }
    }

    /// Nach dem Speichern eines Scores: bei „Automatisch“ direkt zum nächsten Loch (§79).
    func didFinishScore(autoHoleChange: AutoHoleChangeMode) {
        guard autoHoleChange == .automatic, ownerScored(holeNumber), let next = navigator.next else { return }
        goTo(next)
    }

    func setTarget(_ point: GeoPoint?) {
        target = point
    }

    /// Langes Drücken: auf dem Grün die Fahne des Tages setzen, sonst ein eigenes Ziel.
    func longPress(_ point: GeoPoint) {
        if let center = currentHole?.green?.resolvedCenter, Geodesy.distance(center, point) <= 25 {
            dayPins[holeNumber] = point
            recompute()
        } else {
            target = point
        }
    }

    /// Bezugspunkt der Entfernungen: Spieler, oder der Abschlag, wenn der Spieler nicht auf diesem Loch ist.
    var origin: GeoPoint? {
        if let p = lastPosition?.point, !measuringFromTee { return p }
        return currentHole?.teePosition(for: teeID)
    }

    var position: PlayerPosition? { lastPosition }

    func applyRound(_ round: Round) {
        self.round = round
    }

    private func recompute() {
        guard let hole = currentHole else {
            green = .none
            hazards = []
            return
        }
        let tee = hole.teePosition(for: teeID)
        if let p = lastPosition?.point, let anchor = tee ?? hole.green?.resolvedCenter {
            measuringFromTee = Geodesy.distance(p, anchor) > Self.offCourseDistance
        } else {
            measuringFromTee = lastPosition == nil
        }
        guard let origin else {
            green = .none
            hazards = []
            return
        }
        let accuracy = measuringFromTee ? nil : lastPosition?.accuracy
        green = GreenDistanceCalculator.distances(from: origin, green: hole.green, pin: dayPin ?? hole.green?.defaultPin)
        front = stabilized("front", green.front, accuracy)
        center = stabilized("center", green.center, accuracy)
        back = stabilized("back", green.back, accuracy)
        pinDistance = stabilized("pin", green.pin, accuracy)
        hazards = FeatureDistanceCalculator.distances(from: origin, features: hole.features, toward: hole.green?.resolvedCenter)
    }

    private func stabilized(_ key: String, _ meters: Double?, _ accuracy: Double?) -> DistanceValue {
        var s = stabilizers[key] ?? DistanceStabilizer(unit: unit)
        let r = s.update(meters: meters, accuracy: accuracy)
        stabilizers[key] = s
        return DistanceValue(value: r.value, approx: r.approx, far: r.far)
    }

    /// Überlagerung der Karte: Spieler, Fahne, Messlinie, Distanzbögen, Beschriftung der Hindernisse.
    func overlay(settings: SettingsData) -> HoleMapOverlay {
        guard let hole = currentHole else { return HoleMapOverlay() }
        var o = HoleMapOverlay()
        o.player = measuringFromTee ? nil : lastPosition
        o.pin = dayPin ?? hole.green?.defaultPin
        let greenCenter = hole.green?.resolvedCenter
        if let origin, let target {
            o.measureLine = [origin, target] + (greenCenter.map { [$0] } ?? [])
            let toTarget = Geodesy.distance(origin, target)
            o.labels.append(MapLabel(id: "target", point: target, text: Format.distanceText(toTarget, unit: settings.unit), style: .target))
            if let greenCenter {
                let mid = LocalFrame(origin: target).toGeo(LocalFrame(origin: target).toLocal(greenCenter) * 0.5)
                o.labels.append(MapLabel(id: "target-green", point: mid,
                                         text: Format.distanceText(Geodesy.distance(target, greenCenter), unit: settings.unit), style: .target))
            }
        }
        for hazard in hazards.prefix(6) where hazard.kind == .bunker || hazard.kind == .water {
            let text = Format.distance(hazard.reach, accuracy: nil, unit: settings.unit).text
            o.labels.append(MapLabel(id: "hz-" + hazard.id, point: hazard.reachPoint, text: text, style: .hazard))
        }
        if settings.showDistanceArcs, let origin, !measuringFromTee {
            o.arcCenter = origin
            o.arcs = DistanceArcs.radii(preset: settings.arcPreset, distanceToTarget: green.center, unit: settings.unit).map { radius in
                let shown = settings.unit == .yards ? radius / GPSConfig.metersPerYard : radius
                return MapArc(radiusMeters: radius, label: String(Int(shown.rounded())))
            }
        }
        return o
    }
}
