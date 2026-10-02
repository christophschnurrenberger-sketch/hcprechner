import Foundation

/// Ausgang einer Runde: welche Felder seit der letzten erfolgreichen Übertragung lokal geändert wurden.
///
/// Bewusst feldgenau statt „alles nach Zeitpunkt X“: Ein Stand von der Watch kann einen älteren Zeitstempel tragen
/// als die letzte Übertragung des iPhones und muss trotzdem zum Server.
public struct RoundSyncState: Codable, Equatable, Sendable {
    public var dirtyFields: Set<String>
    public var headerDirty: Bool
    public var deletionDirty: Bool
    /// letzte erfolgreiche Übertragung (nur Anzeige)
    public var lastSyncedAt: Date?

    public init(dirtyFields: Set<String> = [], headerDirty: Bool = false, deletionDirty: Bool = false, lastSyncedAt: Date? = nil) {
        self.dirtyFields = dirtyFields
        self.headerDirty = headerDirty
        self.deletionDirty = deletionDirty
        self.lastSyncedAt = lastSyncedAt
    }

    /// Neue, noch nie übertragene Runde
    public static let new = RoundSyncState(headerDirty: true)

    public var isDirty: Bool { headerDirty || deletionDirty || !dirtyFields.isEmpty }

    /// Änderungen zwischen zwei Ständen vormerken (lokale Eingabe oder Stand eines anderen Geräts, nicht vom Server).
    public mutating func markChanges(from old: RoundDocument?, to new: RoundDocument) {
        guard let old else {
            headerDirty = true
            dirtyFields.formUnion(new.fields.keys)
            if new.deleted != nil { deletionDirty = true }
            return
        }
        if old.header != new.header { headerDirty = true }
        for (key, value) in new.fields where old.fields[key] != value {
            dirtyFields.insert(key)
        }
        if old.deleted != new.deleted { deletionDirty = true }
    }

    /// Zu übertragende Änderungen.
    public func outgoing(_ document: RoundDocument) -> RoundDelta? {
        guard isDirty else { return nil }
        var fields: [String: Stamped<FieldValue>] = [:]
        for key in dirtyFields {
            if let value = document.fields[key] { fields[key] = value }
        }
        let delta = RoundDelta(roundID: document.id, header: headerDirty ? document.header : nil, fields: fields,
                               deleted: deletionDirty ? document.deleted : nil)
        return delta.isEmpty ? nil : delta
    }

    /// Nach erfolgreicher Übertragung: nur Felder austragen, die sich seitdem nicht erneut geändert haben.
    public mutating func acknowledge(_ sent: RoundDelta, current: RoundDocument, at date: Date) {
        if let header = sent.header, header == current.header { headerDirty = false }
        for (key, value) in sent.fields where current.fields[key] == value {
            dirtyFields.remove(key)
        }
        if let deleted = sent.deleted, deleted == current.deleted { deletionDirty = false }
        lastSyncedAt = date
    }
}

/// Runde, wie sie lokal gespeichert wird: Dokument plus Ausgang.
public struct StoredRound: Codable, Equatable, Sendable, Identifiable {
    public var document: RoundDocument
    public var sync: RoundSyncState

    public init(document: RoundDocument, sync: RoundSyncState = .new) {
        self.document = document
        self.sync = sync
    }

    public var id: UUID { document.id }
}
