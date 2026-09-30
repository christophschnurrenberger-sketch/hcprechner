import Foundation

/// Robuste Positionsverarbeitung – identisch mit `src/lib/gps/filter.ts`: sehr ungenaue Messungen verwerfen,
/// unrealistische Sprünge erst nach Bestätigung übernehmen, leicht glätten (Kalman), ohne träge zu werden.
/// Hält nur die aktuelle Schätzung – keinen Bewegungsverlauf.
public final class PositionFilter {
    public enum Verdict: Equatable {
        case accepted, reset, rejectedAccuracy, rejectedInvalid, rejectedOutOfOrder, pendingJump
    }

    private struct State {
        var point: GeoPoint
        var variance: Double
        var timestamp: Date
        var accuracy: Double
    }

    private var state: State?
    private var suspects: [LocationFix] = []

    public init() {}

    public func reset() {
        state = nil
        suspects = []
    }

    public var current: LocationFix? {
        state.map { LocationFix(point: $0.point, accuracy: $0.accuracy, timestamp: $0.timestamp) }
    }

    @discardableResult
    public func push(_ fix: LocationFix) -> (verdict: Verdict, fix: LocationFix?) {
        guard fix.point.isValid, fix.accuracy.isFinite, fix.accuracy >= 0 else { return (.rejectedInvalid, nil) }
        if fix.accuracy > GPSConfig.accuracyReject { return (.rejectedAccuracy, nil) }
        guard let s = state else { return initialize(fix, .accepted) }
        if fix.timestamp < s.timestamp { return (.rejectedOutOfOrder, nil) }

        let dt = fix.timestamp.timeIntervalSince(s.timestamp)
        let jump = Geodesy.distance(s.point, fix.point)
        let speed = dt > 0 ? jump / dt : Double.infinity
        if jump > fix.accuracy + s.accuracy && speed > GPSConfig.maxPlausibleSpeed {
            if let last = suspects.last, Geodesy.distance(last.point, fix.point) <= GPSConfig.jumpConfirmRadius + max(last.accuracy, fix.accuracy) {
                suspects.append(fix)
            } else {
                suspects = [fix]
            }
            if suspects.count >= GPSConfig.jumpConfirmations { return initialize(fix, .reset) }
            return (.pendingJump, nil)
        }
        suspects = []

        let motion = max(GPSConfig.filterSpeed, min(speed.isFinite ? speed : 0, GPSConfig.maxPlausibleSpeed))
        let variance = s.variance + dt * motion * motion
        let measurement = fix.accuracy * fix.accuracy
        let gain = measurement == 0 ? 1 : variance / (variance + measurement)
        let offset = Geodesy.toLocalMeters(origin: s.point, point: fix.point)
        let next = Geodesy.fromLocalMeters(origin: s.point, east: offset.east * gain, north: offset.north * gain)
        state = State(point: next, variance: (1 - gain) * variance, timestamp: fix.timestamp, accuracy: fix.accuracy)
        return (.accepted, current)
    }

    private func initialize(_ fix: LocationFix, _ verdict: Verdict) -> (verdict: Verdict, fix: LocationFix?) {
        state = State(point: fix.point, variance: fix.accuracy * fix.accuracy, timestamp: fix.timestamp, accuracy: fix.accuracy)
        suspects = []
        return (verdict, current)
    }
}
