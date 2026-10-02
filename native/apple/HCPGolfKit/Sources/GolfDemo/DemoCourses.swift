import Foundation
import GolfCore
import HCPGolfKit

/// Fiktive Demo-Plätze für Entwicklung und Vorführung. Lage, Geometrie und Ratings sind erfunden (Quelle `.demo`,
/// Rating-Status `.fictional`): Sie zeigen Abläufe und Rechenwege, zählen aber nie für den Handicap Index.
/// Die Koordinaten liegen in ländlicher Umgebung; ein Satellitenbild zeigt dort die echte Landschaft, nicht diese Plätze.
public enum DemoCourses {
    public static let championshipID: CourseID = "demo-championship"
    public static let academyID: CourseID = "demo-academy-9"
    public static let seeparkID: CourseID = "demo-seepark"

    static let clubLocation = GeoPoint(latitude: 47.9640, longitude: 10.4180)
    static let academyLocation = LocalFrame(origin: clubLocation).toGeo(Vector2(x: 1300, y: 0))
    static let seeparkLocation = GeoPoint(latitude: 47.7820, longitude: 10.6380)

    static let note = "Fiktiver Demo-Platz: Geometrie und Ratings sind erfunden und zählen nicht fürs Handicap."

    public static var all: [Course] { [championship, academy, seepark] }

    public static func course(id: CourseID) -> Course? { all.first { $0.id == id } }

    private static func rating(_ g: Gender, _ scope: RatingScope, _ par: Int, _ cr: Double, _ slope: Int) -> TeeRating {
        TeeRating(gender: g, scope: scope, par: par, courseRating: cr, slopeRating: slope, status: .fictional,
                  sourceNote: "fiktiver Demo-Wert")
    }

    // MARK: Meisterschaftsplatz (18 Loch, Par 72)

    public static let championship: Course = DemoCourseBuilder.build(DemoCourseSpec(
        id: championshipID,
        name: "Demo Golf Club – Meisterschaftsplatz",
        clubName: "Demo Golf Club",
        address: "Am Grün 1",
        postalCode: "87700",
        city: "Demohausen",
        region: "Schwaben",
        location: clubLocation,
        tees: [
            DemoTeeSpec(tee: Tee(id: "white", name: "Weiß", color: .white, ratings: [rating(.male, .eighteen, 72, 73.6, 134)]),
                        behindYellow: [3: 15, 4: 25, 5: 30]),
            DemoTeeSpec(tee: Tee(id: "yellow", name: "Gelb", color: .yellow, ratings: [
                rating(.male, .eighteen, 72, 71.8, 129), rating(.male, .front9, 36, 35.8, 127), rating(.male, .back9, 36, 36.0, 131),
            ]), behindYellow: [3: 0, 4: 0, 5: 0]),
            DemoTeeSpec(tee: Tee(id: "blue", name: "Blau", color: .blue, ratings: [rating(.female, .eighteen, 72, 75.2, 132)]),
                        behindYellow: [3: -10, 4: -18, 5: -22]),
            DemoTeeSpec(tee: Tee(id: "red", name: "Rot", color: .red, ratings: [
                rating(.female, .eighteen, 72, 73.4, 128), rating(.female, .front9, 36, 36.6, 126), rating(.female, .back9, 36, 36.8, 130),
            ]), behindYellow: [3: -20, 4: -40, 5: -50]),
        ],
        loops: [
            DemoLoop(ring: RingLayout(minX: 0, minY: 60, width: 1100, height: 913, chamfer: 150, clockwise: true, startFromBottom: 160), holes: [
                DemoHoleSpec(4, si: 5, 355, [.fairwayBunker(at: 225, side: 1), .greenBunker(angle: -40), .greenBunker(angle: 50)]),
                DemoHoleSpec(5, si: 9, 470, [.fairwayBunker(at: 235, side: -1), .creek(at: 330), .greenBunker(angle: 30), .greenBunker(angle: -70)]),
                DemoHoleSpec(3, si: 15, 160, [.greenBunker(angle: -30), .greenBunker(angle: 35), .greenBunker(angle: 180)]),
                DemoHoleSpec(4, si: 1, 385, [.fairwayBunker(at: 215, side: -1), .fairwayBunker(at: 250, side: 1), .greenBunker(angle: 0), .greenBunker(angle: 80)]),
                DemoHoleSpec(4, si: 11, 345, [.pond(at: 260, offset: 38, length: 45, width: 28), .greenBunker(angle: -50)]),
                DemoHoleSpec(3, si: 17, 150, [.frontWater, .greenBunker(angle: 70)]),
                DemoHoleSpec(4, si: 3, 390, [.fairwayBunker(at: 230, side: 1), .greenBunker(angle: -35), .greenBunker(angle: 40)]),
                DemoHoleSpec(4, si: 13, 330, [.fairwayBunker(at: 200, side: -1), .trees(at: 150, offset: 32, radius: 12), .greenBunker(angle: -60)]),
                DemoHoleSpec(5, si: 7, 470, [.fairwayBunker(at: 240, side: 1), .fairwayBunker(at: 360, side: -1), .greenBunker(angle: -30), .greenBunker(angle: 30)]),
            ]),
            DemoLoop(ring: RingLayout(minX: 0, minY: -998, width: 1100, height: 938, chamfer: 150, clockwise: false, startFromBottom: 778), holes: [
                DemoHoleSpec(4, si: 6, 365, [.fairwayBunker(at: 220, side: -1), .greenBunker(angle: 40), .greenBunker(angle: -45)]),
                DemoHoleSpec(3, si: 16, 170, [.greenBunker(angle: -20), .greenBunker(angle: 60)]),
                DemoHoleSpec(5, si: 10, 485, [.pond(at: 300, offset: -30, length: 60, width: 30), .fairwayBunker(at: 240, side: 1), .greenBunker(angle: 20)]),
                DemoHoleSpec(4, si: 2, 350, [.fairwayBunker(at: 215, side: 1), .greenBunker(angle: -40), .greenBunker(angle: 45)]),
                DemoHoleSpec(4, si: 4, 395, [.creek(at: 285), .greenBunker(angle: 0)]),
                DemoHoleSpec(3, si: 18, 140, [.greenBunker(angle: -60), .greenBunker(angle: 60), .greenBunker(angle: 180)]),
                DemoHoleSpec(4, si: 12, 365, [.fairwayBunker(at: 225, side: -1), .greenBunker(angle: 35)]),
                DemoHoleSpec(5, si: 8, 460, [.fairwayBunker(at: 250, side: -1), .fairwayBunker(at: 255, side: 1), .greenBunker(angle: -30)]),
                DemoHoleSpec(4, si: 14, 375, [.pond(at: 250, offset: 35, length: 50, width: 30), .greenBunker(angle: -45), .greenBunker(angle: 45)]),
            ]),
        ],
        seed: 0x00C0_FFEE_2026,
        baseElevation: 640,
        note: note
    ))

