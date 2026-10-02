import Foundation

/// Warum für einen Spieler kein (vollständiges) Handicap gerechnet werden kann.
public enum HandicapIssue: String, Error, Equatable, Sendable {
    /// Runde ohne Handicap-Wertung
    case disabled
    case handicapIndexMissing
    /// kein vollständiges Rating (CR, Slope, Par) für Abschlag, Geschlecht und Lochzahl
    case ratingMissing
    /// Rating passt nicht zur Lochzahl (z. B. 9 Loch ohne 9-Loch-Rating – wird nie abgeleitet)
    case ratingScopeMismatch
    /// Par oder Handicap (Stroke Index) je Loch fehlen
    case holeDataIncomplete
    case invalidInput
}

/// Handicap eines Spielers für die gespielten Löcher.
public struct PlayerHandicap: Equatable, Sendable {
    public var courseHandicap: CourseHandicapResult?
    public var playingHandicap: Int?
    /// Vorgabenschläge je Lochnummer (Playing Handicap) für Netto und Stableford; leer ohne Handicap-Wertung
    public var strokesReceived: [Int: Int]
    /// Vorgabenschläge je Lochnummer mit dem Course Handicap (Netto-Doppelbogey)
    public var courseStrokes: [Int: Int]
    public var issue: HandicapIssue?

    public init(courseHandicap: CourseHandicapResult? = nil, playingHandicap: Int? = nil, strokesReceived: [Int: Int] = [:],
                courseStrokes: [Int: Int] = [:], issue: HandicapIssue? = nil) {
        self.courseHandicap = courseHandicap
        self.playingHandicap = playingHandicap
        self.strokesReceived = strokesReceived
        self.courseStrokes = courseStrokes
        self.issue = issue
    }

    /// Netto-Wertung möglich
    public var hasNet: Bool { playingHandicap != nil && !strokesReceived.isEmpty }
}

public struct HoleResult: Identifiable, Equatable, Sendable {
    public var number: Int
    public var par: Int?
    public var strokeIndex: Int?
    public var score: HoleScore
    /// Vorgabenschläge (Playing Handicap); 0 ohne Handicap-Wertung, `nil` wenn nicht berechenbar
    public var strokesReceived: Int?
    /// Schläge; `nil` bei aufgehobenem Ball oder ohne Eingabe
    public var gross: Int?
    public var net: Int?
    public var toPar: Int?
    public var netToPar: Int?
    public var stablefordPoints: Int?

    public var id: Int { number }
}

/// Summen über eine Lochgruppe (vordere/hintere neun, gesamt). Zwischenstände zählen nur gespielte Löcher.
public struct ScoreTotals: Equatable, Sendable {
    public var holes: Int
    public var scored: Int
    public var pickups: Int
    public var gross: Int
    public var toPar: Int?
    public var net: Int?
    public var netToPar: Int?
    public var stableford: Int?
    public var putts: Int?

    /// alle Löcher mit Schlagzahl, keines aufgehoben
    public var complete: Bool { scored == holes && pickups == 0 }

    static func make(_ results: [HoleResult], hasNet: Bool, hasStableford: Bool) -> ScoreTotals {
        var t = ScoreTotals(holes: results.count, scored: 0, pickups: 0, gross: 0, toPar: nil, net: nil, netToPar: nil,
                            stableford: nil, putts: nil)
        var toPar = 0, net = 0, netToPar = 0, points = 0, putts = 0
        var anyPar = false, anyNet = false, anyPutts = false
        for r in results {
            if r.score.isScored { t.scored += 1 }
            if r.score.pickedUp { t.pickups += 1 }
            if let g = r.gross {
                t.gross += g
                if let p = r.toPar { toPar += p; anyPar = true }
                if let n = r.net { net += n; anyNet = true }
                if let n = r.netToPar { netToPar += n }
            }
            if let s = r.stablefordPoints, r.score.isScored { points += s }
            if let p = r.score.putts { putts += p; anyPutts = true }
        }
        t.toPar = anyPar ? toPar : nil
        if hasNet && anyNet {
            t.net = net
            t.netToPar = anyPar ? netToPar : nil
        }
        t.stableford = hasStableford && t.scored > 0 ? points : nil
        t.putts = anyPutts ? putts : nil
        return t
    }
}

