import GolfCore
import GolfDemo
import HCPGolfKit
import SwiftUI

/// Profil, Einstellungen (§70), Datenschutz und – nach siebenmaligem Tippen auf die Version – das Entwicklermenü.
struct ProfileView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var showEditor = false
    @State private var versionTaps = 0
    @State private var confirmDeleteAll = false

    var body: some View {
        let profile = env.profile.profile
        List {
            Section {
                HStack(spacing: Spacing.m) {
                    PlayerAvatar(name: profile.displayName, size: 56)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(profile.displayName).font(Typography.title)
                        Text(L10n.Profile.handicapLine(Format.handicap(profile.handicapIndex))).font(Typography.body)
                            .foregroundStyle(Palette.textSecondary)
                    }
                }
                .padding(.vertical, Spacing.xs)
                Button(L10n.Profile.edit) { showEditor = true }
                Text(L10n.Profile.demoAccount).font(Typography.caption).foregroundStyle(Palette.textSecondary)
            }
            Section(L10n.Settings.title) {
                Picker(L10n.Settings.units, selection: env.settings.binding(\.unit)) {
                    Text(L10n.Settings.meters).tag(DistanceFormat.Unit.meters)
                    Text(L10n.Settings.yards).tag(DistanceFormat.Unit.yards)
                }
                Picker(L10n.Settings.autoHole, selection: env.settings.binding(\.autoHoleChange)) {
                    Text(L10n.Settings.autoHoleAutomatic).tag(AutoHoleChangeMode.automatic)
                    Text(L10n.Settings.autoHoleAsk).tag(AutoHoleChangeMode.ask)
                    Text(L10n.Settings.autoHoleOff).tag(AutoHoleChangeMode.off)
                }
                Picker(L10n.Settings.defaultScoring, selection: env.settings.binding(\.defaultScoring)) {
                    Text(L10n.Setup.scoringFull).tag(ScoringMode.full)
                    Text(L10n.Setup.scoringSimple).tag(ScoringMode.simple)
                    Text(L10n.Setup.scoringGPS).tag(ScoringMode.gpsOnly)
                }
                Toggle(L10n.Settings.arcs, isOn: env.settings.binding(\.showDistanceArcs))
                Toggle(L10n.Settings.haptics, isOn: env.settings.binding(\.haptics))
                Toggle(L10n.Settings.keepScreenOn, isOn: env.settings.binding(\.keepScreenOn))
                Picker(L10n.Settings.appearance, selection: env.settings.binding(\.appearance)) {
                    Text(L10n.Settings.appearanceSystem).tag(AppearanceSetting.system)
                    Text(L10n.Settings.appearanceLight).tag(AppearanceSetting.light)
                    Text(L10n.Settings.appearanceDark).tag(AppearanceSetting.dark)
                }
                Button(L10n.Settings.language) { openSettings() }
            }
            Section(L10n.Privacy.title) {
                Text(L10n.Privacy.location).font(Typography.caption)
                ShareLink(item: exportJSON(), preview: SharePreview(L10n.Privacy.exportTitle)) {
                    Label(L10n.Privacy.export, systemImage: "square.and.arrow.up")
                }
                Button(L10n.Privacy.deleteAll, role: .destructive) { confirmDeleteAll = true }
            }
            Section {
                Button {
                    versionTaps += 1
                    if versionTaps >= 7 {
                        env.settings.update { $0.developerMode = true }
                        versionTaps = 0
                    }
                } label: {
                    LabeledContent(L10n.Profile.version, value: AppBrand.name + " " + AppBrand.version)
                }
                .foregroundStyle(Palette.textPrimary)
                .accessibilityIdentifier("profile.version")
                if env.settings.data.developerMode {
                    NavigationLink(L10n.Developer.title) { DeveloperMenuView() }
                        .accessibilityIdentifier("profile.developer")
                }
            } footer: {
                Text(L10n.Profile.footer)
            }
        }
        .navigationTitle(L10n.Profile.title)
        .sheet(isPresented: $showEditor) { ProfileEditor() }
        .confirmationDialog(L10n.Privacy.deleteAllTitle, isPresented: $confirmDeleteAll, titleVisibility: .visible) {
            Button(L10n.Privacy.deleteAll, role: .destructive) {
                Task {
                    for round in env.roundList { try? await env.deleteRound(round.id) }
                }
            }
        } message: {
            Text(L10n.Privacy.deleteAllMessage)
        }
    }

    /// Datenexport (DSGVO): alle Runden als JSON.
    private func exportJSON() -> String {
        struct Export: Encodable {
            let profile: PlayerProfile
            let rounds: [ExportRound]
        }
        struct ExportRound: Encodable {
            let id: UUID
            let header: RoundHeader
            let status: String
            let scores: [String: [String: HoleScore]]
        }
        let rounds = env.roundList.map { r in
            ExportRound(id: r.id, header: r.header, status: r.status.rawValue,
                        scores: Dictionary(uniqueKeysWithValues: r.scores.map { player, holes in
                            (player.uuidString, Dictionary(uniqueKeysWithValues: holes.map { (String($0.key), $0.value) }))
                        }))
        }
        let encoder = GolfJSON.encoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = (try? encoder.encode(Export(profile: env.profile.profile, rounds: rounds))) ?? Data()
        return String(data: data, encoding: .utf8) ?? "{}"
    }
}

