import SwiftUI

/// Apple-Watch-App: startet direkt im Distance-Screen – kein Login, keine Einstellungen, kein Dashboard.
/// Daten kommen ausschließlich vom gekoppelten iPhone (WatchConnectivity); Internet ist nicht nötig.
@main
struct HCPWatchApp: App {
    @StateObject private var store = ConnectivityManager()

    var body: some Scene {
        WindowGroup {
            DistanceView()
                .environmentObject(store)
        }
    }
}
