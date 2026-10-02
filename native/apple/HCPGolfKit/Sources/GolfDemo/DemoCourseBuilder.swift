import Foundation
import GolfCore
import HCPGolfKit

/// Hindernis-Vorlage relativ zur Spiellinie eines Lochs.
enum DemoHazard {
    /// Fairwaybunker: `at` Meter vom gelben Abschlag, `side` +1 rechts / −1 links (am Fairwayrand)
    case fairwayBunker(at: Double, side: Double)
    /// Grünbunker: Winkel zur Spielrichtung (0 = vorne, 90 = rechts, −90 = links, 180 = hinten)
    case greenBunker(angle: Double)
    /// Teich: Mitte `at` Meter vom gelben Abschlag, seitlicher Versatz in Metern (+ rechts)
    case pond(at: Double, offset: Double, length: Double, width: Double)
    /// Wasser direkt vor dem Grün (z. B. Par 3 über Wasser)
    case frontWater
    /// Bach quer zur Spielbahn, `at` Meter vom gelben Abschlag
    case creek(at: Double)
    /// Baumgruppe
    case trees(at: Double, offset: Double, radius: Double)
}

struct DemoHoleSpec {
    var par: Int
    var strokeIndex: Int
    /// Länge vom gelben Abschlag bis Grünmitte (m)
    var length: Double
    var hazards: [DemoHazard]

    init(_ par: Int, si: Int, _ length: Double, _ hazards: [DemoHazard] = []) {
        self.par = par
        self.strokeIndex = si
        self.length = length
        self.hazards = hazards
    }
}

struct DemoTeeSpec {
    var tee: Tee
    /// Abstand hinter dem gelben Abschlag je Par (negativ = davor)
    var behindYellow: [Int: Double]
}

struct DemoLoop {
    var ring: RingLayout
    var holes: [DemoHoleSpec]
    /// See im Inneren der Schleife (Seepark)
    var lake: Bool = false
}

struct DemoCourseSpec {
    var id: CourseID
    var name: String
    var clubName: String
    var address: String
    var postalCode: String
    var city: String
    var region: String
    var location: GeoPoint
    var tees: [DemoTeeSpec]
    var loops: [DemoLoop]
    var seed: UInt64
    var baseElevation: Double
    var note: String
}

/// Erzeugt einen fiktiven Platz mit realistischer Lochgeometrie: Abschläge je Tee, Spiellinie mit Doglegs, Fairway,
/// Grün (Fläche, Front/Mitte/Back, Fahne), Fairway- und Grünbunker, Wasser, Aus-Grenze, Bäume, Layup-/Dogleg-Ziele.
enum DemoCourseBuilder {
    static func build(_ spec: DemoCourseSpec) -> Course {
        var rng = DemoRandom(seed: spec.seed)
        let frame = LocalFrame(origin: spec.location)
        var holes: [Hole] = []
        var number = 1
        let whiteBehind = { (par: Int) -> Double in spec.tees.map { $0.behindYellow[par] ?? 0 }.max() ?? 0 }

        for loop in spec.loops {
            let path = loop.ring.path
            let occupied = loop.holes.reduce(0.0) { $0 + whiteBehind($1.par) + $1.length }
            let walk = (path.length - occupied) / Double(loop.holes.count)
            var s = walk / 2
            let lake = loop.lake ? lakePolygon(loop.ring) : nil
            for hs in loop.holes {
                let behind = whiteBehind(hs.par)
                let total = behind + hs.length
                var line = path.subpath(from: s, to: s + total)
                line = straightenIfNeeded(line)
                // seitlicher Versatz für gerade Löcher (Abwechslung, keine perfekte Flucht)
                if line.count == 2 {
                    let shift = rng.range(-10, 10)
                    let n = Polyline(line).rightNormal(at: 0)
                    line = line.map { $0 + n * shift }
                }
                holes.append(makeHole(number: number, spec: hs, line: Polyline(line), behind: behind, tees: spec.tees,
                                      outsideSign: -loop.ring.insideSign, lake: lake, courseID: spec.id,
                                      baseElevation: spec.baseElevation, rng: &rng, frame: frame))
                s += total + walk
                number += 1
            }
        }

        return Course(
            id: spec.id, name: spec.name, clubName: spec.clubName, address: spec.address, postalCode: spec.postalCode,
            city: spec.city, region: spec.region, country: "DE", location: spec.location, timeZoneIdentifier: "Europe/Berlin",
            imageURL: nil, website: nil, holeCount: holes.count, tees: spec.tees.map(\.tee), holes: holes, source: .demo,
            dataNote: spec.note, updatedAt: nil
        )
    }

