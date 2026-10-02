import Foundation

/// Rohschläge eines Lochs aus Sicht des Regelwerks.
public enum WHSHoleScore: Equatable, Sendable {
    case strokes(Int)
    /// gespielt, aber nicht beendet („aufgehoben“)
    case pickup
    /// keine Angabe bzw. nicht gespielt
    case missing
}

public struct WHSHoleInfo: Equatable, Sendable {
    public var number: Int
    public var par: Int
    public var strokeIndex: Int?

    public init(number: Int, par: Int, strokeIndex: Int?) {
        self.number = number
        self.par = par
        self.strokeIndex = strokeIndex
    }
}

public struct CourseHandicapResult: Equatable, Sendable {
    /// 9 oder 18 Löcher
    public var holes: Int
    public var handicapIndex: Double
    /// nur 9 Loch: HCPI / 2, vor der weiteren Rechnung auf 0,1 gerundet
    public var halvedHandicapIndex: Double?
    public var slopeRating: Double
    public var courseRating: Double
    public var par: Int
    public var unrounded: Double
    public var rounded: Int
}

public enum HoleAdjustmentReason: String, Equatable, Sendable {
    case unchanged
    case netDoubleBogeyLimit
    case notCompleted
}

public struct HoleAdjustment: Equatable, Sendable {
    public var number: Int
    public var par: Int
    public var strokeIndex: Int?
    public var strokesReceived: Int
    public var netDoubleBogey: Int
    public var raw: WHSHoleScore
    /// für das Handicap gewerteter Lochscore
    public var adjusted: Int
    public var reason: HoleAdjustmentReason
}

public struct GBEResult: Equatable, Sendable {
    public var holes: [HoleAdjustment]
    /// gewertetes Bruttoergebnis (GBE, Adjusted Gross Score)
    public var total: Int
    /// Summe der Rohschläge, wenn jedes Loch eine Schlagzahl hat
    public var rawTotal: Int?
    public var courseHandicap: CourseHandicapResult
}

public struct ScoreDifferentialValue: Equatable, Sendable {
    public var unrounded: Double
    public var value: Double
}

public struct NineHoleDifferential: Equatable, Sendable {
    public var pccApplied: Double
    public var played: ScoreDifferentialValue
    public var expectedUnrounded: Double
    public var expected: Double
    public var handicapIndexBeforeRound: Double
    public var unrounded: Double
    public var value: Double
}

/// Rechenfunktionen der Regelversion – Swift-Fassung von `courseHandicap.ts`, `gbE.ts`, `stableford.ts`,
/// `scoreDifferential.ts` und `nineHoleCalculation.ts` (Web-App, gleiche Testwerte).
extension WHSRuleSet {
    // MARK: Rundung

    public func roundScoreDifferential(_ v: Double) -> Double { WHSRounding.scoreDifferential(v, mode: roundingMode) }
    public func roundCourseHandicap(_ v: Double) -> Int { WHSRounding.courseHandicap(v, mode: roundingMode) }
    public func roundPlayingHandicap(_ v: Double) -> Int { WHSRounding.playingHandicap(v, mode: roundingMode) }

    // MARK: Course / Playing Handicap

    public func validateSlope(_ slope: Double) throws {
        guard slope.isFinite, slope >= slopeMin, slope <= slopeMax else {
            throw WHSError("SLOPE_RATING_INVALID", ["value": "\(slope)", "min": "\(Int(slopeMin))", "max": "\(Int(slopeMax))"])
        }
    }

    /// 18 Löcher: Course Handicap = HCPI × (Slope / 113) + (CR − Par). Gerundet wird nur das Endergebnis.
    public func courseHandicap(handicapIndex: Double, slopeRating: Double, courseRating: Double, par: Int) throws -> CourseHandicapResult {
        try validateSlope(slopeRating)
        guard handicapIndex.isFinite, courseRating.isFinite else { throw WHSError("HANDICAP_INPUT_INVALID") }
        let unrounded = handicapIndex * slopeRating / slopeStandard + (courseRating - Double(par))
        return CourseHandicapResult(holes: 18, handicapIndex: handicapIndex, halvedHandicapIndex: nil, slopeRating: slopeRating,
                                    courseRating: courseRating, par: par, unrounded: unrounded, rounded: roundCourseHandicap(unrounded))
    }

    /// 9 Löcher: Course Handicap = (HCPI / 2) × (Slope₉ / 113) + (CR₉ − Par₉). HCPI / 2 wird zuerst auf 0,1 gerundet.
    public func nineHoleCourseHandicap(handicapIndex: Double, slopeRating: Double, courseRating: Double, par: Int) throws -> CourseHandicapResult {
        try validateSlope(slopeRating)
        guard handicapIndex.isFinite, courseRating.isFinite else { throw WHSError("HANDICAP_INPUT_INVALID") }
        let halved = WHSRounding.round(handicapIndex / 2, decimals: halvedHandicapIndexDecimals, mode: roundingMode)
        let unrounded = halved * slopeRating / slopeStandard + (courseRating - Double(par))
        return CourseHandicapResult(holes: 9, handicapIndex: handicapIndex, halvedHandicapIndex: halved, slopeRating: slopeRating,
                                    courseRating: courseRating, par: par, unrounded: unrounded, rounded: roundCourseHandicap(unrounded))
    }

