import GolfCore
import SwiftUI

@main
struct GolfApp: App {
    @State private var env = AppEnvironment.live()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(env)
        }
        .onChange(of: scenePhase) { _, phase in
            // Zurück im Vordergrund: Ausgang übertragen (offline bleibt alles auf dem Gerät)
            if phase == .active { Task { await env.syncNow() } }
        }
    }
}

enum AppTab: Hashable {
    case home, golf, rounds, stats, profile
}

/// Navigationsziele, in jedem Tab gleich registriert.
enum Route: Hashable {
    case course(CourseID)
    case preview(CourseID, hole: Int)
    case setup(CourseID)
    case roundDetail(UUID)
}

struct PresentedRound: Identifiable {
    let id: UUID
}

struct RootView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var tab: AppTab = .home

    var body: some View {
        TabView(selection: $tab) {
            NavigationStack { HomeView(selectTab: { tab = $0 }).withRoutes() }
                .tabItem { Label(L10n.Tab.home, systemImage: "house.fill") }
                .tag(AppTab.home)
            NavigationStack { CourseSearchView().withRoutes() }
                .tabItem { Label(L10n.Tab.golf, systemImage: "flag.fill") }
                .tag(AppTab.golf)
            NavigationStack { RoundsListView().withRoutes() }
                .tabItem { Label(L10n.Tab.rounds, systemImage: "list.bullet.rectangle.fill") }
                .tag(AppTab.rounds)
            NavigationStack { StatsView().withRoutes() }
                .tabItem { Label(L10n.Tab.stats, systemImage: "chart.bar.fill") }
                .tag(AppTab.stats)
            NavigationStack { ProfileView().withRoutes() }
                .tabItem { Label(L10n.Tab.profile, systemImage: "person.crop.circle.fill") }
                .tag(AppTab.profile)
        }
        .tint(Palette.brand)
        .fullScreenCover(item: presentedRound) { presented in
            RoundContainerView(roundID: presented.id)
                .environment(env)
        }
        .task {
            await env.refreshRounds()
            await env.syncNow()
        }
        .preferredColorScheme(env.settings.data.appearance.colorScheme)
    }

    private var presentedRound: Binding<PresentedRound?> {
        Binding(
            get: { env.presentedRoundID.map(PresentedRound.init(id:)) },
            set: { env.presentedRoundID = $0?.id }
        )
    }
}

extension View {
    func withRoutes() -> some View {
        navigationDestination(for: Route.self) { route in
            switch route {
            case let .course(id): CourseDetailView(courseID: id)
            case let .preview(id, hole): CoursePreviewView(courseID: id, initialHole: hole)
            case let .setup(id): RoundSetupView(courseID: id)
            case let .roundDetail(id): RoundDetailView(roundID: id)
            }
        }
    }
}
