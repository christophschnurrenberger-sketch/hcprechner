import GolfCore
import HCPGolfKit
import SwiftUI
import UIKit

/// Vollbild-Rundenmodus (§63): nur Distanz, Karte, Score, Loch. Keine Benachrichtigungen, keine Tabs.
struct RoundContainerView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    let roundID: UUID
    @State private var model: RoundModel

    init(roundID: UUID) {
        self.roundID = roundID
        _model = State(initialValue: RoundModel(roundID: roundID))
    }

    var body: some View {
        Group {
            switch model.loadState {
            case .loading:
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            case .failed:
                VStack(spacing: Spacing.m) {
                    ContentUnavailableView(L10n.Round.loadFailedTitle, systemImage: "exclamationmark.triangle",
                                           description: Text(L10n.Round.loadFailedText))
                    SecondaryButton(title: L10n.Common.close) { env.presentedRoundID = nil }
                        .padding(Spacing.m)
                }
            case .ready:
                RoundView(model: model)
            }
        }
        .background(Palette.background)
        .task { await model.load(env: env) }
    }
}

struct RoundView: View {
    @Environment(AppEnvironment.self) private var env
    @Bindable var model: RoundModel
    @State private var showScore = false
    @State private var showScorecard = false
    @State private var showHolePicker = false
    @State private var showEndDialog = false
    @State private var summaryRound: Round?
    @State private var greenFocus = 0
    @State private var resetMap = 0

    private var settings: SettingsData { env.settings.data }

    var body: some View {
        VStack(spacing: 0) {
            topBar
            ZStack(alignment: .top) {
                if model.viewMode == .map {
                    mapArea
                } else {
                    distanceFocus
                }
                banners.padding(Spacing.s)
            }
            if model.viewMode == .map {
                distancePanel
            }
            bottomBar
        }
        .background(Palette.background)
        .onAppear {
            env.location.start(background: true)
            UIApplication.shared.isIdleTimerDisabled = settings.keepScreenOn
            model.update(position: env.location.position, settings: settings)
        }
        .onDisappear {
            env.location.stop()
            UIApplication.shared.isIdleTimerDisabled = false
        }
        .onChange(of: env.location.position) { _, position in
            model.update(position: position, settings: settings)
        }
        .onChange(of: settings) { _, newValue in
            model.update(position: env.location.position, settings: newValue)
        }
        .sheet(isPresented: $showScore) {
            ScoreEntrySheet(model: model, holeNumber: model.holeNumber)
                .environment(env)
        }
        .sheet(isPresented: $showScorecard) {
            NavigationStack {
                ScorecardSheet(model: model)
            }
            .environment(env)
        }
        .sheet(isPresented: $showHolePicker) {
            HolePickerSheet(model: model)
                .presentationDetents([.medium])
                .environment(env)
        }
        .sheet(item: $summaryRound, onDismiss: { env.presentedRoundID = nil }) { round in
            NavigationStack {
                RoundSummaryView(roundID: round.id, isFinishSheet: true)
            }
            .environment(env)
        }
        .alert(L10n.Round.suggestionTitle, isPresented: suggestionBinding, presenting: model.suggestion) { suggestion in
            Button(L10n.Round.switchTo(String(suggestion.hole))) { model.acceptSuggestion() }
            Button(L10n.Common.no, role: .cancel) { model.declineSuggestion() }
        } message: { suggestion in
            Text(suggestionText(suggestion))
        }
        .confirmationDialog(L10n.Round.endTitle, isPresented: $showEndDialog, titleVisibility: .visible) {
            Button(L10n.Round.finish) { Task { await finish(.completed) } }
            Button(L10n.Round.abandon, role: .destructive) { Task { await finish(.abandoned) } }
            Button(L10n.Common.cancel, role: .cancel) {}
        } message: {
            Text(L10n.Round.endMessage(String(model.round?.scoredHoleCount ?? 0), String(model.header?.holes.count ?? 0)))
        }
        .sensoryFeedback(.selection, trigger: model.holeChangeTick) { _, _ in settings.haptics }
    }

    private var suggestionBinding: Binding<Bool> {
        Binding(get: { model.suggestion != nil }, set: { if !$0 { model.declineSuggestion() } })
    }

