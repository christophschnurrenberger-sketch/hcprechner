import GolfCore
import SwiftUI

/// Rundenergebnis (§46): Score, Stableford, Handicap-Differential mit Rechenweg-Hinweis, Putts, Fairways, GIR,
/// vordere/hintere neun, Highlights (nur aus tatsächlichen Eingaben) und Scorekarte.
struct RoundSummaryView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    let roundID: UUID
    var isFinishSheet = false
    @State private var editHole: EditableHole?
    @State private var editModel: RoundModel?
    @State private var confirmDelete = false

    var body: some View {
        Group {
            if let round = env.round(roundID), let owner = round.owner {
                content(round, owner)
            } else {
                ContentUnavailableView(L10n.Rounds.notFound, systemImage: "questionmark.folder")
            }
        }
        .background(Palette.background)
        .navigationTitle(isFinishSheet ? L10n.Summary.finishedTitle : L10n.Summary.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if isFinishSheet {
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.Common.done) { dismiss() }.accessibilityIdentifier("summary.done")
                }
            }
        }
    }

    private func content(_ round: Round, _ owner: RoundPlayer) -> some View {
        let cards = ScoringEngine.scorecards(for: round, rules: env.rules)
        let mine = cards.first { $0.player.id == owner.id } ?? ScoringEngine.scorecard(for: owner, round: round, rules: env.rules)
        let stats = Statistics.round(round, player: owner.id)
        let differential = ScoringEngine.differential(for: owner, round: round, rules: env.rules)
        return ScrollView {
            VStack(alignment: .leading, spacing: Spacing.l) {
                VStack(alignment: .leading, spacing: Spacing.xxs) {
                    Text(round.header.courseName).font(Typography.title)
                    Text(Format.date(round.header.date) + " · " + statusText(round.status))
                        .font(Typography.caption).foregroundStyle(Palette.textSecondary)
                }
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: Spacing.xs) {
                    MetricCard(label: L10n.Summary.score, value: mine.total.complete ? String(mine.total.gross) : Format.toPar(mine.total.toPar))
                    MetricCard(label: L10n.Summary.stableford, value: mine.hasStableford ? Format.score(mine.total.stableford) : "–")
                    MetricCard(label: L10n.Summary.differential, value: differential.scoreDifferential.map { Format.decimal($0) } ?? "–")
                    MetricCard(label: L10n.Summary.putts, value: Format.score(stats.totalPutts))
                    MetricCard(label: L10n.Summary.fairways, value: Format.percent(stats.fairwayPercentage))
                    MetricCard(label: L10n.Summary.gir, value: Format.percent(stats.girPercentage))
                }
                differentialNote(differential)
                if round.header.holes.count == 18, let front = mine.front, let back = mine.back {
                    GolfCard {
                        SectionHeader(title: L10n.Summary.yourRound)
                        HStack(spacing: Spacing.xs) {
                            MetricCard(label: L10n.Scorecard.front, value: front.scored > 0 ? String(front.gross) : "–")
                            MetricCard(label: L10n.Scorecard.back, value: back.scored > 0 ? String(back.gross) : "–")
                            MetricCard(label: L10n.Scorecard.total, value: mine.total.scored > 0 ? String(mine.total.gross) : "–")
                        }
                    }
                }
                highlights(stats)
                LeaderboardView(round: round, cards: cards, rules: env.rules)
                SectionHeader(title: L10n.Round.scorecard)
                ScorecardTable(round: round, cards: cards) { hole in
                    editModel = editModel ?? makeEditModel()
                    editHole = EditableHole(number: hole)
                }
                ShareLink(item: shareText(round, mine, stats)) {
                    Label(L10n.Summary.share, systemImage: "square.and.arrow.up")
                        .font(Typography.bodyEmphasis)
                        .frame(maxWidth: .infinity, minHeight: TouchArea.minimum + 4)
                        .foregroundStyle(Palette.brand)
                        .background(Palette.brandSoft, in: RoundedRectangle(cornerRadius: Radius.m, style: .continuous))
                }
                if !isFinishSheet {
                    if round.status == .inProgress {
                        PrimaryButton(title: L10n.Home.resume, systemImage: "play.fill") { env.presentedRoundID = round.id }
                    }
                    SecondaryButton(title: L10n.Rounds.delete, systemImage: "trash", role: .destructive) { confirmDelete = true }
                }
            }
            .padding(Spacing.m)
        }
        .sheet(item: $editHole) { hole in
            if let editModel {
                ScoreEntrySheet(model: editModel, holeNumber: hole.number).environment(env)
            }
        }
        .confirmationDialog(L10n.Rounds.deleteTitle, isPresented: $confirmDelete, titleVisibility: .visible) {
            Button(L10n.Rounds.delete, role: .destructive) {
                Task {
                    try? await env.deleteRound(round.id)
                    dismiss()
                }
            }
        } message: {
            Text(L10n.Rounds.deleteMessage)
        }
    }

    /// Bearbeiten einer gespeicherten Runde nutzt dasselbe Model wie der Rundenmodus (ohne GPS).
    private func makeEditModel() -> RoundModel {
        let model = RoundModel(roundID: roundID)
        Task { await model.load(env: env) }
        return model
    }

    @ViewBuilder
    private func differentialNote(_ result: RoundDifferentialResult) -> some View {
        if let issue = result.issue {
            NoticeBanner(text: DifferentialText.issue(issue), systemImage: "info.circle")
        } else if result.scoreDifferential != nil {
            NoticeBanner(text: result.countsForHandicapIndex ? L10n.Summary.counts : L10n.Summary.notCounted,
                         systemImage: result.countsForHandicapIndex ? "checkmark.seal" : "info.circle")
        }
    }

    @ViewBuilder
    private func highlights(_ s: RoundStatistics) -> some View {
        let items: [(String, String)] = [
            (s.eagles > 0 ? L10n.Summary.eagles(String(s.eagles)) : "", "star.fill"),
            (s.birdies > 0 ? L10n.Summary.birdies(String(s.birdies)) : "", "bird.fill"),
            (s.pars > 0 ? L10n.Summary.pars(String(s.pars)) : "", "flag.fill"),
            (s.onePutts > 0 ? L10n.Summary.onePutts(String(s.onePutts)) : "", "circle.circle"),
            (s.penaltyStrokes == 0 ? L10n.Summary.noPenalties : "", "hand.thumbsup.fill"),
        ].filter { !$0.0.isEmpty }
        if !items.isEmpty {
            GolfCard {
                SectionHeader(title: L10n.Summary.highlights)
                ForEach(items.indices, id: \.self) { i in
                    Label(items[i].0, systemImage: items[i].1).font(Typography.body)
                }
            }
        }
    }

    private func statusText(_ status: RoundStatus) -> String {
        switch status {
        case .inProgress: return L10n.Rounds.statusInProgress
        case .completed: return L10n.Rounds.statusCompleted
        case .abandoned: return L10n.Rounds.statusAbandoned
        }
    }

    private func shareText(_ round: Round, _ card: PlayerScorecard, _ stats: RoundStatistics) -> String {
        var lines = [AppBrand.name + " · " + round.header.courseName, Format.date(round.header.date)]
        lines.append(L10n.Summary.score + ": " + (card.total.complete ? String(card.total.gross) : "–") + " (" + Format.toPar(card.total.toPar) + ")")
        if card.hasStableford { lines.append(L10n.Summary.stableford + ": " + Format.score(card.total.stableford)) }
        if let putts = stats.totalPutts { lines.append(L10n.Summary.putts + ": " + String(putts)) }
        lines.append(L10n.Summary.fairways + ": " + Format.percent(stats.fairwayPercentage) + " · " + L10n.Summary.gir + ": " + Format.percent(stats.girPercentage))
        return lines.joined(separator: "\n")
    }
}

enum DifferentialText {
    static func issue(_ issue: DifferentialIssue) -> String {
        switch issue {
        case .roundIncomplete: return L10n.Differential.incomplete
        case .handicapIndexMissing: return L10n.Differential.indexMissing
        case .ratingMissing: return L10n.Differential.ratingMissing
        case .ratingScopeMismatch: return L10n.Differential.scopeMismatch
        case .holeDataIncomplete: return L10n.Differential.holeData
        case .invalidInput: return L10n.Differential.invalid
        }
    }
}
