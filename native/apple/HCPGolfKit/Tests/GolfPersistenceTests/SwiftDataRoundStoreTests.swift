#if canImport(SwiftData)
import Foundation
import GolfCore
import GolfPersistence
import XCTest

/// Läuft nur auf Apple-Plattformen (macOS-CI: `swift test`).
final class SwiftDataRoundStoreTests: XCTestCase {
    func header() -> RoundHeader {
        RoundHeader(courseID: "c", courseName: "Testplatz", clubName: "Club", courseSource: .demo,
                    date: LocalDate(year: 2026, month: 7, day: 3), startedAt: Date(timeIntervalSince1970: 1_780_000_000),
                    holeSelection: .front9, holes: (1...9).map { PlayedHole(number: $0, par: 4, strokeIndex: $0) },
                    format: .strokePlay, handicap: HandicapSettings(mode: .none), scoring: .full, privacy: .private,
                    players: [RoundPlayer(kind: .owner, name: "Ich")])
    }

    func testSaveLoadUpdateRemove() async throws {
        let store = SwiftDataRoundStore.make(container: try SwiftDataRoundStore.makeContainer(inMemory: true))
        var clock = HybridLogicalClock(node: "test")
        var stored = StoredRound(document: RoundDocument(header: header(), stamp: clock.tick()))
        try await store.save(stored)
        let me = stored.document.header.value.players[0].id
        stored.document.setScore(HoleScore(strokes: 5), player: me, hole: 1, clock: &clock)
        try await store.save(stored) // Aktualisieren statt doppelt anlegen
        let all = try await store.loadAll()
        XCTAssertEqual(all.count, 1)
        XCTAssertEqual(all[0].document.round.score(player: me, hole: 1).strokes, 5)
        let one = try await store.load(id: stored.id)
        XCTAssertEqual(one, stored)
        try await store.remove(id: stored.id)
        let empty = try await store.loadAll()
        XCTAssertTrue(empty.isEmpty)
    }

    func testRoundSurvivesRestart() async throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("swiftdata-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let url = dir.appendingPathComponent("rounds.store")

        let repo = RoundRepository(store: SwiftDataRoundStore.make(container: try SwiftDataRoundStore.makeContainer(url: url)), node: "phone")
        let round = try await repo.create(header: header())
        let me = round.header.players[0].id
        try await repo.setScore(HoleScore(strokes: 4, putts: 2), player: me, hole: 3, roundID: round.id)

        let restarted = RoundRepository(store: SwiftDataRoundStore.make(container: try SwiftDataRoundStore.makeContainer(url: url)), node: "phone")
        let restored = try await restarted.round(id: round.id)
        XCTAssertEqual(restored?.score(player: me, hole: 3), HoleScore(strokes: 4, putts: 2))
        let outgoing = try await restarted.outgoing()
        XCTAssertEqual(outgoing.count, 1, "Ausgang überlebt den Neustart")
    }
}
#endif
