import GolfCore
import SwiftUI

/// Score-Eingabe als Assistent (§22/§23/§79): Score → Mitspieler → Putts → Fairway → GIR → Extras.
/// Ein Tipp je Frage, danach geht es automatisch weiter; jede Antwort ist sofort gespeichert, „Fertig“ geht immer.
/// Standardfall „Score 5 → Putts 2 → GIR Nein → Fertig“ in vier Tipps.
struct ScoreEntrySheet: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    let model: RoundModel
    let holeNumber: Int

    @State private var step: ScoreEntryStep = .score
    @State private var score = HoleScore()
    @State private var others: [UUID: HoleScore] = [:]
    @State private var savedTick = 0
    @State private var loaded = false
    /// Speichervorgänge laufen nacheinander (keine Überholung älterer Stände)
    @State private var pending: Task<Void, Never>?

    private var par: Int? { model.round?.header.hole(holeNumber)?.par }
    private var owner: RoundPlayer? { model.owner }
    private var otherPlayers: [RoundPlayer] { model.header?.players.filter { $0.id != owner?.id } ?? [] }
    private var flow: ScoreEntryFlow {
        ScoreEntryFlow(scoring: model.scoring, par: par, hasOtherPlayers: !otherPlayers.isEmpty)
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: Spacing.l) {
                stepHeader
                Group {
                    switch step {
                    case .score: scoreStep
                    case .group: groupStep
                    case .putts: puttsStep
                    case .fairway: fairwayStep
                    case .gir: girStep
                    case .extras: extrasStep
                    }
                }
                .transition(.opacity)
                Spacer(minLength: 0)
                navigationRow
            }
            .padding(Spacing.m)
            .background(Palette.background)
            .navigationTitle(L10n.Round.holeTitle(String(holeNumber)) + " · " + L10n.Round.par(Format.score(par)))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.Common.done) { finish() }.fontWeight(.bold).accessibilityIdentifier("score.done")
                }
            }
        }
        .presentationDetents([.large])
        .sensoryFeedback(.success, trigger: savedTick) { _, _ in env.settings.data.haptics }
        .onAppear(perform: loadExisting)
    }

    private func loadExisting() {
        guard !loaded, let owner else { return }
        loaded = true
        score = model.score(player: owner.id, hole: holeNumber)
        for p in otherPlayers { others[p.id] = model.score(player: p.id, hole: holeNumber) }
        step = flow.first ?? .score
    }

    // MARK: Kopf und Navigation

    private var stepHeader: some View {
        VStack(spacing: Spacing.xs) {
            if let position = flow.position(of: step) {
                ProgressView(value: Double(position.index), total: Double(position.count))
                    .tint(Palette.brand)
                Text(L10n.ScoreEntry.step(String(position.index), String(position.count)))
                    .font(Typography.caption).foregroundStyle(Palette.textSecondary)
            }
            Text(title(step)).font(Typography.title).frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func title(_ step: ScoreEntryStep) -> String {
        switch step {
        case .score: return L10n.ScoreEntry.scoreTitle(owner?.name ?? "")
        case .group: return L10n.ScoreEntry.groupTitle
        case .putts: return L10n.ScoreEntry.puttsTitle
        case .fairway: return L10n.ScoreEntry.fairwayTitle
        case .gir: return L10n.ScoreEntry.girTitle
        case .extras: return L10n.ScoreEntry.extrasTitle
        }
    }

    private var navigationRow: some View {
        HStack(spacing: Spacing.s) {
            if let previous = flow.previous(before: step) {
                SecondaryButton(title: L10n.Common.back, systemImage: "chevron.left") { withAnimation { step = previous } }
            }
            if let next = flow.next(after: step) {
                SecondaryButton(title: L10n.Common.next, systemImage: "chevron.right") {
                    save()
                    withAnimation { step = next }
                }
            } else {
                PrimaryButton(title: L10n.Common.done, systemImage: "checkmark") { finish() }
            }
        }
    }

    private func advance() {
        save()
        if let next = flow.next(after: step) {
            withAnimation(.easeInOut(duration: 0.15)) { step = next }
        } else {
            finish()
        }
    }

    private func finish() {
        save()
        let task = pending
        Task { @MainActor in
            await task?.value
            dismiss()
            model.didFinishScore(autoHoleChange: env.settings.data.autoHoleChange)
        }
    }

    /// Speichert den eigenen Stand und die Mitspieler. Geschrieben werden nur geänderte Felder; jede Antwort ist sofort
    /// auf dem Gerät gesichert (offline-first).
    private func save() {
        guard let owner, let roundID = model.round?.id else { return }
        let own = ScoreEntryRules.normalized(score, par: par)
        let otherScores = others
        let hole = holeNumber
        let previous = pending
        pending = Task { @MainActor in
            await previous?.value
            var latest: Round?
            if own != model.score(player: owner.id, hole: hole),
               let updated = try? await env.saveScore(own, player: owner.id, hole: hole, roundID: roundID) {
                latest = updated
            }
            for (id, other) in otherScores where other.isScored {
                let normalized = ScoreEntryRules.normalized(other, par: par)
                guard normalized != model.score(player: id, hole: hole) else { continue }
                if let updated = try? await env.saveScore(normalized, player: id, hole: hole, roundID: roundID) {
                    latest = updated
                }
            }
            if let latest {
                model.applyRound(latest)
                savedTick += 1
            }
        }
    }

    // MARK: Schritte

    private var scoreStep: some View {
        VStack(spacing: Spacing.m) {
            HStack(spacing: Spacing.l) {
                stepperButton("minus") { adjustStrokes(-1) }
                Text(score.pickedUp ? "–" : score.strokes.map(String.init) ?? Format.score(par))
                    .font(.system(size: 64, weight: .heavy, design: .rounded).monospacedDigit())
                    .foregroundStyle(score.strokes == nil && !score.pickedUp ? Palette.textSecondary : Palette.textPrimary)
                    .frame(minWidth: 100)
                    .accessibilityIdentifier("score.value")
                stepperButton("plus") { adjustStrokes(1) }
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: Spacing.xs), count: 5), spacing: Spacing.xs) {
                ForEach(ScoreEntryRules.scoreOptions(par: par), id: \.value) { option in
                    ScoreButton(value: option.value, caption: option.relative.map(relativeName), par: par,
                                isSelected: score.strokes == option.value && !score.pickedUp) {
                        score.strokes = option.value
                        score.pickedUp = false
                        advance()
                    }
                    .accessibilityIdentifier("score.option.\(option.value)")
                }
            }
            ChoiceButton(title: L10n.ScoreEntry.pickedUp, systemImage: "hand.raised", isSelected: score.pickedUp) {
                score.pickedUp.toggle()
                if score.pickedUp { score.strokes = nil; advance() }
            }
        }
    }

    private func adjustStrokes(_ delta: Int) {
        let current = score.strokes ?? par ?? 4
        score.pickedUp = false
        score.strokes = min(ScoreEntryRules.maxStrokes, max(1, score.strokes == nil ? current : current + delta))
    }

    private func stepperButton(_ icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon).font(.title.weight(.bold))
                .frame(width: TouchArea.score, height: TouchArea.score)
                .background(Palette.surfaceMuted, in: Circle())
                .foregroundStyle(Palette.textPrimary)
        }
        .buttonStyle(PressableStyle())
        .accessibilityLabel(icon == "minus" ? L10n.ScoreEntry.fewer : L10n.ScoreEntry.more)
    }

    private var groupStep: some View {
        VStack(spacing: Spacing.s) {
            ForEach(otherPlayers) { player in
                let value = others[player.id] ?? HoleScore()
                HStack(spacing: Spacing.s) {
                    PlayerAvatar(name: player.name)
                    Text(player.name).font(Typography.bodyEmphasis)
                    Spacer()
                    Button { setOther(player.id, delta: -1) } label: { Image(systemName: "minus.circle.fill").font(.title) }
                        .accessibilityLabel(L10n.ScoreEntry.fewerFor(player.name))
                    Text(value.pickedUp ? "–" : value.strokes.map(String.init) ?? Format.score(par))
                        .font(Typography.metric)
                        .foregroundStyle(value.isScored ? Palette.textPrimary : Palette.textSecondary)
                        .frame(minWidth: 44)
                    Button { setOther(player.id, delta: 1) } label: { Image(systemName: "plus.circle.fill").font(.title) }
                        .accessibilityLabel(L10n.ScoreEntry.moreFor(player.name))
                    Button(L10n.ScoreEntry.parShort) { setOther(player.id, value: par ?? 4) }
                        .buttonStyle(.bordered)
                }
                .foregroundStyle(Palette.brand)
                .padding(Spacing.s)
                .background(Palette.surface, in: RoundedRectangle(cornerRadius: Radius.m, style: .continuous))
            }
        }
    }

    private func setOther(_ id: UUID, delta: Int) {
        var s = others[id] ?? HoleScore()
        let base = s.strokes ?? par ?? 4
        s.strokes = min(ScoreEntryRules.maxStrokes, max(1, s.strokes == nil ? base : base + delta))
        s.pickedUp = false
        others[id] = s
    }

    private func setOther(_ id: UUID, value: Int) {
        var s = others[id] ?? HoleScore()
        s.strokes = value
        s.pickedUp = false
        others[id] = s
    }

    private var puttsStep: some View {
        let maxPutts = ScoreEntryRules.maxPutts(strokes: score.strokes, penalties: score.penalties)
        return VStack(spacing: Spacing.s) {
            HStack(spacing: Spacing.xs) {
                ForEach(0...4, id: \.self) { n in
                    ChoiceButton(title: n == 4 ? "4+" : String(n), isSelected: n == 4 ? (score.putts ?? 0) >= 4 : score.putts == n) {
                        score.putts = n
                        if n < 4 { advance() }
                    }
                    .disabled(n > maxPutts)
                    .opacity(n > maxPutts ? 0.35 : 1)
                    .accessibilityIdentifier("putts.\(n)")
                }
            }
            if let putts = score.putts, putts >= 4 {
                Stepper(value: Binding(get: { score.putts ?? 4 }, set: { score.putts = $0 }), in: 4...max(4, maxPutts)) {
                    Text(L10n.ScoreEntry.puttsCount(String(putts))).font(Typography.bodyEmphasis)
                }
            }
        }
    }

    private var fairwayStep: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: Spacing.xs) {
            fairwayButton(.left, L10n.ScoreEntry.fairwayLeft, "arrow.up.left")
            fairwayButton(.right, L10n.ScoreEntry.fairwayRight, "arrow.up.right")
            fairwayButton(.hit, L10n.ScoreEntry.fairwayHit, "checkmark.circle.fill")
            fairwayButton(.short, L10n.ScoreEntry.fairwayShort, "arrow.down")
        }
    }

    private func fairwayButton(_ result: FairwayResult, _ title: String, _ icon: String) -> some View {
        ChoiceButton(title: title, systemImage: icon, isSelected: score.fairway == result) {
            score.fairway = result
            advance()
        }
        .accessibilityIdentifier("fairway.\(result.rawValue)")
    }

    private var girStep: some View {
        HStack(spacing: Spacing.xs) {
            ChoiceButton(title: L10n.Common.yes, systemImage: "checkmark", isSelected: score.gir == true) {
                score.gir = true
                advance()
            }
            .accessibilityIdentifier("gir.yes")
            ChoiceButton(title: L10n.Common.no, systemImage: "xmark", isSelected: score.gir == false) {
                score.gir = false
                advance()
            }
            .accessibilityIdentifier("gir.no")
        }
    }

    private var extrasStep: some View {
        VStack(alignment: .leading, spacing: Spacing.m) {
            Text(L10n.ScoreEntry.penalties).font(Typography.section)
            HStack(spacing: Spacing.xs) {
                ForEach(0...2, id: \.self) { n in
                    ChoiceButton(title: n == 2 ? "2+" : String(n), isSelected: n == 2 ? (score.penalties ?? 0) >= 2 : score.penalties == n) {
                        score.penalties = n
                    }
                }
            }
            Text(L10n.ScoreEntry.sand).font(Typography.section)
            HStack(spacing: Spacing.xs) {
                ChoiceButton(title: L10n.Common.yes, isSelected: score.sandShot == true) { score.sandShot = true }
                ChoiceButton(title: L10n.Common.no, isSelected: score.sandShot == false) { score.sandShot = false }
            }
            let issues = ScoreEntryRules.issues(ScoreEntryRules.normalized(score, par: par), par: par)
            if issues.contains(.girUnlikely) {
                NoticeBanner(text: L10n.ScoreEntry.girUnlikely, systemImage: "questionmark.circle", tone: .warning)
            }
        }
    }

    private func relativeName(_ r: RelativeScore) -> String {
        switch r {
        case .holeInOne: return L10n.Relative.holeInOne
        case .albatross: return L10n.Relative.albatross
        case .eagle: return L10n.Relative.eagle
        case .birdie: return L10n.Relative.birdie
        case .par: return L10n.Relative.par
        case .bogey: return L10n.Relative.bogey
        case .doubleBogey: return L10n.Relative.doubleBogey
        case .tripleBogey: return L10n.Relative.tripleBogey
        case .worse: return L10n.Relative.worse
        }
    }
}
