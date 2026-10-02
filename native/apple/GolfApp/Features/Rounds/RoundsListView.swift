import GolfCore
import SwiftUI

enum RoundListFilter: Hashable, CaseIterable {
    case all, eighteen, nine, counting
}

enum RoundListSort: Hashable, CaseIterable {
    case newest, best, worst
}

/// Runden (§47): laufende Runde, Verlauf mit Filtern (9/18 Loch, handicaprelevant) und Sortierung, Löschen.
struct RoundsListView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var filter: RoundListFilter = .all
    @State private var sort: RoundListSort = .newest
    @State private var pendingDelete: Round?

    var body: some View {
        List {
            if let active = env.activeRound {
                Section(L10n.Rounds.active) {
                    Button { env.presentedRoundID = active.id } label: {
                        RoundRow(course: active.header.courseName, date: Format.date(active.header.date),
                                 score: L10n.Home.activeRoundProgress(String(active.scoredHoleCount), String(active.header.holes.count)),
                                 detail: L10n.Home.resume)
                    }
                    .accessibilityIdentifier("rounds.active")
                }
            }
            Section {
                SegmentControl(options: RoundListFilter.allCases, selection: $filter) { f in
                    switch f {
                    case .all: return L10n.Rounds.filterAll
                    case .eighteen: return L10n.Setup.holes18
                    case .nine: return L10n.Setup.holes9
                    case .counting: return L10n.Rounds.filterCounting
                    }
                }
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
                Picker(L10n.Rounds.sort, selection: $sort) {
                    Text(L10n.Rounds.sortNewest).tag(RoundListSort.newest)
                    Text(L10n.Rounds.sortBest).tag(RoundListSort.best)
                    Text(L10n.Rounds.sortWorst).tag(RoundListSort.worst)
                }
            }
            Section(L10n.Rounds.history) {
                let rows = history
                if rows.isEmpty {
                    Text(L10n.Rounds.empty).font(Typography.body).foregroundStyle(Palette.textSecondary)
                }
                ForEach(rows, id: \.round.id) { row in
                    NavigationLink(value: Route.roundDetail(row.round.id)) {
                        RoundRow(course: row.round.header.courseName, date: Format.date(row.round.header.date),
                                 score: row.scoreText, detail: row.detailText)
                    }
                    .swipeActions {
                        Button(L10n.Rounds.delete, role: .destructive) { pendingDelete = row.round }
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Palette.background)
        .navigationTitle(L10n.Rounds.title)
        .refreshable { await env.refreshRounds() }
        .confirmationDialog(L10n.Rounds.deleteTitle, isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }),
                            titleVisibility: .visible, presenting: pendingDelete) { round in
            Button(L10n.Rounds.delete, role: .destructive) { Task { try? await env.deleteRound(round.id) } }
        } message: { _ in
            Text(L10n.Rounds.deleteMessage)
        }
    }

    private struct Row {
        let round: Round
        let gross: Int?
        let toPar: Int?
        let scoreText: String
        let detailText: String
    }

    private var history: [Row] {
        let rows: [Row] = env.roundList.filter { $0.status != .inProgress }.compactMap { round in
            guard let owner = round.owner else { return nil }
            let card = ScoringEngine.scorecard(for: owner, round: round, rules: env.rules)
            switch filter {
            case .all: break
            case .eighteen: if round.header.holes.count != 18 { return nil }
            case .nine: if round.header.holes.count != 9 { return nil }
            case .counting:
                if !ScoringEngine.differential(for: owner, round: round, rules: env.rules).countsForHandicapIndex { return nil }
            }
            let gross = card.total.complete ? card.total.gross : nil
            var detail = [String]()
            if card.hasStableford { detail.append(L10n.Score.points(Format.score(card.total.stableford))) }
            if let putts = card.total.putts { detail.append(L10n.Rounds.putts(String(putts))) }
            if round.status == .abandoned { detail.append(L10n.Rounds.statusAbandoned) }
            return Row(round: round, gross: gross, toPar: card.total.toPar,
                       scoreText: gross.map { String($0) + " (" + Format.toPar(card.total.toPar) + ")" } ?? Format.toPar(card.total.toPar),
                       detailText: detail.joined(separator: " · "))
        }
        switch sort {
        case .newest: return rows
        case .best: return rows.sorted { ($0.toPar ?? .max) < ($1.toPar ?? .max) }
        case .worst: return rows.sorted { ($0.toPar ?? .min) > ($1.toPar ?? .min) }
        }
    }
}

struct RoundDetailView: View {
    let roundID: UUID

    var body: some View {
        RoundSummaryView(roundID: roundID)
    }
}
