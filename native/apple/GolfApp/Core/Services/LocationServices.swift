import CoreLocation
import Foundation
import GolfCore
import GolfDemo
import HCPGolfKit
import Observation
import UIKit

enum LocationAuthorization: Equatable {
    case notDetermined, denied, restricted, authorized
}

/// Quelle für Standortmessungen (echtes GPS oder Simulation).
@MainActor
protocol LocationSource: AnyObject {
    var onFix: ((LocationFix) -> Void)? { get set }
    func start(background: Bool, lowPower: Bool)
    func stop()
}

/// CoreLocation. Läuft nur, während eine Runde (bzw. eine Ansicht mit Entfernungen) aktiv ist.
@MainActor
final class DeviceLocationSource: NSObject, LocationSource, CLLocationManagerDelegate {
    var onFix: ((LocationFix) -> Void)?
    var onAuthorization: ((LocationAuthorization) -> Void)?
    private let manager = CLLocationManager()

    override init() {
        super.init()
        manager.delegate = self
        manager.activityType = .fitness
        manager.pausesLocationUpdatesAutomatically = false
    }

    var authorization: LocationAuthorization {
        switch manager.authorizationStatus {
        case .notDetermined: return .notDetermined
        case .denied: return .denied
        case .restricted: return .restricted
        default: return .authorized
        }
    }

    func requestAuthorization() {
        manager.requestWhenInUseAuthorization()
    }

    func start(background: Bool, lowPower: Bool) {
        // Akku: bei niedrigem Akku bzw. Stromsparmodus gröbere Genauigkeit und seltenere Updates
        manager.desiredAccuracy = lowPower ? kCLLocationAccuracyNearestTenMeters : kCLLocationAccuracyBest
        manager.distanceFilter = lowPower ? 5 : 2
        if background && authorization == .authorized {
            manager.allowsBackgroundLocationUpdates = true
            manager.showsBackgroundLocationIndicator = true
        }
        manager.startUpdatingLocation()
    }

    func stop() {
        manager.stopUpdatingLocation()
        manager.allowsBackgroundLocationUpdates = false
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        MainActor.assumeIsolated {
            onAuthorization?(authorization)
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        let fixes = locations.filter { $0.horizontalAccuracy >= 0 }.map {
            LocationFix(point: GeoPoint(latitude: $0.coordinate.latitude, longitude: $0.coordinate.longitude),
                        accuracy: $0.horizontalAccuracy, timestamp: $0.timestamp)
        }
        MainActor.assumeIsolated {
            fixes.forEach { onFix?($0) }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // Signalverlust: Die Anzeige wechselt über das Alter der letzten Messung selbst auf „schwach“/„kein Signal“.
    }
}

/// Simuliertes GPS für Entwicklung und Tests auf dem Simulator: fester Punkt (mit Rauschen) oder eine abgespielte
/// Runde (CourseWalkSimulator). Zeitstempel sind immer „jetzt“, damit Filter und Alter wie mit echtem GPS arbeiten.
@MainActor
@Observable
final class SimulatedLocationSource: LocationSource {
    enum Mode: Equatable {
        case fixed(GeoPoint)
        case replay([GeoPoint], index: Int)
    }

    @ObservationIgnored var onFix: ((LocationFix) -> Void)?
    private(set) var mode: Mode?
    /// gemeldete Genauigkeit (m)
    var accuracy: Double = 4
    /// Rauschen (m, je Achse)
    var noise: Double = 1.2
    /// Abspielgeschwindigkeit (1 = Echtzeit). Höchstens 5×, sonst gilt Gehen als unplausibel schnell (12 m/s).
    var speed: Double = 1
    private(set) var running = false
    @ObservationIgnored private var task: Task<Void, Never>?
    @ObservationIgnored private var pendingJump = false

    func setFixed(_ point: GeoPoint) {
        mode = .fixed(point)
        emitNow()
    }

    func play(_ points: [GeoPoint]) {
        guard !points.isEmpty else { return }
        mode = .replay(points, index: 0)
        emitNow()
    }

    /// Einmaliger GPS-Sprung (300 m) zum Testen des Filters.
    func injectJump() {
        pendingJump = true
        emitNow()
    }

    var replayProgress: Double? {
        if case let .replay(points, index) = mode { return Double(index) / Double(max(points.count - 1, 1)) }
        return nil
    }

    func start(background: Bool, lowPower: Bool) {
        guard !running else { return }
        running = true
        task = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                self.tick()
                let interval = 2.0 / max(0.5, min(self.speed, 5))
                try? await Task.sleep(nanoseconds: UInt64(interval * 1_000_000_000))
            }
        }
    }

