import XCTest
@testable import GolfCore

/// Dieselben Testwerte wie die Web-App (`tests/whs/rounding|courseHandicap|scoreDifferential|gbe|stableford|nineHole.test.ts`):
/// Beide Fassungen der Regeln müssen exakt dieselben Ergebnisse liefern.
final class WHSRulesTests: XCTestCase {
    let rules = WHSRuleSet.de2026

    static let pars18 = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5]
    static let si18 = [7, 3, 15, 1, 11, 5, 17, 9, 13, 8, 4, 16, 2, 12, 6, 18, 10, 14]

    static func holes18() -> [WHSHoleInfo] {
        pars18.indices.map { WHSHoleInfo(number: $0 + 1, par: pars18[$0], strokeIndex: si18[$0]) }
    }

    static func holesFront9() -> [WHSHoleInfo] { Array(holes18().prefix(9)) }

    func ch(_ rounded: Int, holes: Int = 18) -> CourseHandicapResult {
        CourseHandicapResult(holes: holes, handicapIndex: Double(rounded), halvedHandicapIndex: nil, slopeRating: 113,
                             courseRating: holes == 18 ? 72 : 36, par: holes == 18 ? 72 : 36, unrounded: Double(rounded), rounded: rounded)
    }

    // MARK: Rundung

    func testRounding() {
        XCTAssertEqual(WHSRounding.round(18.5822, decimals: 1), 18.6)
        XCTAssertEqual(WHSRounding.round(2.3 + 0.05, decimals: 1), 2.4) // Gleitkomma: 2,3499999…
        XCTAssertEqual(WHSRounding.round(1.005, decimals: 2), 1.01)
        XCTAssertEqual(WHSRounding.round(10 + 3 + 0.15, decimals: 1), 13.2)
        XCTAssertEqual(WHSRounding.round(2.45, decimals: 1), 2.5)
        XCTAssertEqual(WHSRounding.round(2.44, decimals: 1), 2.4)
        XCTAssertEqual(WHSRounding.round(-2.5, decimals: 0), -3)
        XCTAssertEqual(WHSRounding.round(-0.25, decimals: 1), -0.3)
        XCTAssertEqual(WHSRounding.round(-2.5, decimals: 0, mode: .halfUp), -2)
        XCTAssertEqual(WHSRounding.round(2.5, decimals: 0, mode: .halfUp), 3)
        let negativeZero = WHSRounding.round(-0.04, decimals: 1)
        XCTAssertEqual(negativeZero, 0)
        XCTAssertEqual(negativeZero.sign, .plus, "nie −0")
        XCTAssertEqual(WHSRounding.scoreDifferential(43.6473), 43.6)
        XCTAssertEqual(WHSRounding.scoreDifferential(43.65), 43.7)
        XCTAssertEqual(WHSRounding.handicapIndex(13.125), 13.1)
        XCTAssertEqual(WHSRounding.handicapIndex(13.175), 13.2)
        XCTAssertEqual(WHSRounding.courseHandicap(57.437), 57)
        XCTAssertEqual(WHSRounding.courseHandicap(26.5), 27)
        XCTAssertEqual(WHSRounding.courseHandicap(26.49), 26)
        XCTAssertEqual(WHSRounding.playingHandicap(20 * 0.95), 19)
        XCTAssertEqual(WHSRounding.playingHandicap(21 * 0.95), 20)
        XCTAssertEqual(WHSRounding.normalizeDecimal(0.1 + 0.2), 0.3)
        XCTAssertEqual(WHSRounding.normalizeDecimal(20.3 + 26.8), 47.1)
    }

    // MARK: Course / Playing Handicap

    func testCourseHandicap18() throws {
        let a = try rules.courseHandicap(handicapIndex: 49.2, slopeRating: 131, courseRating: 72.4, par: 72)
        XCTAssertEqual(a.unrounded, 49.2 * (131.0 / 113.0) + 0.4, accuracy: 1e-10)
        XCTAssertEqual(a.rounded, 57)
        XCTAssertEqual(a.holes, 18)
        let b = try rules.courseHandicap(handicapIndex: 14.3, slopeRating: 128, courseRating: 71.2, par: 72)
        XCTAssertEqual(b.unrounded, 15.398, accuracy: 0.001)
        XCTAssertEqual(b.rounded, 15)
        XCTAssertEqual(try rules.courseHandicap(handicapIndex: 18.5, slopeRating: 113, courseRating: 72, par: 72).rounded, 19)
        XCTAssertEqual(try rules.courseHandicap(handicapIndex: -2.0, slopeRating: 130, courseRating: 72, par: 72).rounded, -2)
        XCTAssertThrowsError(try rules.courseHandicap(handicapIndex: 10, slopeRating: 20, courseRating: 72, par: 72))
    }

    func testCourseHandicap9() throws {
        let a = try rules.nineHoleCourseHandicap(handicapIndex: 49.3, slopeRating: 125, courseRating: 35.2, par: 36)
        XCTAssertEqual(a.halvedHandicapIndex, 24.7) // 24,65 → 24,7
        XCTAssertEqual(a.unrounded, 24.7 * (125.0 / 113.0) - 0.8, accuracy: 1e-10)
        XCTAssertEqual(a.rounded, 27)
        XCTAssertEqual(a.holes, 9)
        let b = try rules.nineHoleCourseHandicap(handicapIndex: 21.1, slopeRating: 120, courseRating: 35.5, par: 36)
        XCTAssertEqual(b.halvedHandicapIndex, 10.6)
        XCTAssertEqual(b.rounded, 11)
        XCTAssertEqual(try rules.nineHoleCourseHandicap(handicapIndex: 14.0, slopeRating: 129, courseRating: 35.8, par: 36).rounded, 8)
    }

    func testPlayingHandicap() throws {
        XCTAssertEqual(try rules.playingHandicap(courseHandicap: 20, allowance: 0.95), 19)
        XCTAssertEqual(try rules.playingHandicap(courseHandicap: 33, allowance: 1), 33)
        XCTAssertThrowsError(try rules.playingHandicap(courseHandicap: 20, allowance: 0))
        XCTAssertThrowsError(try rules.playingHandicap(courseHandicap: 20, allowance: 1.6))
    }

    // MARK: Vorgabenschläge

    func testAllocateStrokes() throws {
        let holes = Self.holes18()
        XCTAssertTrue(try rules.allocateStrokes(0, holes: holes).allSatisfy { $0 == 0 })
        XCTAssertTrue(try rules.allocateStrokes(18, holes: holes).allSatisfy { $0 == 1 })
        let s20 = try rules.allocateStrokes(20, holes: holes)
        for (i, h) in holes.enumerated() { XCTAssertEqual(s20[i], h.strokeIndex! <= 2 ? 2 : 1) }
        XCTAssertEqual(s20.reduce(0, +), 20)
        let s57 = try rules.allocateStrokes(57, holes: holes)
        for (i, h) in holes.enumerated() { XCTAssertEqual(s57[i], h.strokeIndex! <= 3 ? 4 : 3) }
        let s5 = try rules.allocateStrokes(5, holes: holes)
        for (i, h) in holes.enumerated() { XCTAssertEqual(s5[i], h.strokeIndex! <= 5 ? 1 : 0) }
        let plus = try rules.allocateStrokes(-3, holes: holes)
        for (i, h) in holes.enumerated() { XCTAssertEqual(plus[i], h.strokeIndex! >= 16 ? -1 : 0) }
    }

    func testAllocateStrokesNineHolesByRank() throws {
        XCTAssertEqual(try rules.allocateStrokes(4, holes: Self.holesFront9()), [1, 1, 0, 1, 0, 1, 0, 0, 0])
        let s12 = try rules.allocateStrokes(12, holes: Self.holesFront9())
        XCTAssertEqual(s12.reduce(0, +), 12)
        XCTAssertEqual(s12, [1, 2, 1, 2, 1, 2, 1, 1, 1])
    }

    func testStrokeIndexErrors() {
        var holes = Self.holes18()
        holes[3].strokeIndex = nil
        XCTAssertThrowsError(try rules.allocateStrokes(10, holes: holes)) { XCTAssertEqual(($0 as? WHSError)?.code, "STROKE_INDEX_MISSING") }
        holes = Self.holes18()
        holes[3].strokeIndex = 7
        XCTAssertThrowsError(try rules.strokeIndexRanks(holes)) { XCTAssertEqual(($0 as? WHSError)?.code, "STROKE_INDEX_DUPLICATE") }
    }

    // MARK: Netto-Doppelbogey / GBE

    func testNetDoubleBogeyAndHoleGBE() throws {
        XCTAssertEqual(rules.netDoubleBogey(par: 4, strokesReceived: 1), 7)
        XCTAssertEqual(rules.netDoubleBogey(par: 5, strokesReceived: 0), 7)
        XCTAssertEqual(rules.netDoubleBogey(par: 3, strokesReceived: 3), 8)
        let h1 = try rules.holeGBE(hole: WHSHoleInfo(number: 1, par: 4, strokeIndex: 7), strokesReceived: 1, raw: .strokes(8))
        XCTAssertEqual(h1.raw, .strokes(8))
        XCTAssertEqual(h1.adjusted, 7)
        XCTAssertEqual(h1.reason, .netDoubleBogeyLimit)
        let h2 = try rules.holeGBE(hole: WHSHoleInfo(number: 2, par: 5, strokeIndex: 3), strokesReceived: 1, raw: .strokes(7))
        XCTAssertEqual(h2.adjusted, 7)
        XCTAssertEqual(h2.reason, .unchanged)
        let h3 = try rules.holeGBE(hole: WHSHoleInfo(number: 1, par: 4, strokeIndex: 1), strokesReceived: 2, raw: .pickup)
        XCTAssertEqual(h3.adjusted, 8)
        XCTAssertEqual(h3.reason, .notCompleted)
        XCTAssertThrowsError(try rules.holeGBE(hole: WHSHoleInfo(number: 1, par: 4, strokeIndex: 1), strokesReceived: 0, raw: .missing))
        XCTAssertThrowsError(try rules.holeGBE(hole: WHSHoleInfo(number: 1, par: 4, strokeIndex: 1), strokesReceived: 0, raw: .strokes(0)))
    }

    func testGBERound() throws {
        let bogeys = Self.pars18.map { WHSHoleScore.strokes($0 + 1) }
        let a = try rules.gbe(holes: Self.holes18(), scores: bogeys, courseHandicap: ch(18))
        XCTAssertEqual(a.total, 90)
        XCTAssertEqual(a.rawTotal, 90)

        var withOutlier = bogeys
        withOutlier[0] = .strokes(12)
        let b = try rules.gbe(holes: Self.holes18(), scores: withOutlier, courseHandicap: ch(18))
        XCTAssertEqual(b.rawTotal, 90 - 5 + 12)
        XCTAssertEqual(b.total, 90 - 5 + 7)

        var pickups = Self.pars18.map { WHSHoleScore.strokes($0) }
        pickups[1] = .pickup
        pickups[5] = .pickup
        let c = try rules.gbe(holes: Self.holes18(), scores: pickups, courseHandicap: ch(0))
        XCTAssertEqual(c.total, 72 + 2 + 2)
        XCTAssertNil(c.rawTotal)

        let d = try rules.gbe(holes: Self.holes18(), scores: Self.pars18.map { .strokes($0 + 10) }, courseHandicap: ch(54))
        XCTAssertEqual(d.total, 72 + 18 * 5)

        let e = try rules.gbe(holes: Self.holesFront9(), scores: Self.holesFront9().map { .strokes($0.par + 3) }, courseHandicap: ch(9, holes: 9))
        XCTAssertEqual(e.total, 36 + 27)

        XCTAssertThrowsError(try rules.gbe(holes: Self.holes18(), scores: [.strokes(4)], courseHandicap: ch(10)))
    }

    // MARK: Stableford

    func testStablefordPoints() {
        XCTAssertEqual(rules.stablefordPoints(gross: .strokes(5), par: 4, strokesReceived: 1), 2)
        XCTAssertEqual(rules.stablefordPoints(gross: .strokes(4), par: 4, strokesReceived: 1), 3)
        XCTAssertEqual(rules.stablefordPoints(gross: .strokes(7), par: 4, strokesReceived: 1), 0)
        XCTAssertEqual(rules.stablefordPoints(gross: .pickup, par: 4, strokesReceived: 1), 0)
    }

    // MARK: Score Differential

    func testScoreDifferential18() throws {
        func sd(_ ags: Double, _ cr: Double, _ slope: Double, _ pcc: Double = 0) throws -> ScoreDifferentialValue {
            try rules.scoreDifferential(adjustedGrossScore: ags, courseRating: cr, slopeRating: slope, pcc: pcc)
        }
        XCTAssertEqual(try sd(94, 71.8, 135).unrounded, (113.0 / 135.0) * (94 - 71.8), accuracy: 1e-10)
        XCTAssertEqual(try sd(94, 71.8, 135).value, 18.6)
        XCTAssertEqual(try sd(123, 72.4, 131).value, 43.6)
        XCTAssertEqual(try sd(90, 72.0, 113).value, 18.0)
        XCTAssertEqual(try sd(94, 71.8, 135, 1).value, 17.7)
        XCTAssertEqual(try sd(94, 71.8, 135, -1).value, 19.4)
        XCTAssertEqual(try sd(94, 71.8, 135, 3).value, 16.1)
        XCTAssertEqual(try sd(70, 72.0, 113).value, -2.0)
        XCTAssertLessThan(try sd(100, 72, 140).value, try sd(100, 72, 120).value)
        XCTAssertThrowsError(try sd(90, 72, 54))
        XCTAssertThrowsError(try sd(90, 72, 156))
        XCTAssertThrowsError(try sd(.nan, 72, 113))
    }

    func testPCC() throws {
        XCTAssertTrue([-1, 0, 1, 2, 3].allSatisfy(rules.isAllowedPCC))
        XCTAssertFalse(rules.isAllowedPCC(4))
        XCTAssertFalse(rules.isAllowedPCC(-2))
        XCTAssertEqual(try rules.nineHolePCC(1), 0.5)
        XCTAssertEqual(try rules.nineHolePCC(0), 0)
        XCTAssertEqual(try rules.nineHolePCC(-1), -0.5)
        XCTAssertEqual(try rules.nineHolePCC(2), 1.0)
        XCTAssertEqual(try rules.nineHolePCC(3), 1.5)
        XCTAssertThrowsError(try rules.nineHolePCC(4))
    }

    func testExpectedNineHoleDifferential() throws {
        let e = try rules.expectedNineHoleDifferential(handicapIndexBeforeRound: 14.0)
        XCTAssertEqual(e.unrounded, 8.48, accuracy: 1e-10)
        XCTAssertEqual(e.value, 8.5)
        XCTAssertEqual(try rules.expectedNineHoleDifferential(handicapIndexBeforeRound: 49.2).value, 26.8)
        XCTAssertEqual(try rules.expectedNineHoleDifferential(handicapIndexBeforeRound: 47.8).value, 26.1)
        XCTAssertEqual(try rules.expectedNineHoleDifferential(handicapIndexBeforeRound: 54).value, 29.3)
        XCTAssertEqual(try rules.expectedNineHoleDifferential(handicapIndexBeforeRound: 0).value, 1.2)
    }

    func testNineHoleScoreDifferential() throws {
        let r = try rules.nineHoleScoreDifferential(adjustedGrossScore: 45, courseRating: 35.8, slopeRating: 129, pcc: 0, handicapIndexBeforeRound: 14.0)
        XCTAssertEqual(r.played.value, 8.1)
        XCTAssertEqual(r.expected, 8.5)
        XCTAssertEqual(r.value, 16.6)
        let p = try rules.nineHoleScoreDifferential(adjustedGrossScore: 45, courseRating: 35.8, slopeRating: 129, pcc: 1, handicapIndexBeforeRound: 14.0)
        XCTAssertEqual(p.pccApplied, 0.5)
        XCTAssertEqual(p.played.value, 7.6)
        XCTAssertEqual(p.value, 16.1)
        let full = (113.0 / 129.0) * (45 - 35.8 - 1)
        XCTAssertGreaterThan(abs(p.played.unrounded - full), 1e-5, "der volle 18-Loch-PCC wird nie auf 9 Loch angewendet")
        let n = try rules.nineHoleScoreDifferential(adjustedGrossScore: 58, courseRating: 34.9, slopeRating: 118, pcc: 0, handicapIndexBeforeRound: 36.4)
        XCTAssertEqual(n.value, WHSRounding.normalizeDecimal(n.value), "Summe frei von Gleitkommarauschen")
        let better = try rules.nineHoleScoreDifferential(adjustedGrossScore: 44, courseRating: 36, slopeRating: 120, pcc: 0, handicapIndexBeforeRound: 20)
        let worse = try rules.nineHoleScoreDifferential(adjustedGrossScore: 48, courseRating: 36, slopeRating: 120, pcc: 0, handicapIndexBeforeRound: 20)
        XCTAssertLessThan(better.value, worse.value)
    }
}
