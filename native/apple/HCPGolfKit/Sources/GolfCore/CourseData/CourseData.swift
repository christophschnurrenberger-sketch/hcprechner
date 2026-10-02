import Foundation
import HCPGolfKit

/// Suchanfrage für Golfplätze.
public struct CourseQuery: Equatable, Sendable {
    /// Freitext: Platzname, Club, Ort oder Region
    public var text: String
    /// Standort für die Sortierung nach Entfernung
    public var near: GeoPoint?
    public var limit: Int

    public init(text: String = "", near: GeoPoint? = nil, limit: Int = 50) {
        self.text = text
        self.near = near
        self.limit = limit
    }
}

/// Austauschbarer Anbieter von Golfplatzdaten. Die App hängt von keiner bestimmten API ab:
/// heute `MockGolfCourseDataProvider` (Demo-Plätze), später z. B. ein `LicensedGolfCourseDataProvider`.
public protocol GolfCourseDataProvider: Sendable {
    /// Kennung für Cache und Diagnose, z. B. „demo“
    var providerID: String { get }
    func allCourses() async throws -> [CourseSummary]
    func course(id: CourseID) async throws -> Course
}

public enum CourseDataError: Error, Equatable, Sendable {
    case notFound(CourseID)
    /// Anbieter nicht erreichbar und kein Offline-Stand vorhanden
    case unavailable
}

/// Suche über Name, Club, Ort und Region – unabhängig von Groß-/Kleinschreibung, Akzenten und Umlaut-Schreibweise
/// („Allgäu“ = „Allgaeu“ = „allgau“). Sortierung: Treffer am Namensanfang vor Wortanfang vor enthalten, dann nach
/// Entfernung.
public enum CourseSearch {
    public static func normalize(_ text: String) -> String {
        var s = text.lowercased()
        let replacements: [(String, String)] = [
            ("ä", "a"), ("ö", "o"), ("ü", "u"), ("ß", "ss"), ("é", "e"), ("è", "e"), ("ê", "e"), ("à", "a"),
            ("á", "a"), ("â", "a"), ("ç", "c"), ("ñ", "n"), ("ó", "o"), ("ò", "o"), ("ô", "o"), ("í", "i"),
            ("ì", "i"), ("î", "i"), ("ú", "u"), ("ù", "u"), ("û", "u"),
            ("ae", "a"), ("oe", "o"), ("ue", "u"),
        ]
        for (from, to) in replacements { s = s.replacingOccurrences(of: from, with: to) }
        return s.map { $0.isLetter || $0.isNumber ? String($0) : " " }.joined()
            .split(separator: " ").joined(separator: " ")
    }

    /// Rang eines Treffers (kleiner = besser); `nil` = kein Treffer.
    static func rank(_ course: CourseSummary, tokens: [String]) -> Int? {
        let name = normalize(course.name)
        let haystack = [name, normalize(course.clubName), normalize(course.city), normalize(course.region ?? "")].joined(separator: " ")
        var best = 0
        for token in tokens {
            if name.hasPrefix(token) { continue }
            if (" " + name).contains(" " + token) { best = max(best, 1); continue }
            if (" " + haystack).contains(" " + token) { best = max(best, 2); continue }
            if haystack.contains(token) { best = max(best, 3); continue }
            return nil
        }
        return best
    }

    public static func search(_ courses: [CourseSummary], query: CourseQuery) -> [CourseSummary] {
        let tokens = normalize(query.text).split(separator: " ").map(String.init)
        let scored: [(CourseSummary, Int, Double)] = courses.compactMap { course in
            guard let r = tokens.isEmpty ? 0 : rank(course, tokens: tokens) else { return nil }
            let distance = distanceMeters(from: query.near, to: course) ?? .infinity
            return (course, r, distance)
        }
        return scored.sorted { a, b in
            if a.1 != b.1 { return a.1 < b.1 }
            if a.2 != b.2 { return a.2 < b.2 }
            return a.0.name.localizedCompare(b.0.name) == .orderedAscending
        }
        .prefix(query.limit).map(\.0)
    }

