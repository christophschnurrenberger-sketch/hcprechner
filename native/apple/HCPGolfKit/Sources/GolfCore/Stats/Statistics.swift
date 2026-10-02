import Foundation

/// Statistik einer Runde (Swift-Fassung von `src/lib/stats/roundStatistics.ts`, erweitert um Fehlschlag-Richtung,
/// Scrambling und 1-Putts). Prozentwerte 0–100, `nil` = keine Versuche (nicht 0 %).
///
/// Definitionen:
/// - Nenner sind die tatsächlich erfassten Löcher (9 Loch → GIR x/9).
/// - Fairway-Quote = Fairway getroffen ÷ Par-4/5-Löcher mit Angabe (Par 3 nie im Nenner).
/// - Scrambling = Grün verfehlt und danach Par oder besser ÷ Löcher mit GIR „Nein“ und Schlagzahl.
/// - Sand Save = nach Bunkerschlag Par oder besser ÷ Löcher mit Bunkerschlag und Schlagzahl.
/// - Putts/GIR = Putts auf Löchern mit GIR „Ja“ ÷ Anzahl dieser Löcher.
/// - Verteilung = Schläge gegenüber Par (Eagle oder besser … Triple-Bogey und schlechter).
public struct RoundStatistics: Equatable, Sendable {
    public var holes = 0
    public var holesScored = 0
    public var scorecardComplete = false
    /// nur bei vollständiger Scorekarte ohne aufgehobene Löcher
    public var grossScore: Int?
    public var parPlayed: Int?
    public var totalPutts: Int?
    public var puttHoles = 0
    public var puttsOnGIR = 0
    public var girPuttHoles = 0
    public var girs = 0
    public var girHoles = 0
    public var fairwaysHit = 0
    public var fairwayOpportunities = 0
    public var missLeft = 0
    public var missRight = 0
    public var missShort = 0
    public var scrambleAttempts = 0
    public var scrambles = 0
    public var sandAttempts = 0
    public var sandSaves = 0
    public var penaltyStrokes: Int?
    public var onePutts = 0
    public var threePutts = 0
    public var eagles = 0
    public var birdies = 0
    public var pars = 0
    public var bogeys = 0
    public var doubleBogeys = 0
    public var triplePlus = 0

    public init() {}

    public var puttsPerHole: Double? { Statistics.ratio(totalPutts ?? 0, puttHoles) }
    public var puttsPerGIR: Double? { Statistics.ratio(puttsOnGIR, girPuttHoles) }
    public var girPercentage: Double? { Statistics.percent(girs, girHoles) }
    public var fairwayPercentage: Double? { Statistics.percent(fairwaysHit, fairwayOpportunities) }
    public var scramblingPercentage: Double? { Statistics.percent(scrambles, scrambleAttempts) }
    public var sandSavePercentage: Double? { Statistics.percent(sandSaves, sandAttempts) }

    /// Enthält die Runde Spielstatistik über die Schlagzahl hinaus?
    public var hasDetail: Bool { puttHoles > 0 || girHoles > 0 || fairwayOpportunities > 0 }
}

/// Zusammenfassung über mehrere Runden: Summen der Zähler → Quoten (nie Durchschnitt von Prozentwerten).
public struct PerformanceSummary: Equatable, Sendable {
    public var rounds = 0
    public var roundsWithDetail = 0
    public var completed18 = 0
    public var completed9 = 0
    public var averageScore18: Double?
    public var averageScore9: Double?
    public var bestScore18: Int?
    public var bestScore9: Int?
    public var averageToPar18: Double?
    public var totals = RoundStatistics()

    public init() {}

    public var puttsPerRound18: Double? {
        // Putts je 18 Löcher, hochgerechnet aus den Löchern mit Putt-Angabe
        totals.puttsPerHole.map { $0 * 18 }
    }
}

public enum Statistics {
    public static func ratio(_ part: Int, _ whole: Int) -> Double? { whole > 0 ? Double(part) / Double(whole) : nil }
    public static func percent(_ part: Int, _ whole: Int) -> Double? { whole > 0 ? Double(part) / Double(whole) * 100 : nil }

