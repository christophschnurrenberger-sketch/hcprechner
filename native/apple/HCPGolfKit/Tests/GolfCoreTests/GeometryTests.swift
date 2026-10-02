import XCTest
import HCPGolfKit
@testable import GolfCore

final class GeometryTests: XCTestCase {
    func testPolygonBasics() {
        let square = [Vector2(x: 0, y: 0), Vector2(x: 10, y: 0), Vector2(x: 10, y: 10), Vector2(x: 0, y: 10)]
        XCTAssertEqual(PlanarGeometry.area(square), 100, accuracy: 1e-9)
        let c = PlanarGeometry.centroid(square)!
        XCTAssertEqual(c.x, 5, accuracy: 1e-9)
        XCTAssertEqual(c.y, 5, accuracy: 1e-9)
        XCTAssertTrue(PlanarGeometry.contains(Vector2(x: 5, y: 5), in: square))
        XCTAssertTrue(PlanarGeometry.contains(Vector2(x: 10, y: 5), in: square), "Rand gilt als innen")
        XCTAssertFalse(PlanarGeometry.contains(Vector2(x: 11, y: 5), in: square))
        let ts = PlanarGeometry.lineIntersections(origin: Vector2(x: 5, y: -10), direction: Vector2(x: 0, y: 1), ring: square)
        XCTAssertEqual(ts.count, 2)
        XCTAssertEqual(ts[0], 10, accuracy: 1e-9)
        XCTAssertEqual(ts[1], 20, accuracy: 1e-9)
        let near = PlanarGeometry.closestPoint(on: square, to: Vector2(x: 5, y: -3), closed: true)!
        XCTAssertEqual(near.y, 0, accuracy: 1e-9)
    }

    func testLocalFrameRoundTrip() {
        let p = TestGeo.p(123.4, -56.7)
        let back = TestGeo.frame.toLocal(p)
        XCTAssertEqual(back.x, 123.4, accuracy: 0.001)
        XCTAssertEqual(back.y, -56.7, accuracy: 0.001)
        // Lokale Ebene (Ellipsoid-Radien) gegen Vincenty: Millimeter statt 0,3 % in Ost-West-Richtung
        XCTAssertEqual(Geodesy.distance(TestGeo.origin, TestGeo.p(0, 400)), 400, accuracy: 0.01)
        XCTAssertEqual(Geodesy.distance(TestGeo.origin, TestGeo.p(500, 0)), 500, accuracy: 0.01)
        XCTAssertEqual(Geodesy.distance(TestGeo.origin, TestGeo.p(300, 300)), (2.0 * 300 * 300).squareRoot(), accuracy: 0.02)
    }

    func testGreenFrontCenterBackFollowLineOfPlay() {
        let green = GreenGeometry(outline: TestGeo.circle(0, 300, radius: 15), center: TestGeo.p(0, 300))
        // Spieler 150 m vor der Grünmitte (von Süden)
        let south = GreenDistanceCalculator.distances(from: TestGeo.p(0, 150), green: green)
        XCTAssertEqual(south.center!, 150, accuracy: 0.2)
        XCTAssertEqual(south.front!, 135, accuracy: 0.3)
        XCTAssertEqual(south.back!, 165, accuracy: 0.3)
        XCTAssertFalse(south.playerOnGreen)
        // Von der Seite (Westen) liegen Front/Back anders, die Grüntiefe bleibt
        let west = GreenDistanceCalculator.distances(from: TestGeo.p(-100, 300), green: green)
        XCTAssertEqual(west.front!, 85, accuracy: 0.3)
        XCTAssertEqual(west.back!, 115, accuracy: 0.3)
        // Auf dem Grün: kein Front, Back = Rand hinter der Mitte
        let on = GreenDistanceCalculator.distances(from: TestGeo.p(0, 295), green: green)
        XCTAssertTrue(on.playerOnGreen)
        XCTAssertNil(on.front)
        XCTAssertEqual(on.back!, 20, accuracy: 0.3)
    }

    func testGreenFallbackToStaticPointsAndPin() {
        let green = GreenGeometry(front: TestGeo.p(0, 288), center: TestGeo.p(0, 300), back: TestGeo.p(0, 314))
        let d = GreenDistanceCalculator.distances(from: TestGeo.p(0, 100), green: green, pin: TestGeo.p(3, 305))
        XCTAssertEqual(d.front!, 188, accuracy: 0.2)
        XCTAssertEqual(d.center!, 200, accuracy: 0.2)
        XCTAssertEqual(d.back!, 214, accuracy: 0.2)
        XCTAssertEqual(d.pin!, 205, accuracy: 0.3)
        XCTAssertEqual(GreenDistanceCalculator.distances(from: TestGeo.p(0, 0), green: nil), .none)
    }

