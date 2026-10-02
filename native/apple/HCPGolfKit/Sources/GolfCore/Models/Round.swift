import Foundation

/// Kalendertag ohne Uhrzeit („YYYY-MM-DD“) – maßgeblich für die WHS-Tageslogik.
public struct LocalDate: Hashable, Comparable, Sendable, CustomStringConvertible {
    public var year: Int
    public var month: Int
    public var day: Int

    public init(year: Int, month: Int, day: Int) {
        self.year = year
        self.month = month
        self.day = day
    }

    public init(_ date: Date, calendar: Calendar = .current) {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        self.init(year: c.year ?? 1970, month: c.month ?? 1, day: c.day ?? 1)
    }

    public init?(_ text: String) {
        let parts = text.split(separator: "-")
        guard parts.count == 3, let y = Int(parts[0]), let m = Int(parts[1]), let d = Int(parts[2]),
              (1...12).contains(m), (1...31).contains(d) else { return nil }
        self.init(year: y, month: m, day: d)
    }

    public static func < (a: LocalDate, b: LocalDate) -> Bool {
        (a.year, a.month, a.day) < (b.year, b.month, b.day)
    }

    public var description: String {
        func pad(_ value: Int, _ width: Int) -> String {
            let text = String(value)
            return String(repeating: "0", count: max(0, width - text.count)) + text
        }
        return pad(year, 4) + "-" + pad(month, 2) + "-" + pad(day, 2)
    }

    /// Mittag dieses Tages in der Zeitzone des Kalenders (stabil gegen Sommerzeitwechsel).
    public func date(calendar: Calendar = .current) -> Date {
        calendar.date(from: DateComponents(year: year, month: month, day: day, hour: 12)) ?? Date(timeIntervalSince1970: 0)
    }
}

extension LocalDate: Codable {
    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let text = try container.decode(String.self)
        guard let value = LocalDate(text) else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Ungültiges Datum \(text)")
        }
        self = value
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(description)
    }
}

/// Spielform. Weitere Formen (Skins, Nassau, Vierer …) werden als neuer Fall plus Wertung in `ScoringEngine` ergänzt.
public enum GameFormat: String, Codable, Sendable, CaseIterable {
    case strokePlay
    case stableford
    /// Lochspiel Einzel (genau zwei Spieler)
    case matchPlay
}

public enum HandicapMode: String, Codable, Sendable, CaseIterable {
    /// Course Handicap aus Handicap Index und Rating, Playing Handicap = Course Handicap × Verrechnung
    case handicapIndex
    /// Spieler gibt sein Playing Handicap direkt ein (z. B. aus der Vorgabentabelle des Clubs)
    case playingHandicap
    /// ohne Handicap-Wertung (nur brutto)
    case none
}

public struct HandicapSettings: Codable, Equatable, Sendable {
    public var mode: HandicapMode
    /// Handicap-Verrechnung in Prozent (100 = Course Handicap)
    public var allowancePercent: Int

    public init(mode: HandicapMode = .handicapIndex, allowancePercent: Int = 100) {
        self.mode = mode
        self.allowancePercent = allowancePercent
    }
}

public enum ScoringMode: String, Codable, Sendable, CaseIterable {
    /// Score, Putts und Statistik (Fairway, GIR, Strafschläge, Bunker)
    case full
    /// nur Schläge je Loch
    case simple
    /// nur GPS-Entfernungen, keine Scorekarte
    case gpsOnly

    public var hasScorecard: Bool { self != .gpsOnly }
}

public enum RoundPrivacy: String, Codable, Sendable, CaseIterable {
    case `private`, friends, `public`
}

public enum RoundStatus: String, Codable, Sendable {
    case inProgress
    case completed
    case abandoned
}

/// Welche Löcher gespielt werden.
public enum HoleSelection: String, Codable, Sendable, CaseIterable {
    case all18
    case front9
    case back9
    /// 9-Loch-Platz
    case nine

    public var holeNumbers: [Int] {
        switch self {
        case .all18: return Array(1...18)
        case .front9, .nine: return Array(1...9)
        case .back9: return Array(10...18)
        }
    }

    public var ratingScope: RatingScope {
        switch self {
        case .all18: return .eighteen
        case .front9, .nine: return .front9
        case .back9: return .back9
        }
    }

    public var holeCount: Int { self == .all18 ? 18 : 9 }
}

/// Gespieltes Loch mit den Daten zum Zeitpunkt der Runde (Platzdaten können sich später ändern).
public struct PlayedHole: Codable, Hashable, Sendable {
    /// Lochnummer auf dem Platz (1–18; hintere neun 10–18)
    public var number: Int
    public var par: Int?
    public var strokeIndex: Int?