    private func suggestionText(_ s: RoundModel.HoleSuggestion) -> String {
        switch s.reason {
        case .scoreMissing: return L10n.Round.suggestionScoreMissing(String(model.holeNumber))
        case .unexpectedHole: return L10n.Round.suggestionUnexpected(String(s.hole))
        case .confirmationRequired: return L10n.Round.suggestionConfirm(String(s.hole))
        }
    }

    // MARK: Kopf

    private var topBar: some View {
        HStack(spacing: Spacing.xxs) {
            Button { env.presentedRoundID = nil } label: {
                Image(systemName: "chevron.down").font(.title3.weight(.bold)).frame(width: TouchArea.minimum, height: TouchArea.minimum)
            }
            .accessibilityLabel(L10n.Round.minimize)
            .accessibilityIdentifier("round.minimize")
            HoleHeader(
                holeTitle: L10n.Round.holeTitle(String(model.holeNumber)),
                details: holeDetails,
                scoreSummary: model.summary(rules: env.rules),
                onPrevious: model.navigator.isFirst ? nil : { model.previous() },
                onNext: model.navigator.isLast ? nil : { model.next() },
                previousLabel: L10n.Round.previousHole,
                nextLabel: L10n.Round.nextHole
            )
            Menu {
                if model.scoring.hasScorecard {
                    Button(L10n.Round.scorecard, systemImage: "tablecells") { showScorecard = true }
                }
                Button(L10n.Round.end, systemImage: "flag.checkered") { showEndDialog = true }
            } label: {
                Image(systemName: "ellipsis.circle").font(.title3.weight(.semibold)).frame(width: TouchArea.minimum, height: TouchArea.minimum)
            }
            .accessibilityLabel(L10n.Round.menu)
            .accessibilityIdentifier("round.menu")
        }
        .padding(.horizontal, Spacing.xs)
        .padding(.vertical, Spacing.xxs)
        .background(Palette.surface)
    }

    private var holeDetails: String {
        var parts = [L10n.Round.par(Format.score(model.playedHole?.par)), L10n.Round.hcp(Format.score(model.playedHole?.strokeIndex))]
        if let length = model.lengthFromTee { parts.append(Format.distanceText(Double(length), unit: settings.unit)) }
        parts.append(gpsText)
        return parts.joined(separator: " · ")
    }

    private var gpsText: String {
        guard let position = env.location.position else { return L10n.GPS.none }
        switch position.quality {
        case .excellent: return L10n.GPS.excellent(String(Int(position.accuracy.rounded())))
        case .good: return L10n.GPS.good(String(Int(position.accuracy.rounded())))
        case .weak: return L10n.GPS.weak(String(Int(position.accuracy.rounded())))
        case .stale: return L10n.GPS.stale
        case .unavailable: return L10n.GPS.none
        }
    }

    // MARK: Hinweise (§64)

    @ViewBuilder
    private var banners: some View {
        VStack(spacing: Spacing.xs) {
            if model.currentHole?.hasGPSData != true {
                NoticeBanner(text: L10n.Round.noGreenData, systemImage: "mappin.slash", tone: .warning)
            } else if env.location.authorization == .denied || env.location.authorization == .restricted {
                NoticeBanner(text: L10n.Location.deniedRound, systemImage: "location.slash", tone: .warning,
                             actionTitle: L10n.Location.openSettings) { openSettings() }
            } else if env.location.position == nil {
                NoticeBanner(text: L10n.Round.fromTeeNoGPS, systemImage: "location.magnifyingglass")
            } else if model.measuringFromTee {
                NoticeBanner(text: L10n.Round.offCourse, systemImage: "figure.walk")
            } else if let position = env.location.position, position.isStale || position.lastFixRejected || position.quality == .weak {
                NoticeBanner(text: L10n.GPS.weakNotice, systemImage: "antenna.radiowaves.left.and.right.slash", tone: .warning)
            }
            if env.location.lowPower {
                NoticeBanner(text: L10n.Round.lowPower, systemImage: "battery.25")
            }
        }
    }

    // MARK: Karte

