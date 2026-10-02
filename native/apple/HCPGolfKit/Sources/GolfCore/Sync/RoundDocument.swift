import Foundation

/// Wert eines einzelnen Feldes (als JSON-Skalar gespeichert und übertragen).
public enum FieldValue: Hashable, Sendable {
    case null
    case bool(Bool)
    case int(Int)
    case string(String)

    public var intValue: Int? { if case let .int(v) = self { return v } else { return nil } }
    public var boolValue: Bool? { if case let .bool(v) = self { return v } else { return nil } }
    public var stringValue: String? { if case let .string(v) = self { return v } else { return nil } }

    public static func optional(_ v: Int?) -> FieldValue { v.map(FieldValue.int) ?? .null }
    public static func optional(_ v: Bool?) -> FieldValue { v.map(FieldValue.bool) ?? .null }
    public static func optional(_ v: String?) -> FieldValue { v.map(FieldValue.string) ?? .null }
}

extension FieldValue: Codable {
    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() {
            self = .null
        } else if let b = try? c.decode(Bool.self) {
            self = .bool(b)
        } else if let i = try? c.decode(Int.self) {
            self = .int(i)
        } else {
            self = .string(try c.decode(String.self))
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case let .bool(v): try c.encode(v)
        case let .int(v): try c.encode(v)
        case let .string(v): try c.encode(v)
        }
    }
}

/// Wert mit dem HLC-Zeitstempel seiner letzten Änderung.
public struct Stamped<Value: Codable & Equatable & Sendable>: Codable, Equatable, Sendable {
    public var value: Value
    public var stamp: HLCTimestamp

    public init(_ value: Value, _ stamp: HLCTimestamp) {
        self.value = value
        self.stamp = stamp
    }
}

/// Felder einer Runde, die einzeln geändert werden können.
public enum RoundAttribute: String, Sendable, CaseIterable {
    case status
    case finishedAt
    case notes
}

/// Eingabefelder je Spieler und Loch.
public enum ScoreField: String, Sendable, CaseIterable {
    case strokes, pickedUp, putts, fairway, gir, penalties, sandShot, note
}

/// Schlüssel eines Feldes: „round.status“ oder „p.<Spieler-UUID>.h7.strokes“.
public enum RoundFieldKey: Hashable, Sendable, CustomStringConvertible {
    case round(RoundAttribute)
    case hole(player: UUID, hole: Int, field: ScoreField)

    public var description: String {
        switch self {
        case let .round(attribute):
            return "round." + attribute.rawValue
        case let .hole(player, hole, field):
            return "p." + player.uuidString + ".h" + String(hole) + "." + field.rawValue
        }
    }

    public init?(_ raw: String) {
        let parts = raw.split(separator: ".", omittingEmptySubsequences: false).map(String.init)
        if parts.count == 2, parts[0] == "round", let attribute = RoundAttribute(rawValue: parts[1]) {
            self = .round(attribute)
            return
        }
        guard parts.count == 4, parts[0] == "p", let player = UUID(uuidString: parts[1]), parts[2].hasPrefix("h"),
              let hole = Int(parts[2].dropFirst()), let field = ScoreField(rawValue: parts[3]) else { return nil }
        self = .hole(player: player, hole: hole, field: field)
    }
}

/// Änderungen einer Runde seit einem Zeitpunkt – Einheit für Speicherung, Watch-Abgleich und Server.
public struct RoundDelta: Codable, Equatable, Sendable {
    public var roundID: UUID
    public var header: Stamped<RoundHeader>?
    public var fields: [String: Stamped<FieldValue>]
    public var deleted: HLCTimestamp?

    public init(roundID: UUID, header: Stamped<RoundHeader>? = nil, fields: [String: Stamped<FieldValue>] = [:], deleted: HLCTimestamp? = nil) {
        self.roundID = roundID
        self.header = header
        self.fields = fields
        self.deleted = deleted
    }

    public var isEmpty: Bool { header == nil && fields.isEmpty && deleted == nil }

    public var latestStamp: HLCTimestamp? {
        ([header?.stamp, deleted].compactMap { $0 } + fields.values.map(\.stamp)).max()
    }
}

