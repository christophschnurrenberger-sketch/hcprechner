import Foundation

/// WGS-84-Koordinate in Dezimalgrad.
public struct GeoPoint: Codable, Equatable, Sendable {
    public var latitude: Double
    public var longitude: Double

    public init(latitude: Double, longitude: Double) {
        self.latitude = latitude
        self.longitude = longitude
    }

    /// Breite −90…90, Länge −180…180, endliche Werte
    public var isValid: Bool {
        latitude.isFinite && longitude.isFinite && (-90.0...90.0).contains(latitude) && (-180.0...180.0).contains(longitude)
    }
}

/// Geodätische Entfernung (Luftlinie) – identisch mit `src/lib/gps/geodesy.ts`:
/// Vincenty auf dem WGS-84-Ellipsoid, Haversine als Rückfallebene.
public enum Geodesy {
    static let wgs84A = 6_378_137.0
    static let wgs84F = 1.0 / 298.257223563
    static let wgs84B = wgs84A * (1.0 - wgs84F)
    static let meanEarthRadius = 6_371_008.8
    static let rad = Double.pi / 180.0

    public static func haversine(_ a: GeoPoint, _ b: GeoPoint) -> Double {
        let dLat = (b.latitude - a.latitude) * rad
        let dLon = (b.longitude - a.longitude) * rad
        let h = pow(sin(dLat / 2), 2) + cos(a.latitude * rad) * cos(b.latitude * rad) * pow(sin(dLon / 2), 2)
        return 2 * meanEarthRadius * asin(min(1, sqrt(h)))
    }

    /// Vincenty (inverse Aufgabe); `nil`, wenn die Iteration nicht konvergiert (fast gegenüberliegende Punkte).
    public static func vincenty(_ a: GeoPoint, _ b: GeoPoint) -> Double? {
        if a.latitude == b.latitude && a.longitude == b.longitude { return 0 }
        let f = wgs84F
        // Längendifferenz auf −180…180° bringen (Datumsgrenze)
        let dLon = ((b.longitude - a.longitude).truncatingRemainder(dividingBy: 360) + 540).truncatingRemainder(dividingBy: 360) - 180
        let l = dLon * rad
        let tanU1 = (1 - f) * tan(a.latitude * rad)
        let cosU1 = 1 / sqrt(1 + tanU1 * tanU1)
        let sinU1 = tanU1 * cosU1
        let tanU2 = (1 - f) * tan(b.latitude * rad)
        let cosU2 = 1 / sqrt(1 + tanU2 * tanU2)
        let sinU2 = tanU2 * cosU2

        var lambda = l
        for _ in 0..<200 {
            let sinLambda = sin(lambda)
            let cosLambda = cos(lambda)
            let sinSqSigma = pow(cosU2 * sinLambda, 2) + pow(cosU1 * sinU2 - sinU1 * cosU2 * cosLambda, 2)
            if sinSqSigma < 1e-24 { return 0 }
            let sinSigma = sqrt(sinSqSigma)
            let cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda
            let sigma = atan2(sinSigma, cosSigma)
            let sinAlpha = cosU1 * cosU2 * sinLambda / sinSigma
            let cosSqAlpha = 1 - sinAlpha * sinAlpha
            let cos2SigmaM = cosSqAlpha != 0 ? cosSigma - 2 * sinU1 * sinU2 / cosSqAlpha : 0
            let c = f / 16 * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha))
            let previous = lambda
            lambda = l + (1 - c) * f * sinAlpha * (sigma + c * sinSigma * (cos2SigmaM + c * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)))
            if abs(lambda) > Double.pi * 1.5 { return nil }
            if abs(lambda - previous) < 1e-12 {
                let uSq = cosSqAlpha * (wgs84A * wgs84A - wgs84B * wgs84B) / (wgs84B * wgs84B)
                let bigA = 1 + uSq / 16384 * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)))
                let bigB = uSq / 1024 * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)))
                let term1 = cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)
                let term2 = bigB / 6 * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)
                let deltaSigma = bigB * sinSigma * (cos2SigmaM + bigB / 4 * (term1 - term2))
                return wgs84B * bigA * (sigma - deltaSigma)
            }
        }
        return nil
    }

    /// Entfernung in Metern (Vincenty, sonst Haversine). Erwartet gültige Koordinaten.
    public static func distance(_ a: GeoPoint, _ b: GeoPoint) -> Double {
        vincenty(a, b) ?? haversine(a, b)
    }

    /// Lokale Näherung für kleine Abstände (Positionsfilter), Meter Ost/Nord.
    public static func toLocalMeters(origin: GeoPoint, point: GeoPoint) -> (east: Double, north: Double) {
        let north = (point.latitude - origin.latitude) * rad * meanEarthRadius
        var dLon = point.longitude - origin.longitude
        if dLon > 180 { dLon -= 360 }
        if dLon < -180 { dLon += 360 }
        let east = dLon * rad * meanEarthRadius * cos(origin.latitude * rad)
        return (east, north)
    }

    public static func fromLocalMeters(origin: GeoPoint, east: Double, north: Double) -> GeoPoint {
        let latitude = origin.latitude + north / meanEarthRadius / rad
        var longitude = origin.longitude + east / (meanEarthRadius * cos(origin.latitude * rad)) / rad
        if longitude > 180 { longitude -= 360 }
        if longitude < -180 { longitude += 360 }
        return GeoPoint(latitude: latitude, longitude: longitude)
    }
}