public struct PlayerScorecard: Identifiable, Equatable, Sendable {
    public var player: RoundPlayer
    public var handicap: PlayerHandicap
    public var holes: [HoleResult]
    /// Löcher 1–9 (nur 18-Loch-Runden)
    public var front: ScoreTotals?
    /// Löcher 10–18 (nur 18-Loch-Runden)
    public var back: ScoreTotals?
    public var total: ScoreTotals
    /// Stableford möglich (Par je Loch und – mit Handicap – Vorgabenschläge vorhanden)
    public var hasStableford: Bool

    public var id: UUID { player.id }
    public func hole(_ number: Int) -> HoleResult? { holes.first { $0.number == number } }
}

/// Wertung einer Runde: Handicap je Spieler, Netto, Stableford, Summen. Rechnet ausschließlich mit den Regeln aus
/// `WHSRuleSet` (gleiche Ergebnisse wie die Web-App); keine Logik in den Views.
public enum ScoringEngine {
    static func holeInfos(_ header: RoundHeader) -> [WHSHoleInfo]? {
        var out: [WHSHoleInfo] = []
        for hole in header.holes {
            guard let par = hole.par else { return nil }
            out.append(WHSHoleInfo(number: hole.number, par: par, strokeIndex: hole.strokeIndex))
        }
        return out
    }

    /// Course Handicap aus Handicap Index und Rating; die Lochzahl des Ratings muss zur Runde passen.
    public static func courseHandicap(for player: RoundPlayer, header: RoundHeader, rules: WHSRuleSet) -> Result<CourseHandicapResult, HandicapIssue> {
        guard let hi = player.handicapIndex else { return .failure(.handicapIndexMissing) }
        guard let rating = player.rating else { return .failure(.ratingMissing) }
        guard rating.scope == header.holeSelection.ratingScope else { return .failure(.ratingScopeMismatch) }
        do {
            let result = rating.holeCount == 18
                ? try rules.courseHandicap(handicapIndex: hi, slopeRating: Double(rating.slopeRating), courseRating: rating.courseRating, par: rating.par)
                : try rules.nineHoleCourseHandicap(handicapIndex: hi, slopeRating: Double(rating.slopeRating), courseRating: rating.courseRating, par: rating.par)
            return .success(result)
        } catch {
            return .failure(.invalidInput)
        }
    }

    public static func handicap(for player: RoundPlayer, header: RoundHeader, rules: WHSRuleSet) -> PlayerHandicap {
        var out = PlayerHandicap()
        let ch = try? courseHandicap(for: player, header: header, rules: rules).get()
        out.courseHandicap = ch
        let holes = holeInfos(header)
        if let ch, let holes, let strokes = try? rules.allocateStrokes(ch.rounded, holes: holes) {
            out.courseStrokes = Dictionary(uniqueKeysWithValues: zip(holes.map(\.number), strokes))
        }
        switch header.handicap.mode {
        case .none:
            out.issue = .disabled
            return out
        case .handicapIndex:
            switch courseHandicap(for: player, header: header, rules: rules) {
            case let .failure(issue):
                out.issue = issue
                return out
            case let .success(result):
                guard let ph = try? rules.playingHandicap(courseHandicap: result.rounded, allowance: Double(header.handicap.allowancePercent) / 100) else {
                    out.issue = .invalidInput
                    return out
                }
                out.playingHandicap = ph
            }
        case .playingHandicap:
            guard let ph = player.manualPlayingHandicap else {
                out.issue = .handicapIndexMissing
                return out
            }
            out.playingHandicap = ph
        }
        guard let holes, let ph = out.playingHandicap, let strokes = try? rules.allocateStrokes(ph, holes: holes) else {
            out.issue = .holeDataIncomplete
            return out
        }
        out.strokesReceived = Dictionary(uniqueKeysWithValues: zip(holes.map(\.number), strokes))
        return out
    }

