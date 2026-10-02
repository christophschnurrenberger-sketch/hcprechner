import XCTest
import HCPGolfKit
@testable import GolfCore

final class CourseAndSetupTests: XCTestCase {
    func summary(_ id: String, _ name: String, city: String, region: String? = nil, at point: GeoPoint?) -> CourseSummary {
        CourseSummary(id: id, name: name, clubName: name + " e.V.", city: city, region: region, country: "DE", location: point,
                      holeCount: 18, par: 72, hasGPSData: true, hasHoleData: true, source: .demo)
    }

    func testNormalizationIgnoresCaseAccentsAndUmlautSpelling() {
        XCTAssertEqual(CourseSearch.normalize("Allgäuer Golf-  und Landclub"), CourseSearch.normalize("allgaeuer golf und landclub"))
        XCTAssertTrue(CourseSearch.normalize("Allgäuer").hasPrefix(CourseSearch.normalize("allgau")))
        XCTAssertEqual(CourseSearch.normalize("Château Golf"), "chateau golf")
    }

    func testSearchRanksNamePrefixFirstThenDistance() {
        let here = TestGeo.p(0, 0)
        let courses = [
            summary("a", "Seepark Golf", city: "Seeheim", at: TestGeo.p(5000, 0)),
            summary("b", "Golfclub am See", city: "Bergdorf", at: TestGeo.p(100, 0)),
            summary("c", "Seeblick Golfpark", city: "Talheim", at: TestGeo.p(20000, 0)),
            summary("d", "Waldgolf", city: "Seestadt", region: "Schwaben", at: nil),
        ]
        let result = CourseSearch.search(courses, query: CourseQuery(text: "see", near: here))
        XCTAssertEqual(result.map(\.id), ["a", "c", "b", "d"], "Namensanfang (nach Entfernung) vor Wortanfang vor Ort")
        XCTAssertEqual(CourseSearch.search(courses, query: CourseQuery(text: "schwaben")).map(\.id), ["d"])
        XCTAssertTrue(CourseSearch.search(courses, query: CourseQuery(text: "see xyz")).isEmpty, "alle Wörter müssen passen")
        XCTAssertEqual(CourseSearch.search(courses, query: CourseQuery(text: "", near: here)).first?.id, "b", "ohne Text: nach Entfernung")
        let near = CourseSearch.nearby(courses, to: here)
        XCTAssertEqual(near.map(\.course.id), ["b", "a", "c"], "ohne Koordinaten nicht in der Nähe-Liste")
        XCTAssertEqual(near[0].meters, 100, accuracy: 0.5)
    }

    func testCourseRepositoryFallsBackToCacheOffline() async throws {
        struct FlakyProvider: GolfCourseDataProvider {
            let providerID = "flaky"
            let course: Course
            let online: Bool
            func allCourses() async throws -> [CourseSummary] {
                guard online else { throw CourseDataError.unavailable }
                return [course.summary]
            }
            func course(id: CourseID) async throws -> Course {
                guard online else { throw CourseDataError.unavailable }
                return course
            }
        }
        let course = makeCourse()
        let cache = InMemoryCourseCache()
        let online = CourseRepository(provider: FlakyProvider(course: course, online: true), cache: cache)
        _ = try await online.course(id: course.id) // Prefetch vor der Runde
        let offline = CourseRepository(provider: FlakyProvider(course: course, online: false), cache: cache)
        let loaded = try await offline.course(id: course.id)
        XCTAssertEqual(loaded, course)
        let all = try await offline.allCourses()
        XCTAssertEqual(all.map(\.id), [course.id])
        let available = await offline.isAvailableOffline(course.id)
        XCTAssertTrue(available)
    }

    func makeCourse(holeCount: Int = 18, withHoleData: Bool = true) -> Course {
        let pars = WHSRulesTests.pars18
        let sis = WHSRulesTests.si18
        var holes: [Hole] = []
        if withHoleData {
            for i in 0..<holeCount {
                let x = Double(i) * 100
                let si: Int = holeCount == 18 ? sis[i] : i + 1
                let boxes = [TeeBox(teeID: "yellow", position: TestGeo.p(x, 0), lengthMeters: 300),
                             TeeBox(teeID: "red", position: TestGeo.p(x, 40), lengthMeters: 260)]
                holes.append(Hole(number: i + 1, par: pars[i], strokeIndex: si, teeBoxes: boxes,
                                  green: GreenGeometry(center: TestGeo.p(x, 300))))
            }
        }
        let yellow = Tee(id: "yellow", name: "Gelb", color: .yellow, ratings: [
            TeeRating(gender: .male, scope: .eighteen, par: 72, courseRating: 71.8, slopeRating: 135, status: .verified),
            TeeRating(gender: .male, scope: .front9, par: 36, courseRating: 35.8, slopeRating: 129, status: .verified),
            // hintere neun ohne Rating: wird nie aus dem 18-Loch-Rating abgeleitet
        ])
        let red = Tee(id: "red", name: "Rot", color: .red, ratings: [
            TeeRating(gender: .female, scope: .eighteen, par: 72, courseRating: 73.0, slopeRating: 128, status: .unverified),
        ])
        return Course(id: "c1", name: "Testplatz", clubName: "Testclub", city: "Teststadt", country: "DE", location: TestGeo.p(0, 0),
                      holeCount: holeCount, tees: [yellow, red], holes: holes, source: .hcpDataset)
    }

    func owner(hi: Double? = 18.0, gender: Gender = .male) -> SetupPlayer {
        SetupPlayer(kind: .owner, name: "Ich", handicapIndex: hi, gender: gender)
    }

