import Foundation

/// Schritte der Score-Eingabe für ein Loch. Ein Schritt je Ansicht, jede Antwort mit einem Tipp – nie 20 Felder
/// gleichzeitig. „Fertig“ ist jederzeit möglich: Jede Antwort ist sofort gespeichert.
public enum ScoreEntryStep: String, Sendable, CaseIterable {
    /// eigene Schlagzahl (große Tasten)
    case score
    /// Schlagzahlen der Mitspieler (kompakt, eine Zeile je Spieler)
    case group
    case putts
    /// nur Par 4 und Par 5 (Par unbekannt: fragen)
    case fairway
    case gir
    /// Strafschläge und Bunker
    case extras
}

/// Reihenfolge der Schritte abhängig von Erfassungsart, Par und Mitspielern.
public struct ScoreEntryFlow: Equatable, Sendable {
    public let steps: [ScoreEntryStep]

    public init(scoring: ScoringMode, par: Int?, hasOtherPlayers: Bool) {
        var steps: [ScoreEntryStep] = []
        switch scoring {
        case .gpsOnly:
            break
        case .simple:
            steps = [.score]
            if hasOtherPlayers { steps.append(.group) }
        case .full:
            steps = [.score]
            if hasOtherPlayers { steps.append(.group) }
            steps.append(.putts)
            if ScoreEntryRules.asksFairway(par: par) { steps.append(.fairway) }
            steps.append(contentsOf: [.gir, .extras])
        }
        self.steps = steps
    }

    public var first: ScoreEntryStep? { steps.first }

    public func next(after step: ScoreEntryStep) -> ScoreEntryStep? {
        guard let i = steps.firstIndex(of: step), i + 1 < steps.count else { return nil }
        return steps[i + 1]
    }

    public func previous(before step: ScoreEntryStep) -> ScoreEntryStep? {
        guard let i = steps.firstIndex(of: step), i > 0 else { return nil }
        return steps[i - 1]
    }

    /// Fortschritt für die Anzeige („2 von 5“)
    public func position(of step: ScoreEntryStep) -> (index: Int, count: Int)? {
        steps.firstIndex(of: step).map { ($0 + 1, steps.count) }
    }
}

public struct ScoreOption: Equatable, Sendable {
    public var value: Int
    /// Bezeichnung relativ zu Par (Birdie, Par, Bogey …); `nil` ohne Par
    public var relative: RelativeScore?
}

/// Ergebnis relativ zu Par – immer mit Text, nie nur Farbe. Die App zeigt zusätzlich die klassische Scorekarten-
/// Markierung (Kreis = unter Par, Quadrat = über Par).
public enum RelativeScore: String, Sendable, CaseIterable {
    case holeInOne, albatross, eagle, birdie, par, bogey, doubleBogey, tripleBogey, worse

    public init?(strokes: Int?, par: Int?) {
        guard let strokes, let par else { return nil }
        let d = strokes - par
        if strokes == 1 { self = .holeInOne; return }
        switch d {
        case ...(-3): self = .albatross
        case -2: self = .eagle
        case -1: self = .birdie
        case 0: self = .par
        case 1: self = .bogey
        case 2: self = .doubleBogey
        case 3: self = .tripleBogey
        default: self = .worse
        }
    }

    public var isUnderPar: Bool { [.holeInOne, .albatross, .eagle, .birdie].contains(self) }
}

/// Regeln der Eingabe (Swift-Fassung der Relevanzregeln aus `src/lib/rounds/holeFlow.ts` und der Prüfungen aus
/// `src/lib/stats/holeStats.ts`). Aus der Schlagzahl wird nichts abgeleitet, was der Spieler nicht angegeben hat.
public enum ScoreEntryRules {
    /// Fairway nur auf Par 4 und Par 5 (Par unbekannt: fragen).
    public static func asksFairway(par: Int?) -> Bool { par == nil || par! >= 4 }

    /// Schnellauswahl: Par −1 bis Par +3 (z. B. Par 4: 3 4 5 6 7); andere Werte über − / +.
    public static func scoreOptions(par: Int?) -> [ScoreOption] {
        let p = par ?? 4
        return (max(1, p - 1)...(p + 3)).map { ScoreOption(value: $0, relative: RelativeScore(strokes: $0, par: par)) }
    }

    /// Vorschlag, mit dem die Eingabe startet (Par bzw. vorhandener Wert).
    public static func defaultStrokes(par: Int?, current: HoleScore) -> Int {
        current.strokes ?? par ?? 4
    }

    public static let maxStrokes = 20
    public static let maxPutts = 10
    public static let maxPenalties = 10

    /// Mögliche Putts zu einer Schlagzahl: höchstens Schläge − 1 − Strafschläge (der erste Schlag ist nie ein Putt
    /// vom Grün, außer beim Hole-in-One mit 0 Putts).
    public static func maxPutts(strokes: Int?, penalties: Int?) -> Int {
        guard let strokes else { return maxPutts }
        return max(0, min(maxPutts, strokes - 1 - (penalties ?? 0)))
    }

    /// Abhängige Angaben bereinigen: Par 3 → kein Fairway; aufgehoben → keine Schlagzahl; Putts nicht über Maximum.
    public static func normalized(_ score: HoleScore, par: Int?) -> HoleScore {
        var s = score
        if par == 3 { s.fairway = nil }
        if s.pickedUp { s.strokes = nil }
        if let strokes = s.strokes {
            s.strokes = min(max(1, strokes), maxStrokes)
            if let putts = s.putts { s.putts = min(putts, maxPutts(strokes: s.strokes, penalties: s.penalties)) }
        }
        if let penalties = s.penalties { s.penalties = min(max(0, penalties), maxPenalties) }
        return s
    }

    public enum Issue: Equatable, Sendable {
        /// Putts und Strafschläge passen nicht zur Schlagzahl
        case puttsExceedStrokes
        /// Fairway auf Par 3
        case fairwayOnParThree
        /// GIR „Ja“, aber mehr Schläge bis zum Grün als Par − 2 (möglich, z. B. Putt vom Grün gerollt) – nur Hinweis
        case girUnlikely
    }

    public static func issues(_ s: HoleScore, par: Int?) -> [Issue] {
        var out: [Issue] = []
        if let strokes = s.strokes, let putts = s.putts, putts + (s.penalties ?? 0) > max(0, strokes - 1) && !(strokes == 1 && putts == 0) {
            out.append(.puttsExceedStrokes)
        }
        if par == 3, s.fairway != nil { out.append(.fairwayOnParThree) }
        if let par, let strokes = s.strokes, let putts = s.putts, s.gir == true, strokes - putts > par - 2 {
            out.append(.girUnlikely)
        }
        return out
    }
}
