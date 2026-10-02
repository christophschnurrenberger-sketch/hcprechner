import Foundation

/// Spieler im Runden-Assistenten (vor dem Start).
public struct SetupPlayer: Identifiable, Equatable, Sendable {
    public var id: UUID
    public var kind: RoundPlayer.Kind
    public var name: String
    public var userID: String?
    public var handicapIndex: Double?
    public var manualPlayingHandicap: Int?
    public var gender: Gender
    public var teeID: TeeID?
    /// Spieler hat ein ungeprüftes Rating mit seiner Scorekarte verglichen und bestätigt
    public var confirmedUnverifiedRating: Bool

    public init(id: UUID = UUID(), kind: RoundPlayer.Kind, name: String, userID: String? = nil, handicapIndex: Double?,
                manualPlayingHandicap: Int? = nil, gender: Gender, teeID: TeeID? = nil, confirmedUnverifiedRating: Bool = false) {
        self.id = id
        self.kind = kind
        self.name = name
        self.userID = userID
        self.handicapIndex = handicapIndex
        self.manualPlayingHandicap = manualPlayingHandicap
        self.gender = gender
        self.teeID = teeID
        self.confirmedUnverifiedRating = confirmedUnverifiedRating
    }
}

/// Entwurf einer Runde im Assistenten: Platz → Löcher → Datum → Abschlag → Spielform → Handicap → Erfassung →
/// Privatsphäre → Mitspieler.
public struct RoundSetupDraft: Equatable, Sendable {
    public var course: Course
    public var holeSelection: HoleSelection
    public var date: LocalDate
    public var format: GameFormat
    public var handicap: HandicapSettings
    public var scoring: ScoringMode
    public var privacy: RoundPrivacy
    public var players: [SetupPlayer]
    public var countsForHandicap: Bool

    public init(course: Course, owner: SetupPlayer, date: LocalDate, preferredTee: TeeColor? = nil) {
        self.course = course
        self.holeSelection = RoundSetup.availableHoleSelections(for: course).first ?? .all18
        self.date = date
        self.format = .strokePlay
        self.handicap = HandicapSettings(mode: owner.handicapIndex == nil ? .none : .handicapIndex, allowancePercent: 100)
        self.scoring = .full
        self.privacy = .private
        var me = owner
        if me.teeID == nil { me.teeID = RoundSetup.defaultTee(for: course, preferred: preferredTee, gender: owner.gender)?.id }
        self.players = [me]
        self.countsForHandicap = false
    }
}

public enum SetupIssue: Equatable, Sendable {
    /// Lochspiel braucht genau zwei Spieler
    case matchPlayNeedsTwoPlayers
    /// Stableford braucht Par je Loch
    case stablefordNeedsHoleData
    case tooManyPlayers(max: Int)
    case playerNameMissing(UUID)
    case teeMissing(UUID)
    /// Handicap-Wertung, aber kein Handicap Index bzw. Playing Handicap
    case handicapMissing(UUID)
    /// kein vollständiges Rating für Abschlag, Geschlecht und Lochzahl – Netto/Stableford für diesen Spieler nicht
    /// möglich (Hinweis, kein Fehler)
    case ratingMissing(UUID)
    /// ungeprüftes Rating – fürs Handicap muss der Spieler die Werte mit der Scorekarte bestätigen (Hinweis)
    case ratingUnverified(UUID)
    /// Runden auf Demo-Plätzen zählen nie fürs Handicap
    case demoCourseNotCountable

    /// Blockiert den Start der Runde
    public var isBlocking: Bool {
        switch self {
        case .matchPlayNeedsTwoPlayers, .stablefordNeedsHoleData, .tooManyPlayers, .playerNameMissing, .teeMissing, .handicapMissing:
            return true
        case .ratingMissing, .ratingUnverified, .demoCourseNotCountable:
            return false
        }
    }
}

/// Regeln des Runden-Assistenten: welche Optionen es für einen Platz gibt, welches Rating gilt (nie abgeleitet) und
/// wie aus dem Entwurf der Rundenkopf entsteht.
public enum RoundSetup {
    public static let maxPlayers = 4

    public static func availableHoleSelections(for course: Course) -> [HoleSelection] {
        if course.holeCount == 9 { return [.nine] }
        guard course.holeCount == 18 else { return [] }
        // Vordere/hintere neun nur mit Lochdaten (Par, Handicap) für diese Löcher
        let numbers = Set(course.holes.filter { $0.par != nil }.map(\.number))
        var out: [HoleSelection] = [.all18]
        if Set(1...9).isSubset(of: numbers) { out.append(.front9) }
        if Set(10...18).isSubset(of: numbers) { out.append(.back9) }
        return out
    }

    public static func availableFormats(holes: [PlayedHole], playerCount: Int) -> [GameFormat] {
        var out: [GameFormat] = [.strokePlay]
        if !holes.isEmpty && holes.allSatisfy({ $0.par != nil }) { out.append(.stableford) }
        if playerCount == 2 { out.append(.matchPlay) }
        return out
    }

    /// Gespielte Löcher mit den Daten des Platzes; fehlende Lochdaten bleiben leer (`nil`).
    public static func playedHoles(course: Course, selection: HoleSelection) -> [PlayedHole] {
        selection.holeNumbers.map { n in
            let hole = course.hole(n)
            return PlayedHole(number: n, par: hole?.par, strokeIndex: hole?.strokeIndex)
        }
    }

