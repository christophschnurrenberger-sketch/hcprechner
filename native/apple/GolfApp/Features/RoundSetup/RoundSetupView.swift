import GolfCore
import GolfDemo
import SwiftUI

/// Runde konfigurieren – in der Reihenfolge des Konzepts (Platz → Löcher → Datum → Abschlag → Spielform → Handicap →
/// Erfassung → Privatsphäre → Mitspieler). Alles ist sinnvoll vorbelegt: Meist genügt ein Tipp auf „Runde starten“.
/// Gezeigt werden nur Optionen, die mit den Platzdaten funktionieren; die Regeln dafür liegen in `RoundSetup` (GolfCore).
struct RoundSetupView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    let courseID: CourseID

    @State private var draft: RoundSetupDraft?
    @State private var date = Date()
    @State private var loadFailed = false
    @State private var starting = false
    @State private var startError: String?
    @State private var showAddGuest = false

    var body: some View {
        Group {
            if let draft {
                form(draft)
            } else if loadFailed {
                ContentUnavailableView(L10n.Courses.unavailableTitle, systemImage: "wifi.slash", description: Text(L10n.Courses.unavailableText))
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(Palette.background)
        .navigationTitle(L10n.Setup.title)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .sheet(isPresented: $showAddGuest) {
            GuestEditor { guest in draft?.players.append(guest) }
                .presentationDetents([.medium])
        }
    }

    private func load() async {
        guard draft == nil else { return }
        do {
            let course = try await env.loadCourse(courseID)
            let profile = env.profile.profile
            var d = RoundSetupDraft(course: course, owner: profile.setupPlayer(), date: LocalDate(Date()), preferredTee: profile.preferredTeeColor)
            d.scoring = env.settings.data.defaultScoring
            draft = d
        } catch {
            loadFailed = true
        }
    }

    private func binding<T>(_ keyPath: WritableKeyPath<RoundSetupDraft, T>, fallback: T) -> Binding<T> {
        Binding(get: { draft?[keyPath: keyPath] ?? fallback }, set: { draft?[keyPath: keyPath] = $0 })
    }

    private func form(_ draft: RoundSetupDraft) -> some View {
        let course = draft.course
        let issues = RoundSetup.issues(draft)
        let holes = RoundSetup.playedHoles(course: course, selection: draft.holeSelection)
        let formats = RoundSetup.availableFormats(holes: holes, playerCount: draft.players.count)
        return ScrollView {
            VStack(alignment: .leading, spacing: Spacing.l) {
                // 1 Platz
                GolfCard {
                    Text(course.name).font(Typography.title)
                    Text(course.clubName + " · " + course.city).font(Typography.caption).foregroundStyle(Palette.textSecondary)
                    if course.source == .demo {
                        Badge(text: L10n.Courses.badgeDemo, systemImage: "testtube.2", tone: .warning)
                    }
                }
                // 2 Löcher
                section(L10n.Setup.holes) {
                    let selections = RoundSetup.availableHoleSelections(for: course)
                    SegmentControl(options: selections, selection: binding(\.holeSelection, fallback: selections.first ?? .all18)) { s in
                        switch s {
                        case .all18: return L10n.Setup.holes18
                        case .front9: return L10n.Setup.front9
                        case .back9: return L10n.Setup.back9
                        case .nine: return L10n.Setup.holes9
                        }
                    }
                }
                // 3 Datum
                section(L10n.Setup.date) {
                    DatePicker(L10n.Setup.date, selection: $date, in: ...Date(), displayedComponents: .date)
                        .labelsHidden()
                        .onChange(of: date) { _, value in self.draft?.date = LocalDate(value) }
                }
                // 4 Abschlag (je Spieler, unten bei den Mitspielern) und 5 Spielform
                section(L10n.Setup.format) {
                    SegmentControl(options: formats, selection: binding(\.format, fallback: .strokePlay)) { f in
                        switch f {
                        case .strokePlay: return L10n.Setup.strokePlay
                        case .stableford: return L10n.Setup.stableford
                        case .matchPlay: return L10n.Setup.matchPlay
                        }
                    }
                    if !formats.contains(.matchPlay) {
                        Text(L10n.Setup.matchPlayHint).font(Typography.caption).foregroundStyle(Palette.textSecondary)
                    }
                }
                // 6 Handicap
                section(L10n.Setup.handicap) {
                    SegmentControl(options: HandicapMode.allCases, selection: binding(\.handicap.mode, fallback: .handicapIndex)) { m in
                        switch m {
                        case .handicapIndex: return L10n.Setup.handicapIndex
                        case .playingHandicap: return L10n.Setup.playingHandicap
                        case .none: return L10n.Setup.noHandicap
                        }
                    }
                    if draft.handicap.mode == .handicapIndex {
                        Stepper(value: binding(\.handicap.allowancePercent, fallback: 100), in: 50...100, step: 5) {
                            Text(L10n.Setup.allowance(String(draft.handicap.allowancePercent)))
                                .font(Typography.body)
                        }
                    }
                }
                // 7 Erfassung
                section(L10n.Setup.scoring) {
                    SegmentControl(options: ScoringMode.allCases, selection: binding(\.scoring, fallback: .full)) { s in
                        switch s {
                        case .full: return L10n.Setup.scoringFull
                        case .simple: return L10n.Setup.scoringSimple
                        case .gpsOnly: return L10n.Setup.scoringGPS
                        }
                    }
                }
                // 8 Privatsphäre
                section(L10n.Setup.privacy) {
                    SegmentControl(options: RoundPrivacy.allCases, selection: binding(\.privacy, fallback: .private)) { p in
                        switch p {
                        case .private: return L10n.Setup.privacyPrivate
                        case .friends: return L10n.Setup.privacyFriends
                        case .public: return L10n.Setup.privacyPublic
                        }
                    }
                    Text(L10n.Setup.privacyHint).font(Typography.caption).foregroundStyle(Palette.textSecondary)
                }
                // 9 Spieler mit Abschlag
                playersSection(draft)
                // Handicap-Wertung
                section(L10n.Setup.countsTitle) {
                    Toggle(L10n.Setup.countsToggle, isOn: binding(\.countsForHandicap, fallback: false))
                        .disabled(course.source == .demo)
                    Text(course.source == .demo ? L10n.Setup.countsDemo : L10n.Setup.countsHint)
                        .font(Typography.caption).foregroundStyle(Palette.textSecondary)
                }
                issueList(issues, draft: draft)
                if let startError {
                    NoticeBanner(text: startError, systemImage: "exclamationmark.triangle", tone: .danger)
                }
                PrimaryButton(title: L10n.Setup.start, systemImage: "play.fill", isEnabled: RoundSetup.canStart(draft) && !starting) {
                    Task { await start() }
                }
                .accessibilityIdentifier("setup.start")
            }
            .padding(Spacing.m)
        }
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            SectionHeader(title: title)
            content()
        }
    }

    private func playersSection(_ draft: RoundSetupDraft) -> some View {
        section(L10n.Setup.players) {
            ForEach(draft.players) { player in
                PlayerSetupRow(player: player, course: draft.course, selection: draft.holeSelection,
                               handicapMode: draft.handicap.mode, canRemove: player.kind != .owner,
                               update: { updated in
                                   if let i = self.draft?.players.firstIndex(where: { $0.id == updated.id }) { self.draft?.players[i] = updated }
                               },
                               remove: { self.draft?.players.removeAll { $0.id == player.id } })
            }
            if draft.players.count < RoundSetup.maxPlayers {
                Menu {
                    ForEach(DemoPeople.friends.filter { f in !draft.players.contains { $0.userID == f.id } }) { friend in
                        Button(friend.name + " (" + Format.handicap(friend.handicapIndex) + ")") { addFriend(friend) }
                    }
                    Button(L10n.Setup.addGuest, systemImage: "person.badge.plus") { showAddGuest = true }
                } label: {
                    Label(L10n.Setup.addPlayer, systemImage: "plus.circle.fill")
                        .font(Typography.bodyEmphasis)
                        .frame(maxWidth: .infinity, minHeight: TouchArea.minimum)
                        .foregroundStyle(Palette.brand)
                        .background(Palette.brandSoft, in: RoundedRectangle(cornerRadius: Radius.m, style: .continuous))
                }
            }
        }
    }

    private func addFriend(_ friend: DemoPeople.Friend) {
        guard let course = draft?.course else { return }
        let tee = RoundSetup.defaultTee(for: course, preferred: nil, gender: friend.gender)
        draft?.players.append(SetupPlayer(kind: .friend, name: friend.name, userID: friend.id, handicapIndex: friend.handicapIndex,
                                          gender: friend.gender, teeID: tee?.id))
    }

    @ViewBuilder
    private func issueList(_ issues: [SetupIssue], draft: RoundSetupDraft) -> some View {
        if !issues.isEmpty {
            VStack(alignment: .leading, spacing: Spacing.xs) {
                ForEach(Array(issues.enumerated()), id: \.offset) { item in
                    NoticeBanner(text: describe(item.element, draft),
                                 systemImage: item.element.isBlocking ? "exclamationmark.octagon" : "info.circle",
                                 tone: item.element.isBlocking ? .danger : .info)
                }
            }
        }
    }

    private func describe(_ issue: SetupIssue, _ draft: RoundSetupDraft) -> String {
        func name(_ id: UUID) -> String { draft.players.first { $0.id == id }?.name ?? "" }
        switch issue {
        case .matchPlayNeedsTwoPlayers: return L10n.Setup.issueMatchPlay
        case .stablefordNeedsHoleData: return L10n.Setup.issueStableford
        case let .tooManyPlayers(max): return L10n.Setup.issueTooMany(String(max))
        case .playerNameMissing: return L10n.Setup.issueName
        case let .teeMissing(id): return L10n.Setup.issueTee(name(id))
        case let .handicapMissing(id): return L10n.Setup.issueHandicap(name(id))
        case let .ratingMissing(id): return L10n.Setup.issueRating(name(id))
        case let .ratingUnverified(id): return L10n.Setup.issueUnverified(name(id))
        case .demoCourseNotCountable: return L10n.Setup.countsDemo
        }
    }

    private func start() async {
        guard let draft else { return }
        starting = true
        defer { starting = false }
        do {
            _ = try await env.startRound(draft)
            dismiss()
        } catch {
            startError = L10n.Setup.startFailed
        }
    }
}

