import Foundation
import HCPGolfKit

public typealias CourseID = String
public typealias TeeID = String

/// Herkunft der Platzdaten. Sie entscheidet, wie Werte angezeigt werden und ob sie für das Handicap zählen dürfen.
public enum CourseDataSource: String, Codable, Sendable, CaseIterable {
    /// Fiktiver Demo-Platz: Geometrie und Ratings sind erfunden und nur für Entwicklung und Vorführung gedacht.
    /// Runden auf Demo-Plätzen zählen nie für den Handicap Index.
    case demo
    /// Datensatz der Web-App („golf-hcp-rechner/courses“), z. B. die mitgelieferten Startdaten Bayern.
    case hcpDataset
    /// Lizenzierte Platzdatenbank (später über `GolfCourseDataProvider` angebunden).
    case licensed
}

public enum Gender: String, Codable, Sendable, CaseIterable {
    case male = "M"
    case female = "F"
}

public enum TeeColor: String, Codable, Sendable, CaseIterable {
    case black, white, gold, blue, yellow, red, orange, green
}

/// Umfang eines Course-/Slope-Ratings. Ein 9-Loch-Platz hat ein Rating für die Löcher 1–9 (`front9`).
public enum RatingScope: String, Codable, Sendable, CaseIterable {
    case eighteen
    case front9
    case back9

    public var holeCount: Int { self == .eighteen ? 18 : 9 }
}

/// Prüfstand eines Ratings. Werte werden nie erfunden oder abgeleitet (kein CR₉ = CR₁₈ / 2):
/// fehlt ein Wert, bleibt er `nil`.
public enum RatingStatus: String, Codable, Sendable {
    /// gegen die offizielle Quelle geprüft
    case verified
    /// hinterlegt, aber nicht geprüft – der Spieler bestätigt die Werte mit seiner Scorekarte
    case unverified
    /// fiktiver Wert eines Demo-Platzes – zählt nie für den Handicap Index
    case fictional
}

/// Course Rating, Slope Rating und Par eines Abschlags für ein Geschlecht und einen Umfang (18, vordere/hintere 9).
public struct TeeRating: Codable, Hashable, Sendable {
    public var gender: Gender
    public var scope: RatingScope
    public var par: Int?
    public var courseRating: Double?
    public var slopeRating: Int?
    public var status: RatingStatus
    public var sourceNote: String?

    public init(gender: Gender, scope: RatingScope, par: Int?, courseRating: Double?, slopeRating: Int?,
                status: RatingStatus, sourceNote: String? = nil) {
        self.gender = gender
        self.scope = scope
        self.par = par
        self.courseRating = courseRating
        self.slopeRating = slopeRating
        self.status = status
        self.sourceNote = sourceNote
    }

    /// CR, Slope und Par vorhanden – Voraussetzung für Course Handicap und Score Differential.
    public var isComplete: Bool { courseRating != nil && slopeRating != nil && par != nil }
}

/// Abschlag (Tee) eines Platzes, z. B. „Gelb“.
public struct Tee: Identifiable, Codable, Hashable, Sendable {
    public var id: TeeID
    public var name: String
    public var color: TeeColor
    public var ratings: [TeeRating]

    public init(id: TeeID, name: String, color: TeeColor, ratings: [TeeRating] = []) {
        self.id = id
        self.name = name
        self.color = color
        self.ratings = ratings
    }

    public func rating(gender: Gender, scope: RatingScope) -> TeeRating? {
        ratings.first { $0.gender == gender && $0.scope == scope }
    }
}

/// Abschlagposition eines Lochs für einen Abschlag (Tee).
public struct TeeBox: Codable, Hashable, Sendable {
    public var teeID: TeeID
    public var position: GeoPoint?
    /// Länge laut Scorekarte bzw. Spiellinie bis Grünmitte
    public var lengthMeters: Int?
    public var elevation: Double?

    public init(teeID: TeeID, position: GeoPoint?, lengthMeters: Int?, elevation: Double? = nil) {
        self.teeID = teeID
        self.position = position
        self.lengthMeters = lengthMeters
        self.elevation = elevation
    }
}

/// Fläche aus WGS-84-Punkten (äußerer Ring, nicht geschlossen: erster ≠ letzter Punkt).
public struct GeoPolygon: Codable, Hashable, Sendable {
    public var points: [GeoPoint]

    public init(_ points: [GeoPoint]) {
        self.points = points
    }

    public var isValid: Bool { points.count >= 3 && points.allSatisfy(\.isValid) }
}

/// Grün: Fläche (bevorzugt) und/oder feste Punkte Front, Mitte, Back. Ohne Fläche gelten die festen Punkte.
public struct GreenGeometry: Codable, Hashable, Sendable {
    public var outline: GeoPolygon?
    public var front: GeoPoint?
    public var center: GeoPoint?
    public var back: GeoPoint?
    /// Fahnenposition laut Platzdaten (die Tagesfahne setzt der Spieler selbst)
    public var defaultPin: GeoPoint?
    public var elevation: Double?

