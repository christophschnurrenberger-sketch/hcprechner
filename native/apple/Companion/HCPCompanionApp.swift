import SwiftUI

/// iPhone-App „Golf HCP“: zeigt die bestehende Web-App (Mitgliederbereich, Scorecard, Distance-Screen) in einer
/// WKWebView und verbindet die laufende Runde mit der Apple Watch. Keine eigene Anmeldung, keine eigene
/// Geschäftslogik – WHS/HCP bleibt vollständig im Backend.
@main
struct HCPCompanionApp: App {
    @StateObject private var round = RoundDistanceService()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(round)
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var round: RoundDistanceService
    @State private var baseURL: URL? = AppConfig.baseURL

    var body: some View {
        if let url = baseURL {
            WebContainer(url: url.appendingPathComponent("member/"), round: round)
                .ignoresSafeArea(edges: .bottom)
        } else {
            SetupView { url in
                AppConfig.store(url)
                baseURL = url
            }
        }
    }
}

/// Adresse der Installation: aus der Build-Einstellung HCP_BASE_URL (Info.plist „HCPBaseURL“) oder einmalig
/// vom Nutzer eingegeben – keine fest einprogrammierte URL.
enum AppConfig {
    private static let key = "hcp.baseURL"

    static var baseURL: URL? {
        if let stored = UserDefaults.standard.string(forKey: key), let url = URL(string: stored) { return url }
        if let configured = Bundle.main.object(forInfoDictionaryKey: "HCPBaseURL") as? String, !configured.isEmpty, let url = URL(string: configured) {
            return url
        }
        return nil
    }

    static func store(_ url: URL) {
        UserDefaults.standard.set(url.absoluteString, forKey: key)
    }
}

struct SetupView: View {
    let onDone: (URL) -> Void
    @State private var text = "https://"

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Golf HCP Rechner").font(.title.bold())
            Text("Adresse deiner Installation (z. B. https://golf.example.de/hcp):")
            TextField("https://", text: $text)
                .textInputAutocapitalization(.never)
                .keyboardType(.URL)
                .autocorrectionDisabled()
                .textFieldStyle(.roundedBorder)
            Button("Verbinden") {
                if let url = URL(string: text.trimmingCharacters(in: .whitespaces)), url.scheme == "https" { onDone(url) }
            }
            .buttonStyle(.borderedProminent)
            Text("Nur HTTPS. Die Anmeldung erfolgt wie gewohnt im Mitgliederbereich.").font(.footnote).foregroundStyle(.secondary)
        }
        .padding(24)
    }
}