    private var mapArea: some View {
        ZStack(alignment: .bottomTrailing) {
            if let hole = model.currentHole, hole.hasGPSData {
                HoleMapView(hole: hole, teeID: model.teeID, overlay: model.overlay(settings: settings), greenFocusToken: greenFocus,
                            resetToken: resetMap, onTap: { model.setTarget($0) }, onLongPress: { model.longPress($0) })
                    .accessibilityLabel(L10n.Map.accessibility(String(model.holeNumber)))
                    .accessibilityIdentifier("round.map")
            } else {
                Palette.mapRough
            }
            VStack(spacing: Spacing.xs) {
                MapControlButton(systemImage: "flag.circle", label: L10n.Map.zoomGreen) { greenFocus += 1 }
                MapControlButton(systemImage: "arrow.counterclockwise", label: L10n.Map.reset) {
                    resetMap += 1
                    model.setTarget(nil)
                }
                MapControlButton(systemImage: settings.showDistanceArcs ? "circle.dashed.inset.filled" : "circle.dashed",
                                 label: L10n.Map.arcs) {
                    env.settings.update { $0.showDistanceArcs.toggle() }
                }
            }
            .padding(Spacing.s)
        }
    }

    // MARK: Entfernungen

    private var labels: (front: String, center: String, back: String, pin: String) {
        (L10n.Distance.front, model.measuringFromTee ? L10n.Distance.centerFromTee : L10n.Distance.center, L10n.Distance.back, L10n.Distance.pin)
    }

    private var distancePanel: some View {
        VStack(spacing: Spacing.xs) {
            DistanceCard(front: model.front, center: model.center, back: model.back, pin: model.pinDistance,
                         unit: Format.unitSymbol(settings.unit), labels: labels)
                .accessibilityIdentifier("round.distances")
            if let target = model.target, let origin = model.origin {
                targetLine(origin: origin, target: target)
            }
            hazardStrip
        }
        .padding(.horizontal, Spacing.m)
        .padding(.vertical, Spacing.s)
        .background(Palette.surface)
    }

    private func targetLine(origin: GeoPoint, target: GeoPoint) -> some View {
        let m = TargetMeasurement.measure(from: origin, to: target, greenCenter: model.currentHole?.green?.resolvedCenter)
        return HStack {
            Image(systemName: "scope").foregroundStyle(Palette.mapTarget)
            Text(L10n.Distance.toTarget(Format.distanceText(m?.fromOrigin, unit: settings.unit),
                                        Format.distanceText(m?.toGreen, unit: settings.unit)))
                .font(Typography.bodyEmphasis)
            Spacer()
            Button { model.setTarget(nil) } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(Palette.textSecondary) }
                .accessibilityLabel(L10n.Distance.clearTarget)
        }
    }

    @ViewBuilder
    private var hazardStrip: some View {
        let items = model.hazards.filter { $0.kind.isHazard || $0.kind.isTarget }.prefix(8)
        if !items.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Spacing.xs) {
                    ForEach(Array(items)) { hazard in
                        HazardChip(hazard: hazard, unit: settings.unit)
                    }
                }
            }
        }
    }

    /// Ansicht „Distanz“: große Zahlen und alle Hindernisse, ohne Karte.
    private var distanceFocus: some View {
        ScrollView {
            VStack(spacing: Spacing.l) {
                DistanceCard(front: model.front, center: model.center, back: model.back, pin: model.pinDistance,
                             unit: Format.unitSymbol(settings.unit), labels: labels)
                    .padding(.top, Spacing.xxl)
                VStack(alignment: .leading, spacing: Spacing.s) {
                    SectionHeader(title: L10n.Distance.hazards)
                    if model.hazards.isEmpty {
                        Text(L10n.Distance.noHazards).font(Typography.body).foregroundStyle(Palette.textSecondary)
                    }
                    ForEach(model.hazards) { hazard in
                        HazardRow(hazard: hazard, unit: settings.unit)
                        Divider()
                    }
                }
                .padding(Spacing.m)
                .background(Palette.surface, in: RoundedRectangle(cornerRadius: Radius.l, style: .continuous))
            }
            .padding(Spacing.m)
        }
    }

    // MARK: Aktionen

    private var bottomBar: some View {
        var items: [GolfTabBar.Item] = [
            .init(id: "distance", title: L10n.Round.tabDistance, systemImage: "ruler", isSelected: model.viewMode == .distances) {
                model.viewMode = .distances
            },
            .init(id: "map", title: L10n.Round.tabMap, systemImage: "map", isSelected: model.viewMode == .map) {
                model.viewMode = .map
            },
        ]
        if model.scoring.hasScorecard {
            items.append(.init(id: "score", title: L10n.Round.tabScore, systemImage: "plus.square.fill", isProminent: true) {
                showScore = true
            })
        }
        items.append(.init(id: "hole", title: L10n.Round.tabHole, systemImage: "number.square") { showHolePicker = true })
        return GolfTabBar(items: items)
    }

    private func finish(_ status: RoundStatus) async {
        guard let round = model.round else { return }
        do {
            let updated = try await env.setStatus(status, roundID: round.id)
            model.applyRound(updated)
            if status == .completed {
                summaryRound = updated
            } else {
                env.presentedRoundID = nil
            }
        } catch {
            // Speichern ist lokal; ein Fehler hier bedeutet ein Problem mit dem Speicher
            env.presentedRoundID = nil
        }
    }
}