/// Eine Runde als zusammenführbares Dokument (zustandsbasierter CRDT, „Last-Writer-Wins“ je Feld):
///
/// - Jedes Feld (Score, Putts, Fairway … je Spieler und Loch) trägt den HLC-Zeitstempel seiner letzten Änderung.
///   Beim Zusammenführen gewinnt je Feld der jüngere Zeitstempel. Unterschiedliche Felder geraten nie in Konflikt:
///   Erfasst die Watch die Putts und das iPhone gleichzeitig den Score, bleiben beide erhalten.
/// - Der Kopf (Platz, Spieler, Spielform) wird als Ganzes geführt; die jüngste Bearbeitung gewinnt.
/// - Löschen gewinnt immer (Grabstein): Eine gelöschte Runde taucht durch spätere Änderungen nicht wieder auf.
///
/// `merge` ist kommutativ, assoziativ und idempotent – egal in welcher Reihenfolge und wie oft Geräte ihre Stände
/// austauschen, alle landen beim selben Ergebnis.
public struct RoundDocument: Codable, Equatable, Sendable, Identifiable {
    public let id: UUID
    public private(set) var header: Stamped<RoundHeader>
    public private(set) var fields: [String: Stamped<FieldValue>]
    public private(set) var deleted: HLCTimestamp?

    public init(id: UUID = UUID(), header: RoundHeader, stamp: HLCTimestamp) {
        self.id = id
        self.header = Stamped(header, stamp)
        self.fields = [:]
        self.deleted = nil
    }

    /// Dokument aus einer Änderung mit Kopf (z. B. erste Übertragung einer neuen Runde).
    public init?(delta: RoundDelta) {
        guard let header = delta.header else { return nil }
        self.id = delta.roundID
        self.header = header
        self.fields = [:]
        self.deleted = nil
        apply(delta)
    }

    // MARK: Ändern (nur wenn jünger)

    @discardableResult
    public mutating func setHeader(_ value: RoundHeader, stamp: HLCTimestamp) -> Bool {
        guard stamp > header.stamp else { return false }
        header = Stamped(value, stamp)
        return true
    }

    @discardableResult
    public mutating func set(_ key: RoundFieldKey, _ value: FieldValue, stamp: HLCTimestamp) -> Bool {
        set(raw: key.description, Stamped(value, stamp))
    }

    @discardableResult
    private mutating func set(raw key: String, _ incoming: Stamped<FieldValue>) -> Bool {
        if let existing = fields[key], existing.stamp >= incoming.stamp { return false }
        fields[key] = incoming
        return true
    }

    public mutating func markDeleted(stamp: HLCTimestamp) {
        deleted = deleted.map { min($0, stamp) } ?? stamp
    }

    // MARK: Zusammenführen

    public mutating func merge(_ other: RoundDocument) {
        guard other.id == id else { return }
        apply(RoundDelta(roundID: id, header: other.header, fields: other.fields, deleted: other.deleted))
    }

    public mutating func apply(_ delta: RoundDelta) {
        guard delta.roundID == id else { return }
        if let h = delta.header { setHeader(h.value, stamp: h.stamp) }
        for (key, value) in delta.fields { set(raw: key, value) }
        if let d = delta.deleted { markDeleted(stamp: d) }
    }

    /// Alles, was nach `since` geändert wurde (`nil` = vollständiger Stand).
    public func delta(since: HLCTimestamp?) -> RoundDelta? {
        func isNew(_ stamp: HLCTimestamp) -> Bool {
            guard let since else { return true }
            return stamp > since
        }
        let d = RoundDelta(
            roundID: id,
            header: isNew(header.stamp) ? header : nil,
            fields: fields.filter { isNew($0.value.stamp) },
            deleted: deleted.flatMap { isNew($0) ? $0 : nil }
        )
        return d.isEmpty ? nil : d
    }

    public var latestStamp: HLCTimestamp {
        ([header.stamp] + fields.values.map(\.stamp) + [deleted].compactMap { $0 }).max() ?? header.stamp
    }

    public var isDeleted: Bool { deleted != nil }

    // MARK: Lesemodell

