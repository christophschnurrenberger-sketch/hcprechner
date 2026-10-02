import XCTest
import HCPGolfKit
@testable import GolfCore
@testable import GolfDemo

/// Praxistest (§80/§81): komplette Runde mit simuliertem GPS – Entfernungen, automatischer Lochwechsel,
/// Score-Eingabe, Abschluss, Wertung und Statistik, ohne Datenverlust.
final class RoundSimulationTests: XCTestCase {
    let course = DemoCourses.championship
    let start = Date(timeIntervalSince1970: 1_780_000_000)

    /// Spielt die Messungen ab und liefert die Lochwechsel (automatisch bzw. vorgeschlagen).
    func replay(_ fixes: [LocationFix], holes: [Int], scored: Bool, mode: AutoHoleChangeMode = .automatic) -> [HoleDetectionDecision] {
        let tracker = PositionTracker()
        var detector = HoleDetector(context: HoleDetectionContext(course: course, holes: holes))
        var current = holes[0]
        var decisions: [HoleDetectionDecision] = []
        for fix in fixes {
            tracker.push(fix)
            guard let position = tracker.position(at: fix.timestamp) else { continue }
            let decision = detector.process(position: position, currentHole: current, currentHoleScored: scored, mode: mode, now: fix.timestamp)
            switch decision {
            case .none: break
            case let .advance(to): decisions.append(decision); current = to
            case let .suggest(to, _): decisions.append(decision); current = to; detector.noteManualChange(at: fix.timestamp)
            }
        }
        return decisions
    }

    func testAutoHoleChangeFollowsAWholeRound() {
        let holes = Array(1...18)
        let fixes = CourseWalkSimulator.walk(course: course, holes: holes, teeID: "yellow", start: start)
        XCTAssertGreaterThan(fixes.count, 1000)
        let decisions = replay(fixes, holes: holes, scored: true)
        XCTAssertEqual(decisions, (2...18).map { HoleDetectionDecision.advance(to: $0) }, "jedes Loch genau einmal, in Reihenfolge")
    }

    func testWeakGPSAndJumpsNeverCauseWrongChanges() {
        var config = CourseWalkSimulator.Config()
        config.jumpProbability = 0.03
        config.noise = 4
        let holes = Array(1...9)
        let fixes = CourseWalkSimulator.walk(course: course, holes: holes, teeID: "yellow", start: start, config: config, seed: 7)
        let decisions = replay(fixes, holes: holes, scored: true)
        for (i, decision) in decisions.enumerated() {
            XCTAssertEqual(decision, .advance(to: i + 2), "keine falschen Wechsel trotz Sprüngen")
        }
        var weak = CourseWalkSimulator.Config()
        weak.accuracy = 35
        let weakDecisions = replay(CourseWalkSimulator.walk(course: course, holes: holes, teeID: "yellow", start: start, config: weak), holes: holes, scored: true)
        XCTAssertTrue(weakDecisions.isEmpty, "bei schwachem GPS nur manueller Wechsel")
    }

    func testWithoutScoresTheAppAsks() {
        let holes = Array(1...4)
        let fixes = CourseWalkSimulator.walk(course: course, holes: holes, teeID: "yellow", start: start)
        let decisions = replay(fixes, holes: holes, scored: false)
        XCTAssertEqual(decisions, (2...4).map { HoleDetectionDecision.suggest(to: $0, reason: .scoreMissing) })
    }

