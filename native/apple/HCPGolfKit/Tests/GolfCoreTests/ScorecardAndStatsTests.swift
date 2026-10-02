import XCTest
@testable import GolfCore

final class ScorecardAndStatsTests: XCTestCase {
    func testFlowStepsByModeParAndPlayers() {
        XCTAssertEqual(ScoreEntryFlow(scoring: .full, par: 4, hasOtherPlayers: false).steps, [.score, .putts, .fairway, .gir, .extras])
        XCTAssertEqual(ScoreEntryFlow(scoring: .full, par: 3, hasOtherPlayers: false).steps, [.score, .putts, .gir, .extras], "kein Fairway auf Par 3")
        XCTAssertEqual(ScoreEntryFlow(scoring: .full, par: nil, hasOtherPlayers: true).steps, [.score, .group, .putts, .fairway, .gir, .extras])
        XCTAssertEqual(ScoreEntryFlow(scoring: .simple, par: 4, hasOtherPlayers: false).steps, [.score])
        XCTAssertEqual(ScoreEntryFlow(scoring: .simple, par: 4, hasOtherPlayers: true).steps, [.score, .group])
        XCTAssertTrue(ScoreEntryFlow(scoring: .gpsOnly, par: 4, hasOtherPlayers: true).steps.isEmpty)
        let flow = ScoreEntryFlow(scoring: .full, par: 5, hasOtherPlayers: false)
        XCTAssertEqual(flow.next(after: .putts), .fairway)
        XCTAssertNil(flow.next(after: .extras))
        XCTAssertEqual(flow.previous(before: .putts), .score)
        XCTAssertEqual(flow.position(of: .gir)?.index, 4)
    }

    /// UX-Test §79: Loch 7, Score 5, Putts 2, GIR Nein → speichern in wenigen Aktionen.
    func testQuickEntryScenarioNeedsFewSteps() {
        let flow = ScoreEntryFlow(scoring: .full, par: 3, hasOtherPlayers: false)
        // Score (1 Tipp) → Putts (1 Tipp) → GIR (1 Tipp) → Fertig (1 Tipp, Extras übersprungen)
        XCTAssertEqual(Array(flow.steps.prefix(3)), [.score, .putts, .gir])
    }

    func testScoreOptionsAndRelativeLabels() {
        XCTAssertEqual(ScoreEntryRules.scoreOptions(par: 4).map(\.value), [3, 4, 5, 6, 7])
        XCTAssertEqual(ScoreEntryRules.scoreOptions(par: 3).map(\.value), [2, 3, 4, 5, 6])
        XCTAssertEqual(ScoreEntryRules.scoreOptions(par: 4).map(\.relative), [.birdie, .par, .bogey, .doubleBogey, .tripleBogey])
        XCTAssertEqual(RelativeScore(strokes: 1, par: 3), .holeInOne)
        XCTAssertEqual(RelativeScore(strokes: 2, par: 5), .albatross)
        XCTAssertEqual(RelativeScore(strokes: 9, par: 4), .worse)
        XCTAssertNil(RelativeScore(strokes: 4, par: nil))
        XCTAssertEqual(ScoreEntryRules.defaultStrokes(par: 5, current: .empty), 5)
        XCTAssertEqual(ScoreEntryRules.defaultStrokes(par: 5, current: HoleScore(strokes: 7)), 7)
    }

    func testPuttLimitsNormalizationAndIssues() {
        XCTAssertEqual(ScoreEntryRules.maxPutts(strokes: 5, penalties: 1), 3)
        XCTAssertEqual(ScoreEntryRules.maxPutts(strokes: 1, penalties: nil), 0)
        let n = ScoreEntryRules.normalized(HoleScore(strokes: 4, pickedUp: false, putts: 6, fairway: .left), par: 3)
        XCTAssertNil(n.fairway)
        XCTAssertEqual(n.putts, 3)
        XCTAssertNil(ScoreEntryRules.normalized(HoleScore(strokes: 8, pickedUp: true), par: 4).strokes)
        XCTAssertEqual(ScoreEntryRules.issues(HoleScore(strokes: 3, putts: 3), par: 4), [.puttsExceedStrokes])
        XCTAssertEqual(ScoreEntryRules.issues(HoleScore(strokes: 1, putts: 0), par: 3), [])
        XCTAssertEqual(ScoreEntryRules.issues(HoleScore(strokes: 6, putts: 1, gir: true), par: 4), [.girUnlikely])
    }