struct HazardChip: View {
    let hazard: FeatureDistance
    let unit: DistanceFormat.Unit

    var body: some View {
        HStack(spacing: Spacing.xxs) {
            Image(systemName: HazardText.icon(hazard.kind))
            Text(HazardText.short(hazard)).font(Typography.captionEmphasis)
            Text(HazardText.values(hazard, unit: unit)).font(.caption.monospacedDigit().weight(.bold))
        }
        .padding(.horizontal, Spacing.s)
        .padding(.vertical, Spacing.xs)
        .background(Palette.surfaceMuted, in: Capsule())
        .accessibilityElement(children: .combine)
    }
}

struct HazardRow: View {
    let hazard: FeatureDistance
    let unit: DistanceFormat.Unit

    var body: some View {
        HStack(spacing: Spacing.s) {
            Image(systemName: HazardText.icon(hazard.kind)).frame(width: IconSize.l).foregroundStyle(Palette.brand)
            VStack(alignment: .leading, spacing: 2) {
                Text(HazardText.title(hazard)).font(Typography.bodyEmphasis)
                if hazard.playerInside { Text(L10n.Distance.inside).font(Typography.caption).foregroundStyle(Palette.warning) }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(HazardText.values(hazard, unit: unit)).font(Typography.metricSmall)
                Text(hazard.carry != nil ? L10n.Distance.reachCenterCarry : L10n.Distance.reach)
                    .font(.caption2).foregroundStyle(Palette.textSecondary)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// Bezeichnungen für Hindernisse und Ziele (Art + Seite).
enum HazardText {
    static func icon(_ kind: HoleFeatureKind) -> String {
        switch kind {
        case .bunker: return "circle.dotted"
        case .water: return "drop.fill"
        case .outOfBounds: return "xmark.octagon"
        case .trees: return "tree.fill"
        case .rough: return "leaf"
        case .layup: return "target"
        case .dogleg: return "arrow.turn.up.right"
        case .target: return "scope"
        }
    }

    static func kindName(_ kind: HoleFeatureKind) -> String {
        switch kind {
        case .bunker: return L10n.Hazard.bunker
        case .water: return L10n.Hazard.water
        case .outOfBounds: return L10n.Hazard.outOfBounds
        case .trees: return L10n.Hazard.trees
        case .rough: return L10n.Hazard.rough
        case .layup: return L10n.Hazard.layup
        case .dogleg: return L10n.Hazard.dogleg
        case .target: return L10n.Hazard.target
        }
    }

    static func sideName(_ side: FeatureSide) -> String {
        switch side {
        case .left: return L10n.Hazard.left
        case .right: return L10n.Hazard.right
        case .center: return L10n.Hazard.center
        }
    }

    static func title(_ h: FeatureDistance) -> String {
        h.kind.isTarget ? kindName(h.kind) : kindName(h.kind) + " " + sideName(h.side)
    }

    static func short(_ h: FeatureDistance) -> String {
        h.kind.isTarget ? kindName(h.kind) : kindName(h.kind) + " " + String(sideName(h.side).prefix(1)).uppercased()
    }

    /// „120 / 128 / 137“ (Anfang / Mitte / Ende) bzw. nur „145“.
    static func values(_ h: FeatureDistance, unit: DistanceFormat.Unit) -> String {
        let reach = Format.distance(h.reach, accuracy: nil, unit: unit).text
        guard let carry = h.carry else { return reach }
        let center = Format.distance(h.center, accuracy: nil, unit: unit).text
        return reach + " / " + center + " / " + Format.distance(carry, accuracy: nil, unit: unit).text
    }
}
