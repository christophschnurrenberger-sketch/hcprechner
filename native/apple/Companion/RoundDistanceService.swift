import CoreLocation
import Foundation
import HCPGolfKit

/// Laufende Runde auf dem iPhone ↔ Apple Watch.
///
/// - Web-Ansicht sichtbar: Die Web-App rechnet (gleiche Zahl wie auf dem Distance-Screen); ihre Nachrichten
///   werden gespiegelt und mit eigener Folgenummer an die Watch weitergegeben.
/// - iPhone gesperrt / App im Hintergrund: Die Web-App pausiert; die App rechnet selbst mit CoreLocation und dem
///   Rundenkontext (HCPGolfKit, gleiche Regeln und Testwerte wie die Web-App).
/// - Standort nur während einer aktiven Runde (Kontext `roundActive`); danach wird er beendet. Kein Verlauf.
final class RoundDistanceService: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published private(set) var watchReachable = false

    /// Ereignisse an die Web-App (CustomEvent-Name, Detail)
    var sendToWeb: ((String, [String: Any]) -> Void)?

    var webViewVisible = true {
        didSet { if oldValue != webViewVisible { recompute() } }
    }

    private var context: RoundContext?
    private var webMirror = WatchReceiver()
    private var lastWebMessageAt = Date.distantPast
    private let filter = PositionFilter()
    private var fix: LocationFix?
    private let location = CLLocationManager()
    private var locating = false
    private var timer: Timer?
    private let watch = WatchSessionManager()
    private lazy var sync = WatchSync(send: { [weak self] message in self?.watch.send(message, snapshot: self?.sync.snapshot()) })

    override init() {
        super.init()
        location.delegate = self
        location.desiredAccuracy = kCLLocationAccuracyBest
        location.distanceFilter = 3 // Meter – kleinere Bewegungen ändern die Anzeige nicht
        location.activityType = .fitness
        location.pausesLocationUpdatesAutomatically = false
        watch.onCommand = { [weak self] command in self?.handleWatchCommand(command) }
        watch.onReachability = { [weak self] reachable in
            guard let self = self else { return }
            self.watchReachable = reachable
            self.sendToWeb?("hcp-watch-status", ["reachable": reachable])
            if reachable {
                self.sync.reset() // neue Verbindung: vollständigen Zustand senden
                self.recompute()
            }
        }
        watch.activate()
    }

    /// Rechnet die Web-App gerade selbst (sichtbar und nicht verstummt)?
    private var webIsSource: Bool {
        webViewVisible && Date().timeIntervalSince(lastWebMessageAt) <= GPSConfig.webViewSilentAfter
    }

    // MARK: Web-App

    func receiveFromWeb(_ message: WatchMessage) {
        lastWebMessageAt = Date()
        webMirror.receive(message, at: Date())
        if webIsSource, let state = webMirror.state { sync.update(state) }
    }

    func updateContext(_ ctx: RoundContext) {
        let wasActive = context?.roundActive ?? false
        context = ctx
        if ctx.roundActive && !wasActive { startLocation() }
        if !ctx.roundActive && wasActive { stopLocation() }
        recompute()
    }

    // MARK: Standort (nur aktive Runde)

    private func startLocation() {
        guard !locating else { return }
        switch location.authorizationStatus {
        case .notDetermined:
            location.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways:
            begin()
        default:
            break // verweigert: die Runde läuft ohne GPS weiter
        }
    }

    private func begin() {
        guard !locating else { return }
        locating = true
        // Weiterlaufen bei gesperrtem Bildschirm (Hintergrundmodus „location“, blauer Hinweis in der Statusleiste)
        location.allowsBackgroundLocationUpdates = true
        location.showsBackgroundLocationIndicator = true
        location.startUpdatingLocation()
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in self?.tick() }
    }

    private func stopLocation() {
        locating = false
        location.stopUpdatingLocation()
        location.allowsBackgroundLocationUpdates = false
        timer?.invalidate()
        timer = nil
        filter.reset()
        fix = nil
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if context?.roundActive == true, manager.authorizationStatus == .authorizedWhenInUse || manager.authorizationStatus == .authorizedAlways {
            begin()
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard locating else { return } // nach dem Rundenende keine Verarbeitung
        for l in locations where l.horizontalAccuracy >= 0 {
            let raw = LocationFix(point: GeoPoint(latitude: l.coordinate.latitude, longitude: l.coordinate.longitude), accuracy: l.horizontalAccuracy, timestamp: l.timestamp)
            if let filtered = filter.push(raw).fix { fix = filtered }
        }
        if !webIsSource { recompute() }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // Signal verloren o. ä.: Anzeige auf der Watch wechselt über das Alter der Messung selbst auf „GPS wird ermittelt…“
        if !webIsSource { recompute() }
    }

    private func tick() {
        if !webIsSource { recompute() }
        if watchReachable { sync.heartbeat() }
    }

    // MARK: Watch

    private func recompute() {
        guard let ctx = context else { return }
        if webIsSource, let state = webMirror.state {
            sync.update(state)
        } else {
            sync.update(ctx.watchState(fix: ctx.roundActive ? fix : nil, now: Date()))
        }
    }

    private func handleWatchCommand(_ command: [String: Any]) {
        // an die Web-App weitergeben (ändert nur die Entfernungsansicht, nie die Scorecard) …
        sendToWeb?("hcp-watch-command", command)
        // … und bei gesperrtem iPhone sofort selbst umsetzen
        guard !webIsSource, var ctx = context else { return }
        if (command["type"] as? String) == "hole", let delta = command["delta"] as? Int, let next = ctx.neighbor(of: ctx.hole, delta: delta) {
            ctx.hole = next
        } else if (command["type"] as? String) == "target", let raw = command["target"] as? String, let target = GreenTarget(rawValue: raw) {
            ctx.target = target
        }
        context = ctx
        recompute()
    }
}