    func testDistancesOnTheWayAreStableAndPlausible() throws {
        let hole = course.hole(1)!
        let fixes = CourseWalkSimulator.walk(course: course, holes: [1], teeID: "yellow", start: start)
        let tracker = PositionTracker()
        var stabilizer = DistanceStabilizer()
        var shown: [Int] = []
        for fix in fixes {
            tracker.push(fix)
            let pos = try XCTUnwrap(tracker.position(at: fix.timestamp))
            let d = GreenDistanceCalculator.distances(from: pos.point, green: hole.green)
            if let value = stabilizer.update(meters: d.center, accuracy: pos.accuracy).value { shown.append(value) }
        }
        let teeLength = try XCTUnwrap(hole.teeBox("yellow")?.lengthMeters)
        XCTAssertEqual(Double(shown.first!), Double(teeLength), accuracy: 5, "am Abschlag ≈ Scorekartenlänge")
        XCTAssertLessThan(shown.last!, 6, "auf dem Grün nahe 0 (aber nie 0)")
        XCTAssertFalse(shown.contains(0))
        // Beim Stehen an einer Schlagposition springt die Anzeige kaum
        let standing = Array(shown[2..<10])
        XCTAssertLessThanOrEqual(standing.max()! - standing.min()!, 3)
    }

    func testFullRoundOfflineToSummary() async throws {
        let profile = DemoPeople.owner
        var draft = RoundSetupDraft(course: course, owner: profile.setupPlayer(), date: LocalDate(year: 2026, month: 9, day: 12),
                                    preferredTee: profile.preferredTeeColor)
        let friend = DemoPeople.friends[1]
        draft.players.append(SetupPlayer(kind: .friend, name: friend.name, userID: friend.id, handicapIndex: friend.handicapIndex,
                                         gender: friend.gender, teeID: "red"))
        draft.format = .stableford
        draft.countsForHandicap = true
        XCTAssertTrue(RoundSetup.canStart(draft))
        XCTAssertTrue(RoundSetup.issues(draft).contains(.demoCourseNotCountable))

        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("round-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: dir) }
        let startedAt = start
        let repo = RoundRepository(store: try FileRoundStore(directory: dir), node: "phone", now: { startedAt })
        let round = try await repo.create(header: RoundSetup.makeHeader(from: draft, startedAt: start))
        let me = round.header.players[0], anna = round.header.players[1]
        for hole in round.header.holes {
            let par = hole.par!
            try await repo.setScore(HoleScore(strokes: par + 1, putts: 2, fairway: par > 3 ? .hit : nil, gir: false, penalties: 0, sandShot: false),
                                    player: me.id, hole: hole.number, roundID: round.id)
            try await repo.setScore(HoleScore(strokes: par + 2), player: anna.id, hole: hole.number, roundID: round.id)
        }
        try await repo.setStatus(.completed, roundID: round.id)

        // „App-Neustart“: alles wieder da
        let reopened = RoundRepository(store: try FileRoundStore(directory: dir), node: "phone")
        let loaded = try await reopened.round(id: round.id)
        let done = try XCTUnwrap(loaded)
        XCTAssertEqual(done.status, .completed)
        XCTAssertEqual(done.scoredHoleCount, 18)

        let cards = ScoringEngine.scorecards(for: done, rules: .de2026)
        XCTAssertEqual(cards[0].total.gross, 90)
        XCTAssertEqual(cards[0].handicap.courseHandicap?.rounded, 21, "18,4 × 129/113 − 0,2 = 20,8 → 21")
        XCTAssertEqual(cards[0].total.stableford, 36 + 3, "PH 21: drei Löcher mit zwei Schlägen")
        let board = Leaderboard.entries(cards, metric: .stableford)
        XCTAssertEqual(board.map(\.name), ["Demo Spieler", "Anna"])
        let diff = ScoringEngine.differential(for: me, round: done, rules: .de2026)
        XCTAssertNotNil(diff.scoreDifferential, "Rechenweg wird gezeigt …")
        XCTAssertFalse(diff.countsForHandicapIndex, "… zählt auf dem Demo-Platz aber nicht")
        let stats = Statistics.round(done, player: me.id)
        XCTAssertEqual(stats.fairwaysHit, 14)
        XCTAssertEqual(stats.totalPutts, 36)
        XCTAssertEqual(Statistics.summary([done]).averageScore18, 90)
    }
}