    func testRoundStatisticsDefinitions() {
        let holes: [(par: Int?, score: HoleScore)] = [
            (4, HoleScore(strokes: 4, putts: 2, fairway: .hit, gir: true, penalties: 0)),
            (4, HoleScore(strokes: 5, putts: 1, fairway: .left, gir: false, penalties: 0, sandShot: true)),
            (3, HoleScore(strokes: 3, putts: 1, gir: false, penalties: 0)),         // Scramble geschafft
            (5, HoleScore(strokes: 7, putts: 3, fairway: .right, gir: true, penalties: 1)),
            (4, HoleScore(strokes: 4, putts: 2, fairway: .short, gir: false, sandShot: true)), // Sand Save
        ]
        let s = Statistics.round(holes)
        XCTAssertEqual(s.holesScored, 5)
        XCTAssertEqual(s.grossScore, 23)
        XCTAssertEqual(s.parPlayed, 20)
        XCTAssertEqual(s.totalPutts, 9)
        XCTAssertEqual(s.girs, 2)
        XCTAssertEqual(s.girHoles, 5)
        XCTAssertEqual(s.girPercentage!, 40, accuracy: 1e-9)
        XCTAssertEqual(s.fairwayOpportunities, 4, "Par 3 nie im Nenner")
        XCTAssertEqual(s.fairwaysHit, 1)
        XCTAssertEqual([s.missLeft, s.missRight, s.missShort], [1, 1, 1])
        XCTAssertEqual(s.scrambleAttempts, 3)
        XCTAssertEqual(s.scrambles, 2)
        XCTAssertEqual(s.sandAttempts, 2)
        XCTAssertEqual(s.sandSaves, 1)
        XCTAssertEqual(s.puttsPerGIR!, 2.5, accuracy: 1e-9)
        XCTAssertEqual(s.threePutts, 1)
        XCTAssertEqual(s.onePutts, 2)
        XCTAssertEqual(s.penaltyStrokes, 1)
        XCTAssertEqual([s.eagles, s.birdies, s.pars, s.bogeys, s.doubleBogeys, s.triplePlus], [0, 0, 3, 1, 1, 0])
        XCTAssertNil(Statistics.round([(4, HoleScore(strokes: 4))]).girPercentage, "ohne Angabe „–“, nicht 0 %")
    }

    func testSummaryUsesCountersNotAveragesOfPercentages() {
        func makeRound(_ scores: [Int], gir: [Bool], completed: Bool = true) -> Round {
            let me = RoundPlayer(kind: .owner, name: "Ich")
            let holes = Array(TestGeo.holes18().prefix(scores.count))
            var r = Round(id: UUID(), header: TestGeo.header(holes: holes, players: [me], selection: scores.count == 9 ? .front9 : .all18))
            r.status = completed ? .completed : .inProgress
            for (i, s) in scores.enumerated() { r.scores[me.id, default: [:]][holes[i].number] = HoleScore(strokes: s, gir: gir[i]) }
            return r
        }
        let nine = makeRound(Array(repeating: 5, count: 9), gir: Array(repeating: false, count: 8) + [true])
        let eighteen = makeRound(Array(repeating: 5, count: 18), gir: Array(repeating: true, count: 9) + Array(repeating: false, count: 9))
        let running = makeRound(Array(repeating: 4, count: 18), gir: Array(repeating: true, count: 18), completed: false)
        let summary = Statistics.summary([nine, eighteen, running])
        XCTAssertEqual(summary.rounds, 2, "laufende Runden zählen nicht")
        XCTAssertEqual(summary.averageScore18, 90)
        XCTAssertEqual(summary.averageScore9, 45)
        XCTAssertEqual(summary.bestScore18, 90)
        // 10 GIR aus 27 Löchern (nicht (11 % + 50 %) / 2)
        XCTAssertEqual(summary.totals.girPercentage!, 10.0 / 27.0 * 100, accuracy: 1e-9)
    }

    func testHoleNavigator() {
        var nav = HoleNavigator(holes: Array(10...18), current: 3)
        XCTAssertEqual(nav.current, 10, "unbekanntes Loch → erstes Loch")
        XCTAssertTrue(nav.isFirst)
        XCTAssertNil(nav.previous)
        XCTAssertTrue(nav.advance())
        XCTAssertEqual(nav.current, 11)
        XCTAssertTrue(nav.go(to: 18))
        XCTAssertTrue(nav.isLast)
        XCTAssertFalse(nav.advance())
        XCTAssertFalse(nav.go(to: 5))
    }

    func testEntitlementPolicy() {
        let policy = EntitlementPolicy.standard
        XCTAssertTrue(policy.isEnabled(.gpsDistances, for: .free))
        XCTAssertFalse(policy.isEnabled(.distanceArcs, for: .free))
        XCTAssertTrue(policy.isEnabled(.distanceArcs, for: .premium))
        XCTAssertFalse(policy.isEnabled(.aiCaddie, for: .premium))
        XCTAssertTrue(policy.isEnabled(.aiCaddie, for: .intelligence))
        XCTAssertEqual(policy.features(for: .intelligence).count, Feature.allCases.count)
        XCTAssertFalse(EntitlementPolicy(requiredTier: [:]).isEnabled(.gpsDistances, for: .premium), "unbekannt → höchste Stufe")
    }
}
