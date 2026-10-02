import Foundation
import GolfCore
import GolfDemo
import GolfPersistence
import HCPGolfKit
import Observation

enum SyncStatus: Equatable {
    case idle
    case syncing
    case synced(Date)
    /// keine Verbindung – Änderungen bleiben auf dem Gerät und werden später übertragen
    case offline(pending: Int)
    case failed(String)
}

/// Zentrale Abhängigkeiten der App (Dependency Injection). Views erhalten sie über `@Environment(AppEnvironment.self)`
/// und rechnen selbst nichts: Platzdaten, Runden, Wertung und Synchronisation kommen aus GolfCore.
///
/// Was hier Mock ist (siehe docs/NATIVE-APP.md): Platzdaten (`MockGolfCourseDataProvider`, fiktive Demo-Plätze) und
/// der Server (`InMemoryRemoteRoundService`). Beide sind über Protokolle austauschbar.
@MainActor
@Observable
final class AppEnvironment {
    let settings: AppSettings
    let profile: ProfileStore
    let strategies: StrategyStore
    let location: LocationHub
    let rules = WHSRuleSet.de2026
    let courseProvider: MockGolfCourseDataProvider
    let courses: CourseRepository
    let rounds: RoundRepository
    let remote: InMemoryRemoteRoundService
    let syncEngine: SyncEngine

    private(set) var roundList: [Round] = []
    private(set) var syncStatus: SyncStatus = .idle
    private(set) var loadError: String?
    /// Runde im Rundenmodus (Vollbild)
    var presentedRoundID: UUID?
    /// Entwicklermenü: Server offline simulieren
    private(set) var simulateOffline = false
    @ObservationIgnored private var syncTask: Task<Void, Never>?

    init(settings: AppSettings, profile: ProfileStore, strategies: StrategyStore, location: LocationHub,
         courseProvider: MockGolfCourseDataProvider, courseCache: CourseCache, roundStore: RoundStore, node: String) {
        self.settings = settings
        self.profile = profile
        self.strategies = strategies
        self.location = location
        self.courseProvider = courseProvider
        self.courses = CourseRepository(provider: courseProvider, cache: courseCache)
        self.rounds = RoundRepository(store: roundStore, node: node)
        self.remote = InMemoryRemoteRoundService()
        self.syncEngine = SyncEngine(repository: rounds, remote: remote, cursorStore: DefaultsCursorStore())
    }