    func stop() {
        running = false
        task?.cancel()
        task = nil
    }

    private func tick() {
        if case let .replay(points, index) = mode, index + 1 < points.count {
            mode = .replay(points, index: index + 1)
        }
        emitNow()
    }

    private func emitNow() {
        guard running, let base = currentPoint else { return }
        let frame = LocalFrame(origin: base)
        var point = frame.toGeo(Vector2(x: Double.random(in: -noise...noise), y: Double.random(in: -noise...noise)))
        if pendingJump {
            point = frame.toGeo(Vector2(x: 300, y: 0))
            pendingJump = false
        }
        onFix?(LocationFix(point: point, accuracy: accuracy, timestamp: Date()))
    }

    private var currentPoint: GeoPoint? {
        switch mode {
        case let .fixed(p): return p
        case let .replay(points, index): return points[min(index, points.count - 1)]
        case nil: return nil
        }
    }
}

/// Aktuelle Spielerposition für die App: verarbeitet Messungen (Filter, Qualität, Alter) aus echtem oder simuliertem
/// GPS. Hält nur die letzte Position – kein Bewegungsprofil, keine Übertragung.
@MainActor
@Observable
final class LocationHub {
    private(set) var position: PlayerPosition?
    private(set) var authorization: LocationAuthorization = .notDetermined
    private(set) var isActive = false
    private(set) var usesSimulation = false
    /// Akku niedrig oder Stromsparmodus → gröbere Messung
    private(set) var lowPower = false

    let simulator = SimulatedLocationSource()
    private let device = DeviceLocationSource()
    private let tracker = PositionTracker()
    @ObservationIgnored private var refresh: Task<Void, Never>?
    @ObservationIgnored private var wantsBackground = false

    init(simulated: Bool = false) {
        usesSimulation = simulated
        authorization = device.authorization
        device.onAuthorization = { [weak self] status in
            guard let self else { return }
            self.authorization = status
            if self.isActive && !self.usesSimulation && status == .authorized { self.device.start(background: self.wantsBackground, lowPower: self.lowPower) }
        }
        device.onFix = { [weak self] fix in self?.ingest(fix, simulated: false) }
        simulator.onFix = { [weak self] fix in self?.ingest(fix, simulated: true) }
        UIDevice.current.isBatteryMonitoringEnabled = true
    }

    var source: LocationSource { usesSimulation ? simulator : device }

    func requestAuthorization() {
        device.requestAuthorization()
    }

    /// Standort starten (Runde: auch bei gesperrtem Bildschirm).
    func start(background: Bool) {
        wantsBackground = background
        updatePowerState()
        guard !isActive else { return }
        isActive = true
        if !usesSimulation && authorization == .notDetermined { device.requestAuthorization() }
        source.start(background: background, lowPower: lowPower)
        refresh = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                self?.reevaluate()
            }
        }
    }

    func stop() {
        guard isActive else { return }
        isActive = false
        device.stop()
        simulator.stop()
        refresh?.cancel()
        refresh = nil
        tracker.reset()
        position = nil
    }

    /// Zwischen echtem und simuliertem GPS wechseln (Entwicklermenü).
    func setSimulation(_ on: Bool) {
        guard on != usesSimulation else { return }
        let wasActive = isActive
        stop()
        usesSimulation = on
        if wasActive { start(background: wantsBackground) }
    }

    private func ingest(_ fix: LocationFix, simulated: Bool) {
        guard simulated == usesSimulation else { return }
        tracker.push(fix)
        reevaluate()
    }

    private func reevaluate() {
        position = tracker.position(at: Date())
        updatePowerState()
    }

    private func updatePowerState() {
        let battery = UIDevice.current.batteryLevel
        let low = ProcessInfo.processInfo.isLowPowerModeEnabled || (battery >= 0 && battery < 0.15)
        if low != lowPower {
            lowPower = low
            if isActive { source.start(background: wantsBackground, lowPower: low) }
        }
    }
}
