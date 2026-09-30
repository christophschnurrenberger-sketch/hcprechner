import XCTest
@testable import HCPGolfKit

/// Dieselben Testwerte wie `tests/gps/*.test.ts` (Datei `Resources/gps-vectors.json` ist eine Kopie von
/// `tests/fixtures/gps-vectors.json`; ein Vitest-Test stellt sicher, dass beide identisch bleiben).
final class HCPGolfKitTests: XCTestCase {
    private func vectors() throws -> [String: Any] {
        let url = try XCTUnwrap(Bundle.module.url(forResource: "gps-vectors", withExtension: "json"))
        return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
    }

    private func point(_ any: Any?) throws -> GeoPoint {
        let d = try XCTUnwrap(any as? [String: Any])
        return GeoPoint(latitude: try XCTUnwrap(d["latitude"] as? Double), longitude: try XCTUnwrap(d["longitude"] as? Double))
    }

    // MARK: DistanceEngine

    func testDistancesMatchGeographicLib() throws {
        let v = try vectors()
        let tolerance = try XCTUnwrap(v["toleranceMeters"] as? Double)
        for case let item as [String: Any] in try XCTUnwrap(v["distances"] as? [Any]) {
            let name = item["name"] as? String ?? "?"
            let a = try point(item["a"])
            let b = try point(item["b"])
            let expected = try XCTUnwrap((item["meters"] as? NSNumber)?.doubleValue)
            let actual = try DistanceEngine.calculateDistance(a, b)
            XCTAssertLessThan(abs(actual - expected), tolerance, name)
        }
    }

    func testInvalidCoordinatesAreRejected() {
        XCTAssertThrowsError(try DistanceEngine.calculateDistance(GeoPoint(latitude: 999, longitude: 10), GeoPoint(latitude: 47.94, longitude: 10.31)))
        XCTAssertThrowsError(try DistanceEngine.calculateDistance(GeoPoint(latitude: 47.94, longitude: 10.31), GeoPoint(latitude: 47, longitude: 181)))
    }

    func testMissingGreenGivesNoDistance() {
        let r = DistanceEngine.greenDistances(GeoPoint(latitude: 47.94, longitude: 10.31), GreenGeo(front: nil, center: nil, back: nil))
        XCTAssertNil(r.center)
        XCTAssertNil(DistanceFormat.rounded(meters: nil, accuracy: 5, unit: .meters).value)
    }

    func testRoundingAndUnits() throws {
        for case let item as [String: Any] in try XCTUnwrap(try vectors()["format"] as? [Any]) {
            let meters = (item["meters"] as? NSNumber)?.doubleValue
            let accuracy = (item["accuracy"] as? NSNumber)?.doubleValue
            let unit: DistanceFormat.Unit = (item["unit"] as? String) == "YD" ? .yards : .meters
            let text = try XCTUnwrap(item["text"] as? String)
            let r = DistanceFormat.rounded(meters: meters, accuracy: accuracy, unit: unit)
            // erwartete Zahl aus dem Anzeigetext („≈ 150 m“, „> 1.500 m“, „— m“)
            let digits = text.filter(\.isNumber)
            XCTAssertEqual(r.value.map(String.init), digits.isEmpty ? nil : digits, text)
            XCTAssertEqual(r.approx, text.hasPrefix("≈"), text)
            XCTAssertEqual(r.far, text.hasPrefix(">"), text)
        }
    }

    func testFilterIgnoresSingleJumpAndConfirmsRelocation() {
        let f = PositionFilter()
        let start = Date(timeIntervalSince1970: 1_760_000_000)
        let p = GeoPoint(latitude: 47.94, longitude: 10.31)
        func north(_ m: Double) -> GeoPoint { GeoPoint(latitude: 47.94 + m / 111_195, longitude: 10.31) }
        f.push(LocationFix(point: p, accuracy: 4, timestamp: start))
        XCTAssertEqual(f.push(LocationFix(point: north(35), accuracy: 4, timestamp: start + 1)).verdict, .pendingJump)
        XCTAssertEqual(f.push(LocationFix(point: north(1), accuracy: 4, timestamp: start + 2)).verdict, .accepted)
        XCTAssertEqual(f.push(LocationFix(point: north(60), accuracy: 4, timestamp: start + 3)).verdict, .pendingJump)
        XCTAssertEqual(f.push(LocationFix(point: north(62), accuracy: 4, timestamp: start + 4)).verdict, .reset)
    }