    public init(outline: GeoPolygon? = nil, front: GeoPoint? = nil, center: GeoPoint? = nil, back: GeoPoint? = nil,
                defaultPin: GeoPoint? = nil, elevation: Double? = nil) {
        self.outline = outline
        self.front = front
        self.center = center
        self.back = back
        self.defaultPin = defaultPin
        self.elevation = elevation
    }

    /// Grünmitte: hinterlegt oder Schwerpunkt der Fläche.
    public var resolvedCenter: GeoPoint? {
        if let center, center.isValid { return center }
        guard let outline, outline.isValid else { return nil }
        return PlanarGeometry.centroid(of: outline)
    }

    public var hasPosition: Bool { resolvedCenter != nil || front?.isValid == true || back?.isValid == true }
}

/// Art eines Kartenelements. Hindernisse und Zielpunkte teilen sich ein Modell, damit eine lizenzierte Datenbank
/// beliebige weitere Elemente liefern kann.
public enum HoleFeatureKind: String, Codable, Sendable, CaseIterable {
    case bunker
    case water
    case outOfBounds
    case trees
    case rough
    case layup
    case dogleg
    case target

    /// Hindernis (Entfernung bis Anfang/Mitte/Ende relevant)
    public var isHazard: Bool {
        switch self {
        case .bunker, .water, .outOfBounds, .trees: return true
        case .rough, .layup, .dogleg, .target: return false
        }
    }

    /// Zielpunkt (Layup, Dogleg, Ziel)
    public var isTarget: Bool { self == .layup || self == .dogleg || self == .target }
}

/// Seite relativ zur Spiellinie (vom Abschlag aus gesehen).
public enum FeatureSide: String, Codable, Sendable {
    case left, right, center
}

public struct FeatureGeometry: Codable, Hashable, Sendable {
    public enum Shape: String, Codable, Sendable {
        case point, polyline, polygon
    }

    public var shape: Shape
    public var points: [GeoPoint]

    public init(shape: Shape, points: [GeoPoint]) {
        self.shape = shape
        self.points = points
    }

    public static func point(_ p: GeoPoint) -> FeatureGeometry { FeatureGeometry(shape: .point, points: [p]) }
    public static func polygon(_ p: GeoPolygon) -> FeatureGeometry { FeatureGeometry(shape: .polygon, points: p.points) }
    public static func polyline(_ points: [GeoPoint]) -> FeatureGeometry { FeatureGeometry(shape: .polyline, points: points) }

    public var polygon: GeoPolygon? { shape == .polygon ? GeoPolygon(points) : nil }
    public var isValid: Bool {
        switch shape {
        case .point: return points.count == 1 && points[0].isValid
        case .polyline: return points.count >= 2 && points.allSatisfy(\.isValid)
        case .polygon: return points.count >= 3 && points.allSatisfy(\.isValid)
        }
    }
}

/// Hindernis oder Zielpunkt eines Lochs.
public struct HoleFeature: Identifiable, Codable, Hashable, Sendable {
    public var id: String
    public var kind: HoleFeatureKind
    public var name: String?
    public var side: FeatureSide?
    public var geometry: FeatureGeometry

    public init(id: String, kind: HoleFeatureKind, name: String? = nil, side: FeatureSide? = nil, geometry: FeatureGeometry) {
        self.id = id
        self.kind = kind
        self.name = name
        self.side = side
        self.geometry = geometry
    }
}

/// Loch eines Platzes. Fehlende Angaben bleiben `nil` (z. B. Platz ohne Lochdaten oder ohne GPS-Daten).
public struct Hole: Identifiable, Codable, Hashable, Sendable {
    public var number: Int
    public var par: Int?
    /// Handicap (Stroke Index) des Lochs, 1 = schwerstes Loch
    public var strokeIndex: Int?
    public var teeBoxes: [TeeBox]
    public var green: GreenGeometry?
    public var fairways: [GeoPolygon]
    /// Spiellinie vom (hintersten) Abschlag über einen Dogleg-Punkt zur Grünmitte
    public var lineOfPlay: [GeoPoint]
    public var features: [HoleFeature]

    public var id: Int { number }

    public init(number: Int, par: Int?, strokeIndex: Int?, teeBoxes: [TeeBox] = [], green: GreenGeometry? = nil,
                fairways: [GeoPolygon] = [], lineOfPlay: [GeoPoint] = [], features: [HoleFeature] = []) {
        self.number = number
        self.par = par
        self.strokeIndex = strokeIndex
        self.teeBoxes = teeBoxes
        self.green = green
        self.fairways = fairways
        self.lineOfPlay = lineOfPlay
        self.features = features
    }

    public var hazards: [HoleFeature] { features.filter { $0.kind.isHazard } }
    public var targets: [HoleFeature] { features.filter { $0.kind.isTarget } }

    public func teeBox(_ teeID: TeeID?) -> TeeBox? {
        guard let teeID else { return nil }
        return teeBoxes.first { $0.teeID == teeID }
    }

    /// Abschlag des Spielers, sonst der erste mit Position.
    public func teePosition(for teeID: TeeID?) -> GeoPoint? {
        teeBox(teeID)?.position ?? teeBoxes.first(where: { $0.position != nil })?.position
    }

