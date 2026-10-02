import GolfCore
import HCPGolfKit
import SwiftUI

/// Beschriftung auf der Karte (z. B. Entfernung bis zu einem Bunker).
struct MapLabel: Identifiable, Equatable {
    enum Style: Equatable { case distance, hazard, target, arc }
    var id: String
    var point: GeoPoint
    var text: String
    var style: Style = .distance
}

/// Distanzbogen um den Spieler.
struct MapArc: Equatable {
    var radiusMeters: Double
    var label: String
}

/// Was über dem Loch liegt: Spieler, Fahne, Messlinie, Strategie, Distanzbögen, Beschriftungen.
struct HoleMapOverlay: Equatable {
    var player: PlayerPosition?
    var pin: GeoPoint?
    /// Spieler bzw. Abschlag → Zielpunkt → Grün
    var measureLine: [GeoPoint] = []
    var strategy: [GeoPoint] = []
    var arcCenter: GeoPoint?
    var arcs: [MapArc] = []
    var labels: [MapLabel] = []
}

/// Platzkarte eines Lochs als Vektorgrafik (Canvas): funktioniert ohne Netz und ohne Kartendienst, gedreht in
/// Spielrichtung (Abschlag unten, Grün oben). Zoom (zwei Finger), Verschieben, Tippen = Punkt messen,
/// langes Drücken = eigenes Ziel. Die Projektion (`HoleViewport`) ist in GolfCore getestet.
struct HoleMapView: View {
    let hole: Hole
    let teeID: TeeID?
    var overlay = HoleMapOverlay()
    /// Ändern, um auf das Grün zu zoomen
    var greenFocusToken = 0
    /// Ändern, um die Ansicht zurückzusetzen
    var resetToken = 0
    var onTap: ((GeoPoint) -> Void)?
    var onLongPress: ((GeoPoint) -> Void)?

    @State private var committed: HoleViewport?
    @State private var live: HoleViewport?
    @State private var lastSize: CGSize = .zero
    @State private var dragStart: HoleViewport?
    @State private var magnifyStart: HoleViewport?

    var body: some View {
        GeometryReader { geo in
            let viewport = live ?? committed
            Canvas { context, size in
                guard let viewport else { return }
                HoleMapRenderer(hole: hole, teeID: teeID, overlay: overlay, viewport: viewport).draw(in: &context, size: size)
            }
            .background(Palette.mapRough)
            .contentShape(Rectangle())
            .gesture(panGesture)
            .simultaneousGesture(magnifyGesture)
            .simultaneousGesture(longPressGesture)
            .onTapGesture(coordinateSpace: .local) { location in
                guard let viewport = committed, let onTap else { return }
                onTap(viewport.geoPoint(screen: Vector2(x: location.x, y: location.y)))
            }
            .onAppear { fit(size: geo.size) }
            .onChange(of: geo.size) { _, newSize in fit(size: newSize) }
            .onChange(of: hole.number) { _, _ in fit(size: geo.size, force: true) }
            .onChange(of: teeID) { _, _ in fit(size: geo.size, force: true) }
            .onChange(of: resetToken) { _, _ in fit(size: geo.size, force: true) }
            .onChange(of: greenFocusToken) { _, _ in focusGreen() }
        }
        .clipped()
    }

    // MARK: Ansicht

    private var axisFrom: GeoPoint? { hole.teePosition(for: teeID) ?? hole.lineOfPlay.first }
    private var axisTo: GeoPoint? { hole.green?.resolvedCenter ?? hole.lineOfPlay.last }

    private var fitPoints: [GeoPoint] {
        var points = hole.teeBoxes.compactMap(\.position) + hole.lineOfPlay
        points += hole.green?.outline?.points ?? []
        points += hole.fairways.flatMap(\.points)
        points += hole.features.filter { $0.kind == .bunker }.flatMap(\.geometry.points)
        if let player = overlay.player?.point, let from = axisFrom, Geodesy.distance(player, from) < 700 {
            points.append(player) // Spieler im Bild halten, wenn er auf diesem Loch ist
        }
        return points
    }

    private func fit(size: CGSize, force: Bool = false) {
        guard size.width > 0, size.height > 0 else { return }
        guard force || committed == nil || size != lastSize else { return }
        lastSize = size
        guard let from = axisFrom, let to = axisTo else { committed = nil; return }
        committed = HoleViewport.fitting(fitPoints, axisFrom: from, axisTo: to, size: Vector2(x: size.width, y: size.height), padding: 28)
        live = nil
    }

    private func focusGreen() {
        guard let viewport = committed, let center = hole.green?.resolvedCenter else { return }
        withAnimation(.easeInOut(duration: 0.3)) {
            committed = viewport.focused(on: center, spanMeters: 70)
        }
    }

    // MARK: Gesten

    private var panGesture: some Gesture {
        DragGesture(minimumDistance: 8)
            .onChanged { value in
                if dragStart == nil { dragStart = live ?? committed }
                guard let start = dragStart else { return }
                live = start.panned(by: Vector2(x: value.translation.width, y: value.translation.height))
            }
            .onEnded { _ in
                committed = live ?? committed
                live = nil
                dragStart = nil
            }
    }

