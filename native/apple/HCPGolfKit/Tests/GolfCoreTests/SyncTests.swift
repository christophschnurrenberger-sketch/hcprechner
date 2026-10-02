import XCTest
@testable import GolfCore

final class SyncTests: XCTestCase {
    func header(players: [RoundPlayer]) -> RoundHeader {
        TestGeo.header(holes: TestGeo.holes18(), players: players)
    }

    // MARK: Uhr und Kodierung

    func testHLCIsMonotonicEvenIfWallClockGoesBack() {
        var clock = HybridLogicalClock(node: "phone")
        let t1 = clock.tick(now: Date(timeIntervalSince1970: 1000))
        let t2 = clock.tick(now: Date(timeIntervalSince1970: 1000))
        let t3 = clock.tick(now: Date(timeIntervalSince1970: 900)) // Uhr zurückgestellt
        XCTAssertLessThan(t1, t2)
        XCTAssertLessThan(t2, t3)
        clock.observe(HLCTimestamp(millis: 5_000_000, counter: 7, node: "watch"), now: Date(timeIntervalSince1970: 1000))
        let t4 = clock.tick(now: Date(timeIntervalSince1970: 1000))
        XCTAssertGreaterThan(t4, HLCTimestamp(millis: 5_000_000, counter: 7, node: "watch"))
    }

    func testHLCTextIsSortableAndRoundTrips() throws {
        let a = HLCTimestamp(millis: 1_760_000_000_123, counter: 2, node: "A1B2-C3")
        let b = HLCTimestamp(millis: 1_760_000_000_123, counter: 10, node: "x")
        XCTAssertEqual(HLCTimestamp(a.description), a)
        XCTAssertLessThan(a.description, b.description, "Textvergleich = zeitliche Ordnung")
        let data = try GolfJSON.encoder().encode([a])
        XCTAssertEqual(try GolfJSON.decoder().decode([HLCTimestamp].self, from: data), [a])
    }