    func testHoleSelectionsDependOnData() {
        XCTAssertEqual(RoundSetup.availableHoleSelections(for: makeCourse()), [.all18, .front9, .back9])
        XCTAssertEqual(RoundSetup.availableHoleSelections(for: makeCourse(withHoleData: false)), [.all18])
        XCTAssertEqual(RoundSetup.availableHoleSelections(for: makeCourse(holeCount: 9)), [.nine])
    }

    func testRatingIsNeverDerived() {
        let course = makeCourse()
        XCTAssertEqual(RoundSetup.rating(course: course, teeID: "yellow", gender: .male, selection: .front9)?.courseRating, 35.8)
        XCTAssertNil(RoundSetup.rating(course: course, teeID: "yellow", gender: .male, selection: .back9), "kein CR₉ = CR₁₈ / 2")
        XCTAssertNil(RoundSetup.rating(course: course, teeID: "yellow", gender: .female, selection: .all18))
    }

    func testDraftDefaultsAndHeader() {
        let course = makeCourse()
        var draft = RoundSetupDraft(course: course, owner: owner(), date: LocalDate(year: 2026, month: 6, day: 1), preferredTee: .yellow)
        XCTAssertEqual(draft.players.first?.teeID, "yellow")
        XCTAssertEqual(draft.holeSelection, .all18)
        XCTAssertTrue(RoundSetup.canStart(draft))
        let guest = SetupPlayer(kind: .guest, name: "Anna", handicapIndex: 24.0, gender: .female, teeID: "red")
        draft.players.append(guest)
        draft.format = .matchPlay
        draft.handicap.allowancePercent = 95
        let header = RoundSetup.makeHeader(from: draft, startedAt: TestGeo.fixedNow)
        XCTAssertEqual(header.format, .matchPlay)
        XCTAssertEqual(header.holes.count, 18)
        XCTAssertEqual(header.players[0].rating?.courseRating, 71.8)
        XCTAssertEqual(header.players[1].rating?.status, .unverified)
        XCTAssertEqual(header.players[1].teeName, "Rot")
        XCTAssertFalse(header.countsForHandicap)
    }

    func testIssues() {
        let course = makeCourse()
        var draft = RoundSetupDraft(course: course, owner: owner(), date: LocalDate(year: 2026, month: 6, day: 1))
        draft.format = .matchPlay
        XCTAssertTrue(RoundSetup.issues(draft).contains(.matchPlayNeedsTwoPlayers))
        XCTAssertFalse(RoundSetup.canStart(draft))
        draft.format = .strokePlay
        draft.holeSelection = .back9
        let me = draft.players[0].id
        XCTAssertTrue(RoundSetup.issues(draft).contains(.ratingMissing(me)), "hintere neun ohne Rating → Hinweis")
        XCTAssertTrue(RoundSetup.canStart(draft), "Hinweis blockiert nicht")
        draft.players.append(SetupPlayer(kind: .guest, name: " ", handicapIndex: nil, gender: .male, teeID: "yellow"))
        let issues = RoundSetup.issues(draft)
        XCTAssertTrue(issues.contains(.playerNameMissing(draft.players[1].id)))
        XCTAssertTrue(issues.contains(.handicapMissing(draft.players[1].id)))
        let noData = RoundSetupDraft(course: makeCourse(withHoleData: false), owner: owner(), date: LocalDate(year: 2026, month: 6, day: 1))
        var stableford = noData
        stableford.format = .stableford
        XCTAssertTrue(RoundSetup.issues(stableford).contains(.stablefordNeedsHoleData))
        XCTAssertEqual(RoundSetup.availableFormats(holes: RoundSetup.playedHoles(course: noData.course, selection: .all18), playerCount: 1), [.strokePlay])
    }

    func testUnverifiedRatingMustBeConfirmedToCount() {
        let course = makeCourse()
        var draft = RoundSetupDraft(course: course, owner: owner(gender: .female), date: LocalDate(year: 2026, month: 6, day: 1))
        draft.players[0].teeID = "red"
        draft.countsForHandicap = true
        XCTAssertTrue(RoundSetup.issues(draft).contains(.ratingUnverified(draft.players[0].id)))
        draft.players[0].confirmedUnverifiedRating = true
        XCTAssertFalse(RoundSetup.issues(draft).contains(.ratingUnverified(draft.players[0].id)))
        XCTAssertEqual(RoundSetup.makeHeader(from: draft, startedAt: TestGeo.fixedNow).players[0].rating?.playerConfirmed, true)
    }

    func testDemoCourseNeverCounts() {
        var course = makeCourse()
        course.source = .demo
        var draft = RoundSetupDraft(course: course, owner: owner(), date: LocalDate(year: 2026, month: 6, day: 1))
        draft.countsForHandicap = true
        XCTAssertTrue(RoundSetup.issues(draft).contains(.demoCourseNotCountable))
        XCTAssertFalse(RoundSetup.makeHeader(from: draft, startedAt: TestGeo.fixedNow).countsForHandicap)
    }

    func testCourseDerivedValues() {
        let course = makeCourse()
        XCTAssertEqual(course.par, 72)
        XCTAssertTrue(course.hasHoleData)
        XCTAssertTrue(course.hasGPSData)
        XCTAssertEqual(course.length(teeID: "yellow"), 18 * 300)
        XCTAssertEqual(course.length(teeID: "yellow", holes: [1, 2]), 600)
        XCTAssertNil(course.length(teeID: "blue"))
        let empty = makeCourse(withHoleData: false)
        XCTAssertEqual(empty.par, 72, "Par aus dem Rating, wenn Lochdaten fehlen")
        XCTAssertFalse(empty.hasGPSData)
    }
}