    /// Rating für Abschlag, Geschlecht und Lochzahl – exakt dieser Umfang, nie aus einem anderen abgeleitet.
    public static func rating(course: Course, teeID: TeeID?, gender: Gender, selection: HoleSelection) -> TeeRating? {
        course.tee(teeID)?.rating(gender: gender, scope: selection.ratingScope)
    }

    /// Abschlag nach Vorliebe (Farbe), sonst der erste mit Rating für das Geschlecht, sonst der erste.
    public static func defaultTee(for course: Course, preferred: TeeColor?, gender: Gender) -> Tee? {
        if let preferred, let tee = course.tees.first(where: { $0.color == preferred }) { return tee }
        return course.tees.first { tee in tee.ratings.contains { $0.gender == gender } } ?? course.tees.first
    }

    public static func issues(_ draft: RoundSetupDraft) -> [SetupIssue] {
        var out: [SetupIssue] = []
        let holes = playedHoles(course: draft.course, selection: draft.holeSelection)
        if draft.players.count > maxPlayers { out.append(.tooManyPlayers(max: maxPlayers)) }
        if draft.format == .matchPlay && draft.players.count != 2 { out.append(.matchPlayNeedsTwoPlayers) }
        if draft.format == .stableford && !holes.allSatisfy({ $0.par != nil }) { out.append(.stablefordNeedsHoleData) }
        for p in draft.players {
            if p.name.trimmingCharacters(in: .whitespaces).isEmpty { out.append(.playerNameMissing(p.id)) }
            if !draft.course.tees.isEmpty && draft.course.tee(p.teeID) == nil { out.append(.teeMissing(p.id)) }
            switch draft.handicap.mode {
            case .none:
                break
            case .handicapIndex:
                if p.handicapIndex == nil { out.append(.handicapMissing(p.id)) }
            case .playingHandicap:
                if p.manualPlayingHandicap == nil { out.append(.handicapMissing(p.id)) }
            }
            let rating = rating(course: draft.course, teeID: p.teeID, gender: p.gender, selection: draft.holeSelection)
            if draft.handicap.mode == .handicapIndex && rating?.isComplete != true {
                out.append(.ratingMissing(p.id))
            }
            if p.kind == .owner, draft.countsForHandicap, rating?.status == .unverified, !p.confirmedUnverifiedRating {
                out.append(.ratingUnverified(p.id))
            }
        }
        if draft.countsForHandicap && draft.course.source == .demo { out.append(.demoCourseNotCountable) }
        return out
    }

    public static func canStart(_ draft: RoundSetupDraft) -> Bool {
        !issues(draft).contains(where: \.isBlocking)
    }

    public static func makeHeader(from draft: RoundSetupDraft, startedAt: Date, ruleSet: WHSRuleSet = .de2026) -> RoundHeader {
        let course = draft.course
        let players: [RoundPlayer] = draft.players.map { p in
            let tee = course.tee(p.teeID)
            var snapshot = RatingSnapshot(rating(course: course, teeID: p.teeID, gender: p.gender, selection: draft.holeSelection))
            if snapshot?.status == .unverified && p.confirmedUnverifiedRating { snapshot?.playerConfirmed = true }
            return RoundPlayer(id: p.id, kind: p.kind, name: p.name.trimmingCharacters(in: .whitespaces), userID: p.userID,
                               handicapIndex: p.handicapIndex,
                               manualPlayingHandicap: draft.handicap.mode == .playingHandicap ? p.manualPlayingHandicap : nil,
                               gender: p.gender, teeID: tee?.id, teeName: tee?.name, teeColor: tee?.color, rating: snapshot)
        }
        let holes = playedHoles(course: course, selection: draft.holeSelection)
        let format = availableFormats(holes: holes, playerCount: players.count).contains(draft.format) ? draft.format : .strokePlay
        return RoundHeader(
            courseID: course.id, courseName: course.name, clubName: course.clubName, courseSource: course.source,
            date: draft.date, startedAt: startedAt, holeSelection: draft.holeSelection, holes: holes, format: format,
            handicap: draft.handicap, scoring: draft.scoring, privacy: draft.privacy, players: players,
            ruleSetID: ruleSet.id, pcc: 0, countsForHandicap: draft.countsForHandicap && course.source != .demo
        )
    }
}

/// Loch-Navigation während der Runde (vor/zurück, springen).
public struct HoleNavigator: Equatable, Sendable {
    public let holes: [Int]
    public private(set) var current: Int

    public init(holes: [Int], current: Int? = nil) {
        self.holes = holes
        self.current = current.flatMap { holes.contains($0) ? $0 : nil } ?? holes.first ?? 1
    }

    public var index: Int { holes.firstIndex(of: current) ?? 0 }
    public var isFirst: Bool { index == 0 }
    public var isLast: Bool { index == holes.count - 1 }
    public var next: Int? { isLast ? nil : holes[index + 1] }
    public var previous: Int? { isFirst ? nil : holes[index - 1] }

    @discardableResult
    public mutating func go(to hole: Int) -> Bool {
        guard holes.contains(hole), hole != current else { return false }
        current = hole
        return true
    }

    @discardableResult
    public mutating func advance() -> Bool { next.map { go(to: $0) } ?? false }

    @discardableResult
    public mutating func back() -> Bool { previous.map { go(to: $0) } ?? false }
}
