import XCTest
@testable import GolfCore

final class ScoringTests: XCTestCase {
    let rules = WHSRuleSet.de2026

    func rating18(cr: Double = 72.0, slope: Int = 113, status: RatingStatus = .verified) -> RatingSnapshot {
        RatingSnapshot(scope: .eighteen, par: 72, courseRating: cr, slopeRating: slope, status: status)
    }

    func player(_ name: String, hi: Double?, kind: RoundPlayer.Kind = .guest, rating: RatingSnapshot? = nil, manualPH: Int? = nil) -> RoundPlayer {
        RoundPlayer(kind: kind, name: name, handicapIndex: hi, manualPlayingHandicap: manualPH, gender: .male, teeID: "yellow", rating: rating)
    }

    func round(_ header: RoundHeader, scores: [UUID: [Int]]) -> Round {
        var r = Round(id: UUID(), header: header)
        for (player, list) in scores {
            for (i, strokes) in list.enumerated() {
                r.scores[player, default: [:]][header.holes[i].number] = HoleScore(strokes: strokes, putts: 2)
            }
        }
        return r
    }

    func testScorecardWithHandicapNetAndStableford() {
        let me = player("Ich", hi: 18.0, kind: .owner, rating: rating18())
        let header = TestGeo.header(holes: TestGeo.holes18(), players: [me])
        let bogeys = WHSRulesTests.pars18.map { $0 + 1 }
        let card = ScoringEngine.scorecard(for: me, round: round(header, scores: [me.id: bogeys]), rules: rules)
        XCTAssertEqual(card.handicap.courseHandicap?.rounded, 18)
        XCTAssertEqual(card.handicap.playingHandicap, 18)
        XCTAssertTrue(card.hasStableford)
        XCTAssertEqual(card.total.gross, 90)
        XCTAssertEqual(card.total.toPar, 18)
        XCTAssertEqual(card.total.net, 72)
        XCTAssertEqual(card.total.netToPar, 0)
        XCTAssertEqual(card.total.stableford, 36)
        XCTAssertEqual(card.total.putts, 36)
        XCTAssertEqual(card.front?.gross, 45)
        XCTAssertEqual(card.back?.gross, 45)
        XCTAssertTrue(card.total.complete)
        XCTAssertEqual(card.hole(4)?.strokesReceived, 1)
        XCTAssertEqual(card.hole(4)?.stablefordPoints, 2)
    }

    func testAllowanceReducesPlayingHandicap() {
        let me = player("Ich", hi: 20.0, kind: .owner, rating: rating18())
        let header = TestGeo.header(holes: TestGeo.holes18(), players: [me], handicap: HandicapSettings(mode: .handicapIndex, allowancePercent: 95))
        let h = ScoringEngine.handicap(for: me, header: header, rules: rules)
        XCTAssertEqual(h.courseHandicap?.rounded, 20)
        XCTAssertEqual(h.playingHandicap, 19)
        XCTAssertEqual(h.strokesReceived.values.reduce(0, +), 19)
        XCTAssertEqual(h.courseStrokes.values.reduce(0, +), 20, "Netto-Doppelbogey nutzt das Course Handicap")
    }

    func testWithoutHandicapGrossStableford() {
        let me = player("Ich", hi: nil, kind: .owner)
        let header = TestGeo.header(holes: TestGeo.holes18(), players: [me], handicap: HandicapSettings(mode: .none))
        let card = ScoringEngine.scorecard(for: me, round: round(header, scores: [me.id: WHSRulesTests.pars18]), rules: rules)
        XCTAssertEqual(card.handicap.issue, .disabled)
        XCTAssertNil(card.total.net)
        XCTAssertEqual(card.total.stableford, 36, "Par überall = 2 Punkte je Loch (brutto)")
    }

    func testMissingRatingDisablesNetButNotGross() {
        let me = player("Ich", hi: 12.0, kind: .owner, rating: nil)
        let header = TestGeo.header(holes: TestGeo.holes18(), players: [me])
        let card = ScoringEngine.scorecard(for: me, round: round(header, scores: [me.id: WHSRulesTests.pars18]), rules: rules)
        XCTAssertEqual(card.handicap.issue, .ratingMissing)
        XCTAssertFalse(card.hasStableford)
        XCTAssertEqual(card.total.gross, 72)
        XCTAssertNil(card.total.net)
    }

    func testNineHoleRoundNeedsNineHoleRating() {
        let rating9 = RatingSnapshot(scope: .front9, par: 36, courseRating: 36.0, slopeRating: 113, status: .verified)
        let ok = player("A", hi: 18.0, kind: .owner, rating: rating9)
        let wrong = player("B", hi: 18.0, rating: rating18())
        let header = TestGeo.header(holes: Array(TestGeo.holes18().prefix(9)), players: [ok, wrong], selection: .front9)
        XCTAssertEqual(ScoringEngine.handicap(for: ok, header: header, rules: rules).courseHandicap?.rounded, 9)
        XCTAssertEqual(ScoringEngine.handicap(for: wrong, header: header, rules: rules).issue, .ratingScopeMismatch,
                       "kein 9-Loch-Rating aus dem 18-Loch-Rating ableiten")
    }

