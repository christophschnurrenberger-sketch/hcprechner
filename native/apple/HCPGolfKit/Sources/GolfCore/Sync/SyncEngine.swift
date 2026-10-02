import Foundation

public enum RemoteError: Error, Equatable, Sendable {
    /// keine Verbindung – Änderungen bleiben im Ausgang
    case offline
    case unauthorized
    case server(String)
}

public struct RemotePullResult: Sendable {
    public var deltas: [RoundDelta]
    /// Folgenummer des Servers bis einschließlich dieses Abrufs
    public var cursor: Int64

    public init(deltas: [RoundDelta], cursor: Int64) {
        self.deltas = deltas
        self.cursor = cursor
    }
}

/// Server für Runden (Repository-Schicht „Remote“). Der Server ordnet Änderungen mit einer eigenen, steigenden
/// Folgenummer – so erhält jedes Gerät auch Änderungen mit älterem Zeitstempel, die erst später eintreffen.
/// Supabase-Umsetzung: Tabelle `round_fields` mit bedingtem Upsert (`hlc` als Text vergleichbar), siehe
/// `native/supabase/migrations`.
public protocol RemoteRoundService: Sendable {
    func push(_ deltas: [RoundDelta]) async throws
    func pull(since cursor: Int64?) async throws -> RemotePullResult
}

/// Ablage der Server-Folgenummer (App: UserDefaults).
public protocol SyncCursorStore: Sendable {
    func loadCursor() async -> Int64?
    func saveCursor(_ cursor: Int64) async
}

public actor InMemoryCursorStore: SyncCursorStore {
    private var cursor: Int64?
    public init(_ cursor: Int64? = nil) { self.cursor = cursor }
    public func loadCursor() async -> Int64? { cursor }
    public func saveCursor(_ cursor: Int64) async { self.cursor = cursor }
}

public struct SyncReport: Equatable, Sendable {
    public var pushedRounds: Int
    public var pulledRounds: Int
    public var error: RemoteError?

    public var succeeded: Bool { error == nil }
}

/// Abgleich: erst den Ausgang übertragen, dann neue Stände holen und zusammenführen. Bricht die Verbindung ab,
/// bleibt alles lokal erhalten und wird beim nächsten Versuch übertragen (keine doppelten oder verlorenen Eingaben,
/// weil Übertragen und Zusammenführen idempotent sind).
public actor SyncEngine {
    private let repository: RoundRepository
    private let remote: RemoteRoundService
    private let cursorStore: SyncCursorStore
    private var running = false

    public init(repository: RoundRepository, remote: RemoteRoundService, cursorStore: SyncCursorStore) {
        self.repository = repository
        self.remote = remote
        self.cursorStore = cursorStore
    }

    public func sync() async -> SyncReport {
        guard !running else { return SyncReport(pushedRounds: 0, pulledRounds: 0, error: nil) }
        running = true
        defer { running = false }
        var report = SyncReport(pushedRounds: 0, pulledRounds: 0, error: nil)
        do {
            let outgoing = try await repository.outgoing()
            if !outgoing.isEmpty {
                try await remote.push(outgoing)
                try await repository.acknowledge(outgoing)
                report.pushedRounds = outgoing.count
            }
            let pulled = try await remote.pull(since: await cursorStore.loadCursor())
            var missingHeader = false
            for delta in pulled.deltas {
                if try await repository.mergeFromServer(delta) == nil { missingHeader = true }
            }
            // Unbekannte Runde ohne Kopf (z. B. lokaler Speicher gelöscht): beim nächsten Mal alles holen
            await cursorStore.saveCursor(missingHeader ? 0 : pulled.cursor)
            report.pulledRounds = pulled.deltas.count
        } catch let error as RemoteError {
            report.error = error
        } catch {
            report.error = .server(String(describing: error))
        }
        return report
    }
}

/// Mock-Server im Arbeitsspeicher – verhält sich wie der spätere Supabase-Server (Last-Writer-Wins je Feld,
/// Folgenummern, Löschen gewinnt). Für Tests, Vorschauen und den Entwicklermodus („Offline simulieren“).
public actor InMemoryRemoteRoundService: RemoteRoundService {
    private var documents: [UUID: RoundDocument] = [:]
    private var headerSeq: [UUID: Int64] = [:]
    private var deletedSeq: [UUID: Int64] = [:]
    private var fieldSeq: [UUID: [String: Int64]] = [:]
    private var seq: Int64 = 0
    public private(set) var isOnline = true
    public private(set) var pushCount = 0

    public init() {}

    public func setOnline(_ online: Bool) { isOnline = online }

    public func push(_ deltas: [RoundDelta]) async throws {
        guard isOnline else { throw RemoteError.offline }
        pushCount += 1
        for delta in deltas {
            let before = documents[delta.roundID]
            var document: RoundDocument
            if var existing = before {
                existing.apply(delta)
                document = existing
            } else if let created = RoundDocument(delta: delta) {
                document = created
            } else {
                continue // Kopf fehlt – Gerät sendet ihn beim nächsten Mal mit
            }
            if before?.header != document.header { seq += 1; headerSeq[delta.roundID] = seq }
            for (key, value) in document.fields where before?.fields[key] != value {
                seq += 1
                fieldSeq[delta.roundID, default: [:]][key] = seq
            }
            if before?.deleted != document.deleted { seq += 1; deletedSeq[delta.roundID] = seq }
            documents[delta.roundID] = document
        }
    }

    public func pull(since cursor: Int64?) async throws -> RemotePullResult {
        guard isOnline else { throw RemoteError.offline }
        let c = cursor ?? 0
        var out: [RoundDelta] = []
        for (id, document) in documents {
            let header = (headerSeq[id] ?? 0) > c ? document.header : nil
            let fields = document.fields.filter { (fieldSeq[id]?[$0.key] ?? 0) > c }
            let deleted = (deletedSeq[id] ?? 0) > c ? document.deleted : nil
            let delta = RoundDelta(roundID: id, header: header, fields: fields, deleted: deleted)
            if !delta.isEmpty { out.append(delta) }
        }
        return RemotePullResult(deltas: out, cursor: seq)
    }

    public func document(_ id: UUID) -> RoundDocument? { documents[id] }
}
