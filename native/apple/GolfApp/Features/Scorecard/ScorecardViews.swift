import GolfCore
import SwiftUI

/// Scorekarte als Tabelle: Loch, Par, HCP und je Spieler die Schläge (mit Kreis/Quadrat), Putts des Besitzers,
/// Summen vorne/hinten/gesamt (§24). Feste Spaltenbreiten – passt mit vier Spielern auf jedes iPhone.
struct ScorecardTable: View {
    let round: Round
    let cards: [PlayerScorecard]
    var onSelectHole: ((Int) -> Void)?

    private enum Width {
        static let hole: CGFloat = 36
        static let par: CGFloat = 30
        static let hcp: CGFloat = 34
        static let player: CGFloat = 46
        static let putts: CGFloat = 40
    }

    private var isEighteen: Bool { round.header.holes.count == 18 }

    var body: some View {
        VStack(spacing: 0) {
            headerRow
            Divider()
            ForEach(round.header.holes, id: \.number) { hole in
                holeRow(hole)
                if isEighteen && hole.number == 9 {
                    totalRow(L10n.Scorecard.front, holes: round.header.holes.filter { $0.number <= 9 }) { $0.front }
                }
            }
            Divider()
            if isEighteen {
                totalRow(L10n.Scorecard.back, holes: round.header.holes.filter { $0.number >= 10 }) { $0.back }
            }
            totalRow(L10n.Scorecard.total, holes: round.header.holes) { $0.total }
        }
        .font(.callout.monospacedDigit())
        .padding(Spacing.s)
        .background(Palette.surface, in: RoundedRectangle(cornerRadius: Radius.l, style: .continuous))
    }

    private var headerRow: some View {
        HStack(spacing: 0) {
            Text(L10n.Scorecard.hole).frame(width: Width.hole, alignment: .leading)
            Text(L10n.Scorecard.par).frame(width: Width.par)
            Text(L10n.Scorecard.hcp).frame(width: Width.hcp)
            ForEach(cards) { card in
                Text(card.player.name.split(separator: " ").first.map(String.init) ?? card.player.name)
                    .lineLimit(1).minimumScaleFactor(0.6).frame(width: Width.player)
            }
            Text(L10n.Scorecard.putts).lineLimit(1).minimumScaleFactor(0.6).frame(width: Width.putts)
            Spacer(minLength: 0)
        }
        .font(Typography.label)
        .foregroundStyle(Palette.textSecondary)
        .padding(.vertical, Spacing.xs)
    }

