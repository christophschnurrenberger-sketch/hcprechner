import GolfCore
import GolfDemo
import SwiftUI

/// Startseite: Runde starten bzw. fortsetzen, Handicap, zuletzt gespielte und favorisierte Plätze, letzte Runde.
struct HomeView: View {
    @Environment(AppEnvironment.self) private var env
    let selectTab: (AppTab) -> Void
    @State private var courses: [CourseSummary] = []

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.l) {
                header
                if let active = env.activeRound {
                    activeRoundCard(active)
                } else {
                    startCard
                }
                metrics
                courseSection(L10n.Home.recent, ids: env.settings.data.recentCourses)
                courseSection(L10n.Home.favorites, ids: env.settings.data.favorites)
                lastRound
            }
            .padding(Spacing.m)
        }
        .background(Palette.background)
        .navigationTitle(AppBrand.name)
        .task { courses = (try? await env.courses.allCourses()) ?? [] }
        .refreshable {
            await env.refreshRounds()
            await env.syncNow()
        }
    }

    private var header: some View {
        HStack(spacing: Spacing.s) {
            PlayerAvatar(name: env.profile.profile.displayName, size: 44)
            VStack(alignment: .leading, spacing: 2) {
                Text(L10n.Home.greeting(env.profile.profile.displayName)).font(Typography.title)
                Text(L10n.Home.subtitle).font(Typography.caption).foregroundStyle(Palette.textSecondary)
            }
            Spacer()
            SyncBadge(status: env.syncStatus)
        }
    }

    private var startCard: some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            Text(L10n.Home.readyTitle).font(Typography.title).foregroundStyle(.white)
            Text(L10n.Home.readyText).font(Typography.body).foregroundStyle(.white.opacity(0.85))
            NavigationLink(value: Route.setup(defaultCourseID)) {
                Label(L10n.Home.startRound, systemImage: "figure.golf")
                    .font(Typography.section)
                    .frame(maxWidth: .infinity, minHeight: TouchArea.large)
                    .foregroundStyle(Palette.brandDeep)
                    .background(Palette.lime, in: RoundedRectangle(cornerRadius: Radius.l, style: .continuous))
            }
            .accessibilityIdentifier("home.startRound")
            Button(L10n.Home.chooseCourse) { selectTab(.golf) }
                .font(Typography.bodyEmphasis)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, minHeight: TouchArea.minimum)
        }
        .padding(Spacing.l)
        .background(
            LinearGradient(colors: [Palette.brandDeep, Palette.brand], startPoint: .topLeading, endPoint: .bottomTrailing),
            in: RoundedRectangle(cornerRadius: Radius.xl, style: .continuous)
        )
    }

    /// Heimatplatz, sonst zuletzt gespielter Platz, sonst der Demo-Platz.
    private var defaultCourseID: CourseID {
        env.profile.profile.homeCourseID ?? env.settings.data.recentCourses.first ?? DemoCourses.championshipID
    }

    private func activeRoundCard(_ round: Round) -> some View {
        Button { env.presentedRoundID = round.id } label: {
            VStack(alignment: .leading, spacing: Spacing.s) {
                Label(L10n.Home.activeRound, systemImage: "dot.radiowaves.left.and.right")
                    .font(Typography.label).foregroundStyle(Palette.lime)
                Text(round.header.courseName).font(Typography.title).foregroundStyle(.white).multilineTextAlignment(.leading)
                Text(L10n.Home.activeRoundProgress(String(round.scoredHoleCount), String(round.header.holes.count)))
                    .font(Typography.body).foregroundStyle(.white.opacity(0.85))
                Text(L10n.Home.resume)
                    .font(Typography.section)
                    .frame(maxWidth: .infinity, minHeight: TouchArea.large)
                    .foregroundStyle(Palette.brandDeep)
                    .background(Palette.lime, in: RoundedRectangle(cornerRadius: Radius.l, style: .continuous))
            }
            .padding(Spacing.l)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.brandDeep, in: RoundedRectangle(cornerRadius: Radius.xl, style: .continuous))
        }
        .buttonStyle(PressableStyle())
        .accessibilityIdentifier("home.resumeRound")
    }

    private var metrics: some View {
        let summary = Statistics.summary(env.completedRounds)
        return HStack(spacing: Spacing.s) {
            StatCard(title: L10n.Home.handicapIndex, value: Format.handicap(env.profile.profile.handicapIndex), systemImage: "number")
            StatCard(title: L10n.Home.rounds, value: String(summary.rounds), systemImage: "flag")
            StatCard(title: L10n.Home.average18, value: Format.decimal(summary.averageScore18), systemImage: "chart.line.uptrend.xyaxis")
        }
    }

    @ViewBuilder
    private func courseSection(_ title: String, ids: [CourseID]) -> some View {
        let list = ids.compactMap { id in courses.first { $0.id == id } }
        if !list.isEmpty {
            VStack(alignment: .leading, spacing: Spacing.s) {
                SectionHeader(title: title)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: Spacing.s) {
                        ForEach(list) { course in
                            NavigationLink(value: Route.course(course.id)) {
                                CourseTile(course: course)
                            }
                            .buttonStyle(PressableStyle())
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var lastRound: some View {
        if let round = env.completedRounds.first, let owner = round.owner {
            let card = ScoringEngine.scorecard(for: owner, round: round, rules: env.rules)
            VStack(alignment: .leading, spacing: Spacing.s) {
                SectionHeader(title: L10n.Home.lastRound, actionTitle: L10n.Home.allRounds) { selectTab(.rounds) }
                NavigationLink(value: Route.roundDetail(round.id)) {
                    GolfCard {
                        RoundRow(course: round.header.courseName, date: Format.date(round.header.date),
                                 score: card.total.complete ? String(card.total.gross) : Format.toPar(card.total.toPar),
                                 detail: card.hasStableford ? L10n.Score.points(Format.score(card.total.stableford)) : Format.toPar(card.total.toPar))
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }
}

/// Kleine Platzkachel (horizontale Listen).
struct CourseTile: View {
    let course: CourseSummary

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xxs) {
            ZStack(alignment: .bottomLeading) {
                LinearGradient(colors: [Palette.brandDeep, Palette.brand], startPoint: .top, endPoint: .bottom)
                Image(systemName: "flag.fill").font(.title2).foregroundStyle(Palette.lime).padding(Spacing.s)
            }
            .frame(width: 168, height: 84)
            .clipShape(RoundedRectangle(cornerRadius: Radius.m, style: .continuous))
            Text(course.name).font(Typography.bodyEmphasis).lineLimit(2).foregroundStyle(Palette.textPrimary)
            Text(L10n.Courses.holesPar(String(course.holeCount), Format.score(course.par)))
                .font(Typography.caption).foregroundStyle(Palette.textSecondary)
        }
        .frame(width: 168, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// Stand der Synchronisation (kurz, ohne Fehlercodes).
struct SyncBadge: View {
    let status: SyncStatus

    var body: some View {
        Label(text, systemImage: icon)
            .labelStyle(.iconOnly)
            .font(.title3)
            .foregroundStyle(color)
            .accessibilityLabel(text)
    }

    private var text: String {
        switch status {
        case .idle: return L10n.Sync.idle
        case .syncing: return L10n.Sync.syncing
        case .synced: return L10n.Sync.synced
        case let .offline(pending): return L10n.Sync.offline(String(pending))
        case .failed: return L10n.Sync.failed
        }
    }

    private var icon: String {
        switch status {
        case .idle, .synced: return "checkmark.icloud"
        case .syncing: return "arrow.triangle.2.circlepath.icloud"
        case .offline: return "icloud.slash"
        case .failed: return "exclamationmark.icloud"
        }
    }

    private var color: Color {
        switch status {
        case .offline: return Palette.warning
        case .failed: return Palette.danger
        default: return Palette.brand
        }
    }
}