    public init(number: Int, par: Int?, strokeIndex: Int?) {
        self.number = number
        self.par = par
        self.strokeIndex = strokeIndex
    }
}

/// Rating, mit dem eine Runde gespielt wurde – mit der Runde gespeichert und nie neu berechnet.
public struct RatingSnapshot: Codable, Hashable, Sendable {
    public var scope: RatingScope
    public var par: Int
    public var courseRating: Double
    public var slopeRating: Int
    public var status: RatingStatus
    /// Spieler hat ein ungeprüftes Rating mit seiner Scorekarte bestätigt
    public var playerConfirmed: Bool

    public init(scope: RatingScope, par: Int, courseRating: Double, slopeRating: Int, status: RatingStatus, playerConfirmed: Bool = false) {
        self.scope = scope
        self.par = par
        self.courseRating = courseRating
        self.slopeRating = slopeRating
        self.status = status
        self.playerConfirmed = playerConfirmed
    }

    /// Nur vollständige Ratings werden übernommen – fehlt ein Wert, gibt es keinen Snapshot.
    public init?(_ rating: TeeRating?) {
        guard let rating, let par = rating.par, let cr = rating.courseRating, let slope = rating.slopeRating else { return nil }
        self.init(scope: rating.scope, par: par, courseRating: cr, slopeRating: slope, status: rating.status)
    }

    public var holeCount: Int { scope.holeCount }
}

public struct RoundPlayer: Codable, Hashable, Identifiable, Sendable {
    public enum Kind: String, Codable, Sendable {
        /// Besitzer der Runde (angemeldeter Spieler)
        case owner
        /// Freund mit eigenem Konto
        case friend
        /// Gastspieler ohne Konto
        case guest
    }

    public var id: UUID
    public var kind: Kind
    public var name: String
    /// Konto eines Freundes (Backend)
    public var userID: String?
    /// Handicap Index zu Beginn der Runde
    public var handicapIndex: Double?
    /// direkt eingegebenes Playing Handicap (Modus `.playingHandicap`)
    public var manualPlayingHandicap: Int?
    public var gender: Gender?
    public var teeID: TeeID?
    public var teeName: String?
    public var teeColor: TeeColor?
    public var rating: RatingSnapshot?

    public init(id: UUID = UUID(), kind: Kind, name: String, userID: String? = nil, handicapIndex: Double? = nil,
                manualPlayingHandicap: Int? = nil, gender: Gender? = nil, teeID: TeeID? = nil, teeName: String? = nil,
                teeColor: TeeColor? = nil, rating: RatingSnapshot? = nil) {
        self.id = id
        self.kind = kind
        self.name = name
        self.userID = userID
        self.handicapIndex = handicapIndex
        self.manualPlayingHandicap = manualPlayingHandicap
        self.gender = gender
        self.teeID = teeID
        self.teeName = teeName
        self.teeColor = teeColor
        self.rating = rating
    }
}

/// Daten einer Runde, die beim Start festgelegt werden (Platz, Löcher, Spieler, Spielform). Späteres Bearbeiten
/// ersetzt den ganzen Kopf (jüngste Änderung gewinnt); Scores werden feldweise geführt (`RoundDocument`).
public struct RoundHeader: Codable, Equatable, Sendable {
    public var courseID: CourseID
    public var courseName: String
    public var clubName: String
    public var courseSource: CourseDataSource
    public var date: LocalDate
    public var startedAt: Date
    public var holeSelection: HoleSelection
    public var holes: [PlayedHole]
    public var format: GameFormat
    public var handicap: HandicapSettings
    public var scoring: ScoringMode
    public var privacy: RoundPrivacy
    public var players: [RoundPlayer]
    /// Regelversion für Course Handicap, Netto-Doppelbogey und Score Differential
    public var ruleSetID: String
    /// PCC des Tages (18-Loch-Wert); wird erst am Folgetag veröffentlicht – 0, bis der Spieler ihn einträgt
    public var pcc: Int
    /// Spieler möchte die Runde fürs Handicap werten (z. B. registrierte Privatrunde)
    public var countsForHandicap: Bool