    private func holeRow(_ hole: PlayedHole) -> some View {
        Button {
            onSelectHole?(hole.number)
        } label: {
            HStack(spacing: 0) {
                Text(verbatim: String(hole.number)).font(Typography.bodyEmphasis).frame(width: Width.hole, alignment: .leading)
                Text(verbatim: Format.score(hole.par)).frame(width: Width.par)
                Text(verbatim: Format.score(hole.strokeIndex)).foregroundStyle(Palette.textSecondary).frame(width: Width.hcp)
                ForEach(cards) { card in
                    let result = card.hole(hole.number)
                    ScoreMark(strokes: result?.score.strokes, par: hole.par, pickedUp: result?.score.pickedUp ?? false)
                        .frame(width: Width.player)
                }
                Text(verbatim: Format.score(cards.first?.hole(hole.number)?.score.putts))
                    .foregroundStyle(Palette.textSecondary).frame(width: Width.putts)
                Spacer(minLength: 0)
            }
            .foregroundStyle(Palette.textPrimary)
            .padding(.vertical, 3)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(onSelectHole == nil)
        .accessibilityIdentifier("scorecard.hole.\(hole.number)")
    }

    private func totalRow(_ title: String, holes: [PlayedHole], value: (PlayerScorecard) -> ScoreTotals?) -> some View {
        HStack(spacing: 0) {
            Text(title).font(Typography.label).lineLimit(1).minimumScaleFactor(0.6).frame(width: Width.hole + Width.par, alignment: .leading)
            Text(verbatim: holes.allSatisfy { $0.par != nil } ? String(holes.reduce(0) { $0 + ($1.par ?? 0) }) : "–")
                .frame(width: Width.hcp)
            ForEach(cards) { card in
                let totals = value(card)
                Text(verbatim: totals.map { $0.scored > 0 ? String($0.gross) + ($0.pickups > 0 ? "*" : "") : "–" } ?? "–")
                    .font(Typography.bodyEmphasis).frame(width: Width.player)
            }
            Text(verbatim: Format.score(cards.first.flatMap { value($0)?.putts })).frame(width: Width.putts)
            Spacer(minLength: 0)
        }
        .padding(.vertical, Spacing.xs)
        .background(Palette.surfaceMuted, in: RoundedRectangle(cornerRadius: Radius.s, style: .continuous))
    }
}

/// Summen und Wertung je Spieler, nach Spielform.
struct ScorecardTotals: View {
    let round: Round
    let cards: [PlayerScorecard]
    let rules: WHSRuleSet

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            ForEach(cards) { card in
                GolfCard(padding: Spacing.s) {
                    HStack {
                        PlayerAvatar(name: card.player.name, size: 30)
                        Text(card.player.name).font(Typography.bodyEmphasis)
                        Spacer()
                        if let ph = card.handicap.playingHandicap {
                            Text(L10n.Scorecard.playingHandicap(String(ph))).font(Typography.caption).foregroundStyle(Palette.textSecondary)
                        }
                    }
                    HStack(spacing: Spacing.xs) {
                        MetricCard(label: L10n.Scorecard.gross, value: card.total.scored > 0 ? String(card.total.gross) : "–")
                        MetricCard(label: L10n.Scorecard.toPar, value: Format.toPar(card.total.toPar))
                        if card.handicap.hasNet {
                            MetricCard(label: L10n.Scorecard.netToPar, value: Format.toPar(card.total.netToPar))
                        }
                        if card.hasStableford {
                            MetricCard(label: L10n.Scorecard.stableford, value: Format.score(card.total.stableford))
                        }
                    }
                    if let issue = card.handicap.issue, issue != .disabled {
                        Text(HandicapIssueText.text(issue)).font(Typography.caption).foregroundStyle(Palette.textSecondary)
                    }
                }
            }
        }
    }
}

enum HandicapIssueText {
    static func text(_ issue: HandicapIssue) -> String {
        switch issue {
        case .disabled: return L10n.HandicapIssue.disabled
        case .handicapIndexMissing: return L10n.HandicapIssue.indexMissing
        case .ratingMissing: return L10n.HandicapIssue.ratingMissing
        case .ratingScopeMismatch: return L10n.HandicapIssue.scopeMismatch
        case .holeDataIncomplete: return L10n.HandicapIssue.holeData
        case .invalidInput: return L10n.HandicapIssue.invalid
        }
    }
}

/// Rangliste der Gruppe (Brutto, Netto, Stableford) bzw. Lochspiel-Stand.
struct LeaderboardView: View {
    let round: Round
    let cards: [PlayerScorecard]
    let rules: WHSRuleSet

