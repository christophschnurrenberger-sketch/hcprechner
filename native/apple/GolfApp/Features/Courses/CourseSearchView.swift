import GolfCore
import HCPGolfKit
import SwiftUI
import UIKit

/// Treffer der Platzsuche mit Entfernung (falls Standort bekannt).
struct CourseHit: Identifiable {
    let course: CourseSummary
    let meters: Double?
    var id: CourseID { course.id }
}

enum CourseFilter: Hashable, CaseIterable {
    case all, nearby, favorites, recent
}

/// Platzsuche: Name, Ort, Region, Club; „In meiner Nähe“ nach Entfernung sortiert; Favoriten; zuletzt verwendet.
struct CourseSearchView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var query = ""
    @State private var filter: CourseFilter = .all
    @State private var all: [CourseSummary] = []
    @State private var loadFailed = false

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.m) {
                SegmentControl(options: CourseFilter.allCases, selection: $filter) { option in
                    switch option {
                    case .all: return L10n.Courses.filterAll
                    case .nearby: return L10n.Courses.filterNearby
                    case .favorites: return L10n.Courses.filterFavorites
                    case .recent: return L10n.Courses.filterRecent
                    }
                }
                if filter == .nearby { nearbyNotice }
                if loadFailed {
                    NoticeBanner(text: L10n.Courses.loadFailed, systemImage: "wifi.slash", tone: .warning)
                }
                let results = filtered
                if results.isEmpty && !loadFailed {
                    emptyState
                }
                LazyVStack(spacing: Spacing.s) {
                    ForEach(results) { item in
                        NavigationLink(value: Route.course(item.course.id)) {
                            CourseCard(course: item.course, distance: item.meters, unit: env.settings.data.unit,
                                       isFavorite: env.settings.isFavorite(item.course.id)) {
                                env.settings.toggleFavorite(item.course.id)
                            }
                        }
                        .buttonStyle(PressableStyle())
                    }
                }
            }
            .padding(Spacing.m)
        }
        .background(Palette.background)
        .navigationTitle(L10n.Courses.title)
        .searchable(text: $query, prompt: L10n.Courses.searchPrompt)
        .task { await load() }
        .onChange(of: filter) { _, value in
            if value == .nearby { env.location.start(background: false) } else if env.activeRound == nil { env.location.stop() }
        }
        .onDisappear { if env.activeRound == nil && env.presentedRoundID == nil { env.location.stop() } }
    }

    private func load() async {
        do {
            all = try await env.courses.allCourses()
            loadFailed = false
        } catch {
            loadFailed = true
        }
    }

    private var here: GeoPoint? { env.location.position?.point }

    private var filtered: [CourseHit] {
        var base: [CourseSummary]
        switch filter {
        case .all, .nearby: base = all
        case .favorites: base = all.filter { env.settings.isFavorite($0.id) }
        case .recent: base = env.settings.data.recentCourses.compactMap { id in all.first { $0.id == id } }
        }
        if !query.trimmingCharacters(in: .whitespaces).isEmpty || filter == .nearby || filter == .all {
            base = CourseSearch.search(base, query: CourseQuery(text: query, near: here, limit: 100))
        }
        if filter == .nearby {
            guard let here else { return [] }
            return CourseSearch.nearby(base, to: here, limit: 50).map { CourseHit(course: $0.course, meters: $0.meters) }
        }
        return base.map { CourseHit(course: $0, meters: CourseSearch.distanceMeters(from: here, to: $0)) }
    }

    @ViewBuilder
    private var nearbyNotice: some View {
        switch env.location.authorization {
        case .denied, .restricted:
            NoticeBanner(text: L10n.Location.denied, systemImage: "location.slash", tone: .warning,
                         actionTitle: L10n.Location.openSettings) { openSettings() }
        default:
            if env.location.position == nil {
                NoticeBanner(text: L10n.Location.locating, systemImage: "location.magnifyingglass")
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: Spacing.s) {
            Image(systemName: "flag.slash").font(.largeTitle).foregroundStyle(Palette.textSecondary)
            Text(filter == .favorites ? L10n.Courses.noFavorites : L10n.Courses.noResults)
                .font(Typography.body).foregroundStyle(Palette.textSecondary).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Spacing.xl)
    }
}

func openSettings() {
    if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
}

/// Platzkarte in Listen: Name, Club, Ort, Entfernung, Löcher, Par, GPS-Daten, Favorit.
struct CourseCard: View {
    let course: CourseSummary
    let distance: Double?
    let unit: DistanceFormat.Unit
    let isFavorite: Bool
    let toggleFavorite: () -> Void

    var body: some View {
        HStack(spacing: Spacing.s) {
            ZStack {
                RoundedRectangle(cornerRadius: Radius.m, style: .continuous)
                    .fill(LinearGradient(colors: [Palette.brandDeep, Palette.brand], startPoint: .top, endPoint: .bottom))
                VStack(spacing: 0) {
                    Text(verbatim: String(course.holeCount)).font(Typography.metricSmall).foregroundStyle(.white)
                    Text(L10n.Courses.holesShort).font(.caption2.weight(.semibold)).foregroundStyle(.white.opacity(0.8))
                }
            }
            .frame(width: 64, height: 64)
            VStack(alignment: .leading, spacing: 3) {
                Text(course.name).font(Typography.bodyEmphasis).foregroundStyle(Palette.textPrimary).lineLimit(2)
                Text(course.clubName + " · " + course.city).font(Typography.caption).foregroundStyle(Palette.textSecondary).lineLimit(1)
                HStack(spacing: Spacing.xs) {
                    Text(L10n.Courses.holesPar(String(course.holeCount), Format.score(course.par)))
                    if let distance {
                        Text(verbatim: "· " + Format.distanceText(distance > 5000 ? (distance / 100).rounded() * 100 : distance, unit: unit))
                    }
                }
                .font(Typography.caption).foregroundStyle(Palette.textSecondary)
                HStack(spacing: Spacing.xxs) {
                    if course.hasGPSData { Badge(text: L10n.Courses.badgeGPS, systemImage: "location.fill") }
                    if course.source == .demo { Badge(text: L10n.Courses.badgeDemo, systemImage: "testtube.2", tone: .warning) }
                    if !course.hasHoleData { Badge(text: L10n.Courses.badgeNoHoleData, systemImage: "exclamationmark.triangle", tone: .warning) }
                }
            }
            Spacer(minLength: 0)
            Button(action: toggleFavorite) {
                Image(systemName: isFavorite ? "star.fill" : "star")
                    .font(.title3)
                    .foregroundStyle(isFavorite ? Palette.warning : Palette.textSecondary)
                    .frame(width: TouchArea.minimum, height: TouchArea.minimum)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(isFavorite ? L10n.Courses.removeFavorite : L10n.Courses.addFavorite)
        }
        .padding(Spacing.s)
        .background(Palette.surface, in: RoundedRectangle(cornerRadius: Radius.l, style: .continuous))
        .golfShadow(.card)
    }
}

struct Badge: View {
    enum Tone { case neutral, warning }
    let text: String
    var systemImage: String?
    var tone: Tone = .neutral

    var body: some View {
        HStack(spacing: 3) {
            if let systemImage { Image(systemName: systemImage) }
            Text(text)
        }
        .font(.caption2.weight(.semibold))
        .padding(.horizontal, 6)
        .padding(.vertical, 3)
        .foregroundStyle(tone == .warning ? Palette.warning : Palette.brand)
        .background((tone == .warning ? Palette.warning : Palette.brand).opacity(0.12), in: Capsule())
    }
}
