import XCTest
import HCPGolfKit
@testable import GolfCore

final class GPSAndDetectionTests: XCTestCase {
    func testQualityClasses() {
        XCTAssertEqual(GPSQuality.classify(accuracy: 3), .excellent)
        XCTAssertEqual(GPSQuality.classify(accuracy: 8), .good)
        XCTAssertEqual(GPSQuality.classify(accuracy: 25), .weak)
        XCTAssertEqual(GPSQuality.classify(accuracy: nil), .unavailable)
        XCTAssertEqual(GPSQuality.classify(accuracy: -1), .unavailable)
    }

    func testTrackerUsesLastReliablePositionAndExpires() {
        let tracker = PositionTracker()
        let t0 = TestGeo.fixedNow
        XCTAssertTrue(tracker.push(LocationFix(point: TestGeo.p(0, 0), accuracy: 4, timestamp: t0)))
        // sehr ungenaue Messung wird verworfen, die letzte zuverlässige Position bleibt
        XCTAssertFalse(tracker.push(LocationFix(point: TestGeo.p(0, 80), accuracy: 150, timestamp: t0.addingTimeInterval(2))))
        let pos = tracker.position(at: t0.addingTimeInterval(3))!
        XCTAssertEqual(pos.quality, .excellent)
        XCTAssertTrue(pos.lastFixRejected)
        XCTAssertEqual(Geodesy.distance(pos.point, TestGeo.p(0, 0)), 0, accuracy: 0.01)
        XCTAssertEqual(tracker.position(at: t0.addingTimeInterval(30))?.quality, .stale)
        XCTAssertNil(tracker.position(at: t0.addingTimeInterval(61)), "nach 60 s keine Position mehr")
    }

    func testSingleGPSJumpIsIgnored() {
        let tracker = PositionTracker()
        let t0 = TestGeo.fixedNow
        tracker.push(LocationFix(point: TestGeo.p(0, 0), accuracy: 5, timestamp: t0))
        tracker.push(LocationFix(point: TestGeo.p(0, 300), accuracy: 5, timestamp: t0.addingTimeInterval(1))) // Sprung
        let pos = tracker.position(at: t0.addingTimeInterval(1))!
        XCTAssertLessThan(Geodesy.distance(pos.point, TestGeo.p(0, 0)), 1)
    }

    func testStabilizerDoesNotFlicker() {
        var s = DistanceStabilizer()
        XCTAssertEqual(s.update(meters: 131.4, accuracy: 4).value, 131)
        XCTAssertEqual(s.update(meters: 131.6, accuracy: 4).value, 131, "kleine Schwankung → gleiche Zahl")
        XCTAssertEqual(s.update(meters: 131.45, accuracy: 4).value, 131)
        XCTAssertEqual(s.update(meters: 131.8, accuracy: 4).value, 132, "deutliche Änderung wird angezeigt")
        XCTAssertEqual(s.update(meters: 131.4, accuracy: 4).value, 132)
        XCTAssertEqual(s.update(meters: 130.9, accuracy: 4).value, 131)
        let weak = s.update(meters: 147, accuracy: 25)
        XCTAssertEqual(weak.value, 145, "bei ±25 m in 5-m-Schritten")
        XCTAssertTrue(weak.approx)
        XCTAssertNil(s.update(meters: nil, accuracy: 4).value, "nie 0, sondern keine Zahl")
        XCTAssertTrue(s.update(meters: 2000, accuracy: 4).far)
    }

    // MARK: Automatischer Lochwechsel

    /// Zwei Löcher nebeneinander: Loch 1 nach Norden (Grün bei 0/350), Abschlag 2 direkt neben dem Grün (40/350).
    func context() -> HoleDetectionContext {
        let h1 = TestGeo.straightHole(number: 1, length: 350)
        var h2 = TestGeo.straightHole(number: 2, length: 300, eastOffset: 40)
        h2.teeBoxes = [TeeBox(teeID: "yellow", position: TestGeo.p(40, 360), lengthMeters: 300)]
        let h3 = TestGeo.straightHole(number: 3, length: 300, eastOffset: 400)
        return HoleDetectionContext(holes: [1, 2, 3], teePositions: [1: [TestGeo.p(0, 0)], 2: [TestGeo.p(40, 360)], 3: [TestGeo.p(400, 0)]],
                                    greens: [1: h1.green!, 2: h2.green!, 3: h3.green!])
    }

    func position(_ e: Double, _ n: Double, accuracy: Double = 5, at t: Date) -> PlayerPosition {
        PlayerPosition(point: TestGeo.p(e, n), accuracy: accuracy, timestamp: t, quality: GPSQuality.classify(accuracy: accuracy),
                       isStale: false, lastFixRejected: false)
    }