    // MARK: Watch-Protokoll

    func testWatchDisplayVectors() throws {
        let origin = Date(timeIntervalSinceReferenceDate: 0)
        for case let item as [String: Any] in try XCTUnwrap(try vectors()["watch"] as? [Any]) {
            let name = item["name"] as? String ?? "?"
            var receiver = WatchReceiver()
            for case let m as [String: Any] in try XCTUnwrap(item["messages"] as? [Any]) {
                let at = origin + (try XCTUnwrap((m["atMs"] as? NSNumber)?.doubleValue)) / 1000
                let message = try XCTUnwrap(WatchMessage(json: try XCTUnwrap(m["message"] as? [String: Any])), name)
                receiver.receive(message, at: at)
            }
            let now = origin + (try XCTUnwrap((item["nowMs"] as? NSNumber)?.doubleValue)) / 1000
            let d = WatchDisplay.make(receiver, now: now)
            let e = try XCTUnwrap(item["expected"] as? [String: Any])
            XCTAssertEqual(d.kind.rawValue, e["kind"] as? String, name)
            XCTAssertEqual(d.hole, e["hole"] as? String, name)
            XCTAssertEqual(d.par, e["par"] as? String, name)
            XCTAssertEqual(d.distance, e["distance"] as? String, name)
            XCTAssertEqual(d.approx, e["approx"] as? Bool, name)
            XCTAssertEqual(d.target, e["target"] as? String, name)
            XCTAssertEqual(d.gps, e["gps"] as? String, name)
            XCTAssertEqual(d.age, e["age"] as? String, name)
            XCTAssertEqual(d.notice, e["notice"] as? String, name)
            XCTAssertEqual(d.dim, e["dim"] as? Bool, name)
            let rows = (e["rows"] as? [[String: Any]] ?? []).map { WatchDisplay.Row(label: $0["label"] as? String ?? "", value: $0["value"] as? String, primary: $0["primary"] as? Bool ?? false) }
            XCTAssertEqual(d.rows, rows, name)
            XCTAssertNotEqual(d.distance, "0", name)
        }
    }

    func testSyncSendsOnlyChangesAndHeartbeat() throws {
        var clock = Date(timeIntervalSince1970: 1_760_000_000)
        var sent: [WatchMessage] = []
        var receiver = WatchReceiver()
        let sync = WatchSync(send: { m in
            sent.append(m)
            receiver.receive(m, at: clock)
        }, now: { clock })
        var state = WatchState()
        state.roundActive = true
        state.hole = 7
        state.par = 4
        state.distance = 151
        state.status = .ok
        state.gpsAccuracy = 5
        state.timestamp = 1_760_000_000
        sync.update(state)
        XCTAssertEqual(sent.last?.kind, .state)
        XCTAssertEqual(WatchDisplay.make(receiver, now: clock).distance, "151")

        clock += 1
        state.distance = 148
        state.timestamp = 1_760_000_001
        sync.update(state)
        XCTAssertEqual(sent.last?.kind, .patch)
        XCTAssertEqual(Set(sent.last?.data?.keys.map { $0 } ?? []), ["distance", "timestamp"])
        XCTAssertEqual(WatchDisplay.make(receiver, now: clock).distance, "148")
        XCTAssertNil(sync.update(state), "ohne Änderung keine Nachricht")

        clock += 6
        XCTAssertEqual(sync.heartbeat()?.kind, .heartbeat)

        // Verbindung verloren: 16 s nichts empfangen
        let lost = WatchDisplay.make(receiver, now: clock + 16)
        XCTAssertEqual(lost.kind, .connectionLost)
        XCTAssertEqual(lost.notice, "Verbindung verloren")
    }

    func testHoleChangeNeverShowsPreviousDistance() {
        var s1 = WatchState()
        s1.roundActive = true
        s1.hole = 7
        s1.distance = 151
        s1.status = .ok
        var s2 = s1
        s2.hole = 8
        s2.distance = nil
        let diff = WatchSync.diff(s1, s2) ?? [:]
        XCTAssertTrue(diff["distance"] is NSNull)
        XCTAssertTrue(diff["timestamp"] is NSNull)
    }
}
