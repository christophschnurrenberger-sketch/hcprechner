import Foundation
import HCPGolfKit
import WatchConnectivity

/// Zustand der Watch: letzter empfangener Protokollstand (HCPGolfKit.WatchReceiver). Keine eigene Standortbestimmung
/// in Version 1 (spart Akku) – vorbereitet ist sie über HCPGolfKit (DistanceEngine, PositionFilter, RoundContext).
final class ConnectivityManager: NSObject, ObservableObject, WCSessionDelegate {
    @Published private(set) var receiver = WatchReceiver()
    @Published private(set) var phoneReachable = false

    private let session: WCSession? = WCSession.isSupported() ? WCSession.default : nil

    override init() {
        super.init()
        session?.delegate = self
        session?.activate()
    }

    func display(at now: Date) -> WatchDisplay {
        WatchDisplay.make(receiver, now: now, locale: GPSMessages.deviceLocale)
    }

    /// Loch bzw. Ziel wechseln – ändert auf dem iPhone nur die Entfernungsansicht, nie die Scorecard.
    func previousHole() { send(["type": "hole", "delta": -1]) }
    func nextHole() { send(["type": "hole", "delta": 1]) }

    func cycleTarget() {
        let order: [GreenTarget] = [.greenCenter, .greenFront, .greenBack]
        let current = receiver.state?.target ?? .greenCenter
        let next = order[((order.firstIndex(of: current) ?? 0) + 1) % order.count]
        send(["type": "target", "target": next.rawValue])
    }

    private func send(_ command: [String: Any]) {
        guard let session = session, session.isReachable else { return }
        session.sendMessage(["command": command], replyHandler: nil, errorHandler: nil)
    }

    private func handle(_ payload: [String: Any]) {
        guard let data = payload["m"] as? Data, let message = WatchMessage.decode(data) else { return }
        DispatchQueue.main.async {
            var r = self.receiver
            r.receive(message, at: Date())
            self.receiver = r
        }
    }

    // MARK: WCSessionDelegate

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        // zuletzt gesendeten vollständigen Zustand übernehmen (App wurde neu geöffnet)
        if !session.receivedApplicationContext.isEmpty { handle(session.receivedApplicationContext) }
        DispatchQueue.main.async { self.phoneReachable = session.isReachable }
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        DispatchQueue.main.async { self.phoneReachable = session.isReachable }
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        handle(message)
    }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        handle(applicationContext)
    }
}
