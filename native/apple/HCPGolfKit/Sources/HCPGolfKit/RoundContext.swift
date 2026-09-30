import Foundation

/// Rundenkontext aus der Web-App (`src/lib/gps/watch/bridge.ts` → RoundContext): Löcher der Runde mit Par und
/// Grün-Koordinaten, Loch der Entfernungsansicht, Ziel und Einheit. Nur für die iPhone-App (native Berechnung bei
/// gesperrtem Bildschirm) – die Watch erhält ihn nicht. Enthält keine personenbezogenen Daten.
public struct RoundContext: Equatable, Sendable {
    public struct Hole: Equatable, Sendable {
        public var number: Int
        public var par: Int?
        public var green: GreenGeo?

        public init(number: Int, par: Int?, green: GreenGeo?) {
            self.number = number
            self.par = par
            self.green = green
        }
    }

    public var roundActive: Bool
    public var courseId: String?
    public var unit: DistanceFormat.Unit
    public var target: GreenTarget
    /// Loch der Entfernungsansicht
    public var hole: Int?
    public var holes: [Hole]

    public init(roundActive: Bool, courseId: String?, unit: DistanceFormat.Unit, target: GreenTarget, hole: Int?, holes: [Hole]) {
        self.roundActive = roundActive
        self.courseId = courseId
        self.unit = unit
        self.target = target
        self.hole = hole
        self.holes = holes
    }

    public init?(json: [String: Any]) {
        guard (json["v"] as? Int) == 1 else { return nil }
        func point(_ any: Any?) -> GeoPoint? {
            guard let d = any as? [String: Any], let lat = d["latitude"] as? Double, let lng = d["longitude"] as? Double else { return nil }
            let p = GeoPoint(latitude: lat, longitude: lng)
            return p.isValid ? p : nil
        }
        roundActive = (json["roundActive"] as? Bool) ?? false
        courseId = json["courseId"] as? String
        unit = (json["unit"] as? String).flatMap(DistanceFormat.Unit.init(rawValue:)) ?? .meters
        target = (json["target"] as? String).flatMap(GreenTarget.init(rawValue:)) ?? .greenCenter
        hole = json["hole"] as? Int
        holes = (json["holes"] as? [[String: Any]] ?? []).compactMap { h in
            guard let number = h["number"] as? Int else { return nil }
            let g = h["green"] as? [String: Any]
            let green = g.map { GreenGeo(front: point($0["front"]), center: point($0["center"]), back: point($0["back"])) }
            return Hole(number: number, par: h["par"] as? Int, green: green)
        }
    }

    public func hole(_ number: Int?) -> Hole? {
        guard let number = number else { return nil }
        return holes.first { $0.number == number }
    }

    /// Nächstes/vorheriges Loch der Runde (für die Lochwahl auf der Watch)
    public func neighbor(of number: Int?, delta: Int) -> Int? {
        guard let index = holes.firstIndex(where: { $0.number == number }) else { return nil }
        let next = index + delta
        return holes.indices.contains(next) ? holes[next].number : nil
    }

    /// Watch-Zustand aus einer (geglätteten) Position – gleiche Regeln wie `watchStateFromView` in der Web-App.
    public func watchState(fix: LocationFix?, now: Date) -> WatchState {
        var s = WatchState()
        s.roundActive = roundActive
        s.hole = hole
        s.unit = unit
        let h = self.hole(hole)
        s.par = h?.par
        let green = h?.green
        let target = DistanceEngine.resolveTarget(green, preferred: self.target)
        s.target = target
        guard roundActive, let green = green, green.center != nil || green.front != nil || green.back != nil else {
            s.noGreen = roundActive && hole != nil
            s.status = fix == nil ? .acquiring : .ok
            return s
        }
        guard let fix = fix else {
            s.status = .acquiring
            return s
        }
        let age = now.timeIntervalSince(fix.timestamp)
        if age > GPSConfig.positionExpired {
            s.status = .noSignal
            return s
        }
        s.status = age > GPSConfig.positionStale ? .acquiring : (fix.accuracy > GPSConfig.accuracyFair ? .poor : .ok)
        s.gpsAccuracy = max(1, Int(fix.accuracy.rounded()))
        let d = DistanceEngine.greenDistances(fix.point, green)
        func value(_ meters: Double?) -> Int? { DistanceFormat.rounded(meters: meters, accuracy: fix.accuracy, unit: unit).value }
        let primary: Double? = target == .greenFront ? d.front : target == .greenBack ? d.back : d.center
        let r = DistanceFormat.rounded(meters: primary, accuracy: fix.accuracy, unit: unit)
        s.distance = r.value
        s.approx = r.approx
        if green.hasFrontOrBack {
            s.front = value(d.front)
            s.center = value(d.center)
            s.back = value(d.back)
        }
        s.timestamp = r.value == nil ? nil : Int(fix.timestamp.timeIntervalSince1970.rounded())
        return s
    }
}
