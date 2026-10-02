import Foundation
import GolfCore
import HCPGolfKit

/// Mock-Anbieter mit den Demo-Plätzen. Später ersetzt durch einen lizenzierten Anbieter mit derselben Schnittstelle.
/// Optional mit künstlicher Verzögerung und abschaltbarer „Verbindung“ (Entwicklermodus: Offline simulieren).
public actor MockGolfCourseDataProvider: GolfCourseDataProvider {
    public nonisolated let providerID = "demo"
    private let courses: [Course]
    private let latency: Duration
    public private(set) var isOnline = true

    public init(courses: [Course] = DemoCourses.all, latency: Duration = .zero) {
        self.courses = courses
        self.latency = latency
    }

    public func setOnline(_ online: Bool) { isOnline = online }

    public func allCourses() async throws -> [CourseSummary] {
        try await wait()
        return courses.map(\.summary)
    }

    public func course(id: CourseID) async throws -> Course {
        try await wait()
        guard let course = courses.first(where: { $0.id == id }) else { throw CourseDataError.notFound(id) }
        return course
    }

    private func wait() async throws {
        guard isOnline else { throw CourseDataError.unavailable }
        if latency > .zero { try await Task.sleep(for: latency) }
    }
}

/// Demo-Spieler und Freunde (für den Runden-Assistenten), solange es noch keine Konten gibt.
public enum DemoPeople {
    public struct Friend: Identifiable, Hashable, Sendable {
        public var id: String
        public var name: String
        public var handicapIndex: Double?
        public var gender: Gender
    }

    public static let owner = PlayerProfile(
        id: UUID(uuidString: "6F1C2A40-0000-4000-8000-000000000001")!,
        displayName: "Demo Spieler",
        handicapIndex: 18.4,
        gender: .male,
        handedness: .right,
        preferredTeeColor: .yellow,
        homeCourseID: DemoCourses.championshipID,
        unit: .meters
    )

    public static let friends: [Friend] = [
        Friend(id: "friend-max", name: "Max", handicapIndex: 12.3, gender: .male),
        Friend(id: "friend-anna", name: "Anna", handicapIndex: 21.7, gender: .female),
        Friend(id: "friend-peter", name: "Peter", handicapIndex: 28.0, gender: .male),
        Friend(id: "friend-lena", name: "Lena", handicapIndex: 6.9, gender: .female),
    ]
}
