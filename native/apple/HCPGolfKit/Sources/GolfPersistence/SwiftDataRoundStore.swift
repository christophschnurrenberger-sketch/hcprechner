#if canImport(SwiftData)
import Foundation
import GolfCore
import SwiftData

/// Runde als SwiftData-Datensatz: wenige abfragbare Spalten plus das vollständige Dokument als JSON.
///
/// Bewusst kein Geflecht aus Beziehungen: Das Dokument (`StoredRound`) ist die Einheit für Zusammenführen und
/// Synchronisation und wird als Ganzes geschrieben – das hält Migrationen einfach und schließt halbe Stände aus.
@Model
public final class RoundRecord {
    @Attribute(.unique) public var roundID: UUID
    public var payload: Data
    /// „YYYY-MM-DD“ – sortierbar
    public var dateKey: String
    public var statusRaw: String
    public var courseName: String
    public var savedAt: Date

    public init(roundID: UUID, payload: Data, dateKey: String, statusRaw: String, courseName: String, savedAt: Date) {
        self.roundID = roundID
        self.payload = payload
        self.dateKey = dateKey
        self.statusRaw = statusRaw
        self.courseName = courseName
        self.savedAt = savedAt
    }
}

/// `RoundStore` mit SwiftData (iPhone und Watch). Jede Änderung wird sofort gespeichert (`save()` nach jedem Schreiben).
@ModelActor
public actor SwiftDataRoundStore: RoundStore {
    /// Speicher im Application-Support-Ordner der App bzw. im Arbeitsspeicher (Tests, Vorschauen).
    public static func makeContainer(inMemory: Bool = false, url: URL? = nil) throws -> ModelContainer {
        let configuration: ModelConfiguration
        if let url {
            configuration = ModelConfiguration(url: url, cloudKitDatabase: .none)
        } else {
            configuration = ModelConfiguration(isStoredInMemoryOnly: inMemory, cloudKitDatabase: .none)
        }
        return try ModelContainer(for: RoundRecord.self, configurations: configuration)
    }

    public static func make(container: ModelContainer) -> SwiftDataRoundStore {
        SwiftDataRoundStore(modelContainer: container)
    }

    private func record(_ id: UUID) throws -> RoundRecord? {
        var descriptor = FetchDescriptor<RoundRecord>(predicate: #Predicate { $0.roundID == id })
        descriptor.fetchLimit = 1
        return try modelContext.fetch(descriptor).first
    }

    public func loadAll() async throws -> [StoredRound] {
        let records = try modelContext.fetch(FetchDescriptor<RoundRecord>())
        let decoder = GolfJSON.decoder()
        // Ein beschädigter Datensatz darf die anderen Runden nicht blockieren
        return records.compactMap { try? decoder.decode(StoredRound.self, from: $0.payload) }
    }

    public func load(id: UUID) async throws -> StoredRound? {
        guard let record = try record(id) else { return nil }
        return try GolfJSON.decoder().decode(StoredRound.self, from: record.payload)
    }

    public func save(_ round: StoredRound) async throws {
        let payload = try GolfJSON.encoder().encode(round)
        let header = round.document.header.value
        let status = round.document.round.status.rawValue
        if let existing = try record(round.id) {
            existing.payload = payload
            existing.dateKey = header.date.description
            existing.statusRaw = status
            existing.courseName = header.courseName
            existing.savedAt = Date()
        } else {
            modelContext.insert(RoundRecord(roundID: round.id, payload: payload, dateKey: header.date.description,
                                            statusRaw: status, courseName: header.courseName, savedAt: Date()))
        }
        try modelContext.save()
    }

    public func remove(id: UUID) async throws {
        if let existing = try record(id) {
            modelContext.delete(existing)
            try modelContext.save()
        }
    }
}
#endif
