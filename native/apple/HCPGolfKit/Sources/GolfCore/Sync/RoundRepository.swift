import Foundation

/// Runden des Geräts: lesen, ändern, löschen – jede Änderung wird sofort gespeichert und für die Übertragung
/// vorgemerkt. Offline-first: Nichts davon braucht eine Verbindung.
public actor RoundRepository {
    private let store: RoundStore
    private var clock: HybridLogicalClock
    private let now: @Sendable () -> Date
    private var cache: [UUID: StoredRound] = [:]
    private var loaded = false

    public init(store: RoundStore, node: String, now: @escaping @Sendable () -> Date = { Date() }) {
        self.store = store
        self.clock = HybridLogicalClock(node: node)
        self.now = now
    }

    public var node: String { clock.node }

    /// Lädt alle gespeicherten Runden und stellt die Uhr hinter den jüngsten bekannten Zeitstempel
    /// (auch wenn die Geräteuhr seit dem letzten Start zurückgestellt wurde).
    public func bootstrap() async throws {
        guard !loaded else { return }
        for round in try await store.loadAll() {
            cache[round.id] = round
            clock.observe(round.document.latestStamp, now: now())
        }
        loaded = true
    }

    // MARK: Lesen

    /// Runden ohne gelöschte, neueste zuerst.
    public func rounds() async throws -> [Round] {
        try await bootstrap()
        return cache.values.map(\.document.round).filter { !$0.isDeleted }.sorted {
            ($0.header.date, $0.header.startedAt) > ($1.header.date, $1.header.startedAt)
        }
    }

    public func round(id: UUID) async throws -> Round? {
        try await bootstrap()
        guard let round = cache[id]?.document.round, !round.isDeleted else { return nil }
        return round
    }

    /// Laufende Runde (höchstens eine wird in der App fortgesetzt; die jüngste gewinnt).
    public func activeRound() async throws -> Round? {
        try await rounds().first { $0.status == .inProgress }
    }

    public func stored(id: UUID) async throws -> StoredRound? {
        try await bootstrap()
        return cache[id]
    }

    // MARK: Ändern

    @discardableResult
    public func create(header: RoundHeader, id: UUID = UUID()) async throws -> Round {
        try await bootstrap()
        var document = RoundDocument(id: id, header: header, stamp: clock.tick(now: now()))
        document.setStatus(.inProgress, finishedAt: nil, clock: &clock, now: now())
        let stored = StoredRound(document: document, sync: .new)
        try await persist(stored)
        return document.round
    }

    @discardableResult
    public func setScore(_ score: HoleScore, player: UUID, hole: Int, roundID: UUID) async throws -> Round {
        try await mutate(roundID) { doc, clock, now in doc.setScore(score, player: player, hole: hole, clock: &clock, now: now) }
    }

    @discardableResult
    public func setStatus(_ status: RoundStatus, roundID: UUID) async throws -> Round {
        let finished: Date? = status == .inProgress ? nil : now()
        return try await mutate(roundID) { doc, clock, now in doc.setStatus(status, finishedAt: finished, clock: &clock, now: now) }
    }

    @discardableResult
    public func setNotes(_ notes: String?, roundID: UUID) async throws -> Round {
        try await mutate(roundID) { doc, clock, now in doc.setNotes(notes, clock: &clock, now: now) }
    }

    @discardableResult
    public func updateHeader(roundID: UUID, _ change: @Sendable (inout RoundHeader) -> Void) async throws -> Round {
        try await mutate(roundID) { doc, clock, now in doc.updateHeader(clock: &clock, now: now, change) }
    }

    public func delete(roundID: UUID) async throws {
        _ = try await mutate(roundID) { doc, clock, now in doc.delete(clock: &clock, now: now) }
    }

    private func mutate(_ id: UUID, _ change: (inout RoundDocument, inout HybridLogicalClock, Date) -> Void) async throws -> Round {
        try await bootstrap()
        guard var stored = cache[id] else { throw RepositoryError.notFound(id) }
        let before = stored.document
        change(&stored.document, &clock, now())
        guard stored.document != before else { return stored.document.round }
        stored.sync.markChanges(from: before, to: stored.document)
        try await persist(stored)
        return stored.document.round
    }

    private func persist(_ stored: StoredRound) async throws {
        try await store.save(stored) // erst speichern, dann den Zwischenspeicher aktualisieren
        cache[stored.id] = stored
    }

    // MARK: Abgleich

    /// Stand eines anderen Geräts (z. B. Apple Watch) übernehmen – Änderungen gehen anschließend auch zum Server.
    @discardableResult
    public func mergeFromPeer(_ delta: RoundDelta) async throws -> Round? {
        try await merge(delta, markDirty: true)
    }

    /// Stand vom Server übernehmen – nichts davon muss zurück übertragen werden.
    @discardableResult
    public func mergeFromServer(_ delta: RoundDelta) async throws -> Round? {
        try await merge(delta, markDirty: false)
    }

    private func merge(_ delta: RoundDelta, markDirty: Bool) async throws -> Round? {
        try await bootstrap()
        if let latest = delta.latestStamp { clock.observe(latest, now: now()) }
        if var stored = cache[delta.roundID] {
            let before = stored.document
            stored.document.apply(delta)
            guard stored.document != before else { return stored.document.round }
            if markDirty { stored.sync.markChanges(from: before, to: stored.document) }
            try await persist(stored)
            return stored.document.round
        }
        guard let document = RoundDocument(delta: delta) else { return nil } // Kopf fehlt: beim nächsten Abgleich
        var sync = RoundSyncState()
        if markDirty { sync.markChanges(from: nil, to: document) }
        try await persist(StoredRound(document: document, sync: sync))
        return document.round
    }

    /// Ausstehende Änderungen aller Runden.
    public func outgoing() async throws -> [RoundDelta] {
        try await bootstrap()
        return cache.values.compactMap { $0.sync.outgoing($0.document) }
    }

    public func acknowledge(_ sent: [RoundDelta]) async throws {
        for delta in sent {
            guard var stored = cache[delta.roundID] else { continue }
            stored.sync.acknowledge(delta, current: stored.document, at: now())
            try await persist(stored)
        }
    }

    public var pendingChangeCount: Int {
        cache.values.reduce(0) { sum, r in
            sum + r.sync.dirtyFields.count + (r.sync.headerDirty ? 1 : 0) + (r.sync.deletionDirty ? 1 : 0)
        }
    }
}

public enum RepositoryError: Error, Equatable {
    case notFound(UUID)
}