    /// Playing Handicap = Course Handicap × Handicap-Verrechnung (z. B. 0,95), gerundet.
    public func playingHandicap(courseHandicap: Int, allowance: Double) throws -> Int {
        guard allowance > 0, allowance <= allowanceRange.upperBound else {
            throw WHSError("ALLOWANCE_INVALID", ["value": "\(allowance)"])
        }
        return roundPlayingHandicap(Double(courseHandicap) * allowance)
    }

    // MARK: Vorgabenschläge, Netto-Doppelbogey, GBE

    /// Rangfolge der Löcher nach Stroke Index (1 = schwerstes Loch). Bei 9-Loch-Runden mit 18er-Stroke-Index ergibt
    /// die Rangfolge die Reihenfolge der Vorgabenschläge innerhalb der neun Löcher.
    public func strokeIndexRanks(_ holes: [WHSHoleInfo]) throws -> [Int] {
        var seen = Set<Int>()
        for hole in holes {
            guard let si = hole.strokeIndex, si >= 1 else {
                throw WHSError("STROKE_INDEX_MISSING", ["hole": "\(hole.number)"])
            }
            guard seen.insert(si).inserted else {
                throw WHSError("STROKE_INDEX_DUPLICATE", ["hole": "\(hole.number)", "strokeIndex": "\(si)"])
            }
        }
        let order = holes.enumerated().sorted { ($0.element.strokeIndex ?? 0) < ($1.element.strokeIndex ?? 0) }
        var ranks = [Int](repeating: 0, count: holes.count)
        for (rank, entry) in order.enumerated() {
            ranks[entry.offset] = rank + 1
        }
        return ranks
    }

    /// Verteilt ein (gerundetes) Course bzw. Playing Handicap auf die Löcher. Positiv: Schläge ab Rang 1, mehrfach
    /// umlaufend. Plus-Handicap (negativ): Schläge werden ab dem leichtesten Loch zurückgegeben.
    public func allocateStrokes(_ handicap: Int, holes: [WHSHoleInfo]) throws -> [Int] {
        let n = holes.count
        guard n > 0 else { return [] }
        let ranks = try strokeIndexRanks(holes)
        let magnitude = abs(handicap)
        let base = magnitude / n
        let extra = magnitude % n
        return ranks.map { rank in
            if handicap >= 0 {
                return base + (rank <= extra ? 1 : 0)
            }
            return -(base + (rank > n - extra ? 1 : 0))
        }
    }

    public func netDoubleBogey(par: Int, strokesReceived: Int) -> Int {
        par + netDoubleBogeyStrokesOverPar + strokesReceived
    }

    /// Gewerteter Lochscore: Rohscore, höchstens Netto-Doppelbogey; nicht beendetes Loch = Netto-Doppelbogey.
    public func holeGBE(hole: WHSHoleInfo, strokesReceived: Int, raw: WHSHoleScore) throws -> HoleAdjustment {
        let ndb = netDoubleBogey(par: hole.par, strokesReceived: strokesReceived)
        func make(_ adjusted: Int, _ reason: HoleAdjustmentReason) -> HoleAdjustment {
            HoleAdjustment(number: hole.number, par: hole.par, strokeIndex: hole.strokeIndex, strokesReceived: strokesReceived,
                           netDoubleBogey: ndb, raw: raw, adjusted: adjusted, reason: reason)
        }
        switch raw {
        case .pickup:
            return make(ndb, .notCompleted)
        case .missing:
            throw WHSError("HOLE_SCORE_MISSING", ["hole": "\(hole.number)"])
        case let .strokes(value):
            guard value >= 1, value <= maxHoleScore else {
                throw WHSError("HOLE_SCORE_INVALID", ["hole": "\(hole.number)", "value": "\(value)"])
            }
            return value > ndb ? make(ndb, .netDoubleBogeyLimit) : make(value, .unchanged)
        }
    }

    public func validateHoleData(_ holes: [WHSHoleInfo], expected: Int) throws {
        guard holes.count == expected else {
            throw WHSError("HOLE_DATA_INCOMPLETE", ["expected": "\(expected)", "actual": "\(holes.count)"])
        }
        for hole in holes where !(3...6).contains(hole.par) {
            throw WHSError("HOLE_PAR_MISSING", ["hole": "\(hole.number)"])
        }
    }