/// Profil bearbeiten: Name, Handicap Index, Geschlecht, Händigkeit, bevorzugter Abschlag, Heimatplatz.
struct ProfileEditor: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var handicap = ""
    @State private var gender: Gender = .male
    @State private var handedness: Handedness = .right
    @State private var tee: TeeColor = .yellow
    @State private var homeCourse: CourseID = ""
    @State private var courses: [CourseSummary] = []

    var body: some View {
        NavigationStack {
            Form {
                TextField(L10n.Profile.name, text: $name)
                TextField(L10n.Profile.handicapIndex, text: $handicap).keyboardType(.decimalPad)
                Picker(L10n.Setup.gender, selection: $gender) {
                    Text(L10n.Setup.male).tag(Gender.male)
                    Text(L10n.Setup.female).tag(Gender.female)
                }
                Picker(L10n.Profile.handedness, selection: $handedness) {
                    Text(L10n.Profile.rightHanded).tag(Handedness.right)
                    Text(L10n.Profile.leftHanded).tag(Handedness.left)
                }
                Picker(L10n.Profile.preferredTee, selection: $tee) {
                    ForEach(TeeColor.allCases, id: \.self) { color in
                        Text(L10n.Profile.teeColor(color)).tag(color)
                    }
                }
                Picker(L10n.Profile.homeCourse, selection: $homeCourse) {
                    Text(L10n.Profile.noHomeCourse).tag("")
                    ForEach(courses) { c in Text(c.name).tag(c.id) }
                }
                Text(L10n.Profile.handicapHint).font(Typography.caption).foregroundStyle(Palette.textSecondary)
            }
            .navigationTitle(L10n.Profile.edit)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(L10n.Common.cancel) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.Common.save) { save() }.disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .task {
                let p = env.profile.profile
                name = p.displayName
                handicap = p.handicapIndex.map { Format.handicap($0) } ?? ""
                gender = p.gender
                handedness = p.handedness
                tee = p.preferredTeeColor ?? .yellow
                homeCourse = p.homeCourseID ?? ""
                courses = (try? await env.courses.allCourses()) ?? []
            }
        }
    }

    private func save() {
        let text = handicap.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")
        // „+2,0“ = Plus-Handicap (negativer Index)
        let value: Double? = text.isEmpty ? nil : (text.hasPrefix("+") ? Double(text.dropFirst()).map { -$0 } : Double(text))
        env.profile.update { p in
            p.displayName = name.trimmingCharacters(in: .whitespaces)
            p.handicapIndex = value.map { min(54, max(-10, $0)) }
            p.gender = gender
            p.handedness = handedness
            p.preferredTeeColor = tee
            p.homeCourseID = homeCourse.isEmpty ? nil : homeCourse
        }
        dismiss()
    }
}