    public init(courseID: CourseID, courseName: String, clubName: String, courseSource: CourseDataSource, date: LocalDate,
                startedAt: Date, holeSelection: HoleSelection, holes: [PlayedHole], format: GameFormat,
                handicap: HandicapSettings, scoring: ScoringMode, privacy: RoundPrivacy, players: [RoundPlayer],
                ruleSetID: String = WHSRuleSet.de2026.id, pcc: Int = 0, countsForHandicap: Bool = false) {
        self.courseID = courseID
        self.courseName = courseName
        self.clubName = clubName
        self.courseSource = courseSource
        self.date = date
        self.startedAt = startedAt
        self.holeSelection = holeSelection
        self.holes = holes
        self.format = format
        self.handicap = handicap
        self.scoring = scoring
        self.privacy = privacy
        self.players = players
        self.ruleSetID = ruleSetID
        self.pcc = pcc
        self.countsForHandicap = countsForHandicap
    }

    public var owner: RoundPlayer? { players.first { $0.kind == .owner } ?? players.first }
    public var holeNumbers: [Int] { holes.map(\.number) }
    public func hole(_ number: Int) -> PlayedHole? { holes.first { $0.number == number } }
    public func player(_ id: UUID) -> RoundPlayer? { players.first { $0.id == id } }
}

/// Ergebnis des Abschlags in Bezug auf das Fairway (nur Par 4 und Par 5).
public enum FairwayResult: String, Codable, Sendable, CaseIterable {
    case hit, left, right, short

    public var isHit: Bool { self == .hit }
}

/// Eingaben eines Spielers für ein Loch. `nil` = nicht erfasst.
public struct HoleScore: Codable, Equatable, Sendable {
    public var strokes: Int?
    /// Ball aufgehoben (Loch nicht beendet)
    public var pickedUp: Bool
    public var putts: Int?
    public var fairway: FairwayResult?
    public var gir: Bool?
    public var penalties: Int?
    /// mindestens ein Schlag aus dem Bunker
    public var sandShot: Bool?
    public var note: String?

    public init(strokes: Int? = nil, pickedUp: Bool = false, putts: Int? = nil, fairway: FairwayResult? = nil, gir: Bool? = nil,
                penalties: Int? = nil, sandShot: Bool? = nil, note: String? = nil) {
        self.strokes = strokes
        self.pickedUp = pickedUp
        self.putts = putts
        self.fairway = fairway
        self.gir = gir
        self.penalties = penalties
        self.sandShot = sandShot
        self.note = note
    }

    public static let empty = HoleScore()

    /// Loch hat ein Ergebnis (Schlagzahl oder aufgehoben)
    public var isScored: Bool { strokes != nil || pickedUp }
    public var isEmpty: Bool { self == .empty }

    /// Rohschläge aus Sicht des Regelwerks
    public var whsScore: WHSHoleScore {
        if pickedUp { return .pickup }
        if let strokes { return .strokes(strokes) }
        return .missing
    }
}

/// Lesemodell einer Runde (aus `RoundDocument` erzeugt).
public struct Round: Identifiable, Equatable, Sendable {
    public let id: UUID
    public var header: RoundHeader
    public var status: RoundStatus
    public var finishedAt: Date?
    public var notes: String?
    /// Spieler → Lochnummer → Eingaben
    public var scores: [UUID: [Int: HoleScore]]
    /// jüngste Änderung (für Sortierung und Synchronisation)
    public var updatedAt: HLCTimestamp?
    public var isDeleted: Bool

    public init(id: UUID, header: RoundHeader, status: RoundStatus = .inProgress, finishedAt: Date? = nil, notes: String? = nil,
                scores: [UUID: [Int: HoleScore]] = [:], updatedAt: HLCTimestamp? = nil, isDeleted: Bool = false) {
        self.id = id
        self.header = header
        self.status = status
        self.finishedAt = finishedAt
        self.notes = notes
        self.scores = scores
        self.updatedAt = updatedAt
        self.isDeleted = isDeleted
    }

    public func score(player: UUID, hole: Int) -> HoleScore {
        scores[player]?[hole] ?? .empty
    }

    public var owner: RoundPlayer? { header.owner }

    /// Löcher, auf denen alle Spieler ein Ergebnis haben
    public func isHoleComplete(_ hole: Int) -> Bool {
        header.players.allSatisfy { score(player: $0.id, hole: hole).isScored }
    }

    /// Erstes Loch ohne Ergebnis des Besitzers (Fortsetzen einer unterbrochenen Runde)
    public var firstOpenHole: Int? {
        guard let owner else { return header.holes.first?.number }
        return header.holes.first { !score(player: owner.id, hole: $0.number).isScored }?.number
    }

    public var scoredHoleCount: Int {
        guard let owner else { return 0 }
        return header.holes.filter { score(player: owner.id, hole: $0.number).isScored }.count
    }
}