/// Spielerzeile: Name, Handicap, Geschlecht (für das Rating), Abschlag, Rating-Bestätigung.
struct PlayerSetupRow: View {
    let player: SetupPlayer
    let course: Course
    let selection: HoleSelection
    let handicapMode: HandicapMode
    let canRemove: Bool
    let update: (SetupPlayer) -> Void
    let remove: () -> Void

    var body: some View {
        let rating = RoundSetup.rating(course: course, teeID: player.teeID, gender: player.gender, selection: selection)
        GolfCard(padding: Spacing.s) {
            HStack(spacing: Spacing.s) {
                PlayerAvatar(name: player.name)
                VStack(alignment: .leading, spacing: 2) {
                    Text(player.name).font(Typography.bodyEmphasis)
                    Text(L10n.Setup.playerHandicap(Format.handicap(player.handicapIndex))).font(Typography.caption).foregroundStyle(Palette.textSecondary)
                }
                Spacer()
                if canRemove {
                    Button(role: .destructive, action: remove) {
                        Image(systemName: "minus.circle.fill").font(.title3).frame(width: TouchArea.minimum, height: TouchArea.minimum)
                    }
                    .accessibilityLabel(L10n.Setup.removePlayer(player.name))
                }
            }
            if !course.tees.isEmpty {
                Picker(L10n.Setup.tee, selection: Binding(get: { player.teeID ?? course.tees[0].id }, set: { id in
                    var p = player
                    p.teeID = id
                    update(p)
                })) {
                    ForEach(course.tees) { tee in Text(tee.name).tag(tee.id) }
                }
                .pickerStyle(.segmented)
            }
            if handicapMode == .playingHandicap {
                Stepper(value: Binding(get: { player.manualPlayingHandicap ?? 0 }, set: { v in
                    var p = player
                    p.manualPlayingHandicap = v
                    update(p)
                }), in: -10...60) {
                    Text(L10n.Setup.manualPlayingHandicap(player.manualPlayingHandicap.map(String.init) ?? "–"))
                        .font(Typography.body)
                }
            }
            Picker(L10n.Setup.gender, selection: Binding(get: { player.gender }, set: { g in
                var p = player
                p.gender = g
                update(p)
            })) {
                Text(L10n.Setup.male).tag(Gender.male)
                Text(L10n.Setup.female).tag(Gender.female)
            }
            .pickerStyle(.segmented)
            if let rating {
                RatingLine(rating: rating)
                if rating.status == .unverified && player.kind == .owner {
                    Toggle(L10n.Setup.confirmRating, isOn: Binding(get: { player.confirmedUnverifiedRating }, set: { v in
                        var p = player
                        p.confirmedUnverifiedRating = v
                        update(p)
                    }))
                    .font(Typography.caption)
                }
            } else {
                Text(L10n.Setup.noRatingForTee).font(Typography.caption).foregroundStyle(Palette.warning)
            }
        }
    }
}

