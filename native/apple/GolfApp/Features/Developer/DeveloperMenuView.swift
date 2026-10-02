import GolfCore
import GolfDemo
import HCPGolfKit
import SwiftUI

/// Verstecktes Entwicklermenü (§74): Fake GPS, Position je Loch, Genauigkeit, GPS-Sprung, Runde simulieren,
/// Offline-Modus, Synchronisation erzwingen, Demo-Daten zurücksetzen, Design-System.
/// Noch nicht enthalten (spätere Phasen): Wind/Höhe (Plays Like), Schlag erzeugen, Watch simulieren, Benutzer wechseln.
struct DeveloperMenuView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var hole = 1
    @State private var confirmReset = false

    private var simulator: SimulatedLocationSource { env.location.simulator }

    var body: some View {
        @Bindable var sim = env.location.simulator
        List {
            Section(L10n.Developer.gps) {
                Toggle(L10n.Developer.fakeGPS, isOn: Binding(get: { env.location.usesSimulation }, set: { env.location.setSimulation($0) }))
                    .accessibilityIdentifier("dev.fakeGPS")
                if env.location.usesSimulation {
                    Stepper(value: $hole, in: 1...18) { Text(L10n.Developer.hole(String(hole))) }
                    HStack {
                        Button(L10n.Developer.spotTee) { place(.tee) }
                        Spacer()
                        Button(L10n.Developer.spotFairway) { place(.fairway(toGreen: 150)) }
                        Spacer()
                        Button(L10n.Developer.spotGreen) { place(.green) }
                        Spacer()
                        Button(L10n.Developer.spotNextTee) { place(.nextTee) }
                    }
                    .buttonStyle(.bordered)
                    VStack(alignment: .leading) {
                        Text(L10n.Developer.accuracy(String(Int(sim.accuracy))))
                        Slider(value: $sim.accuracy, in: 2...60, step: 1)
                    }
                    VStack(alignment: .leading) {
                        Text(L10n.Developer.noise(Format.decimal(sim.noise)))
                        Slider(value: $sim.noise, in: 0...10, step: 0.5)
                    }
                    Button(L10n.Developer.jump) { sim.injectJump() }
                    VStack(alignment: .leading) {
                        Text(L10n.Developer.speed(Format.decimal(sim.speed)))
                        Slider(value: $sim.speed, in: 1...5, step: 0.5)
                    }
                    Button(L10n.Developer.simulateRound) { Task { await simulateRound() } }
                    if let progress = sim.replayProgress {
                        ProgressView(value: progress)
                    }
                }
                LabeledContent(L10n.Developer.position, value: positionText)
            }
            Section(L10n.Developer.network) {
                Toggle(L10n.Developer.offline, isOn: Binding(get: { env.simulateOffline }, set: { value in
                    Task { await env.setSimulateOffline(value) }
                }))
                Button(L10n.Developer.forceSync) { Task { await env.syncNow() } }
                LabeledContent(L10n.Developer.syncState, value: syncText)
            }
            Section(L10n.Developer.data) {
                Button(L10n.Developer.resetDemo, role: .destructive) { confirmReset = true }
                NavigationLink(L10n.Developer.designSystem) { DesignSystemGallery() }
                Button(L10n.Developer.hide) { env.settings.update { $0.developerMode = false } }
            }
        }
        .navigationTitle(L10n.Developer.title)
        .onAppear { if let current = env.activeRound.flatMap({ $0.firstOpenHole }) { hole = current } }
        .confirmationDialog(L10n.Developer.resetDemo, isPresented: $confirmReset, titleVisibility: .visible) {
            Button(L10n.Developer.resetDemo, role: .destructive) { Task { await resetDemo() } }
        }
    }

    private var positionText: String {
        guard let p = env.location.position else { return "–" }
        return String(format: "%.5f, %.5f ±%.0f m", p.point.latitude, p.point.longitude, p.accuracy)
    }

    private var syncText: String {
        switch env.syncStatus {
        case .idle: return L10n.Sync.idle
        case .syncing: return L10n.Sync.syncing
        case let .synced(date): return L10n.Sync.synced + " " + date.formatted(date: .omitted, time: .standard)
        case let .offline(pending): return L10n.Sync.offline(String(pending))
        case let .failed(message): return L10n.Sync.failed + " (" + message + ")"
        }
    }

    /// Platz der laufenden Runde, sonst der Demo-Meisterschaftsplatz.
    private func currentCourse() async -> Course? {
        let id = env.activeRound?.header.courseID ?? DemoCourses.championshipID
        return try? await env.loadCourse(id)
    }

    private func place(_ spot: CourseWalkSimulator.Spot) {
        Task {
            guard let course = await currentCourse(), let h = course.hole(hole) else { return }
            let teeID = env.activeRound?.owner?.teeID ?? "yellow"
            let next = course.hole(hole + 1) ?? course.holes.first
            if let point = CourseWalkSimulator.position(spot, hole: h, next: next, teeID: teeID) {
                if !env.location.isActive { env.location.start(background: false) }
                simulator.setFixed(point)
            }
        }
    }

    /// Spielt eine ganze Runde ab (Abschlag → Schläge → Grün → nächster Abschlag) – zeigt den automatischen Lochwechsel.
    private func simulateRound() async {
        guard let course = await currentCourse() else { return }
        let holes = env.activeRound?.header.holeNumbers ?? course.holes.map(\.number)
        let start = holes.firstIndex(of: hole) ?? 0
        let teeID = env.activeRound?.owner?.teeID ?? "yellow"
        let fixes = CourseWalkSimulator.walk(course: course, holes: Array(holes[start...]), teeID: teeID, start: Date())
        if !env.location.isActive { env.location.start(background: false) }
        simulator.play(fixes.map(\.point))
    }

    private func resetDemo() async {
        for round in env.roundList { try? await env.deleteRound(round.id) }
        env.profile.update { $0 = DemoPeople.owner }
        env.settings.update { s in
            let developer = s.developerMode
            s = SettingsData()
            s.developerMode = developer
        }
    }
}