    /// Hat das Loch Koordinaten für die Entfernung zum Grün?
    public var hasGPSData: Bool { green?.hasPosition == true }
}

/// Golfplatz bzw. Layout (eine Anlage mit zwei Plätzen erscheint als zwei Einträge).
public struct Course: Identifiable, Codable, Hashable, Sendable {
    public var id: CourseID
    public var name: String
    public var clubName: String
    public var address: String?
    public var postalCode: String?
    public var city: String
    public var region: String?
    /// ISO-3166-Ländercode, z. B. „DE“
    public var country: String
    /// Lage der Anlage (Clubhaus); `nil`, wenn unbekannt
    public var location: GeoPoint?
    public var timeZoneIdentifier: String?
    public var imageURL: URL?
    public var website: URL?
    /// Anzahl Löcher laut Platz – gilt auch, wenn keine Lochdaten vorliegen
    public var holeCount: Int
    public var tees: [Tee]
    public var holes: [Hole]
    public var source: CourseDataSource
    /// Hinweis zur Datenqualität (z. B. „Ratings nicht verifiziert“)
    public var dataNote: String?
    public var updatedAt: Date?

    public init(id: CourseID, name: String, clubName: String, address: String? = nil, postalCode: String? = nil,
                city: String, region: String? = nil, country: String, location: GeoPoint?, timeZoneIdentifier: String? = nil,
                imageURL: URL? = nil, website: URL? = nil, holeCount: Int, tees: [Tee], holes: [Hole],
                source: CourseDataSource, dataNote: String? = nil, updatedAt: Date? = nil) {
        self.id = id
        self.name = name
        self.clubName = clubName
        self.address = address
        self.postalCode = postalCode
        self.city = city
        self.region = region
        self.country = country
        self.location = location
        self.timeZoneIdentifier = timeZoneIdentifier
        self.imageURL = imageURL
        self.website = website
        self.holeCount = holeCount
        self.tees = tees
        self.holes = holes
        self.source = source
        self.dataNote = dataNote
        self.updatedAt = updatedAt
    }

    /// Lochdaten (Par und Handicap je Loch) vollständig?
    public var hasHoleData: Bool {
        holes.count == holeCount && holes.allSatisfy { $0.par != nil && $0.strokeIndex != nil }
    }

    /// GPS-Daten (Grün) für alle Löcher vorhanden?
    public var hasGPSData: Bool { !holes.isEmpty && holes.count == holeCount && holes.allSatisfy(\.hasGPSData) }

    /// Par des Platzes aus den Lochdaten, sonst aus einem Rating – nie geschätzt.
    public var par: Int? {
        if holes.count == holeCount, holes.allSatisfy({ $0.par != nil }) {
            return holes.reduce(0) { $0 + ($1.par ?? 0) }
        }
        let scope: RatingScope = holeCount == 18 ? .eighteen : .front9
        return tees.lazy.flatMap(\.ratings).first { $0.scope == scope && $0.par != nil }?.par
    }

    public func hole(_ number: Int) -> Hole? { holes.first { $0.number == number } }
    public func tee(_ id: TeeID?) -> Tee? { tees.first { $0.id == id } }

    /// Gesamtlänge eines Abschlags über die angegebenen Löcher (nur wenn alle Längen bekannt sind).
    public func length(teeID: TeeID, holes numbers: [Int]? = nil) -> Int? {
        let selected = numbers.map { n in holes.filter { n.contains($0.number) } } ?? holes
        guard !selected.isEmpty else { return nil }
        var sum = 0
        for hole in selected {
            guard let length = hole.teeBox(teeID)?.lengthMeters else { return nil }
            sum += length
        }
        return sum
    }

    public var summary: CourseSummary {
        CourseSummary(id: id, name: name, clubName: clubName, city: city, region: region, country: country,
                      location: location, holeCount: holeCount, par: par, hasGPSData: hasGPSData,
                      hasHoleData: hasHoleData, source: source, imageURL: imageURL)
    }
}

/// Kurzform für Listen und Suche (ohne Lochgeometrie).
public struct CourseSummary: Identifiable, Codable, Hashable, Sendable {
    public var id: CourseID
    public var name: String
    public var clubName: String
    public var city: String
    public var region: String?
    public var country: String
    public var location: GeoPoint?
    public var holeCount: Int
    public var par: Int?
    public var hasGPSData: Bool
    public var hasHoleData: Bool
    public var source: CourseDataSource
    public var imageURL: URL?

    public init(id: CourseID, name: String, clubName: String, city: String, region: String?, country: String,
                location: GeoPoint?, holeCount: Int, par: Int?, hasGPSData: Bool, hasHoleData: Bool,
                source: CourseDataSource, imageURL: URL? = nil) {
        self.id = id
        self.name = name
        self.clubName = clubName
        self.city = city
        self.region = region
        self.country = country
        self.location = location
        self.holeCount = holeCount
        self.par = par
        self.hasGPSData = hasGPSData
        self.hasHoleData = hasHoleData
        self.source = source
        self.imageURL = imageURL
    }
}
