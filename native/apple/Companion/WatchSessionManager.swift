import Foundation
import HCPGolfKit
import WatchConnectivity

/// WatchConnectivity auf dem iPhone.
///
/// - Watch erreichbar (App im Vordergrund): `sendMessage` – sofort, nur Änderungen und Herzschlag.
/// - Nicht erreichbar: nur `updateApplicationContext` mit dem vollständigen Zustand (jüngster gewinnt, wird beim
///   Öffnen der Watch-App zugestellt) – keine Herzschläge, damit die Watch nicht unnötig geweckt wird.
final class WatchSessionManager: NSObject, WCSessionDelegate {
    var onCommand: (([String: Any]) -> Void)?
    var onReachability: ((Bool) -> Void)?

    private let session: WCSession? = WCSession.isSupported() ? WCSession.default : nil
    private var lastContextAt = Date.distantPast

    func activate() {
        session?.delegate = self
        session?.activate()
    }

    var isReachable: Bool { session?.isReachable ?? false }

    func send(_ message: WatchMessage, snapshot: WatchMessage?) {
        guard let session = session, session.activationState == .activated, session.isPaired, session.isWatchAppInstalled else { return }
        if session.isReachable, let data = try? message.encoded() {
            session.sendMessage(["m": data], replyHandler: nil, errorHandler: nil)
        }
        // Application Context (vollständiger Zustand) höchstens alle 10 s bzw. bei Lochwechsel/Rundenende
        guard message.kind != .heartbeat, let snapshot = snapshot else { return }
        let roundEnded = (message.data?["roundActive"] as? Bool) == false
        let holeChanged = message.data?["hole"] != nil
        if Date().timeIntervalSince(lastContextAt) >= 10 || holeChanged || roundEnded || message.kind == .state {
            if let data = try? snapshot.encoded() {
                try? session.updateApplicationContext(["m": data])
                lastContextAt = Date()
            }
        }
    }

    // MARK: WCSessionDelegate

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        DispatchQueue.main.async { self.onReachability?(session.isReachable) }
    }

    func sessionDidBecomeInactive(_ session: WCSession) {}

    func sessionDidDeactivate(_ session: WCSession) {
        // Wechsel auf eine andere Watch: neu aktivieren
        session.activate()
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        DispatchQueue.main.async { self.onReachability?(session.isReachable) }
    }

    /// Befehle der Watch: Loch wechseln, Ziel wechseln (nur Entfernungsansicht)
    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        guard let command = message["command"] as? [String: Any] else { return }
        DispatchQueue.main.async { self.onCommand?(command) }
    }
}
