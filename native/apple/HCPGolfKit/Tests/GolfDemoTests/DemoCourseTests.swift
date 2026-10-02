import XCTest
import HCPGolfKit
@testable import GolfCore
@testable import GolfDemo

final class DemoCourseTests: XCTestCase {
    func testThreeCoursesNineAndEighteenHoles() {
        let all = DemoCourses.all
        XCTAssertEqual(all.count, 3)
        XCTAssertEqual(Set(all.map(\.id)).count, 3)
        XCTAssertEqual(DemoCourses.championship.holeCount, 18)
        XCTAssertEqual(DemoCourses.championship.par, 72)
        XCTAssertEqual(DemoCourses.academy.holeCount, 9)
        XCTAssertEqual(DemoCourses.academy.par, 31)
        XCTAssertEqual(DemoCourses.seepark.par, 70)
        XCTAssertTrue(all.allSatisfy { $0.source == .demo && $0.hasHoleData && $0.hasGPSData })
    }

    func testHoleDataIsConsistent() {
        for course in DemoCourses.all {
            XCTAssertEqual(Set(course.holes.compactMap(\.strokeIndex)), Set(1...course.holeCount), "\(course.name): Stroke Index 1–n eindeutig")
            for hole in course.holes {
                let label = "\(course.name) Loch \(hole.number)"
                XCTAssertEqual(hole.teeBoxes.count, course.tees.count, label)
                XCTAssertTrue(hole.teeBoxes.allSatisfy { $0.position?.isValid == true }, label)
                let yellow = hole.teeBox("yellow")?.lengthMeters ?? 0
                switch hole.par {
                case 3: XCTAssertTrue((100...200).contains(yellow), "\(label): \(yellow) m")
                case 4: XCTAssertTrue((240...420).contains(yellow), "\(label): \(yellow) m")
                default: XCTAssertTrue((420...520).contains(yellow), "\(label): \(yellow) m")
                }
                // Abschläge in sinnvoller Reihenfolge: Weiß ≥ Gelb ≥ Blau ≥ Rot
                let lengths = ["white", "yellow", "blue", "red"].compactMap { hole.teeBox($0)?.lengthMeters }
                XCTAssertEqual(lengths, lengths.sorted(by: >), label)
                // Grün: gültige Fläche, Mitte innen, Front/Back plausibel
                let green = hole.green!
                XCTAssertTrue(green.outline!.isValid, label)
                let frame = LocalFrame(origin: green.center!)
                XCTAssertTrue(PlanarGeometry.contains(.zero, in: green.outline!.points.map(frame.toLocal)), label)
                let depth = Geodesy.distance(green.front!, green.back!)
                XCTAssertTrue((25...40).contains(depth), "\(label): Grüntiefe \(depth)")
                XCTAssertEqual(hole.fairways.isEmpty, hole.par == 3, label)
                XCTAssertTrue(hole.features.allSatisfy(\.geometry.isValid), label)
                XCTAssertTrue(hole.features.contains { $0.kind == .bunker } || hole.features.contains { $0.kind == .water }, label)
                if hole.par == 5 { XCTAssertTrue(hole.targets.contains { $0.kind == .layup }, label) }
            }
        }
    }

    func testRoutingWalksAreShortAndHolesDoNotOverlap() {
        for course in DemoCourses.all {
            for (a, b) in zip(course.holes, course.holes.dropFirst()) where !(a.number == 9 && course.holeCount == 18) {
                let walk = Geodesy.distance(a.green!.center!, b.teePosition(for: "white") ?? b.teePosition(for: "yellow")!)
                XCTAssertLessThan(walk, 130, "\(course.name): Weg von Grün \(a.number) zu Abschlag \(b.number)")
            }
            // Grün eines Lochs liegt nie in der Spielbahn eines anderen Lochs
            for hole in course.holes {
                let center = hole.green!.center!
                for other in course.holes where other.number != hole.number {
                    let frame = LocalFrame(origin: center)
                    let line = other.lineOfPlay.map(frame.toLocal)
                    let d = zip(line, line.dropFirst()).map { PlanarGeometry.distanceToSegment(.zero, $0, $1) }.min()!
                    // hinter dem nächsten Abschlag genügen 30 m (dorthin wird nicht gespielt), sonst 40 m Abstand zur Spiellinie
                    let minimum = other.number == hole.number + 1 ? 30.0 : 40.0
                    XCTAssertGreaterThan(d, minimum, "\(course.name): Grün \(hole.number) zu nah an Loch \(other.number)")
                }
            }
        }
    }

    func testRatingsAreFictionalAndNeverDerived() {
        let c = DemoCourses.championship
        XCTAssertTrue(c.tees.flatMap(\.ratings).allSatisfy { $0.status == .fictional && $0.isComplete })
        XCTAssertNotNil(RoundSetup.rating(course: c, teeID: "yellow", gender: .male, selection: .front9))
        XCTAssertNil(RoundSetup.rating(course: c, teeID: "blue", gender: .female, selection: .front9), "Blau hat nur ein 18-Loch-Rating")
        XCTAssertEqual(RoundSetup.availableHoleSelections(for: DemoCourses.academy), [.nine])
    }

    func testMockProviderAndSearch() async throws {
        let provider = MockGolfCourseDataProvider()
        let repo = CourseRepository(provider: provider, cache: InMemoryCourseCache())
        let found = try await repo.search(CourseQuery(text: "seepark"))
        XCTAssertEqual(found.first?.id, DemoCourses.seeparkID)
        let near = try await repo.nearby(DemoCourses.clubLocation)
        XCTAssertEqual(near.first?.course.id, DemoCourses.championshipID)
        XCTAssertGreaterThan(near.last!.meters, 20_000, "Seepark liegt gut 20 km entfernt")
        await provider.setOnline(false)
        do {
            _ = try await provider.course(id: DemoCourses.academyID)
            XCTFail("offline muss fehlschlagen")
        } catch {
            XCTAssertEqual(error as? CourseDataError, .unavailable)
        }
    }

    /// Optional: Platzdaten als JSON exportieren (für Kontrollbilder), z. B. GOLF_DEMO_EXPORT=/tmp/demo swift test
    func testExportForReview() throws {
        guard let dir = ProcessInfo.processInfo.environment["GOLF_DEMO_EXPORT"] else { return }
        try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        for course in DemoCourses.all {
            let data = try GolfJSON.encoder().encode(course)
            try data.write(to: URL(fileURLWithPath: dir).appendingPathComponent(course.id + ".json"))
        }
    }
}