/// Alle Komponenten des Design-Systems in hell und dunkel prüfen.
struct DesignSystemGallery: View {
    @State private var segment = 0
    @State private var sheet = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.l) {
                PrimaryButton(title: "PrimaryButton", systemImage: "play.fill") {}
                SecondaryButton(title: "SecondaryButton", systemImage: "star") {}
                GolfCard {
                    Text(verbatim: "GolfCard").font(Typography.section)
                    Text(verbatim: "Typography.body").font(Typography.body)
                }
                HStack { ForEach([3, 4, 5, 6], id: \.self) { ScoreMark(strokes: $0, par: 4) } }
                HStack(spacing: Spacing.xs) {
                    ScoreButton(value: 3, caption: "Birdie", isSelected: false) {}
                    ScoreButton(value: 4, caption: "Par", isSelected: true) {}
                    ScoreButton(value: 5, caption: "Bogey", isSelected: false) {}
                }
                DistanceCard(front: DistanceValue(value: 118), center: DistanceValue(value: 132), back: DistanceValue(value: 146),
                             pin: DistanceValue(value: 139), unit: "m", labels: ("Front", "Mitte", "Back", "Pin"))
                HoleHeader(holeTitle: "Loch 7", details: "Par 4 · HCP 3 · 356 m", scoreSummary: "+3")
                HStack(spacing: Spacing.s) {
                    StatCard(title: "StatCard", value: "42 %", subtitle: "12 / 28")
                    MetricCard(label: "MetricCard", value: "36")
                }
                HStack { PlayerAvatar(name: "Anna Muster"); PlayerAvatar(name: "Max") }
                RoundRow(course: "Demo Golf Club", date: "12.09.2026", score: "90 (+18)", detail: "39 Punkte")
                ClubRow(name: "7 Iron", carry: "135 m")
                SegmentControl(options: [0, 1, 2], selection: $segment) { ["Eins", "Zwei", "Drei"][$0] }
                NoticeBanner(text: "NoticeBanner", systemImage: "info.circle", tone: .warning)
                Button { sheet = true } label: { Text(verbatim: "BottomSheet") }
                GolfTabBar(items: [
                    .init(id: "a", title: "Distanz", systemImage: "ruler", isSelected: true) {},
                    .init(id: "b", title: "Karte", systemImage: "map") {},
                    .init(id: "c", title: "Score", systemImage: "plus.square.fill", isProminent: true) {},
                    .init(id: "d", title: "Loch", systemImage: "number.square") {},
                ])
            }
            .padding(Spacing.m)
        }
        .background(Palette.background)
        .navigationTitle(L10n.Developer.designSystem)
        .bottomSheet(isPresented: $sheet) {
            Text(verbatim: "BottomSheet").font(Typography.title).padding()
        }
    }
}