    /// Plätze in der Nähe, nach Entfernung sortiert (Plätze ohne Koordinaten fehlen).
    public static func nearby(_ courses: [CourseSummary], to point: GeoPoint, limit: Int = 20) -> [(course: CourseSummary, meters: Double)] {
        courses.compactMap { c in distanceMeters(from: point, to: c).map { (c, $0) } }
            .sorted { $0.1 < $1.1 }
            .prefix(limit)
            .map { (course: $0.0, meters: $0.1) }
    }

    public static func distanceMeters(from point: GeoPoint?, to course: CourseSummary) -> Double? {
        guard let point, point.isValid, let location = course.location, location.isValid else { return nil }
        return Geodesy.distance(point, location)
    }
}

/// Offline-Ablage von Platzdaten. Vor einer Runde wird der Platz vollständig gespeichert („prefetch“), damit die Runde
/// ohne Netz läuft.
public protocol CourseCache: Sendable {
    func load(id: CourseID) async -> Course?
    func save(_ course: Course) async
    func cachedIDs() async -> [CourseID]
}

public actor InMemoryCourseCache: CourseCache {
    private var courses: [CourseID: Course] = [:]
    public init() {}
    public func load(id: CourseID) async -> Course? { courses[id] }
    public func save(_ course: Course) async { courses[course.id] = course }
    public func cachedIDs() async -> [CourseID] { Array(courses.keys) }
}

/// Platzdaten als JSON-Dateien (atomar geschrieben).
public actor FileCourseCache: CourseCache {
    private let directory: URL

    public init(directory: URL) throws {
        self.directory = directory
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    private func url(_ id: CourseID) -> URL {
        let safe = id.map { $0.isLetter || $0.isNumber || $0 == "-" ? String($0) : "_" }.joined()
        return directory.appendingPathComponent(safe + ".json")
    }

    public func load(id: CourseID) async -> Course? {
        guard let data = try? Data(contentsOf: url(id)) else { return nil }
        return try? GolfJSON.decoder().decode(Course.self, from: data)
    }

    public func save(_ course: Course) async {
        guard let data = try? GolfJSON.encoder().encode(course) else { return }
        try? data.write(to: url(course.id), options: [.atomic])
    }

    public func cachedIDs() async -> [CourseID] {
        let files = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? []
        return files.compactMap { file in
            guard file.pathExtension == "json", let data = try? Data(contentsOf: file),
                  let course = try? GolfJSON.decoder().decode(Course.self, from: data) else { return nil }
            return course.id
        }
    }
}

/// Platzdaten für die App: Anbieter plus Offline-Ablage. Ein geladener Platz wird immer gespeichert; ist der Anbieter
/// nicht erreichbar, gilt der gespeicherte Stand.
public actor CourseRepository {
    private let provider: GolfCourseDataProvider
    private let cache: CourseCache
    private var summaries: [CourseSummary]?

    public init(provider: GolfCourseDataProvider, cache: CourseCache) {
        self.provider = provider
        self.cache = cache
    }

    public func allCourses() async throws -> [CourseSummary] {
        if let summaries { return summaries }
        do {
            let all = try await provider.allCourses()
            summaries = all
            return all
        } catch {
            // offline: gespeicherte Plätze
            var out: [CourseSummary] = []
            for id in await cache.cachedIDs() {
                if let c = await cache.load(id: id) { out.append(c.summary) }
            }
            if out.isEmpty { throw CourseDataError.unavailable }
            return out
        }
    }

    public func search(_ query: CourseQuery) async throws -> [CourseSummary] {
        CourseSearch.search(try await allCourses(), query: query)
    }

    public func nearby(_ point: GeoPoint, limit: Int = 20) async throws -> [(course: CourseSummary, meters: Double)] {
        CourseSearch.nearby(try await allCourses(), to: point, limit: limit)
    }

    /// Platz laden und offline speichern (vor jeder Runde aufrufen).
    public func course(id: CourseID) async throws -> Course {
        do {
            let course = try await provider.course(id: id)
            await cache.save(course)
            return course
        } catch {
            if let cached = await cache.load(id: id) { return cached }
            throw error
        }
    }

    public func isAvailableOffline(_ id: CourseID) async -> Bool {
        await cache.load(id: id) != nil
    }
}
