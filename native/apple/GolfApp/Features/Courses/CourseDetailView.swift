import GolfCore
import SwiftUI

/// Platzdetails: Grafik, Daten, Abschläge mit Ratings (inkl. Prüfstand), Lochliste, Vorschau, Runde starten.
struct CourseDetailView: View {
    @Environment(AppEnvironment.self) private var env
    let courseID: CourseID
    @State private var course: Course?
    @State private var failed = false
    @State private var offline = false

    var body: some View {
        Group {
            if let course {
                content(course)
            } else if failed {
                ContentUnavailableView(L10n.Courses.unavailableTitle, systemImage: "wifi.slash", description: Text(L10n.Courses.unavailableText))
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(Palette.background)
        .navigationTitle(course?.name ?? "")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        do {
            course = try await env.loadCourse(courseID)
            offline = await env.courses.isAvailableOffline(courseID)
        } catch {
            failed = true
        }
    }

    private func content(_ course: Course) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.l) {
                CourseArtwork(course: course, height: 180)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.xl, style: .continuous))
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    Text(course.name).font(Typography.display).fixedSize(horizontal: false, vertical: true)
                    Text([course.clubName, course.address, [course.postalCode, course.city].compactMap { $0 }.joined(separator: " ")]
                        .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(Typography.body).foregroundStyle(Palette.textSecondary)
                    HStack(spacing: Spacing.xxs) {
                        Badge(text: L10n.Courses.holesPar(String(course.holeCount), Format.score(course.par)), systemImage: "flag")
                        if course.hasGPSData { Badge(text: L10n.Courses.badgeGPS, systemImage: "location.fill") }
                        if offline { Badge(text: L10n.Courses.badgeOffline, systemImage: "arrow.down.circle.fill") }
                    }
                }
                if course.source == .demo {
                    NoticeBanner(text: L10n.Courses.demoNotice, systemImage: "testtube.2", tone: .warning)
                } else if let note = course.dataNote {
                    NoticeBanner(text: note, systemImage: "info.circle")
                }
                if !course.hasHoleData {
                    NoticeBanner(text: L10n.Courses.noHoleDataNotice, systemImage: "exclamationmark.triangle", tone: .warning)
                }
                HStack(spacing: Spacing.s) {
                    NavigationLink(value: Route.setup(course.id)) {
                        Label(L10n.Home.startRound, systemImage: "figure.golf")
                            .font(Typography.section)
                            .frame(maxWidth: .infinity, minHeight: TouchArea.large)
                            .foregroundStyle(Palette.textOnBrand)
                            .background(Palette.brand, in: RoundedRectangle(cornerRadius: Radius.l, style: .continuous))
                    }
                    .accessibilityIdentifier("course.startRound")
                    if course.hasGPSData {
                        NavigationLink(value: Route.preview(course.id, hole: course.holes.first?.number ?? 1)) {
                            Label(L10n.Courses.preview, systemImage: "map")
                                .font(Typography.section)
                                .frame(maxWidth: .infinity, minHeight: TouchArea.large)
                                .foregroundStyle(Palette.brand)
                                .background(Palette.brandSoft, in: RoundedRectangle(cornerRadius: Radius.l, style: .continuous))
                        }
                    }
                }
                Button {
                    env.settings.toggleFavorite(course.id)
                } label: {
                    Label(env.settings.isFavorite(course.id) ? L10n.Courses.removeFavorite : L10n.Courses.addFavorite,
                          systemImage: env.settings.isFavorite(course.id) ? "star.fill" : "star")
                }
                .font(Typography.bodyEmphasis)
                .foregroundStyle(Palette.warning)
                teesSection(course)
                holesSection(course)
            }
            .padding(Spacing.m)
        }
    }

    private func teesSection(_ course: Course) -> some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            SectionHeader(title: L10n.Courses.tees)
            ForEach(course.tees) { tee in
                GolfCard {
                    HStack {
                        TeeDot(color: tee.color)
                        Text(tee.name).font(Typography.bodyEmphasis)
                        Spacer()
                        if let length = course.length(teeID: tee.id) {
                            Text(Format.distanceText(Double(length), unit: env.settings.data.unit)).font(Typography.metricSmall)
                        }
                    }
                    if tee.ratings.isEmpty {
                        Text(L10n.Courses.noRating).font(Typography.caption).foregroundStyle(Palette.textSecondary)
                    }
                    ForEach(Array(tee.ratings.enumerated()), id: \.offset) { _, rating in
                        RatingLine(rating: rating)
                    }
                }
            }
        }
    }

    private func holesSection(_ course: Course) -> some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            SectionHeader(title: L10n.Courses.holes)
            if course.holes.isEmpty {
                Text(L10n.Courses.noHoleData).font(Typography.caption).foregroundStyle(Palette.textSecondary)
            } else {
                GolfCard(padding: Spacing.s) {
                    Grid(alignment: .leading, horizontalSpacing: Spacing.s, verticalSpacing: Spacing.xs) {
                        GridRow {
                            Text(L10n.Scorecard.hole).gridColumnAlignment(.leading)
                            Text(L10n.Scorecard.par)
                            Text(L10n.Scorecard.hcp)
                            ForEach(course.tees) { tee in TeeDot(color: tee.color) }
                        }
                        .font(Typography.label).foregroundStyle(Palette.textSecondary)
                        Divider()
                        ForEach(course.holes) { hole in
                            GridRow {
                                NavigationLink(value: Route.preview(course.id, hole: hole.number)) {
                                    Text(verbatim: String(hole.number)).font(Typography.bodyEmphasis).frame(minWidth: 28, alignment: .leading)
                                }
                                .disabled(!hole.hasGPSData)
                                Text(verbatim: Format.score(hole.par))
                                Text(verbatim: Format.score(hole.strokeIndex))
                                ForEach(course.tees) { tee in
                                    Text(verbatim: hole.teeBox(tee.id)?.lengthMeters.map(String.init) ?? "–")
                                        .font(.callout.monospacedDigit())
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

struct TeeDot: View {
    let color: TeeColor

    var body: some View {
        Circle()
            .fill(swatch)
            .overlay(Circle().stroke(Palette.separator, lineWidth: 1))
            .frame(width: 14, height: 14)
            .accessibilityHidden(true)
    }

    private var swatch: Color {
        switch color {
        case .black: return .black
        case .white: return .white
        case .gold: return Color(light: 0xD4A017, dark: 0xD4A017)
        case .blue: return Color(light: 0x2A62D9, dark: 0x5B8CFF)
        case .yellow: return Color(light: 0xF2C200, dark: 0xF2C200)
        case .red: return Color(light: 0xD93A2B, dark: 0xFF6655)
        case .orange: return Color(light: 0xF08A24, dark: 0xF08A24)
        case .green: return Palette.brand
        }
    }
}

/// Eine Zeile „Herren · 18 Loch: CR 71,8 · Slope 129 · Par 72“ mit Prüfstand.
struct RatingLine: View {
    let rating: TeeRating

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(L10n.Rating.scope(gender: rating.gender, scope: rating.scope)).font(Typography.captionEmphasis)
                Text(L10n.Rating.values(cr: rating.courseRating.map { Format.decimal($0) } ?? "–",
                                        slope: rating.slopeRating.map(String.init) ?? "–",
                                        par: rating.par.map(String.init) ?? "–"))
                    .font(Typography.caption).foregroundStyle(Palette.textSecondary)
            }
            Spacer()
            switch rating.status {
            case .verified: Badge(text: L10n.Rating.verified, systemImage: "checkmark.seal")
            case .unverified: Badge(text: L10n.Rating.unverified, systemImage: "questionmark.circle", tone: .warning)
            case .fictional: Badge(text: L10n.Rating.fictional, systemImage: "testtube.2", tone: .warning)
            }
        }
    }
}