    /// Spieler geht vom Grün 1 zum Abschlag 2 und bleibt dort; liefert die erste Entscheidung ungleich `.none`.
    func walkToNextTee(_ detector: inout HoleDetector, scored: Bool, mode: AutoHoleChangeMode = .automatic,
                       accuracy: Double = 5, start: Date = TestGeo.fixedNow) -> (HoleDetectionDecision, TimeInterval) {
        var t = start
        // auf dem Grün putten
        for _ in 0..<5 {
            _ = detector.process(position: position(0, 352, at: t), currentHole: 1, currentHoleScored: scored, mode: mode, now: t)
            t += 5
        }
        // zum nächsten Abschlag und dort warten
        for step in 0..<12 {
            let decision = detector.process(position: position(min(40, Double(step) * 10), 360, accuracy: accuracy, at: t),
                                            currentHole: 1, currentHoleScored: scored, mode: mode, now: t)
            if decision != .none { return (decision, t.timeIntervalSince(start)) }
            t += 5
        }
        return (.none, t.timeIntervalSince(start))
    }

    func testAdvancesAutomaticallyOnlyWhenConfident() {
        var detector = HoleDetector(context: context())
        let (decision, elapsed) = walkToNextTee(&detector, scored: true)
        XCTAssertEqual(decision, .advance(to: 2))
        XCTAssertGreaterThanOrEqual(elapsed, 25 + 12, "erst nach Verweildauer am Abschlag")
    }

    func testNoChangeWhileStillOnGreenNextToTee() {
        var detector = HoleDetector(context: context())
        var t = TestGeo.fixedNow
        for _ in 0..<20 {
            // Abschlag 2 liegt 40 m entfernt, Spieler steht am Grünrand (12 m von der Mitte)
            XCTAssertEqual(detector.process(position: position(12, 350, at: t), currentHole: 1, currentHoleScored: true, mode: .automatic, now: t), .none)
            t += 5
        }
    }

    func testAsksWhenScoreMissingAndOnlyOnce() {
        var detector = HoleDetector(context: context())
        let (decision, _) = walkToNextTee(&detector, scored: false)
        XCTAssertEqual(decision, .suggest(to: 2, reason: .scoreMissing))
        // weiter am Abschlag: keine erneute Frage
        var t = TestGeo.fixedNow.addingTimeInterval(200)
        for _ in 0..<10 {
            XCTAssertEqual(detector.process(position: position(40, 360, at: t), currentHole: 1, currentHoleScored: false, mode: .automatic, now: t), .none)
            t += 5
        }
    }

    func testNoSuggestionWithoutScoreIfGreenNeverVisited() {
        var detector = HoleDetector(context: context())
        var t = TestGeo.fixedNow
        // Spieler läuft von Abschlag 1 nach rechts zum Abschlag 2 (z. B. Ball verzogen), ohne am Grün gewesen zu sein
        for _ in 0..<12 {
            XCTAssertEqual(detector.process(position: position(40, 360, at: t), currentHole: 1, currentHoleScored: false, mode: .automatic, now: t), .none)
            t += 5
        }
    }

    func testWeakGPSNeverChangesHole() {
        var detector = HoleDetector(context: context())
        let (decision, _) = walkToNextTee(&detector, scored: true, accuracy: 35)
        XCTAssertEqual(decision, .none)
    }

    func testAskModeAndOffMode() {
        var ask = HoleDetector(context: context())
        XCTAssertEqual(walkToNextTee(&ask, scored: true, mode: .ask).0, .suggest(to: 2, reason: .confirmationRequired))
        var off = HoleDetector(context: context())
        XCTAssertEqual(walkToNextTee(&off, scored: true, mode: .off).0, .none)
    }

    func testCooldownAfterManualChange() {
        var detector = HoleDetector(context: context())
        detector.noteManualChange(at: TestGeo.fixedNow)
        let (decision, _) = walkToNextTee(&detector, scored: true, start: TestGeo.fixedNow.addingTimeInterval(1))
        XCTAssertEqual(decision, .none, "innerhalb von 90 s nach manuellem Wechsel kein Vorschlag")
    }

    func testUnexpectedHoleIsOnlySuggested() {
        var detector = HoleDetector(context: context())
        var t = TestGeo.fixedNow
        var result = HoleDetectionDecision.none
        for _ in 0..<10 where result == .none {
            result = detector.process(position: position(400, 5, at: t), currentHole: 1, currentHoleScored: true, mode: .automatic, now: t)
            t += 5
        }
        XCTAssertEqual(result, .suggest(to: 3, reason: .unexpectedHole))
    }

    func testWalkingBackTowardsGreenCancels() {
        var detector = HoleDetector(context: context())
        var t = TestGeo.fixedNow
        _ = detector.process(position: position(0, 352, at: t), currentHole: 1, currentHoleScored: true, mode: .automatic, now: t)
        // am Abschlag 2 (60 m weit weg vom Grün über den äußersten Punkt), dann zurück Richtung Grün
        let path: [(Double, Double)] = [(60, 370), (60, 370), (45, 362), (30, 358), (25, 356)]
        for (e, n) in path {
            t += 6
            XCTAssertEqual(detector.process(position: position(e, n, at: t), currentHole: 1, currentHoleScored: true, mode: .automatic, now: t), .none)
        }
    }
}
