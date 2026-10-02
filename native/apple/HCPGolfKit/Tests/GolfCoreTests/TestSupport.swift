import Foundation
import HCPGolfKit
@testable import GolfCore

/// Synthetische Geometrie für Tests: Punkte in Metern Ost/Nord um einen festen Ursprung.
enum TestGeo {
    static let origin = GeoPoint(latitude: 47.95, longitude: 10.30)
    static let frame = LocalFrame(origin: origin)

    static func p(_ east: Double, _ north: Double) -> GeoPoint {
        frame.toGeo(Vector2(x: east, y: north))
    }

    static func circle(_ east: Double, _ north: Double, radius: Double, points n: Int = 36) -> GeoPolygon {
        GeoPolygon((0..<n).map { i in
            let a = Double(i) / Double(n) * 2 * Double.pi
            return p(east + radius * cos(a), north + radius * sin(a))
        })
    }

    static func rect(_ e1: Double, _ n1: Double, _ e2: Double, _ n2: Double) -> GeoPolygon {
        GeoPolygon([p(e1, n1), p(e2, n1), p(e2, n2), p(e1, n2)])
    }

    /// Gerades Loch nach Norden: Abschlag (0,0), Grünmitte (0, length), Grün als Kreis mit Radius 15 m.
    static func straightHole(number: Int = 1, par: Int = 4, strokeIndex: Int = 1, length: Double = 350, eastOffset: Double = 0) -> Hole {
        Hole(
            number: number, par: par, strokeIndex: strokeIndex,
            teeBoxes: [TeeBox(teeID: "yellow", position: p(eastOffset, 0), lengthMeters: Int(length))],
            green: GreenGeometry(outline: circle(eastOffset, length, radius: 15), center: p(eastOffset, length)),
            fairways: [rect(eastOffset - 15, 100, eastOffset + 15, length - 30)],
            lineOfPlay: [p(eastOffset, 0), p(eastOffset, length)],
            features: [
                HoleFeature(id: "b\(number)", kind: .bunker, name: nil, side: .left,
                            geometry: .polygon(rect(eastOffset - 30, 200, eastOffset - 18, 215))),
                HoleFeature(id: "w\(number)", kind: .water, name: nil, side: .right,
                            geometry: .polygon(rect(eastOffset + 20, 250, eastOffset + 60, 280))),
            ]
        )
    }

    static func header(holes: [PlayedHole], players: [RoundPlayer], format: GameFormat = .strokePlay,
                       handicap: HandicapSettings = HandicapSettings(), scoring: ScoringMode = .full,
                       selection: HoleSelection = .all18, source: CourseDataSource = .hcpDataset, counts: Bool = true) -> RoundHeader {
        RoundHeader(courseID: "test", courseName: "Testplatz", clubName: "Testclub", courseSource: source,
                    date: LocalDate(year: 2026, month: 5, day: 1), startedAt: Date(timeIntervalSince1970: 1_777_000_000),
                    holeSelection: selection, holes: holes, format: format, handicap: handicap, scoring: scoring,
                    privacy: .private, players: players, countsForHandicap: counts)
    }

    static func holes18() -> [PlayedHole] {
        WHSRulesTests.pars18.indices.map { PlayedHole(number: $0 + 1, par: WHSRulesTests.pars18[$0], strokeIndex: WHSRulesTests.si18[$0]) }
    }

    static let fixedNow = Date(timeIntervalSince1970: 1_777_000_000)
}