    // MARK: Kurzplatz (9 Loch, Par 31)

    public static let academy: Course = DemoCourseBuilder.build(DemoCourseSpec(
        id: academyID,
        name: "Demo Golf Club – Kurzplatz",
        clubName: "Demo Golf Club",
        address: "Am Grün 1",
        postalCode: "87700",
        city: "Demohausen",
        region: "Schwaben",
        location: academyLocation,
        tees: [
            DemoTeeSpec(tee: Tee(id: "yellow", name: "Gelb", color: .yellow, ratings: [rating(.male, .front9, 31, 30.6, 102)]),
                        behindYellow: [3: 0, 4: 0]),
            DemoTeeSpec(tee: Tee(id: "red", name: "Rot", color: .red, ratings: [rating(.female, .front9, 31, 31.4, 106)]),
                        behindYellow: [3: -15, 4: -30]),
        ],
        loops: [
            DemoLoop(ring: RingLayout(minX: 30, minY: -250, width: 700, height: 532, chamfer: 100, clockwise: true, startFromBottom: 260), holes: [
                DemoHoleSpec(3, si: 8, 135, [.greenBunker(angle: -40)]),
                DemoHoleSpec(4, si: 3, 285, [.fairwayBunker(at: 190, side: 1), .greenBunker(angle: 30)]),
                DemoHoleSpec(3, si: 6, 150, [.greenBunker(angle: 45), .greenBunker(angle: -45)]),
                DemoHoleSpec(4, si: 1, 310, [.pond(at: 200, offset: -28, length: 40, width: 22), .greenBunker(angle: 0)]),
                DemoHoleSpec(3, si: 9, 120, [.greenBunker(angle: 90)]),
                DemoHoleSpec(3, si: 5, 165, [.frontWater]),
                DemoHoleSpec(4, si: 2, 295, [.fairwayBunker(at: 200, side: -1), .greenBunker(angle: 40)]),
                DemoHoleSpec(3, si: 7, 140, [.greenBunker(angle: -30), .greenBunker(angle: 30)]),
                DemoHoleSpec(4, si: 4, 270, [.greenBunker(angle: -50)]),
            ]),
        ],
        seed: 0x0009_0009_2026,
        baseElevation: 655,
        note: note
    ))