    public static func round(_ holes: [(par: Int?, score: HoleScore)]) -> RoundStatistics {
        var s = RoundStatistics()
        s.holes = holes.count
        var scoreSum = 0, parSum = 0, putts = 0, penalties = 0, penaltyHoles = 0
        var parKnown = true, pickups = 0
        for (par, h) in holes {
            if h.pickedUp { pickups += 1 }
            if h.isScored { s.holesScored += 1 }
            if let strokes = h.strokes, !h.pickedUp {
                scoreSum += strokes
                if let par {
                    parSum += par
                    switch strokes - par {
                    case ...(-2): s.eagles += 1
                    case -1: s.birdies += 1
                    case 0: s.pars += 1
                    case 1: s.bogeys += 1
                    case 2: s.doubleBogeys += 1
                    default: s.triplePlus += 1
                    }
                    if h.gir == false {
                        s.scrambleAttempts += 1
                        if strokes <= par { s.scrambles += 1 }
                    }
                    if h.sandShot == true {
                        s.sandAttempts += 1
                        if strokes <= par { s.sandSaves += 1 }
                    }
                } else {
                    parKnown = false
                }
            }
            if let p = h.putts {
                putts += p
                s.puttHoles += 1
                if p == 1 { s.onePutts += 1 }
                if p >= 3 { s.threePutts += 1 }
                if h.gir == true {
                    s.puttsOnGIR += p
                    s.girPuttHoles += 1
                }
            }
            if let gir = h.gir {
                s.girHoles += 1
                if gir { s.girs += 1 }
            }
            if let fairway = h.fairway, par != 3 {
                s.fairwayOpportunities += 1
                switch fairway {
                case .hit: s.fairwaysHit += 1
                case .left: s.missLeft += 1
                case .right: s.missRight += 1
                case .short: s.missShort += 1
                }
            }
            if let pen = h.penalties {
                penalties += pen
                penaltyHoles += 1
            }
        }
        s.scorecardComplete = !holes.isEmpty && s.holesScored == holes.count
        if s.scorecardComplete && pickups == 0 {
            s.grossScore = scoreSum
            s.parPlayed = parKnown ? parSum : nil
        }
        s.totalPutts = s.puttHoles > 0 ? putts : nil
        s.penaltyStrokes = penaltyHoles > 0 ? penalties : nil
        return s
    }

    /// Statistik eines Spielers in einer Runde.
    public static func round(_ round: Round, player: UUID) -> RoundStatistics {
        Self.round(round.header.holes.map { ($0.par, round.score(player: player, hole: $0.number)) })
    }

    /// Zusammenfassung über abgeschlossene Runden des Besitzers.
    public static func summary(_ rounds: [Round]) -> PerformanceSummary {
        var out = PerformanceSummary()
        var sum18 = 0, sum9 = 0, toPar18 = 0, toPar18Count = 0
        for round in rounds where round.status == .completed && !round.isDeleted {
            guard let owner = round.owner else { continue }
            let s = Self.round(round, player: owner.id)
            out.rounds += 1
            if s.hasDetail { out.roundsWithDetail += 1 }
            if let gross = s.grossScore {
                if s.holes == 18 {
                    out.completed18 += 1
                    sum18 += gross
                    out.bestScore18 = min(out.bestScore18 ?? gross, gross)
                    if let par = s.parPlayed { toPar18 += gross - par; toPar18Count += 1 }
                } else if s.holes == 9 {
                    out.completed9 += 1
                    sum9 += gross
                    out.bestScore9 = min(out.bestScore9 ?? gross, gross)
                }
            }
            add(s, to: &out.totals)
        }
        out.averageScore18 = out.completed18 > 0 ? Double(sum18) / Double(out.completed18) : nil
        out.averageScore9 = out.completed9 > 0 ? Double(sum9) / Double(out.completed9) : nil
        out.averageToPar18 = toPar18Count > 0 ? Double(toPar18) / Double(toPar18Count) : nil
        return out
    }

    static func add(_ s: RoundStatistics, to t: inout RoundStatistics) {
        t.holes += s.holes
        t.holesScored += s.holesScored
        t.totalPutts = (t.totalPutts ?? 0) + (s.totalPutts ?? 0)
        t.puttHoles += s.puttHoles
        t.puttsOnGIR += s.puttsOnGIR
        t.girPuttHoles += s.girPuttHoles
        t.girs += s.girs
        t.girHoles += s.girHoles
        t.fairwaysHit += s.fairwaysHit
        t.fairwayOpportunities += s.fairwayOpportunities
        t.missLeft += s.missLeft
        t.missRight += s.missRight
        t.missShort += s.missShort
        t.scrambleAttempts += s.scrambleAttempts
        t.scrambles += s.scrambles
        t.sandAttempts += s.sandAttempts
        t.sandSaves += s.sandSaves
        if let p = s.penaltyStrokes { t.penaltyStrokes = (t.penaltyStrokes ?? 0) + p }
        t.onePutts += s.onePutts
        t.threePutts += s.threePutts
        t.eagles += s.eagles
        t.birdies += s.birdies
        t.pars += s.pars
        t.bogeys += s.bogeys
        t.doubleBogeys += s.doubleBogeys
        t.triplePlus += s.triplePlus
    }
}
