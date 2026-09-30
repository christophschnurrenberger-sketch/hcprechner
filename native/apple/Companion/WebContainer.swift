import HCPGolfKit
import SwiftUI
import WebKit

/// Die bestehende Web-App in einer WKWebView. Brücke zur App über `window.webkit.messageHandlers.hcpWatch`:
///   { kind: "watch", message }      – Watch-Protokollnachricht (Version 1) der laufenden Runde
///   { kind: "context", context }    – Rundenkontext (Löcher mit Grün-Koordinaten) für die native Berechnung
///   { kind: "lifecycle", visible }  – Seite sichtbar/verborgen
/// Richtung Web-App: CustomEvents „hcp-watch-command“ (Loch/Ziel von der Watch) und „hcp-watch-status“.
struct WebContainer: UIViewRepresentable {
    let url: URL
    let round: RoundDistanceService

    func makeCoordinator() -> Coordinator {
        Coordinator(round: round)
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        let controller = WKUserContentController()
        controller.add(WeakScriptHandler(context.coordinator), name: "hcpWatch")
        // Sichtbarkeit der Seite melden (bei gesperrtem iPhone übernimmt die App die Berechnung)
        let lifecycle = """
        document.addEventListener('visibilitychange', function () {
          window.webkit.messageHandlers.hcpWatch.postMessage({ kind: 'lifecycle', visible: document.visibilityState !== 'hidden' });
        });
        """
        controller.addUserScript(WKUserScript(source: lifecycle, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        config.userContentController = controller
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.allowsBackForwardNavigationGestures = true
        context.coordinator.webView = webView
        round.sendToWeb = { [weak webView] event, detail in
            guard let webView = webView,
                  let data = try? JSONSerialization.data(withJSONObject: detail),
                  let json = String(data: data, encoding: .utf8) else { return }
            webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('\(event)', { detail: \(json) }))")
        }
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKScriptMessageHandler {
        let round: RoundDistanceService
        weak var webView: WKWebView?

        init(round: RoundDistanceService) {
            self.round = round
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let body = message.body as? [String: Any], let kind = body["kind"] as? String else { return }
            switch kind {
            case "watch":
                if let json = body["message"] as? [String: Any], let m = WatchMessage(json: json) { round.receiveFromWeb(m) }
            case "context":
                if let json = body["context"] as? [String: Any], let ctx = RoundContext(json: json) { round.updateContext(ctx) }
            case "lifecycle":
                round.webViewVisible = (body["visible"] as? Bool) ?? true
            default:
                break
            }
        }
    }
}

/// Verhindert einen Retain-Zyklus zwischen WKUserContentController und Coordinator.
final class WeakScriptHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?

    init(_ target: WKScriptMessageHandler) {
        self.target = target
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive: message)
    }
}