    // MARK: Seepark (18 Loch, Par 70, viel Wasser)

    public static let seepark: Course = DemoCourseBuilder.build(DemoCourseSpec(
        id: seeparkID,
        name: "Seepark Golf (Demo)",
        clubName: "Golfpark am See (Demo)",
        address: "Seeweg 8",
        postalCode: "87600",
        city: "Seedorf",
        region: "Schwaben",
        location: seeparkLocation,
        tees: [
            DemoTeeSpec(tee: Tee(id: "white", name: "Weiß", color: .white, ratings: [rating(.male, .eighteen, 70, 71.4, 130)]),
                        behindYellow: [3: 15, 4: 25, 5: 30]),
            DemoTeeSpec(tee: Tee(id: "yellow", name: "Gelb", color: .yellow, ratings: [
                rating(.male, .eighteen, 70, 69.9, 126), rating(.male, .front9, 35, 34.9, 124), rating(.male, .back9, 35, 35.0, 128),
            ]), behindYellow: [3: 0, 4: 0, 5: 0]),
            DemoTeeSpec(tee: Tee(id: "red", name: "Rot", color: .red, ratings: [rating(.female, .eighteen, 70, 71.8, 124)]),
                        behindYellow: [3: -20, 4: -40, 5: -50]),
        ],
        loops: [
            DemoLoop(ring: RingLayout(minX: 0, minY: 60, width: 1050, height: 850, chamfer: 150, clockwise: true, startFromBottom: 160), holes: [
                DemoHoleSpec(4, si: 7, 340, [.greenBunker(angle: -40)]),
                DemoHoleSpec(4, si: 3, 365, [.fairwayBunker(at: 225, side: 1), .greenBunker(angle: 40)]),
                DemoHoleSpec(3, si: 17, 145, [.frontWater, .greenBunker(angle: 70)]),
                DemoHoleSpec(4, si: 9, 320, [.pond(at: 230, offset: -30, length: 40, width: 25), .greenBunker(angle: -30)]),
                DemoHoleSpec(5, si: 1, 455, [.creek(at: 280), .fairwayBunker(at: 230, side: 1), .greenBunker(angle: 30), .greenBunker(angle: -30)]),
                DemoHoleSpec(3, si: 15, 175, [.greenBunker(angle: -45), .greenBunker(angle: 45)]),
                DemoHoleSpec(4, si: 5, 355, [.fairwayBunker(at: 220, side: -1), .greenBunker(angle: 0)]),
                DemoHoleSpec(4, si: 13, 300, [.pond(at: 190, offset: 28, length: 35, width: 25)]),
                DemoHoleSpec(4, si: 11, 380, [.fairwayBunker(at: 235, side: 1), .greenBunker(angle: -40), .greenBunker(angle: 40)]),
            ], lake: true),
            DemoLoop(ring: RingLayout(minX: 0, minY: -910, width: 1050, height: 850, chamfer: 150, clockwise: false, startFromBottom: 690), holes: [
                DemoHoleSpec(4, si: 8, 350, [.greenBunker(angle: 45)]),
                DemoHoleSpec(3, si: 16, 160, [.frontWater]),
                DemoHoleSpec(4, si: 4, 330, [.fairwayBunker(at: 210, side: -1), .greenBunker(angle: 30)]),
                DemoHoleSpec(4, si: 6, 375, [.creek(at: 250), .greenBunker(angle: -30)]),
                DemoHoleSpec(5, si: 2, 470, [.fairwayBunker(at: 240, side: 1), .pond(at: 380, offset: -30, length: 45, width: 25), .greenBunker(angle: 30)]),
                DemoHoleSpec(3, si: 18, 135, [.frontWater, .greenBunker(angle: 180)]),
                DemoHoleSpec(4, si: 10, 345, [.fairwayBunker(at: 225, side: 1), .greenBunker(angle: -40)]),
                DemoHoleSpec(4, si: 14, 310, [.pond(at: 200, offset: 30, length: 40, width: 22)]),
                DemoHoleSpec(4, si: 12, 360, [.fairwayBunker(at: 230, side: -1), .greenBunker(angle: -30), .greenBunker(angle: 30)]),
            ], lake: true),
        ],
        seed: 0x5EE0_A4C0_2026,
        baseElevation: 720,
        note: note
    ))
}
