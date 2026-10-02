import GolfCore
import HCPGolfKit
import SwiftUI

enum PreviewMode: Hashable, CaseIterable {
    /// Tippen misst vom Abschlag zum Punkt und weiter zum Grün
    case measure
    /// zwei Punkte antippen, Entfernung dazwischen
    case twoPoints
    /// Zielpunkte planen (Abschlag → Layup → Annäherung → Grün) und speichern
    case strategy
}

/// Platzvorschau vor der Runde: jedes Loch als Karte (Vektor oder Satellit), Entfernungen, Ziele setzen, Strategie planen.
struct CoursePreviewView: View {
    @Environment(AppEnvironment.self) private var env
    let courseID: CourseID
    let initialHole: Int

    @State private var course: Course?
    @State private var holeNumber = 1
    @State private var teeID: TeeID?
    @State private var mode: PreviewMode = .measure
    @State private var satellite = false
    @State private var points: [GeoPoint] = []
    @State private var strategy: [GeoPoint] = []
    @State private var greenFocus = 0
    @State private var reset = 0
    @State private var saved = 0

    var body: some View {
        Group {
            if let course, let hole = course.hole(holeNumber) {
                content(course, hole)
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(Palette.background)
        .navigationTitle(L10n.Preview.title)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            course = try? await env.loadCourse(courseID)
            holeNumber = initialHole
            teeID = course.flatMap { RoundSetup.defaultTee(for: $0, preferred: env.profile.profile.preferredTeeColor, gender: env.profile.profile.gender)?.id }
            loadStrategy()
        }
        .sensoryFeedback(.success, trigger: saved) { _, _ in env.settings.data.haptics }
    }

    private func content(_ course: Course, _ hole: Hole) -> some View {
        VStack(spacing: 0) {
            HoleHeader(
                holeTitle: L10n.Round.holeTitle(String(hole.number)),
                details: holeDetails(course, hole),
                scoreSummary: nil,
                onPrevious: previousHole(course).map { n in { select(n) } },
                onNext: nextHole(course).map { n in { select(n) } },
                previousLabel: L10n.Round.previousHole,
                nextLabel: L10n.Round.nextHole
            )
            .padding(.horizontal, Spacing.s)
            .padding(.vertical, Spacing.xs)
            .background(Palette.surface)
            ZStack(alignment: .topTrailing) {
                if satellite {
                    SatelliteHoleMap(hole: hole, teeID: teeID, target: points.last) { tap($0, hole) }
                } else {
                    HoleMapView(hole: hole, teeID: teeID, overlay: overlay(hole), greenFocusToken: greenFocus, resetToken: reset,
                                onTap: { tap($0, hole) }, onLongPress: { addStrategyPoint($0) })
                        .accessibilityLabel(L10n.Map.accessibility(String(hole.number)))
                }
                mapControls
            }
            infoPanel(hole)
        }
    }

    private var mapControls: some View {
        VStack(spacing: Spacing.xs) {
            MapControlButton(systemImage: satellite ? "map" : "globe.europe.africa", label: satellite ? L10n.Map.vector : L10n.Map.satellite) {
                satellite.toggle()
            }
            if !satellite {
                MapControlButton(systemImage: "flag.circle", label: L10n.Map.zoomGreen) { greenFocus += 1 }
                MapControlButton(systemImage: "arrow.counterclockwise", label: L10n.Map.reset) {
                    reset += 1
                    points = []
                }
            }
        }
        .padding(Spacing.s)
    }

    private func infoPanel(_ hole: Hole) -> some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            if let course, course.tees.count > 1 {
                SegmentControl(options: course.tees.map(\.id), selection: Binding(get: { teeID ?? course.tees[0].id }, set: { teeID = $0 })) { id in
                    course.tee(id)?.name ?? id
                }
            }
            SegmentControl(options: PreviewMode.allCases, selection: $mode) { m in
                switch m {
                case .measure: return L10n.Preview.modeMeasure
                case .twoPoints: return L10n.Preview.modeTwoPoints
                case .strategy: return L10n.Preview.modeStrategy
                }
            }
            .onChange(of: mode) { _, _ in points = [] }
            Text(resultText(hole)).font(Typography.bodyEmphasis).frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityIdentifier("preview.result")
            if mode == .strategy {
                HStack(spacing: Spacing.s) {
                    SecondaryButton(title: L10n.Preview.clearStrategy, systemImage: "trash", role: .destructive) { strategy = [] }
                    SecondaryButton(title: L10n.Preview.saveStrategy, systemImage: "square.and.arrow.down") {
                        env.strategies.save(strategy, course: courseID, hole: holeNumber)
                        saved += 1
                    }
                }
            }
        }
        .padding(Spacing.m)
        .background(Palette.surface)
    }

    // MARK: Logik der Ansicht

    private func holeDetails(_ course: Course, _ hole: Hole) -> String {
        var parts = [L10n.Round.par(Format.score(hole.par)), L10n.Round.hcp(Format.score(hole.strokeIndex))]
        if let length = hole.teeBox(teeID)?.lengthMeters {
            parts.append(Format.distanceText(Double(length), unit: env.settings.data.unit))
        }
        return parts.joined(separator: " · ")
    }

    private func previousHole(_ course: Course) -> Int? {
        course.holes.last { $0.number < holeNumber }?.number
    }

    private func nextHole(_ course: Course) -> Int? {
        course.holes.first { $0.number > holeNumber }?.number
    }

    private func select(_ number: Int) {
        holeNumber = number
        points = []
        loadStrategy()
    }

    private func loadStrategy() {
        strategy = env.strategies.plan(course: courseID, hole: holeNumber)
    }

    private func tap(_ point: GeoPoint, _ hole: Hole) {
        switch mode {
        case .measure:
            points = [point]
        case .twoPoints:
            points = points.count >= 2 ? [point] : points + [point]
        case .strategy:
            addStrategyPoint(point)
        }
    }

    private func addStrategyPoint(_ point: GeoPoint) {
        mode = .strategy
        strategy = Array((strategy + [point]).suffix(3))
    }

    private func overlay(_ hole: Hole) -> HoleMapOverlay {
        var o = HoleMapOverlay()
        o.pin = hole.green?.defaultPin
        o.strategy = strategy
        let unit = env.settings.data.unit
        let tee = hole.teePosition(for: teeID)
        let green = hole.green?.resolvedCenter
        switch mode {
        case .measure:
            if let tee, let target = points.first {
                o.measureLine = [tee, target] + (green.map { [$0] } ?? [])
                o.labels = segmentLabels(o.measureLine, unit: unit)
            }
        case .twoPoints:
            if points.count == 2 {
                o.measureLine = points
                o.labels = segmentLabels(points, unit: unit)
            }
        case .strategy:
            if let tee, let green {
                o.labels = segmentLabels([tee] + strategy + [green], unit: unit)
            }
        }
        return o
    }

    private func segmentLabels(_ line: [GeoPoint], unit: DistanceFormat.Unit) -> [MapLabel] {
        zip(line, line.dropFirst()).enumerated().map { i, pair in
            let mid = LocalFrame(origin: pair.0).toGeo(LocalFrame(origin: pair.0).toLocal(pair.1) * 0.5)
            return MapLabel(id: "seg\(i)", point: mid, text: Format.distanceText(Geodesy.distance(pair.0, pair.1), unit: unit), style: .target)
        }
    }

    private func resultText(_ hole: Hole) -> String {
        let unit = env.settings.data.unit
        let tee = hole.teePosition(for: teeID)
        switch mode {
        case .measure:
            guard let tee, let target = points.first,
                  let m = TargetMeasurement.measure(from: tee, to: target, greenCenter: hole.green?.resolvedCenter) else {
                let toGreen = tee.flatMap { t in hole.green?.resolvedCenter.map { Geodesy.distance(t, $0) } }
                return L10n.Preview.teeToGreen(Format.distanceText(toGreen, unit: unit))
            }
            return L10n.Preview.measured(Format.distanceText(m.fromOrigin, unit: unit), Format.distanceText(m.toGreen, unit: unit))
        case .twoPoints:
            guard points.count == 2 else { return L10n.Preview.tapTwoPoints }
            return L10n.Preview.between(Format.distanceText(Geodesy.distance(points[0], points[1]), unit: unit))
        case .strategy:
            return strategy.isEmpty ? L10n.Preview.strategyHint : L10n.Preview.strategyCount(String(strategy.count))
        }
    }
}

struct MapControlButton: View {
    let systemImage: String
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: IconSize.m, weight: .semibold))
                .frame(width: TouchArea.minimum + 4, height: TouchArea.minimum + 4)
                .foregroundStyle(Palette.textPrimary)
                .background(.regularMaterial, in: Circle())
        }
        .accessibilityLabel(label)
    }
}
