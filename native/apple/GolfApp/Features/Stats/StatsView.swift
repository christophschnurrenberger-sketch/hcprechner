import GolfCore
import SwiftUI

/// Statistik (Grundlage für Phase 5): Scoring, Driving, Annäherung, kurzes Spiel, Putting – nur aus abgeschlossenen
/// Runden und nur aus tatsächlichen Eingaben. Quoten aus Summen (nie Durchschnitt von Prozentwerten).
struct StatsView: View {
    @Environment(AppEnvironment.self) private var env

    var body: some View {
        let summary = Statistics.summary(env.completedRounds)
        let t = summary.totals
        ScrollView {
            if summary.rounds == 0 {
                ContentUnavailableView(L10n.Stats.emptyTitle, systemImage: "chart.bar", description: Text(L10n.Stats.emptyText))
                    .padding(.top, Spacing.xxl)
            } else {
                VStack(alignment: .leading, spacing: Spacing.l) {
                    group(L10n.Stats.scoring) {
                        StatCard(title: L10n.Stats.rounds, value: String(summary.rounds))
                        StatCard(title: L10n.Stats.average18, value: Format.decimal(summary.averageScore18),
                                 subtitle: summary.averageToPar18.map { L10n.Stats.overPar(Format.decimal($0)) })
                        StatCard(title: L10n.Stats.best18, value: Format.score(summary.bestScore18))
                        StatCard(title: L10n.Stats.average9, value: Format.decimal(summary.averageScore9))
                    }
                    group(L10n.Stats.driving) {
                        StatCard(title: L10n.Stats.fairways, value: Format.percent(t.fairwayPercentage),
                                 subtitle: L10n.Stats.ofHoles(String(t.fairwaysHit), String(t.fairwayOpportunities)))
                        StatCard(title: L10n.Stats.missLeftRight, value: String(t.missLeft) + " / " + String(t.missRight),
                                 subtitle: L10n.Stats.missShort(String(t.missShort)))
                    }
                    group(L10n.Stats.approach) {
                        StatCard(title: L10n.Stats.gir, value: Format.percent(t.girPercentage),
                                 subtitle: L10n.Stats.ofHoles(String(t.girs), String(t.girHoles)))
                    }
                    group(L10n.Stats.shortGame) {
                        StatCard(title: L10n.Stats.scrambling, value: Format.percent(t.scramblingPercentage),
                                 subtitle: L10n.Stats.ofHoles(String(t.scrambles), String(t.scrambleAttempts)))
                        StatCard(title: L10n.Stats.sandSaves, value: Format.percent(t.sandSavePercentage),
                                 subtitle: L10n.Stats.ofHoles(String(t.sandSaves), String(t.sandAttempts)))
                    }
                    group(L10n.Stats.putting) {
                        StatCard(title: L10n.Stats.puttsPerRound, value: Format.decimal(summary.puttsPerRound18))
                        StatCard(title: L10n.Stats.puttsPerGIR, value: Format.decimal(t.puttsPerGIR, digits: 2))
                        StatCard(title: L10n.Stats.threePutts, value: String(t.threePutts))
                        StatCard(title: L10n.Stats.onePutts, value: String(t.onePutts))
                    }
                    distribution(t)
                    Text(L10n.Stats.definitions).font(Typography.caption).foregroundStyle(Palette.textSecondary)
                }
                .padding(Spacing.m)
            }
        }
        .background(Palette.background)
        .navigationTitle(L10n.Stats.title)
    }

    private func group<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            SectionHeader(title: title)
            LazyVGrid(columns: [GridItem(.flexible(), spacing: Spacing.s), GridItem(.flexible(), spacing: Spacing.s)], spacing: Spacing.s) {
                content()
            }
        }
    }

    /// Verteilung der Lochergebnisse – Balken mit Zahl und Bezeichnung (nicht nur Farbe).
    private func distribution(_ t: RoundStatistics) -> some View {
        let rows: [(String, Int, Color)] = [
            (L10n.Relative.eagle, t.eagles, Palette.underPar),
            (L10n.Relative.birdie, t.birdies, Palette.underPar),
            (L10n.Relative.par, t.pars, Palette.brand),
            (L10n.Relative.bogey, t.bogeys, Palette.overPar),
            (L10n.Relative.doubleBogey, t.doubleBogeys, Palette.overPar),
            (L10n.Stats.triplePlus, t.triplePlus, Palette.danger),
        ]
        let maximum = max(1, rows.map { $0.1 }.max() ?? 1)
        return VStack(alignment: .leading, spacing: Spacing.s) {
            SectionHeader(title: L10n.Stats.distribution)
            GolfCard {
                ForEach(rows.indices, id: \.self) { i in
                    HStack {
                        Text(rows[i].0).font(Typography.caption).frame(width: 110, alignment: .leading)
                        GeometryReader { geo in
                            RoundedRectangle(cornerRadius: 4)
                                .fill(rows[i].2)
                                .frame(width: max(4, geo.size.width * CGFloat(rows[i].1) / CGFloat(maximum)))
                        }
                        .frame(height: 14)
                        Text(verbatim: String(rows[i].1)).font(.caption.monospacedDigit().weight(.bold)).frame(width: 32, alignment: .trailing)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }
}