    func testPickupCountsAsZeroStablefordAndBlocksGrossTotal() {
        let me = player("Ich", hi: 18.0, kind: .owner, rating: rating18())
        let header = TestGeo.header(holes: TestGeo.holes18(), players: [me])
        var r = round(header, scores: [me.id: WHSRulesTests.pars18.map { $0 + 1 }])
        r.scores[me.id]?[1] = HoleScore(pickedUp: true)
        let card = ScoringEngine.scorecard(for: me, round: r, rules: rules)
        XCTAssertEqual(card.hole(1)?.stablefordPoints, 0)
        XCTAssertNil(card.hole(1)?.gross)
        XCTAssertFalse(card.total.complete)
        XCTAssertEqual(card.total.pickups, 1)
        XCTAssertEqual(card.total.stableford, 34)
    }

    func testDifferentialEighteenHoles() {
        let me = player("Ich", hi: 18.0, kind: .owner, rating: rating18(cr: 71.8, slope: 135))
        let header = TestGeo.header(holes: TestGeo.holes18(), players: [me])
        var scores = WHSRulesTests.pars18.map { $0 + 1 }
        scores[0] = 12 // NDB greift
        let result = ScoringEngine.differential(for: me, round: round(header, scores: [me.id: scores]), rules: rules)
        XCTAssertNil(result.issue)
        // CH = 18 × 135/113 − 0,2 = 21,3 → 21; Loch 1 (SI 7): 2 Schläge? SI 7 ≤ 3 nein → 1 Schlag → NDB 7
        XCTAssertEqual(result.gbe?.courseHandicap.rounded, 21)
        XCTAssertEqual(result.gbe?.total, 90 - 5 + 7)
        XCTAssertEqual(result.scoreDifferential, try rules.scoreDifferential(adjustedGrossScore: 92, courseRating: 71.8, slopeRating: 135, pcc: 0).value)
        XCTAssertTrue(result.countsForHandicapIndex)
    }

    func testDifferentialNineHolesUsesExpected() throws {
        let rating9 = RatingSnapshot(scope: .front9, par: 36, courseRating: 35.8, slopeRating: 129, status: .verified)
        let me = player("Ich", hi: 14.0, kind: .owner, rating: rating9)
        let holes = Array(TestGeo.holes18().prefix(9))
        let header = TestGeo.header(holes: holes, players: [me], selection: .front9)
        // GBE 45: 5 + 5 + 4 + 6 + 5 + 5 + 4 + 5 + 6 (CH₉ 8 → keine Kappung)
        let result = ScoringEngine.differential(for: me, round: round(header, scores: [me.id: [5, 5, 4, 6, 5, 5, 4, 5, 6]]), rules: rules)
        XCTAssertEqual(result.gbe?.total, 45)
        XCTAssertEqual(result.nineHole?.expected, 8.5)
        XCTAssertEqual(result.scoreDifferential, 16.6)
    }

    func testDifferentialIncompleteAndNotCountable() {
        let me = player("Ich", hi: 18.0, kind: .owner, rating: rating18(status: .fictional))
        let header = TestGeo.header(holes: TestGeo.holes18(), players: [me], source: .demo)
        var r = round(header, scores: [me.id: WHSRulesTests.pars18])
        XCTAssertFalse(ScoringEngine.differential(for: me, round: r, rules: rules).countsForHandicapIndex, "Demo-Platz zählt nie")
        r.scores[me.id]?[18] = nil
        XCTAssertEqual(ScoringEngine.differential(for: me, round: r, rules: rules).issue, .roundIncomplete)
    }

    func testUnverifiedRatingCountsOnlyWhenConfirmed() {
        var rating = rating18(status: .unverified)
        let me = player("Ich", hi: 18.0, kind: .owner, rating: rating)
        let header = TestGeo.header(holes: TestGeo.holes18(), players: [me])
        XCTAssertFalse(ScoringEngine.differential(for: me, round: round(header, scores: [me.id: WHSRulesTests.pars18]), rules: rules).countsForHandicapIndex)
        rating.playerConfirmed = true
        let confirmed = player("Ich", hi: 18.0, kind: .owner, rating: rating)
        let header2 = TestGeo.header(holes: TestGeo.holes18(), players: [confirmed])
        XCTAssertTrue(ScoringEngine.differential(for: confirmed, round: round(header2, scores: [confirmed.id: WHSRulesTests.pars18]), rules: rules).countsForHandicapIndex)
    }

    // MARK: Leaderboard