    public static func scorecard(for player: RoundPlayer, round: Round, rules: WHSRuleSet) -> PlayerScorecard {
        let header = round.header
        let handicap = handicap(for: player, header: header, rules: rules)
        let noHandicap = header.handicap.mode == .none
        let hasStableford = header.holes.allSatisfy { $0.par != nil } && (noHandicap || handicap.hasNet)
        let results: [HoleResult] = header.holes.map { hole in
            let score = round.score(player: player.id, hole: hole.number)
            let received: Int? = noHandicap ? 0 : handicap.strokesReceived[hole.number]
            let gross = score.pickedUp ? nil : score.strokes
            var r = HoleResult(number: hole.number, par: hole.par, strokeIndex: hole.strokeIndex, score: score,
                               strokesReceived: received, gross: gross, net: nil, toPar: nil, netToPar: nil, stablefordPoints: nil)
            if let gross {
                if let par = hole.par { r.toPar = gross - par }
                if handicap.hasNet, let received {
                    r.net = gross - received
                    if let par = hole.par { r.netToPar = gross - received - par }
                }
            }
            if hasStableford, let par = hole.par, let received, score.isScored {
                r.stablefordPoints = rules.stablefordPoints(gross: score.whsScore, par: par, strokesReceived: received)
            }
            return r
        }
        let hasNet = handicap.hasNet
        let isEighteen = header.holes.count == 18
        return PlayerScorecard(
            player: player,
            handicap: handicap,
            holes: results,
            front: isEighteen ? ScoreTotals.make(results.filter { $0.number <= 9 }, hasNet: hasNet, hasStableford: hasStableford) : nil,
            back: isEighteen ? ScoreTotals.make(results.filter { $0.number >= 10 }, hasNet: hasNet, hasStableford: hasStableford) : nil,
            total: ScoreTotals.make(results, hasNet: hasNet, hasStableford: hasStableford),
            hasStableford: hasStableford
        )
    }

    public static func scorecards(for round: Round, rules: WHSRuleSet) -> [PlayerScorecard] {
        round.header.players.map { scorecard(for: $0, round: round, rules: rules) }
    }
}

// MARK: - Handicap-Ergebnis der Runde

public enum DifferentialIssue: String, Equatable, Sendable {
    /// noch nicht alle Löcher mit Ergebnis
    case roundIncomplete
    case handicapIndexMissing
    case ratingMissing
    case ratingScopeMismatch
    case holeDataIncomplete
    case invalidInput
}

/// Gewertetes Bruttoergebnis (GBE) und Score Differential eines Spielers für diese Runde.
public struct RoundDifferentialResult: Equatable, Sendable {
    public var gbe: GBEResult?
    public var scoreDifferential: Double?
    /// nur 9-Loch-Runden: gespieltes und erwartetes Differential
    public var nineHole: NineHoleDifferential?
    public var issue: DifferentialIssue?
    /// darf in den Handicap Index eingehen (Spieler möchte werten, kein Demo-Platz, Rating geprüft oder bestätigt)
    public var countsForHandicapIndex: Bool
}

extension ScoringEngine {
    public static func differential(for player: RoundPlayer, round: Round, rules: WHSRuleSet) -> RoundDifferentialResult {
        var result = RoundDifferentialResult(gbe: nil, scoreDifferential: nil, nineHole: nil, issue: nil, countsForHandicapIndex: false)
        let header = round.header
        let ch: CourseHandicapResult
        switch courseHandicap(for: player, header: header, rules: rules) {
        case let .success(value): ch = value
        case let .failure(issue):
            result.issue = DifferentialIssue(rawValue: issue.rawValue) ?? .invalidInput
            return result
        }
        guard let holes = holeInfos(header), holes.allSatisfy({ $0.strokeIndex != nil }) else {
            result.issue = .holeDataIncomplete
            return result
        }
        let scores = header.holes.map { round.score(player: player.id, hole: $0.number).whsScore }
        guard !scores.contains(.missing) else {
            result.issue = .roundIncomplete
            return result
        }
        guard let rating = player.rating, let hi = player.handicapIndex else {
            result.issue = .ratingMissing
            return result
        }
        do {
            let gbe = try rules.gbe(holes: holes, scores: scores, courseHandicap: ch)
            result.gbe = gbe
            if rating.holeCount == 18 {
                result.scoreDifferential = try rules.scoreDifferential(adjustedGrossScore: Double(gbe.total), courseRating: rating.courseRating,
                                                                       slopeRating: Double(rating.slopeRating), pcc: Double(header.pcc)).value
            } else {
                let nine = try rules.nineHoleScoreDifferential(adjustedGrossScore: Double(gbe.total), courseRating: rating.courseRating,
                                                               slopeRating: Double(rating.slopeRating), pcc: header.pcc,
                                                               handicapIndexBeforeRound: hi)
                result.nineHole = nine
                result.scoreDifferential = nine.value
            }
        } catch {
            result.issue = .invalidInput
            return result
        }
        result.countsForHandicapIndex = header.countsForHandicap
            && header.courseSource != .demo
            && rating.status != .fictional
            && (rating.status == .verified || rating.playerConfirmed)
        return result
    }
}
