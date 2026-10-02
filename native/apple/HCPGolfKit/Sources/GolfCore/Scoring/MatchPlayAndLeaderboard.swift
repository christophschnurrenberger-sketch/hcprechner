import Foundation

// MARK: - Lochspiel (Einzel)

public struct MatchPlayHole: Equatable, Sendable {
    public var number: Int
    /// Gewinner des Lochs; `nil` = geteilt
    public var winner: UUID?
    /// Stand nach diesem Loch aus Sicht von Spieler A (> 0: A führt)
    public var lead: Int
}

public struct MatchPlayStatus: Equatable, Sendable {
    public var playerA: UUID
    public var playerB: UUID
    /// Vorgabenschläge, die der höher eingestufte Spieler je Loch erhält
    public var strokesForA: [Int: Int]
    public var strokesForB: [Int: Int]
    public var holes: [MatchPlayHole]
    /// > 0: A führt, < 0: B führt, 0: all square
    public var lead: Int
    public var holesPlayed: Int
    public var holesRemaining: Int

    public var leader: UUID? { lead > 0 ? playerA : lead < 0 ? playerB : nil }
    /// Vorsprung größer als die verbleibenden Löcher
    public var isDecided: Bool { abs(lead) > holesRemaining }
    /// Vorsprung gleich verbleibende Löcher („dormie“)
    public var isDormie: Bool { lead != 0 && abs(lead) == holesRemaining }
    public var isFinished: Bool { isDecided || holesRemaining == 0 }
}

/// Lochspiel nach Netto-Schlägen: Der Spieler mit dem höheren Playing Handicap erhält die Differenz, verteilt nach
/// Stroke Index über die gespielten Löcher. Ein aufgehobener Ball verliert das Loch (beide aufgehoben: geteilt).
public enum MatchPlayEngine {
    public static func status(round: Round, playerA: UUID, playerB: UUID, rules: WHSRuleSet) -> MatchPlayStatus? {
        let header = round.header
        guard let a = header.player(playerA), let b = header.player(playerB) else { return nil }
        var strokesA: [Int: Int] = [:]
        var strokesB: [Int: Int] = [:]
        if header.handicap.mode != .none,
           let phA = ScoringEngine.handicap(for: a, header: header, rules: rules).playingHandicap,
           let phB = ScoringEngine.handicap(for: b, header: header, rules: rules).playingHandicap,
           let holes = ScoringEngine.holeInfos(header) {
            let diff = abs(phA - phB)
            if diff > 0, let allocation = try? rules.allocateStrokes(diff, holes: holes) {
                let map = Dictionary(uniqueKeysWithValues: zip(holes.map(\.number), allocation))
                if phA > phB { strokesA = map } else { strokesB = map }
            }
        }
        var lead = 0
        var played = 0
        var results: [MatchPlayHole] = []
        for hole in header.holes {
            let sa = round.score(player: playerA, hole: hole.number)
            let sb = round.score(player: playerB, hole: hole.number)
            guard sa.isScored, sb.isScored else { continue }
            if abs(lead) > header.holes.count - played { break } // Match entschieden – weitere Löcher zählen nicht
            played += 1
            let winner: UUID?
            switch (sa.pickedUp, sb.pickedUp) {
            case (true, true): winner = nil
            case (true, false): winner = playerB
            case (false, true): winner = playerA
            default:
                let netA = (sa.strokes ?? 0) - (strokesA[hole.number] ?? 0)
                let netB = (sb.strokes ?? 0) - (strokesB[hole.number] ?? 0)
                winner = netA < netB ? playerA : netB < netA ? playerB : nil
            }
            if winner == playerA { lead += 1 }
            if winner == playerB { lead -= 1 }
            results.append(MatchPlayHole(number: hole.number, winner: winner, lead: lead))
        }
        return MatchPlayStatus(playerA: playerA, playerB: playerB, strokesForA: strokesA, strokesForB: strokesB, holes: results,
                               lead: lead, holesPlayed: played, holesRemaining: header.holes.count - played)
    }
}

// MARK: - Leaderboard

public enum LeaderboardMetric: String, Sendable, CaseIterable {
    case grossToPar
    case netToPar
    case stableford
}

public struct LeaderboardEntry: Identifiable, Equatable, Sendable {
    public var playerID: UUID
    public var name: String
    /// Platz (1, 2, 2, 4 …); `nil` ohne gewertetes Loch
    public var position: Int?
    /// Gleichstand mit mindestens einem anderen Spieler („T2“)
    public var tied: Bool
    /// gespielte Löcher („nach 7“)
    public var thru: Int
    /// Schläge über/unter Par bzw. Stablefordpunkte
    public var value: Int?

    public var id: UUID { playerID }
}

/// Rangliste mit korrekten Gleichständen (Standard-Wettspielwertung „1, T2, T2, 4“). Über/unter Par wird über die
/// gespielten Löcher verglichen, damit Spieler mit unterschiedlich vielen Löchern vergleichbar sind.
public enum Leaderboard {
    public static func value(_ card: PlayerScorecard, metric: LeaderboardMetric) -> Int? {
        guard card.total.scored > 0 else { return nil }
        switch metric {
        case .grossToPar: return card.total.toPar
        case .netToPar: return card.total.netToPar
        case .stableford: return card.total.stableford
        }
    }

    public static func entries(_ cards: [PlayerScorecard], metric: LeaderboardMetric) -> [LeaderboardEntry] {
        let higherIsBetter = metric == .stableford
        let base = cards.map {
            LeaderboardEntry(playerID: $0.player.id, name: $0.player.name, position: nil, tied: false, thru: $0.total.scored,
                             value: value($0, metric: metric))
        }
        let ranked = base.filter { $0.value != nil }.sorted { a, b in
            if a.value != b.value { return higherIsBetter ? a.value! > b.value! : a.value! < b.value! }
            if a.thru != b.thru { return a.thru > b.thru }
            return a.name.localizedCompare(b.name) == .orderedAscending
        }
        var out: [LeaderboardEntry] = []
        for (index, entry) in ranked.enumerated() {
            var e = entry
            if let previous = out.last, previous.value == entry.value {
                e.position = previous.position
            } else {
                e.position = index + 1
            }
            out.append(e)
        }
        for i in out.indices {
            out[i].tied = out.filter { $0.value == out[i].value }.count > 1
        }
        let unranked = base.filter { $0.value == nil }.sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
        return out + unranked
    }
}