    func testLeaderboardTiesAndThru() {
        let a = player("Anna", hi: nil), b = player("Ben", hi: nil), c = player("Carla", hi: nil), d = player("Dirk", hi: nil)
        let header = TestGeo.header(holes: TestGeo.holes18(), players: [a, b, c, d], handicap: HandicapSettings(mode: .none))
        let pars = WHSRulesTests.pars18
        var r = round(header, scores: [
            a.id: Array(pars.prefix(3)).map { $0 + 1 },           // +3 nach 3
            b.id: Array(pars.prefix(3)),                          // E nach 3
            c.id: Array(pars.prefix(4)).enumerated().map { $0.offset == 0 ? $0.element + 3 : $0.element }, // +3 nach 4
        ])
        r.scores[d.id] = [:]
        let cards = ScoringEngine.scorecards(for: r, rules: rules)
        let board = Leaderboard.entries(cards, metric: .grossToPar)
        XCTAssertEqual(board.map(\.name), ["Ben", "Carla", "Anna", "Dirk"], "bei Gleichstand zuerst mehr gespielte Löcher")
        XCTAssertEqual(board.map(\.position), [1, 2, 2, nil])
        XCTAssertEqual(board.map(\.tied), [false, true, true, false])
        XCTAssertEqual(board[1].thru, 4)
        XCTAssertNil(board[3].value)
    }

    func testStablefordLeaderboardHigherIsBetter() {
        let a = player("Anna", hi: 18, rating: rating18()), b = player("Ben", hi: 0, rating: rating18())
        let header = TestGeo.header(holes: TestGeo.holes18(), players: [a, b], format: .stableford)
        let bogeys = WHSRulesTests.pars18.map { $0 + 1 }
        let cards = ScoringEngine.scorecards(for: round(header, scores: [a.id: bogeys, b.id: bogeys]), rules: rules)
        let board = Leaderboard.entries(cards, metric: .stableford)
        XCTAssertEqual(board.first?.name, "Anna")
        XCTAssertEqual(board.first?.value, 36)
        XCTAssertEqual(board.last?.value, 18)
    }

    // MARK: Lochspiel

    func testMatchPlayWithStrokesDormieAndDecided() throws {
        let a = player("Anna", hi: 10, rating: rating18()), b = player("Ben", hi: 14, rating: rating18())
        let header = TestGeo.header(holes: TestGeo.holes18(), players: [a, b], format: .matchPlay)
        var r = Round(id: UUID(), header: header)
        // Ben erhält 4 Schläge auf SI 1–4 (Löcher 4, 13, 2, 11)
        for hole in header.holes {
            r.scores[a.id, default: [:]][hole.number] = HoleScore(strokes: hole.par! - (hole.number <= 4 ? 1 : 0))
            r.scores[b.id, default: [:]][hole.number] = HoleScore(strokes: hole.par!)
        }
        let status = try XCTUnwrap(MatchPlayEngine.status(round: r, playerA: a.id, playerB: b.id, rules: rules))
        XCTAssertEqual(status.strokesForB.values.reduce(0, +), 4)
        XCTAssertEqual(status.strokesForB[4], 1)
        // Loch 1: Anna Birdie (3), Ben Par → Anna; Loch 2: Anna 3, Ben 4 − 1 = 3 → geteilt; Loch 3: Anna 2 / Ben 3 → Anna;
        // Loch 4: Anna 4 / Ben 5 − 1 = 4 → geteilt; ab Loch 5 alles Par, Ben bekommt auf 11 und 13 einen Schlag → Ben
        XCTAssertEqual(status.holes.prefix(4).map(\.lead), [1, 1, 2, 2])
        XCTAssertEqual(status.lead, 0)
        XCTAssertNil(status.leader)
        XCTAssertTrue(status.isFinished)

        // Dormie und entschieden
        var d = Round(id: UUID(), header: TestGeo.header(holes: TestGeo.holes18(), players: [a, b], format: .matchPlay, handicap: HandicapSettings(mode: .none)))
        for hole in header.holes where hole.number <= 15 {
            d.scores[a.id, default: [:]][hole.number] = HoleScore(strokes: hole.number <= 3 ? hole.par! - 1 : hole.par!)
            d.scores[b.id, default: [:]][hole.number] = HoleScore(strokes: hole.par!)
        }
        let dormie = try XCTUnwrap(MatchPlayEngine.status(round: d, playerA: a.id, playerB: b.id, rules: rules))
        XCTAssertEqual(dormie.lead, 3)
        XCTAssertEqual(dormie.holesRemaining, 3)
        XCTAssertTrue(dormie.isDormie)
        XCTAssertFalse(dormie.isDecided)
        d.scores[a.id]?[16] = HoleScore(strokes: 3)
        d.scores[b.id]?[16] = HoleScore(strokes: 4)
        d.scores[a.id]?[17] = HoleScore(strokes: 9)
        d.scores[b.id]?[17] = HoleScore(strokes: 3)
        let decided = try XCTUnwrap(MatchPlayEngine.status(round: d, playerA: a.id, playerB: b.id, rules: rules))
        XCTAssertTrue(decided.isDecided, "4 auf mit 2 zu spielen")
        XCTAssertEqual(decided.holesPlayed, 16, "nach der Entscheidung zählen weitere Löcher nicht")
        XCTAssertEqual(decided.leader, a.id)
    }
}