    /// GBE einer vollständig gespielten 9- oder 18-Loch-Runde aus Lochscores.
    public func gbe(holes: [WHSHoleInfo], scores: [WHSHoleScore], courseHandicap: CourseHandicapResult) throws -> GBEResult {
        guard scores.count == holes.count else {
            throw WHSError("HOLE_SCORES_INCOMPLETE", ["expected": "\(holes.count)", "actual": "\(scores.count)"])
        }
        let strokes = try allocateStrokes(courseHandicap.rounded, holes: holes)
        var adjustments: [HoleAdjustment] = []
        for i in holes.indices {
            adjustments.append(try holeGBE(hole: holes[i], strokesReceived: strokes[i], raw: scores[i]))
        }
        let total = adjustments.reduce(0) { $0 + $1.adjusted }
        var rawTotal: Int? = 0
        for score in scores {
            if case let .strokes(v) = score, let sum = rawTotal { rawTotal = sum + v } else { rawTotal = nil }
        }
        return GBEResult(holes: adjustments, total: total, rawTotal: rawTotal, courseHandicap: courseHandicap)
    }

    // MARK: Stableford

    /// Stablefordpunkte eines Lochs (Netto-Par = 2 Punkte). Stableford ist nur eine Spielform: In den Handicap Index
    /// geht nie die Punktzahl ein, sondern immer das GBE.
    public func stablefordPoints(gross: WHSHoleScore, par: Int, strokesReceived: Int) -> Int {
        guard case let .strokes(value) = gross else { return 0 }
        return max(0, par + strokesReceived + 2 - value)
    }

    // MARK: Score Differential

    public func isAllowedPCC(_ pcc: Int) -> Bool { pccAllowed.contains(pcc) }

    /// DGV: PCC für 9-Loch-Runden über die explizit hinterlegte Tabelle.
    public func nineHolePCC(_ pcc18: Int) throws -> Double {
        guard let mapped = nineHolePCC[pcc18] else { throw WHSError("PCC_INVALID", ["value": "\(pcc18)"]) }
        return mapped
    }

    /// Score Differential = (113 / Slope) × (GBE − CR − PCC), auf 0,1 gerundet.
    public func scoreDifferential(adjustedGrossScore: Double, courseRating: Double, slopeRating: Double, pcc: Double) throws -> ScoreDifferentialValue {
        try validateSlope(slopeRating)
        guard adjustedGrossScore.isFinite, courseRating.isFinite else { throw WHSError("SCORE_DIFFERENTIAL_INPUT_INVALID") }
        let unrounded = slopeStandard * (adjustedGrossScore - courseRating - pcc) / slopeRating
        return ScoreDifferentialValue(unrounded: unrounded, value: roundScoreDifferential(unrounded))
    }

    /// Erwartetes Score Differential der nicht gespielten neun Löcher: ((HCPI × 1,04) + 2,4) / 2.
    /// `handicapIndexBeforeRound` ist der HCPI zu Beginn des Spieltags – nie der nach der Runde.
    public func expectedNineHoleDifferential(handicapIndexBeforeRound hi: Double) throws -> ScoreDifferentialValue {
        guard hi.isFinite else { throw WHSError("HANDICAP_INDEX_MISSING") }
        let unrounded = (hi * nineHoleExpectedFactor + nineHoleExpectedConstant) / nineHoleDivisor
        return ScoreDifferentialValue(unrounded: unrounded, value: nineHoleRoundComponents ? roundScoreDifferential(unrounded) : unrounded)
    }

    /// 18-Loch-Score-Differential aus einer 9-Loch-Runde: SD₉ gespielt + SD₉ erwartet.
    /// Es werden niemals zwei 9-Loch-Runden miteinander kombiniert.
    public func nineHoleScoreDifferential(adjustedGrossScore: Double, courseRating: Double, slopeRating: Double, pcc: Int,
                                          handicapIndexBeforeRound: Double) throws -> NineHoleDifferential {
        let pccApplied = try nineHolePCC(pcc)
        let playedRaw = try scoreDifferential(adjustedGrossScore: adjustedGrossScore, courseRating: courseRating,
                                              slopeRating: slopeRating, pcc: pccApplied)
        let played = nineHoleRoundComponents ? playedRaw : ScoreDifferentialValue(unrounded: playedRaw.unrounded, value: playedRaw.unrounded)
        let expected = try expectedNineHoleDifferential(handicapIndexBeforeRound: handicapIndexBeforeRound)
        let unrounded = played.value + expected.value
        let value = nineHoleRoundComponents
            ? WHSRounding.normalizeDecimal(unrounded, decimals: scoreDifferentialDecimals)
            : roundScoreDifferential(unrounded)
        return NineHoleDifferential(pccApplied: pccApplied, played: played, expectedUnrounded: expected.unrounded,
                                    expected: expected.value, handicapIndexBeforeRound: handicapIndexBeforeRound,
                                    unrounded: unrounded, value: value)
    }
}