    func testHazardDistancesReachCenterCarryAndSide() {
        let hole = TestGeo.straightHole(length: 350)
        let list = FeatureDistanceCalculator.distances(from: TestGeo.p(0, 0), features: hole.features, toward: TestGeo.p(0, 350))
        XCTAssertEqual(list.map(\.id), ["b1", "w1"], "sortiert nach Entfernung bis zum Anfang")
        let bunker = list[0]
        XCTAssertEqual(bunker.side, .left)
        // Bunker: Rechteck 200–215 m nördlich, 18–30 m westlich
        XCTAssertEqual(bunker.reach, (200.0 * 200 + 18 * 18).squareRoot(), accuracy: 0.3)
        XCTAssertEqual(bunker.carry!, (215.0 * 215 + 30 * 30).squareRoot(), accuracy: 0.3)
        XCTAssertGreaterThan(bunker.center!, bunker.reach)
        XCTAssertLessThan(bunker.center!, bunker.carry!)
        XCTAssertEqual(list[1].side, .right)
        // Vom Grün aus gesehen liegen beide Hindernisse hinter dem Spieler → nicht relevant
        let fromGreen = FeatureDistanceCalculator.distances(from: TestGeo.p(0, 320), features: hole.features, toward: TestGeo.p(0, 350))
        XCTAssertTrue(fromGreen.isEmpty)
    }

    func testPlayerInsideHazard() {
        let hole = TestGeo.straightHole(length: 350)
        let list = FeatureDistanceCalculator.distances(from: TestGeo.p(-24, 207), features: hole.features, toward: TestGeo.p(0, 350))
        let bunker = list.first { $0.id == "b1" }!
        XCTAssertTrue(bunker.playerInside)
        XCTAssertEqual(bunker.reach, 0)
    }

    func testTargetMeasurement() {
        let m = TargetMeasurement.measure(from: TestGeo.p(0, 0), to: TestGeo.p(0, 154), greenCenter: TestGeo.p(0, 300))!
        XCTAssertEqual(m.fromOrigin, 154, accuracy: 0.2)
        XCTAssertEqual(m.toGreen!, 146, accuracy: 0.2)
    }

    func testViewportPointsHoleUpAndRoundTrips() throws {
        // Loch nach Osten: auf dem Bildschirm muss das Grün trotzdem oben liegen
        let tee = TestGeo.p(0, 0)
        let green = TestGeo.p(350, 0)
        let size = Vector2(x: 390, y: 700)
        let vp = try XCTUnwrap(HoleViewport.fitting([tee, green, TestGeo.p(175, 30), TestGeo.p(175, -30)], axisFrom: tee, axisTo: green, size: size))
        let sTee = vp.screenPoint(tee)
        let sGreen = vp.screenPoint(green)
        XCTAssertEqual(sTee.x, sGreen.x, accuracy: 0.5, "Spielrichtung senkrecht")
        XCTAssertLessThan(sGreen.y, sTee.y, "Grün oben")
        XCTAssertGreaterThan(sTee.y, size.y / 2)
        // Tippen → Koordinate → Bildschirmpunkt
        let tapped = Vector2(x: 120, y: 300)
        let geo = vp.geoPoint(screen: tapped)
        let back = vp.screenPoint(geo)
        XCTAssertEqual(back.x, tapped.x, accuracy: 0.01)
        XCTAssertEqual(back.y, tapped.y, accuracy: 0.01)
        // Nordnadel: Spielrichtung Ost → Norden zeigt auf dem Bildschirm nach links (−90°)
        XCTAssertEqual(vp.northAngle, -Double.pi / 2, accuracy: 1e-6)
    }

    func testViewportZoomKeepsAnchorAndPanMovesContent() throws {
        let tee = TestGeo.p(0, 0)
        let green = TestGeo.p(0, 400)
        let vp = try XCTUnwrap(HoleViewport.fitting([tee, green], axisFrom: tee, axisTo: green, size: Vector2(x: 300, y: 600)))
        let anchor = Vector2(x: 200, y: 150)
        let under = vp.geoPoint(screen: anchor)
        let zoomed = vp.zoomed(by: 2.5, anchor: anchor)
        XCTAssertEqual(zoomed.scale, vp.scale * 2.5, accuracy: 1e-9)
        let after = zoomed.screenPoint(under)
        XCTAssertEqual(after.x, anchor.x, accuracy: 0.01)
        XCTAssertEqual(after.y, anchor.y, accuracy: 0.01)
        let panned = vp.panned(by: Vector2(x: 30, y: -40))
        let moved = panned.screenPoint(tee)
        let before = vp.screenPoint(tee)
        XCTAssertEqual(moved.x - before.x, 30, accuracy: 0.01)
        XCTAssertEqual(moved.y - before.y, -40, accuracy: 0.01)
        let focused = vp.focused(on: green, spanMeters: 40)
        XCTAssertEqual(focused.screenPoint(green).x, 150, accuracy: 0.01)
        XCTAssertEqual(focused.screenPoint(green).y, 300, accuracy: 0.01)
    }

    func testDistanceArcs() {
        XCTAssertEqual(DistanceArcs.radii(preset: [50, 100, 150, 200], distanceToTarget: 130, unit: .meters), [50, 100, 150])
        XCTAssertEqual(DistanceArcs.radii(preset: [100], distanceToTarget: nil, unit: .yards).first!, 91.44, accuracy: 1e-9)
    }
}