    private var magnifyGesture: some Gesture {
        MagnifyGesture()
            .onChanged { value in
                if magnifyStart == nil { magnifyStart = live ?? committed }
                guard let start = magnifyStart else { return }
                let anchor = Vector2(x: value.startAnchor.x * start.size.x, y: value.startAnchor.y * start.size.y)
                live = start.zoomed(by: value.magnification, anchor: anchor)
            }
            .onEnded { _ in
                committed = live ?? committed
                live = nil
                magnifyStart = nil
            }
    }

    private var longPressGesture: some Gesture {
        LongPressGesture(minimumDuration: 0.5)
            .sequenced(before: DragGesture(minimumDistance: 0, coordinateSpace: .local))
            .onEnded { value in
                guard case let .second(true, drag?) = value, let viewport = committed, let onLongPress else { return }
                onLongPress(viewport.geoPoint(screen: Vector2(x: drag.location.x, y: drag.location.y)))
            }
    }
}

/// Zeichnet ein Loch in einen Canvas-Kontext. Reihenfolge: Rough, Wasser, Bäume, Fairway, Bunker, Grün, Abschläge,
/// Aus-Grenze, Spiellinie, Strategie, Distanzbögen, Messlinie, Fahne, Spieler, Beschriftungen.
struct HoleMapRenderer {
    let hole: Hole
    let teeID: TeeID?
    let overlay: HoleMapOverlay
    let viewport: HoleViewport

    private func cg(_ p: GeoPoint) -> CGPoint {
        let v = viewport.screenPoint(p)
        return CGPoint(x: v.x, y: v.y)
    }

    private func path(_ points: [GeoPoint], closed: Bool) -> Path {
        var path = Path()
        for (i, point) in points.enumerated() {
            if i == 0 { path.move(to: cg(point)) } else { path.addLine(to: cg(point)) }
        }
        if closed { path.closeSubpath() }
        return path
    }

    func draw(in context: inout GraphicsContext, size: CGSize) {
        let features = hole.features
        for f in features where f.kind == .water && f.geometry.shape == .polygon {
            context.fill(path(f.geometry.points, closed: true), with: .color(Palette.mapWater))
        }
        for f in features where f.kind == .trees {
            context.fill(path(f.geometry.points, closed: true), with: .color(Palette.mapTrees))
        }
        for fairway in hole.fairways {
            context.fill(path(fairway.points, closed: true), with: .color(Palette.mapFairway))
        }
        for f in features where f.kind == .bunker {
            let p = path(f.geometry.points, closed: true)
            context.fill(p, with: .color(Palette.mapBunker))
            context.stroke(p, with: .color(.black.opacity(0.15)), lineWidth: 0.8)
        }
        if let outline = hole.green?.outline {
            let p = path(outline.points, closed: true)
            context.fill(p, with: .color(Palette.mapGreen))
            context.stroke(p, with: .color(Palette.mapGreenEdge.opacity(0.7)), lineWidth: 1.2)
        } else if let center = hole.green?.resolvedCenter {
            let c = cg(center)
            let r = viewport.points(forMeters: 14)
            context.fill(Path(ellipseIn: CGRect(x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r)), with: .color(Palette.mapGreen))
        }
        drawTees(&context)
        for f in features where f.kind == .outOfBounds && f.geometry.shape == .polyline {
            context.stroke(path(f.geometry.points, closed: false), with: .color(.white.opacity(0.85)),
                           style: StrokeStyle(lineWidth: 1.5, dash: [5, 4]))
        }
        if hole.lineOfPlay.count >= 2 {
            context.stroke(path(hole.lineOfPlay, closed: false), with: .color(Palette.mapLine.opacity(0.35)),
                           style: StrokeStyle(lineWidth: 1, dash: [2, 5]))
        }
        drawStrategy(&context)
        drawArcs(&context)
        if overlay.measureLine.count >= 2 {
            context.stroke(path(overlay.measureLine, closed: false), with: .color(Palette.mapTarget),
                           style: StrokeStyle(lineWidth: 2.5, lineCap: .round, dash: [7, 5]))
            if let target = overlay.measureLine.dropFirst().first {
                let c = cg(target)
                context.fill(Path(ellipseIn: CGRect(x: c.x - 7, y: c.y - 7, width: 14, height: 14)), with: .color(Palette.mapTarget))
                context.stroke(Path(ellipseIn: CGRect(x: c.x - 7, y: c.y - 7, width: 14, height: 14)), with: .color(.white), lineWidth: 2)
            }
        }
        if let pin = overlay.pin ?? hole.green?.defaultPin { drawFlag(&context, at: cg(pin)) }
        drawPlayer(&context, size: size)
        for label in overlay.labels { drawLabel(&context, label) }
    }