    public var round: Round {
        var status = RoundStatus.inProgress
        var finishedAt: Date?
        var notes: String?
        var scores: [UUID: [Int: HoleScore]] = [:]
        for (raw, stamped) in fields {
            guard let key = RoundFieldKey(raw) else { continue } // unbekannte Felder (neuere App-Version) ignorieren
            let value = stamped.value
            switch key {
            case .round(.status):
                status = value.stringValue.flatMap(RoundStatus.init(rawValue:)) ?? .inProgress
            case .round(.finishedAt):
                finishedAt = value.intValue.map { Date(timeIntervalSince1970: Double($0) / 1000) }
            case .round(.notes):
                notes = value.stringValue
            case let .hole(player, hole, field):
                var score = scores[player]?[hole] ?? .empty
                switch field {
                case .strokes: score.strokes = value.intValue
                case .pickedUp: score.pickedUp = value.boolValue ?? false
                case .putts: score.putts = value.intValue
                case .fairway: score.fairway = value.stringValue.flatMap(FairwayResult.init(rawValue:))
                case .gir: score.gir = value.boolValue
                case .penalties: score.penalties = value.intValue
                case .sandShot: score.sandShot = value.boolValue
                case .note: score.note = value.stringValue
                }
                scores[player, default: [:]][hole] = score
            }
        }
        return Round(id: id, header: header.value, status: status, finishedAt: finishedAt, notes: notes, scores: scores,
                     updatedAt: latestStamp, isDeleted: isDeleted)
    }
}

// MARK: - Bearbeiten mit Uhr

extension RoundDocument {
    /// Feldänderungen zwischen zwei Ständen eines Lochs.
    public static func fieldChanges(from old: HoleScore, to new: HoleScore) -> [(ScoreField, FieldValue)] {
        var out: [(ScoreField, FieldValue)] = []
        if old.strokes != new.strokes { out.append((.strokes, .optional(new.strokes))) }
        if old.pickedUp != new.pickedUp { out.append((.pickedUp, .bool(new.pickedUp))) }
        if old.putts != new.putts { out.append((.putts, .optional(new.putts))) }
        if old.fairway != new.fairway { out.append((.fairway, .optional(new.fairway?.rawValue))) }
        if old.gir != new.gir { out.append((.gir, .optional(new.gir))) }
        if old.penalties != new.penalties { out.append((.penalties, .optional(new.penalties))) }
        if old.sandShot != new.sandShot { out.append((.sandShot, .optional(new.sandShot))) }
        if old.note != new.note { out.append((.note, .optional(new.note))) }
        return out
    }

    /// Eingaben eines Lochs setzen – geschrieben werden nur geänderte Felder. Liefert die Anzahl geänderter Felder.
    @discardableResult
    public mutating func setScore(_ score: HoleScore, player: UUID, hole: Int, clock: inout HybridLogicalClock, now: Date = Date()) -> Int {
        let current = round.score(player: player, hole: hole)
        let changes = Self.fieldChanges(from: current, to: score)
        guard !changes.isEmpty else { return 0 }
        let stamp = clock.tick(now: now)
        for (field, value) in changes {
            set(.hole(player: player, hole: hole, field: field), value, stamp: stamp)
        }
        return changes.count
    }

    public mutating func setStatus(_ status: RoundStatus, finishedAt: Date?, clock: inout HybridLogicalClock, now: Date = Date()) {
        let stamp = clock.tick(now: now)
        set(.round(.status), .string(status.rawValue), stamp: stamp)
        set(.round(.finishedAt), .optional(finishedAt.map { Int(($0.timeIntervalSince1970 * 1000).rounded()) }), stamp: stamp)
    }

    public mutating func setNotes(_ notes: String?, clock: inout HybridLogicalClock, now: Date = Date()) {
        set(.round(.notes), .optional(notes), stamp: clock.tick(now: now))
    }

    public mutating func updateHeader(clock: inout HybridLogicalClock, now: Date = Date(), _ change: (inout RoundHeader) -> Void) {
        var value = header.value
        change(&value)
        guard value != header.value else { return }
        setHeader(value, stamp: clock.tick(now: now))
    }

    public mutating func delete(clock: inout HybridLogicalClock, now: Date = Date()) {
        markDeleted(stamp: clock.tick(now: now))
    }
}