/// Gastspieler anlegen: Name, Handicap Index (optional), Geschlecht.
struct GuestEditor: View {
    @Environment(\.dismiss) private var dismiss
    let onSave: (SetupPlayer) -> Void
    @State private var name = ""
    @State private var handicap = ""
    @State private var gender: Gender = .male

    var body: some View {
        NavigationStack {
            Form {
                TextField(L10n.Setup.guestName, text: $name)
                    .textContentType(.name)
                TextField(L10n.Setup.guestHandicap, text: $handicap)
                    .keyboardType(.decimalPad)
                Picker(L10n.Setup.gender, selection: $gender) {
                    Text(L10n.Setup.male).tag(Gender.male)
                    Text(L10n.Setup.female).tag(Gender.female)
                }
                .pickerStyle(.segmented)
            }
            .navigationTitle(L10n.Setup.addGuest)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(L10n.Common.cancel) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.Common.add) {
                        let hi = Double(handicap.replacingOccurrences(of: ",", with: ".").trimmingCharacters(in: .whitespaces))
                        onSave(SetupPlayer(kind: .guest, name: name.trimmingCharacters(in: .whitespaces),
                                           handicapIndex: hi.map { min(54, max(-10, $0)) }, gender: gender))
                        dismiss()
                    }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }
}