    private func drawTees(_ context: inout GraphicsContext) {
        for box in hole.teeBoxes {
            guard let position = box.position else { continue }
            let c = cg(position)
            let selected = box.teeID == teeID
            let side: CGFloat = selected ? 12 : 8
            let rect = CGRect(x: c.x - side / 2, y: c.y - side / 2, width: side, height: side)
            context.fill(Path(roundedRect: rect, cornerRadius: 2), with: .color(teeColor(box.teeID)))
            context.stroke(Path(roundedRect: rect, cornerRadius: 2), with: .color(.black.opacity(selected ? 0.7 : 0.35)), lineWidth: selected ? 1.5 : 0.8)
        }
    }

    private func teeColor(_ id: TeeID) -> Color {
        switch id {
        case "white": return .white
        case "yellow": return Color(light: 0xF2C200, dark: 0xF2C200)
        case "blue": return Color(light: 0x2A62D9, dark: 0x5B8CFF)
        case "red": return Color(light: 0xD93A2B, dark: 0xFF6655)
        case "black": return .black
        default: return Palette.mapTee
        }
    }

    private func drawStrategy(_ context: inout GraphicsContext) {
        guard !overlay.strategy.isEmpty else { return }
        var points = overlay.strategy
        if let tee = hole.teePosition(for: teeID) { points.insert(tee, at: 0) }
        if let green = hole.green?.resolvedCenter { points.append(green) }
        context.stroke(path(points, closed: false), with: .color(Palette.lime), style: StrokeStyle(lineWidth: 2, lineCap: .round, dash: [1, 6]))
        for (i, point) in overlay.strategy.enumerated() {
            let c = cg(point)
            context.fill(Path(ellipseIn: CGRect(x: c.x - 9, y: c.y - 9, width: 18, height: 18)), with: .color(Palette.lime))
            context.draw(Text(verbatim: "\(i + 1)").font(.caption2.weight(.heavy)).foregroundColor(.black), at: c)
        }
    }

    private func drawArcs(_ context: inout GraphicsContext) {
        guard let center = overlay.arcCenter, !overlay.arcs.isEmpty else { return }
        let c = cg(center)
        for arc in overlay.arcs {
            let r = viewport.points(forMeters: arc.radiusMeters)
            let rect = CGRect(x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r)
            context.stroke(Path(ellipseIn: rect), with: .color(.white.opacity(0.55)), style: StrokeStyle(lineWidth: 1, dash: [4, 6]))
            let labelPoint = CGPoint(x: c.x, y: c.y - r)
            let text = context.resolve(Text(verbatim: arc.label).font(.caption2.weight(.bold)).foregroundColor(.white))
            context.draw(text, at: labelPoint)
        }
    }

    private func drawFlag(_ context: inout GraphicsContext, at p: CGPoint) {
        var pole = Path()
        pole.move(to: p)
        pole.addLine(to: CGPoint(x: p.x, y: p.y - 22))
        context.stroke(pole, with: .color(.white), lineWidth: 2)
        var flag = Path()
        flag.move(to: CGPoint(x: p.x, y: p.y - 22))
        flag.addLine(to: CGPoint(x: p.x + 13, y: p.y - 17))
        flag.addLine(to: CGPoint(x: p.x, y: p.y - 12))
        flag.closeSubpath()
        context.fill(flag, with: .color(Palette.danger))
        context.fill(Path(ellipseIn: CGRect(x: p.x - 2.5, y: p.y - 2.5, width: 5, height: 5)), with: .color(.white))
    }

    private func drawPlayer(_ context: inout GraphicsContext, size: CGSize) {
        guard let player = overlay.player else { return }
        let c = cg(player.point)
        guard c.x > -50, c.y > -50, c.x < size.width + 50, c.y < size.height + 50 else { return }
        let accuracy = max(6, viewport.points(forMeters: player.accuracy))
        let halo = CGRect(x: c.x - accuracy, y: c.y - accuracy, width: 2 * accuracy, height: 2 * accuracy)
        context.fill(Path(ellipseIn: halo), with: .color(Palette.mapPlayer.opacity(player.isStale ? 0.08 : 0.18)))
        let dot = CGRect(x: c.x - 8, y: c.y - 8, width: 16, height: 16)
        context.fill(Path(ellipseIn: dot), with: .color(.white))
        context.fill(Path(ellipseIn: dot.insetBy(dx: 3, dy: 3)), with: .color(player.isStale ? Palette.textSecondary : Palette.mapPlayer))
    }

    private func drawLabel(_ context: inout GraphicsContext, _ label: MapLabel) {
        let c = cg(label.point)
        let color: Color
        switch label.style {
        case .distance, .arc: color = .white
        case .hazard: color = Color(light: 0xFFF6D8, dark: 0xFFF6D8)
        case .target: color = Palette.mapTarget
        }
        let text = context.resolve(Text(verbatim: label.text).font(.caption.weight(.heavy).monospacedDigit()).foregroundColor(Palette.mapLabel))
        let size = text.measure(in: CGSize(width: 200, height: 40))
        let rect = CGRect(x: c.x - size.width / 2 - 6, y: c.y - size.height / 2 - 3, width: size.width + 12, height: size.height + 6)
        context.fill(Path(roundedRect: rect, cornerRadius: rect.height / 2), with: .color(color.opacity(0.92)))
        context.draw(text, at: c)
    }
}