    func testFieldValueAndKeyCoding() throws {
        let values: [FieldValue] = [.null, .bool(true), .int(5), .string("hit")]
        let data = try GolfJSON.encoder().encode(values)
        XCTAssertEqual(String(data: data, encoding: .utf8), #"[null,true,5,"hit"]"#)
        XCTAssertEqual(try GolfJSON.decoder().decode([FieldValue].self, from: data), values)
        let player = UUID()
        let key = RoundFieldKey.hole(player: player, hole: 12, field: .putts)
        XCTAssertEqual(RoundFieldKey(key.description), key)
        XCTAssertEqual(RoundFieldKey("round.status"), .round(.status))
        XCTAssertNil(RoundFieldKey("p.kaputt.h1.strokes"))
    }

    // MARK: Dokument

    func testSetScoreWritesOnlyChangedFieldsAndReadsBack() {
        let me = RoundPlayer(kind: .owner, name: "Ich")
        var clock = HybridLogicalClock(node: "phone")
        var doc = RoundDocument(header: header(players: [me]), stamp: clock.tick(now: TestGeo.fixedNow))
        let n1 = doc.setScore(HoleScore(strokes: 5, putts: 2, gir: false), player: me.id, hole: 7, clock: &clock, now: TestGeo.fixedNow)
        XCTAssertEqual(n1, 3)
        let n2 = doc.setScore(HoleScore(strokes: 5, putts: 2, gir: false), player: me.id, hole: 7, clock: &clock, now: TestGeo.fixedNow)
        XCTAssertEqual(n2, 0, "unveränderte Eingabe schreibt nichts")
        XCTAssertEqual(doc.round.score(player: me.id, hole: 7), HoleScore(strokes: 5, putts: 2, gir: false))
        doc.setStatus(.completed, finishedAt: TestGeo.fixedNow, clock: &clock, now: TestGeo.fixedNow)
        XCTAssertEqual(doc.round.status, .completed)
        XCTAssertEqual(doc.round.finishedAt, TestGeo.fixedNow)
    }

    func testConcurrentEditsOnDifferentFieldsBothSurvive() {
        let me = RoundPlayer(kind: .owner, name: "Ich")
        var phoneClock = HybridLogicalClock(node: "phone")
        var watchClock = HybridLogicalClock(node: "watch")
        let base = RoundDocument(header: header(players: [me]), stamp: phoneClock.tick(now: TestGeo.fixedNow))
        var phone = base
        var watch = base
        // offline: iPhone erfasst den Score, die Watch die Putts desselben Lochs
        phone.setScore(HoleScore(strokes: 5), player: me.id, hole: 3, clock: &phoneClock, now: TestGeo.fixedNow.addingTimeInterval(10))
        watch.setScore(HoleScore(putts: 2), player: me.id, hole: 3, clock: &watchClock, now: TestGeo.fixedNow.addingTimeInterval(20))
        var a = phone; a.merge(watch)
        var b = watch; b.merge(phone)
        XCTAssertEqual(a, b, "kommutativ")
        XCTAssertEqual(a.round.score(player: me.id, hole: 3), HoleScore(strokes: 5, putts: 2))
        var c = a; c.merge(a)
        XCTAssertEqual(c, a, "idempotent")
    }

    func testSameFieldLastWriterWins() {
        let me = RoundPlayer(kind: .owner, name: "Ich")
        var phoneClock = HybridLogicalClock(node: "phone")
        var watchClock = HybridLogicalClock(node: "watch")
        let base = RoundDocument(header: header(players: [me]), stamp: phoneClock.tick(now: TestGeo.fixedNow))
        var phone = base, watch = base
        watch.setScore(HoleScore(strokes: 6), player: me.id, hole: 1, clock: &watchClock, now: TestGeo.fixedNow.addingTimeInterval(5))
        phone.setScore(HoleScore(strokes: 5), player: me.id, hole: 1, clock: &phoneClock, now: TestGeo.fixedNow.addingTimeInterval(30))
        var merged = watch; merged.merge(phone)
        XCTAssertEqual(merged.round.score(player: me.id, hole: 1).strokes, 5, "jüngere Korrektur gewinnt")
        var mergedOther = phone; mergedOther.merge(watch)
        XCTAssertEqual(mergedOther, merged)
    }

    func testDeletionWinsOverLaterEdits() {
        let me = RoundPlayer(kind: .owner, name: "Ich")
        var phoneClock = HybridLogicalClock(node: "phone")
        var watchClock = HybridLogicalClock(node: "watch")
        let base = RoundDocument(header: header(players: [me]), stamp: phoneClock.tick(now: TestGeo.fixedNow))
        var phone = base, watch = base
        phone.delete(clock: &phoneClock, now: TestGeo.fixedNow.addingTimeInterval(1))
        watch.setScore(HoleScore(strokes: 4), player: me.id, hole: 2, clock: &watchClock, now: TestGeo.fixedNow.addingTimeInterval(60))
        var merged = watch; merged.merge(phone)
        XCTAssertTrue(merged.round.isDeleted)
    }

    func testDeltaSinceAndHeaderEdit() {
        let me = RoundPlayer(kind: .owner, name: "Ich")
        var clock = HybridLogicalClock(node: "phone")
        var doc = RoundDocument(header: header(players: [me]), stamp: clock.tick(now: TestGeo.fixedNow))
        let cut = doc.latestStamp
        doc.setScore(HoleScore(strokes: 4), player: me.id, hole: 1, clock: &clock, now: TestGeo.fixedNow)
        doc.updateHeader(clock: &clock, now: TestGeo.fixedNow) { $0.pcc = 1 }
        let delta = doc.delta(since: cut)!
        XCTAssertEqual(delta.fields.count, 1)
        XCTAssertEqual(delta.header?.value.pcc, 1)
        XCTAssertNil(doc.delta(since: doc.latestStamp))
        XCTAssertNotNil(RoundDocument(delta: doc.delta(since: nil)!))
        XCTAssertNil(RoundDocument(delta: delta.withoutHeader), "ohne Kopf kein neues Dokument")
    }

    // MARK: Ausgang

    func testOutboxIsFieldBasedAndSurvivesOlderStamps() {
        let me = RoundPlayer(kind: .owner, name: "Ich")
        var phoneClock = HybridLogicalClock(node: "phone")
        var watchClock = HybridLogicalClock(node: "watch")
        let base = RoundDocument(header: header(players: [me]), stamp: phoneClock.tick(now: TestGeo.fixedNow))
        var watchDoc = base
        // Watch erfasst um 10:00 (ältere Zeit), das iPhone überträgt erst um 10:05 seinen Stand
        watchDoc.setScore(HoleScore(strokes: 4), player: me.id, hole: 1, clock: &watchClock, now: TestGeo.fixedNow.addingTimeInterval(0))
        var phone = StoredRound(document: base, sync: .new)
        phone.document.setScore(HoleScore(strokes: 3), player: me.id, hole: 2, clock: &phoneClock, now: TestGeo.fixedNow.addingTimeInterval(300))
        phone.sync.markChanges(from: base, to: phone.document)
        let sent = phone.sync.outgoing(phone.document)!
        phone.sync.acknowledge(sent, current: phone.document, at: TestGeo.fixedNow)
        XCTAssertFalse(phone.sync.isDirty)
        // jetzt kommt der ältere Watch-Stand an
        let before = phone.document
        phone.document.merge(watchDoc)
        phone.sync.markChanges(from: before, to: phone.document)
        let next = phone.sync.outgoing(phone.document)!
        XCTAssertEqual(next.fields.count, 1, "älterer Zeitstempel wird trotzdem übertragen")
        XCTAssertNil(next.header)
    }

    func testAcknowledgeKeepsFieldsChangedDuringPush() {
        let me = RoundPlayer(kind: .owner, name: "Ich")
        var clock = HybridLogicalClock(node: "phone")
        let base = RoundDocument(header: header(players: [me]), stamp: clock.tick(now: TestGeo.fixedNow))
        var stored = StoredRound(document: base, sync: .new)
        stored.document.setScore(HoleScore(strokes: 5), player: me.id, hole: 1, clock: &clock, now: TestGeo.fixedNow)
        stored.sync.markChanges(from: base, to: stored.document)
        let sent = stored.sync.outgoing(stored.document)!
        // während der Übertragung korrigiert der Spieler
        let mid = stored.document
        stored.document.setScore(HoleScore(strokes: 6), player: me.id, hole: 1, clock: &clock, now: TestGeo.fixedNow)
        stored.sync.markChanges(from: mid, to: stored.document)
        stored.sync.acknowledge(sent, current: stored.document, at: TestGeo.fixedNow)
        XCTAssertTrue(stored.sync.isDirty, "Korrektur bleibt im Ausgang")
        XCTAssertFalse(stored.sync.headerDirty)
    }

    // MARK: Zwei Geräte über den Mock-Server

    func testTwoDevicesOfflineThenSyncConverge() async throws {
        let server = InMemoryRemoteRoundService()
        let phone = RoundRepository(store: InMemoryRoundStore(), node: "phone", now: { TestGeo.fixedNow })
        let tablet = RoundRepository(store: InMemoryRoundStore(), node: "tablet", now: { TestGeo.fixedNow.addingTimeInterval(1) })
        let phoneSync = SyncEngine(repository: phone, remote: server, cursorStore: InMemoryCursorStore())
        let tabletSync = SyncEngine(repository: tablet, remote: server, cursorStore: InMemoryCursorStore())

        let me = RoundPlayer(kind: .owner, name: "Ich")
        let friend = RoundPlayer(kind: .guest, name: "Gast")
        let round = try await phone.create(header: header(players: [me, friend]))
        var report = await phoneSync.sync()
        XCTAssertTrue(report.succeeded)
        report = await tabletSync.sync()
        XCTAssertTrue(report.succeeded)
        let onTablet = try await tablet.round(id: round.id)
        XCTAssertNotNil(onTablet)

        // Funkloch: beide erfassen offline
        await server.setOnline(false)
        try await phone.setScore(HoleScore(strokes: 5, putts: 2), player: me.id, hole: 1, roundID: round.id)
        try await tablet.setScore(HoleScore(strokes: 4), player: friend.id, hole: 1, roundID: round.id)
        report = await phoneSync.sync()
        XCTAssertEqual(report.error, .offline)
        let pending = await phone.pendingChangeCount
        XCTAssertGreaterThan(pending, 0, "Eingaben bleiben im Ausgang")

        // Verbindung wieder da
        await server.setOnline(true)
        for engine in [phoneSync, tabletSync, phoneSync] {
            report = await engine.sync()
            XCTAssertTrue(report.succeeded)
        }
        let p = try await phone.round(id: round.id)!
        let t = try await tablet.round(id: round.id)!
        XCTAssertEqual(p.scores, t.scores)
        XCTAssertEqual(p.score(player: me.id, hole: 1), HoleScore(strokes: 5, putts: 2))
        XCTAssertEqual(p.score(player: friend.id, hole: 1).strokes, 4)
        let pendingAfter = await phone.pendingChangeCount
        XCTAssertEqual(pendingAfter, 0)
        // erneutes Übertragen ist unschädlich (idempotent)
        report = await phoneSync.sync()
        XCTAssertTrue(report.succeeded)
        let again = try await phone.round(id: round.id)!
        XCTAssertEqual(again.scores, p.scores)
    }

    func testRepositoryPersistsAndRestoresClock() async throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("golfcore-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: dir) }
        let me = RoundPlayer(kind: .owner, name: "Ich")
        let store = try FileRoundStore(directory: dir)
        let repo = RoundRepository(store: store, node: "phone", now: { Date(timeIntervalSince1970: 2_000_000) })
        let round = try await repo.create(header: header(players: [me]))
        try await repo.setScore(HoleScore(strokes: 5), player: me.id, hole: 1, roundID: round.id)

        // „App-Neustart“ mit zurückgestellter Uhr
        let restarted = RoundRepository(store: try FileRoundStore(directory: dir), node: "phone", now: { Date(timeIntervalSince1970: 1_000_000) })
        let restored = try await restarted.round(id: round.id)
        XCTAssertEqual(restored?.score(player: me.id, hole: 1).strokes, 5)
        try await restarted.setScore(HoleScore(strokes: 6), player: me.id, hole: 1, roundID: round.id)
        let corrected = try await restarted.round(id: round.id)
        XCTAssertEqual(corrected?.score(player: me.id, hole: 1).strokes, 6, "neue Eingabe gewinnt trotz zurückgestellter Uhr")
        try await restarted.delete(roundID: round.id)
        let remaining = try await restarted.rounds()
        XCTAssertTrue(remaining.isEmpty)
    }

    func testFileStoreSkipsCorruptFiles() async throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("golfcore-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: dir) }
        let store = try FileRoundStore(directory: dir)
        var clock = HybridLogicalClock(node: "phone")
        let doc = RoundDocument(header: header(players: [RoundPlayer(kind: .owner, name: "Ich")]), stamp: clock.tick())
        try await store.save(StoredRound(document: doc))
        try Data("{kaputt".utf8).write(to: dir.appendingPathComponent("kaputt.json"))
        let all = try await store.loadAll()
        XCTAssertEqual(all.map(\.id), [doc.id])
    }
}

extension RoundDelta {
    var withoutHeader: RoundDelta { RoundDelta(roundID: roundID, header: nil, fields: fields, deleted: deleted) }
}