    var body: some View {
        if round.header.format == .matchPlay, round.header.players.count == 2,
           let status = MatchPlayEngine.status(round: round, playerA: round.header.players[0].id, playerB: round.header.players[1].id, rules: rules) {
            GolfCard {
                Text(L10n.Scorecard.matchPlay).font(Typography.section)
                Text(matchText(status)).font(Typography.title)
                Text(L10n.Scorecard.matchHoles(String(status.holesPlayed), String(status.holesRemaining)))
                    .font(Typography.caption).foregroundStyle(Palette.textSecondary)
            }
        } else if cards.count > 1 {
            let metric: LeaderboardMetric = round.header.format == .stableford ? .stableford
                : (cards.allSatisfy { $0.handicap.hasNet } ? .netToPar : .grossToPar)
            GolfCard {
                Text(metricTitle(metric)).font(Typography.section)
                ForEach(Leaderboard.entries(cards, metric: metric)) { entry in
                    HStack {
                        Text(verbatim: entry.position.map { (entry.tied ? "T" : "") + String($0) } ?? "–")
                            .font(Typography.metricSmall).frame(width: 44, alignment: .leading)
                        Text(entry.name).font(Typography.bodyEmphasis)
                        Spacer()
                        Text(L10n.Scorecard.thru(String(entry.thru))).font(Typography.caption).foregroundStyle(Palette.textSecondary)
                        Text(verbatim: metric == .stableford ? Format.score(entry.value) : Format.toPar(entry.value))
                            .font(Typography.metricSmall).frame(minWidth: 48, alignment: .trailing)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }

    private func metricTitle(_ metric: LeaderboardMetric) -> String {
        switch metric {
        case .grossToPar: return L10n.Scorecard.leaderboardGross
        case .netToPar: return L10n.Scorecard.leaderboardNet
        case .stableford: return L10n.Scorecard.leaderboardStableford
        }
    }

    private func matchText(_ s: MatchPlayStatus) -> String {
        guard let leader = s.leader, let name = round.header.player(leader)?.name else {
            return s.holesPlayed == 0 ? L10n.Scorecard.matchNotStarted : L10n.Scorecard.allSquare
        }
        if s.isDecided && s.holesRemaining > 0 {
            return L10n.Scorecard.matchWon(name, String(abs(s.lead)), String(s.holesRemaining))
        }
        if s.isDormie { return L10n.Scorecard.matchDormie(name, String(abs(s.lead))) }
        return L10n.Scorecard.matchUp(name, String(abs(s.lead)))
    }
}

/// Scorekarte während der Runde (Blatt) – Tippen auf ein Loch öffnet die Eingabe für dieses Loch.
struct ScorecardSheet: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    let model: RoundModel
    @State private var editHole: EditableHole?

    var body: some View {
        ScrollView {
            if let round = model.round {
                let cards = ScoringEngine.scorecards(for: round, rules: env.rules)
                VStack(alignment: .leading, spacing: Spacing.m) {
                    LeaderboardView(round: round, cards: cards, rules: env.rules)
                    ScorecardTable(round: round, cards: cards) { editHole = EditableHole(number: $0) }
                    ScorecardTotals(round: round, cards: cards, rules: env.rules)
                }
                .padding(Spacing.m)
            }
        }
        .background(Palette.background)
        .navigationTitle(L10n.Round.scorecard)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .confirmationAction) { Button(L10n.Common.done) { dismiss() } } }
        .sheet(item: $editHole) { hole in
            ScoreEntrySheet(model: model, holeNumber: hole.number).environment(env)
        }
    }
}

struct EditableHole: Identifiable {
    let number: Int
    var id: Int { number }
}

/// Lochauswahl (Raster) mit Stand je Loch.
struct HolePickerSheet: View {
    @Environment(\.dismiss) private var dismiss
    let model: RoundModel

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.m) {
            Text(L10n.Round.chooseHole).font(Typography.title)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: Spacing.xs), count: 6), spacing: Spacing.xs) {
                ForEach(model.navigator.holes, id: \.self) { hole in
                    let selected = hole == model.holeNumber
                    let done = model.ownerScored(hole)
                    Button {
                        model.goTo(hole)
                        dismiss()
                    } label: {
                        VStack(spacing: 2) {
                            Text(verbatim: String(hole)).font(Typography.metricSmall)
                            Image(systemName: done ? "checkmark.circle.fill" : "circle").font(.caption2)
                        }
                        .frame(maxWidth: .infinity, minHeight: TouchArea.large)
                        .foregroundStyle(selected ? Palette.textOnBrand : Palette.textPrimary)
                        .background(selected ? Palette.brand : Palette.surfaceMuted, in: RoundedRectangle(cornerRadius: Radius.m, style: .continuous))
                    }
                    .buttonStyle(PressableStyle())
                    .accessibilityLabel(L10n.Round.holeState(String(hole), done ? L10n.Round.holeDone : L10n.Round.holeOpen))
                }
            }
        }
        .padding(Spacing.m)
    }
}