    /// Ecken direkt hinter dem Abschlag oder kurz vor dem Grün sähen unnatürlich aus und entfallen (die Linie läuft
    /// dort gerade); Ecken im Mittelteil bleiben als Dogleg erhalten (zwei Ecken = Doppel-Dogleg).
    static func straightenIfNeeded(_ points: [Vector2]) -> [Vector2] {
        guard points.count > 2 else { return points }
        let poly = Polyline(points)
        let length = poly.length
        var out = [points[0]]
        for i in 1..<(points.count - 1) {
            let at = poly.cumulative[i]
            if at >= length * 0.15 && at <= length * 0.88 { out.append(points[i]) }
        }
        out.append(points[points.count - 1])
        return out
    }

    static func lakePolygon(_ ring: RingLayout) -> [Vector2] {
        let center = Vector2(x: ring.minX + ring.width / 2, y: ring.minY + ring.height / 2)
        return DemoShapes.blob(center: center, along: Vector2(x: 1, y: 0), semiLength: ring.width / 2 - 95,
                               semiWidth: ring.height / 2 - 95, points: 40, wobble: 0.05, phase: 0.7)
    }

    // swiftlint:disable:next function_parameter_count
    static func makeHole(number n: Int, spec hs: DemoHoleSpec, line: Polyline, behind: Double, tees: [DemoTeeSpec],
                         outsideSign: Double, lake: [Vector2]?, courseID: CourseID, baseElevation: Double,
                         rng: inout DemoRandom, frame: LocalFrame) -> Hole {
        let length = line.length
        let yellowAt = behind // Abstand des gelben Abschlags vom Linienanfang
        let green = line.points.last!
        let approach = line.direction(at: length - 1)
        let side = Vector2(x: approach.y, y: -approach.x) // rechts der Spielrichtung
        let id = { (suffix: String) in "\(courseID)-h\(n)-\(suffix)" }
        func geo(_ v: Vector2) -> GeoPoint { frame.toGeo(v) }
        func at(_ fromYellow: Double) -> Vector2 { line.point(at: min(length, max(0, yellowAt + fromYellow))) }

        // Abschläge
        let elevationTee = baseElevation + 6 * sin(Double(n) * 1.3)
        let teeBoxes: [TeeBox] = tees.map { t in
            let d = yellowAt - (t.behindYellow[hs.par] ?? 0)
            return TeeBox(teeID: t.tee.id, position: geo(line.point(at: d)), lengthMeters: Int((length - d).rounded()),
                          elevation: (elevationTee * 10).rounded() / 10)
        }

        // Grün
        let depth = rng.range(14, 18)
        let width = rng.range(11, 14.5)
        let outline = DemoShapes.blob(center: green, along: approach, semiLength: depth, semiWidth: width, points: 28,
                                      wobble: 0.07, phase: rng.range(0, 6))
        let pin = green + approach * rng.range(-4, 5) + side * rng.range(-3, 3)
        let greenGeometry = GreenGeometry(
            outline: GeoPolygon(outline.map(geo)), front: geo(green - approach * depth), center: geo(green),
            back: geo(green + approach * depth), defaultPin: geo(pin),
            elevation: ((baseElevation + 6 * sin(Double(n) * 1.3 + 1.1)) * 10).rounded() / 10
        )

        // Fairway (Par 4/5)
        var fairways: [GeoPolygon] = []
        var fairwayHalf = 15.0
        if hs.par >= 4 {
            let start = yellowAt + (hs.par == 4 ? 95 : 110)
            let end = length - depth - 12
            let phaseL = rng.range(0, 6), phaseR = rng.range(0, 6)
            let landing = yellowAt + 235
            let ring = DemoShapes.ribbon(line, from: start, to: end) { s in
                let bulge = 5 * exp(-pow((s - landing) / 50, 2))
                let taper = max(0, min(1, (end - s) / 70)) // zum Grün schmaler
                let base = 12 + 4 * taper + bulge
                return (base + 1.6 * sin(s / 37 + phaseL), base + 1.6 * sin(s / 41 + phaseR))
            }
            fairways = [GeoPolygon(ring.map(geo))]
            fairwayHalf = 16 + 5
        }

        var features: [HoleFeature] = []
        var bunkerCount = 0
        func bunker(_ center: Vector2, along axis: Vector2, a: Double, b: Double, side s: FeatureSide) {
            bunkerCount += 1
            let shape = DemoShapes.blob(center: center, along: axis, semiLength: a, semiWidth: b, points: 16, wobble: 0.1, phase: rng.range(0, 6))
            features.append(HoleFeature(id: id("b\(bunkerCount)"), kind: .bunker, side: s, geometry: .polygon(GeoPolygon(shape.map(geo)))))
        }
        for hazard in hs.hazards {
            switch hazard {
            case let .fairwayBunker(d, s):
                let p = at(d)
                let n = line.rightNormal(at: yellowAt + d)
                bunker(p + n * (s * (fairwayHalf - 3 + rng.range(0, 4))), along: line.direction(at: yellowAt + d),
                       a: rng.range(9, 13), b: rng.range(5, 7), side: s > 0 ? .right : .left)
            case let .greenBunker(angle):
                let r = angle * Double.pi / 180
                // Richtung im Uhrzeigersinn ab Spielrichtung: 90° = rechts
                let dir = approach * cos(r) + side * sin(r)
                let reach = (abs(cos(r)) * depth + abs(sin(r)) * width) + 7
                bunker(green + dir * reach, along: Vector2(x: -dir.y, y: dir.x), a: rng.range(7, 10), b: rng.range(3.5, 5),
                       side: abs(angle) < 20 || abs(angle) > 160 ? .center : (angle > 0 ? .right : .left))
            case let .pond(d, offset, a, b):
                let p = at(d) + line.rightNormal(at: yellowAt + d) * offset
                let shape = DemoShapes.blob(center: p, along: line.direction(at: yellowAt + d), semiLength: a / 2, semiWidth: b / 2,
                                            points: 24, wobble: 0.08, phase: rng.range(0, 6))
                features.append(HoleFeature(id: id("w\(features.count)"), kind: .water, side: offset > 0 ? .right : offset < 0 ? .left : .center,
                                            geometry: .polygon(GeoPolygon(shape.map(geo)))))
            case .frontWater:
                let p = green - approach * (depth + 22)
                let shape = DemoShapes.blob(center: p, along: side, semiLength: width + 18, semiWidth: 13, points: 24, wobble: 0.06, phase: rng.range(0, 6))
                features.append(HoleFeature(id: id("w\(features.count)"), kind: .water, side: .center,
                                            geometry: .polygon(GeoPolygon(shape.map(geo)))))
            case let .creek(d):
                let c = at(d)
                let across = line.rightNormal(at: yellowAt + d)
                let creekLine = Polyline([c - across * 55 + line.direction(at: yellowAt + d) * 6, c, c + across * 55 - line.direction(at: yellowAt + d) * 5])
                let shape = DemoShapes.ribbon(creekLine, from: 0, to: creekLine.length, step: 10) { _ in (3, 3) }
                features.append(HoleFeature(id: id("w\(features.count)"), kind: .water, side: .center,
                                            geometry: .polygon(GeoPolygon(shape.map(geo)))))
            case let .trees(d, offset, radius):
                let p = at(d) + line.rightNormal(at: yellowAt + d) * offset
                let shape = DemoShapes.blob(center: p, along: Vector2(x: 1, y: 0), semiLength: radius, semiWidth: radius * 0.8, points: 14, wobble: 0.12)
                features.append(HoleFeature(id: id("t\(features.count)"), kind: .trees, side: offset > 0 ? .right : .left,
                                            geometry: .polygon(GeoPolygon(shape.map(geo)))))
            }
        }

        // Aus-Grenze auf der Außenseite der Schleife
        let obOffset = outsideSign * 45
        let obLine = stride(from: max(0, yellowAt - 30), through: length + 25, by: 25).map { s -> Vector2 in
            let clamped = min(length, s)
            return line.point(at: clamped) + line.rightNormal(at: clamped) * obOffset + line.direction(at: clamped) * max(0, s - length)
        }
        features.append(HoleFeature(id: id("ob"), kind: .outOfBounds, side: obOffset > 0 ? .right : .left,
                                    geometry: .polyline(obLine.map(geo))))
        // Baumgruppe zwischen Spielbahn und Grenze
        let treeAt = rng.range(0.35, 0.7) * length
        let treeCenter = line.point(at: treeAt) + line.rightNormal(at: treeAt) * (outsideSign * 33)
        features.append(HoleFeature(id: id("trees"), kind: .trees, side: outsideSign > 0 ? .right : .left,
                                    geometry: .polygon(GeoPolygon(DemoShapes.blob(center: treeCenter, along: Vector2(x: 1, y: 0),
                                                                                  semiLength: 11, semiWidth: 8, points: 14, wobble: 0.12).map(geo)))))
        // See (Seepark): als Wasserhindernis, wenn er nahe an der Spielbahn liegt
        if let lake {
            let sampled = stride(from: 0.0, through: length, by: 10).map { line.point(at: $0) }
            let closest = sampled.map { p in lake.map { $0.distance(to: p) }.min() ?? .infinity }.min() ?? .infinity
            if closest < 110 {
                features.append(HoleFeature(id: id("lake"), kind: .water, side: outsideSign > 0 ? .left : .right,
                                            geometry: .polygon(GeoPolygon(lake.map(geo)))))
            }
        }

        // Zielpunkte: Dogleg-Ecke, Layup bei Par 5
        for (i, corner) in line.points.dropFirst().dropLast().enumerated() {
            features.append(HoleFeature(id: id("dogleg\(i + 1)"), kind: .dogleg, geometry: .point(geo(corner))))
        }
        if hs.par == 5 {
            features.append(HoleFeature(id: id("layup"), kind: .layup, geometry: .point(geo(line.point(at: length - 100)))))
        }

        return Hole(number: n, par: hs.par, strokeIndex: hs.strokeIndex, teeBoxes: teeBoxes, green: greenGeometry,
                    fairways: fairways, lineOfPlay: line.points.map(geo), features: features)
    }
}
