import CoreLocation
import GolfCore
import HCPGolfKit
import MapKit
import SwiftUI

extension GeoPoint {
    var coordinate: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: latitude, longitude: longitude) }
    init(_ coordinate: CLLocationCoordinate2D) { self.init(latitude: coordinate.latitude, longitude: coordinate.longitude) }
}

/// Satellitenansicht eines Lochs (MapKit) mit den Platzelementen als Überlagerung. Braucht Netz für das Luftbild;
/// ohne Netz bleibt die Vektorkarte (`HoleMapView`) die Hauptansicht.
struct SatelliteHoleMap: View {
    let hole: Hole
    let teeID: TeeID?
    var target: GeoPoint?
    var onTap: ((GeoPoint) -> Void)?

    @State private var position: MapCameraPosition = .automatic

    var body: some View {
        MapReader { proxy in
            Map(position: $position, interactionModes: [.pan, .zoom]) {
                ForEach(Array(hole.fairways.enumerated()), id: \.offset) { _, fairway in
                    MapPolygon(coordinates: fairway.points.map(\.coordinate))
                        .foregroundStyle(Palette.mapFairway.opacity(0.35))
                }
                ForEach(hole.features.filter { $0.geometry.shape == .polygon }) { feature in
                    MapPolygon(coordinates: feature.geometry.points.map(\.coordinate))
                        .foregroundStyle(color(feature.kind).opacity(0.55))
                }
                if let outline = hole.green?.outline {
                    MapPolygon(coordinates: outline.points.map(\.coordinate))
                        .foregroundStyle(Palette.mapGreen.opacity(0.6))
                        .stroke(.white, lineWidth: 1)
                }
                if hole.lineOfPlay.count >= 2 {
                    MapPolyline(coordinates: hole.lineOfPlay.map(\.coordinate))
                        .stroke(.white.opacity(0.85), style: StrokeStyle(lineWidth: 2, dash: [6, 4]))
                }
                if let tee = hole.teePosition(for: teeID) {
                    Annotation(String(), coordinate: tee.coordinate) {
                        RoundedRectangle(cornerRadius: 2).fill(.white).frame(width: 12, height: 12)
                            .overlay(RoundedRectangle(cornerRadius: 2).stroke(.black, lineWidth: 1))
                    }
                }
                if let target {
                    Annotation(String(), coordinate: target.coordinate) {
                        Circle().fill(Palette.mapTarget).frame(width: 14, height: 14).overlay(Circle().stroke(.white, lineWidth: 2))
                    }
                }
            }
            .mapStyle(.imagery(elevation: .flat))
            .onTapGesture(coordinateSpace: .local) { location in
                if let onTap, let coordinate = proxy.convert(location, from: .local) {
                    onTap(GeoPoint(coordinate))
                }
            }
        }
        .onAppear(perform: frameHole)
        .onChange(of: hole.number) { _, _ in frameHole() }
    }

    private func color(_ kind: HoleFeatureKind) -> Color {
        switch kind {
        case .bunker: return Palette.mapBunker
        case .water: return Palette.mapWater
        case .trees: return Palette.mapTrees
        default: return .clear
        }
    }

    /// Kamera in Spielrichtung: Abschlag unten, Grün oben.
    private func frameHole() {
        guard let tee = hole.teePosition(for: teeID), let green = hole.green?.resolvedCenter else { return }
        let length = Geodesy.distance(tee, green)
        let mid = LocalFrame(origin: tee).toGeo(LocalFrame(origin: tee).toLocal(green) * 0.5)
        position = .camera(MapCamera(centerCoordinate: mid.coordinate, distance: max(450, length * 2.6),
                                     heading: PlanarGeometry.bearingDegrees(from: tee, to: green), pitch: 0))
    }
}

/// Grafik eines Platzes aus seinen echten Daten (alle Spielbahnen, Norden oben) – statt Stockfotos.
struct CourseArtwork: View {
    let course: Course?
    var height: CGFloat = 160

    var body: some View {
        Canvas { context, size in
            context.fill(Path(CGRect(origin: .zero, size: size)), with: .linearGradient(
                Gradient(colors: [Palette.brandDeep, Palette.brand]), startPoint: .zero, endPoint: CGPoint(x: size.width, y: size.height)))
            guard let course, let origin = course.location ?? course.holes.first?.lineOfPlay.first else { return }
            let frame = LocalFrame(origin: origin)
            let points = course.holes.flatMap { $0.lineOfPlay + ($0.green?.outline?.points ?? []) }.map(frame.toLocal)
            guard let minX = points.map(\.x).min(), let maxX = points.map(\.x).max(),
                  let minY = points.map(\.y).min(), let maxY = points.map(\.y).max() else { return }
            let scale = min((size.width - 32) / max(maxX - minX, 1), (size.height - 32) / max(maxY - minY, 1))
            func cg(_ p: GeoPoint) -> CGPoint {
                let v = frame.toLocal(p)
                let x = (v.x - (minX + maxX) / 2) * scale + size.width / 2
                let y = size.height / 2 - (v.y - (minY + maxY) / 2) * scale
                return CGPoint(x: x, y: y)
            }
            for hole in course.holes {
                for f in hole.features where f.kind == .water && f.geometry.shape == .polygon {
                    var p = Path()
                    p.addLines(f.geometry.points.map(cg))
                    p.closeSubpath()
                    context.fill(p, with: .color(Palette.mapWater.opacity(0.7)))
                }
                for fairway in hole.fairways {
                    var p = Path()
                    p.addLines(fairway.points.map(cg))
                    p.closeSubpath()
                    context.fill(p, with: .color(.white.opacity(0.22)))
                }
                if let outline = hole.green?.outline {
                    var p = Path()
                    p.addLines(outline.points.map(cg))
                    p.closeSubpath()
                    context.fill(p, with: .color(Palette.lime.opacity(0.9)))
                }
            }
        }
        .frame(height: height)
        .accessibilityHidden(true)
    }
}
