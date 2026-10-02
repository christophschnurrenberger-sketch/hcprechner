import Foundation
import GolfCore
import HCPGolfKit
import Observation
import SwiftUI

enum AppearanceSetting: String, Codable, CaseIterable {
    case system, light, dark

    var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }
}

/// Einstellungen der App (UserDefaults). Neue Felder brauchen einen Standardwert, damit ältere Stände lesbar bleiben.
struct SettingsData: Codable, Equatable {
    var unit: DistanceFormat.Unit = .meters
    var autoHoleChange: AutoHoleChangeMode = .automatic
    var showDistanceArcs = true
    var arcPreset: [Int] = DistanceArcs.defaultMeters
    var haptics = true
    var keepScreenOn = true
    var appearance: AppearanceSetting = .system
    var defaultScoring: ScoringMode = .full
    var favorites: [CourseID] = []
    var recentCourses: [CourseID] = []
    var developerMode = false

    init() {}

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let d = SettingsData()
        unit = (try? c.decode(DistanceFormat.Unit.self, forKey: .unit)) ?? d.unit
        autoHoleChange = (try? c.decode(AutoHoleChangeMode.self, forKey: .autoHoleChange)) ?? d.autoHoleChange
        showDistanceArcs = (try? c.decode(Bool.self, forKey: .showDistanceArcs)) ?? d.showDistanceArcs
        arcPreset = (try? c.decode([Int].self, forKey: .arcPreset)) ?? d.arcPreset
        haptics = (try? c.decode(Bool.self, forKey: .haptics)) ?? d.haptics
        keepScreenOn = (try? c.decode(Bool.self, forKey: .keepScreenOn)) ?? d.keepScreenOn
        appearance = (try? c.decode(AppearanceSetting.self, forKey: .appearance)) ?? d.appearance
        defaultScoring = (try? c.decode(ScoringMode.self, forKey: .defaultScoring)) ?? d.defaultScoring
        favorites = (try? c.decode([CourseID].self, forKey: .favorites)) ?? d.favorites
        recentCourses = (try? c.decode([CourseID].self, forKey: .recentCourses)) ?? d.recentCourses
        developerMode = (try? c.decode(Bool.self, forKey: .developerMode)) ?? d.developerMode
    }
}

/// JSON-Wert in UserDefaults.
struct DefaultsCodable<Value: Codable> {
    let key: String
    let defaults: UserDefaults

    func load() -> Value? {
        guard let data = defaults.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(Value.self, from: data)
    }

    func save(_ value: Value) {
        if let data = try? JSONEncoder().encode(value) { defaults.set(data, forKey: key) }
    }
}

@MainActor
@Observable
final class AppSettings {
    private(set) var data: SettingsData
    private let storage: DefaultsCodable<SettingsData>

    init(defaults: UserDefaults = .standard) {
        storage = DefaultsCodable(key: "golf.settings.v1", defaults: defaults)
        data = storage.load() ?? SettingsData()
    }

    func update(_ change: (inout SettingsData) -> Void) {
        var copy = data
        change(&copy)
        guard copy != data else { return }
        data = copy
        storage.save(copy)
    }

    func binding<T>(_ keyPath: WritableKeyPath<SettingsData, T>) -> Binding<T> {
        Binding(get: { self.data[keyPath: keyPath] }, set: { value in self.update { $0[keyPath: keyPath] = value } })
    }

    func isFavorite(_ id: CourseID) -> Bool { data.favorites.contains(id) }

    func toggleFavorite(_ id: CourseID) {
        update { s in
            if let i = s.favorites.firstIndex(of: id) { s.favorites.remove(at: i) } else { s.favorites.append(id) }
        }
    }

    func noteRecent(_ id: CourseID) {
        update { s in
            s.recentCourses.removeAll { $0 == id }
            s.recentCourses.insert(id, at: 0)
            s.recentCourses = Array(s.recentCourses.prefix(10))
        }
    }
}

/// Spielerprofil des Geräts. Beim ersten Start der Demo-Spieler („Demo-Account“), bis es Konten gibt.
@MainActor
@Observable
final class ProfileStore {
    private(set) var profile: PlayerProfile
    private let storage: DefaultsCodable<PlayerProfile>

    init(defaults: UserDefaults = .standard, initial: PlayerProfile) {
        storage = DefaultsCodable(key: "golf.profile.v1", defaults: defaults)
        profile = storage.load() ?? initial
    }

    func update(_ change: (inout PlayerProfile) -> Void) {
        var copy = profile
        change(&copy)
        guard copy != profile else { return }
        profile = copy
        storage.save(copy)
    }
}

/// Gespeicherte Strategie je Loch (Zielpunkte Abschlag → Layup → Annäherung → Grün).
@MainActor
@Observable
final class StrategyStore {
    private(set) var plans: [String: [GeoPoint]]
    private let storage: DefaultsCodable<[String: [GeoPoint]]>

    init(defaults: UserDefaults = .standard) {
        storage = DefaultsCodable(key: "golf.strategies.v1", defaults: defaults)
        plans = storage.load() ?? [:]
    }

    private static func key(_ course: CourseID, _ hole: Int) -> String { "\(course)#\(hole)" }

    func plan(course: CourseID, hole: Int) -> [GeoPoint] { plans[Self.key(course, hole)] ?? [] }

    func save(_ points: [GeoPoint], course: CourseID, hole: Int) {
        plans[Self.key(course, hole)] = points.isEmpty ? nil : points
        storage.save(plans)
    }
}

/// Kennung dieses Geräts für die hybride logische Uhr (bleibt über Neustarts gleich).
enum DeviceIdentity {
    static func node(defaults: UserDefaults = .standard) -> String {
        let key = "golf.device.node"
        if let existing = defaults.string(forKey: key) { return existing }
        let node = "ios" + String(UUID().uuidString.prefix(8)).lowercased()
        defaults.set(node, forKey: key)
        return node
    }
}