    /// App auf dem Gerät: SwiftData für Runden, Dateiablage für Platzdaten (offline).
    static func live() -> AppEnvironment {
        let support = (try? FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true))
            ?? FileManager.default.temporaryDirectory
        let roundStore: RoundStore
        if let container = try? SwiftDataRoundStore.makeContainer() {
            roundStore = SwiftDataRoundStore.make(container: container)
        } else if let files = try? FileRoundStore(directory: support.appendingPathComponent("Rounds")) {
            roundStore = files // Rückfall, falls der SwiftData-Speicher nicht geöffnet werden kann
        } else {
            roundStore = InMemoryRoundStore()
        }
        let cache: CourseCache = (try? FileCourseCache(directory: support.appendingPathComponent("Courses"))) ?? InMemoryCourseCache()
        let uiTesting = ProcessInfo.processInfo.arguments.contains("-uiTesting")
        return AppEnvironment(
            settings: AppSettings(), profile: ProfileStore(initial: DemoPeople.owner), strategies: StrategyStore(),
            location: LocationHub(simulated: uiTesting), courseProvider: MockGolfCourseDataProvider(), courseCache: cache,
            roundStore: uiTesting ? InMemoryRoundStore() : roundStore, node: DeviceIdentity.node()
        )
    }

    /// Vorschauen: alles im Arbeitsspeicher, simuliertes GPS.
    static func preview() -> AppEnvironment {
        let defaults = UserDefaults(suiteName: "preview") ?? .standard
        return AppEnvironment(
            settings: AppSettings(defaults: defaults), profile: ProfileStore(defaults: defaults, initial: DemoPeople.owner),
            strategies: StrategyStore(defaults: defaults), location: LocationHub(simulated: true),
            courseProvider: MockGolfCourseDataProvider(), courseCache: InMemoryCourseCache(), roundStore: InMemoryRoundStore(),
            node: "preview"
        )
    }

    // MARK: Runden

    var activeRound: Round? { roundList.first { $0.status == .inProgress } }
    var completedRounds: [Round] { roundList.filter { $0.status == .completed } }

    func refreshRounds() async {
        do {
            roundList = try await rounds.rounds()
            loadError = nil
        } catch {
            loadError = String(describing: error)
        }
    }

    /// Platz vollständig laden und offline speichern (vor jeder Runde).
    func loadCourse(_ id: CourseID) async throws -> Course {
        try await courses.course(id: id)
    }

    func startRound(_ draft: RoundSetupDraft) async throws -> Round {
        _ = try await courses.course(id: draft.course.id) // Prefetch für die Offline-Runde
        let round = try await rounds.create(header: RoundSetup.makeHeader(from: draft, startedAt: Date(), ruleSet: rules))
        settings.noteRecent(draft.course.id)
        await refreshRounds()
        presentedRoundID = round.id
        scheduleSync()
        return round
    }

    @discardableResult
    func saveScore(_ score: HoleScore, player: UUID, hole: Int, roundID: UUID) async throws -> Round {
        let round = try await rounds.setScore(score, player: player, hole: hole, roundID: roundID)
        replace(round)
        scheduleSync()
        return round
    }

    @discardableResult
    func setStatus(_ status: RoundStatus, roundID: UUID) async throws -> Round {
        let round = try await rounds.setStatus(status, roundID: roundID)
        replace(round)
        scheduleSync()
        return round
    }

    @discardableResult
    func updateHeader(roundID: UUID, _ change: @escaping @Sendable (inout RoundHeader) -> Void) async throws -> Round {
        let round = try await rounds.updateHeader(roundID: roundID, change)
        replace(round)
        scheduleSync()
        return round
    }

    func deleteRound(_ id: UUID) async throws {
        try await rounds.delete(roundID: id)
        roundList.removeAll { $0.id == id }
        if presentedRoundID == id { presentedRoundID = nil }
        scheduleSync()
    }

    func round(_ id: UUID) -> Round? { roundList.first { $0.id == id } }

    private func replace(_ round: Round) {
        if let i = roundList.firstIndex(where: { $0.id == round.id }) {
            roundList[i] = round
        } else {
            roundList.insert(round, at: 0)
        }
    }

    // MARK: Synchronisation (offline-first)

    /// Abgleich kurz nach Änderungen bündeln; ohne Verbindung bleibt alles im Ausgang.
    func scheduleSync(after seconds: Double = 2) {
        syncTask?.cancel()
        syncTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
            guard !Task.isCancelled else { return }
            await self?.syncNow()
        }
    }

    func syncNow() async {
        syncStatus = .syncing
        let report = await syncEngine.sync()
        switch report.error {
        case nil:
            syncStatus = .synced(Date())
            if report.pulledRounds > 0 { await refreshRounds() }
        case .offline:
            syncStatus = .offline(pending: await rounds.pendingChangeCount)
        case let .some(error):
            syncStatus = .failed(String(describing: error))
        }
    }

    func setSimulateOffline(_ offline: Bool) async {
        simulateOffline = offline
        await remote.setOnline(!offline)
        await courseProvider.setOnline(!offline)
        await syncNow()
    }
}

/// Server-Folgenummer in UserDefaults.
actor DefaultsCursorStore: SyncCursorStore {
    private let key = "golf.sync.cursor"

    func loadCursor() async -> Int64? {
        let value = UserDefaults.standard.object(forKey: key) as? NSNumber
        return value?.int64Value
    }

    func saveCursor(_ cursor: Int64) async {
        UserDefaults.standard.set(NSNumber(value: cursor), forKey: key)
    }
}
