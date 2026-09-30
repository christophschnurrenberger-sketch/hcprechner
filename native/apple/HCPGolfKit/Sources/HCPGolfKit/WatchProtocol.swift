import Foundation

// Apple-Watch-Protokoll Version 1 – identisch mit `src/lib/gps/watch/protocol.ts`.
// Die Watch erhält nur Loch, Par, Entfernung, Ziel, GPS-Status und Zeitpunkt; keine Scorecard, kein Konto,
// keine Golfplatzdatenbank. Übertragen werden JSON-Nachrichten (vollständiger Zustand, danach nur Änderungen).

public let watchProtocolVersion = 1

public enum WatchGPSStatus: String, Codable, Sendable {
    case ok
    case poor
    case acquiring
    case noSignal = "no_signal"
    case off
}

/// Zustand auf der Watch (Felder aus dem Master-Prompt §30 plus Status).
public struct WatchState: Equatable, Sendable {
    public var roundActive = false
    public var hole: Int?
    public var par: Int?
    /// gerundet in `unit`; nil statt 0
    public var distance: Int?
    public var approx = false
    public var unit: DistanceFormat.Unit = .meters
    public var target: GreenTarget = .greenCenter
    public var front: Int?
    public var center: Int?
    public var back: Int?
    public var gpsAccuracy: Int?
    public var status: WatchGPSStatus = .off
    public var noGreen = false
    /// Zeitpunkt der Messung, Unix-Sekunden (iPhone-Uhr)
    public var timestamp: Int?

    public init() {}

    public static let keys = ["roundActive", "hole", "par", "distance", "approx", "unit", "target", "front", "center", "back", "gpsAccuracy", "status", "noGreen", "timestamp"]

    /// Feldwert für JSON (nil → NSNull)
    public func json(_ key: String) -> Any {
        func opt(_ v: Int?) -> Any { v.map { $0 as Any } ?? NSNull() }
        switch key {
        case "roundActive": return roundActive
        case "hole": return opt(hole)
        case "par": return opt(par)
        case "distance": return opt(distance)
        case "approx": return approx
        case "unit": return unit.rawValue
        case "target": return target.rawValue
        case "front": return opt(front)
        case "center": return opt(center)
        case "back": return opt(back)
        case "gpsAccuracy": return opt(gpsAccuracy)
        case "status": return status.rawValue
        case "noGreen": return noGreen
        case "timestamp": return opt(timestamp)
        default: return NSNull()
        }
    }

    /// Feld aus JSON übernehmen (NSNull → nil); unbekannte Felder werden ignoriert.
    public mutating func apply(_ key: String, _ value: Any) {
        func int(_ v: Any) -> Int? {
            if v is NSNull { return nil }
            if let i = v as? Int { return i }
            if let d = v as? Double, d.rounded() == d { return Int(d) }
            return nil
        }
        switch key {
        case "roundActive": roundActive = (value as? Bool) ?? false
        case "hole": hole = int(value)
        case "par": par = int(value)
        case "distance": distance = int(value)
        case "approx": approx = (value as? Bool) ?? false
        case "unit": unit = (value as? String).flatMap(DistanceFormat.Unit.init(rawValue:)) ?? .meters
        case "target": target = (value as? String).flatMap(GreenTarget.init(rawValue:)) ?? .greenCenter
        case "front": front = int(value)
        case "center": center = int(value)
        case "back": back = int(value)
        case "gpsAccuracy": gpsAccuracy = int(value)
        case "status": status = (value as? String).flatMap(WatchGPSStatus.init(rawValue:)) ?? .off
        case "noGreen": noGreen = (value as? Bool) ?? false
        case "timestamp": timestamp = int(value)
        default: break
        }
    }
}

/// Nachricht iPhone → Watch.
public struct WatchMessage {
    public enum Kind: String {
        case state, patch, heartbeat
    }

    public var kind: Kind
    /// Kennung des Senders (neu nach Neustart) – ein neuer Sender beginnt mit `state`
    public var epoch: String
    public var seq: Int
    /// Sendezeitpunkt, Unix-Sekunden (iPhone-Uhr)
    public var sentAt: Int
    /// geänderte Felder (NSNull = Wert entfernt); bei `heartbeat` nil
    public var data: [String: Any]?

    public init(kind: Kind, epoch: String, seq: Int, sentAt: Int, data: [String: Any]?) {
        self.kind = kind
        self.epoch = epoch
        self.seq = seq
        self.sentAt = sentAt
        self.data = data
    }

    public init?(json: [String: Any]) {
        guard (json["v"] as? Int) == watchProtocolVersion,
              let kind = (json["type"] as? String).flatMap(Kind.init(rawValue:)),
              let epoch = json["epoch"] as? String,
              let seq = json["seq"] as? Int,
              let sentAt = json["sentAt"] as? Int else { return nil }
        self.kind = kind
        self.epoch = epoch
        self.seq = seq
        self.sentAt = sentAt
        self.data = json["data"] as? [String: Any]
    }

    public var json: [String: Any] {
        var out: [String: Any] = ["v": watchProtocolVersion, "type": kind.rawValue, "epoch": epoch, "seq": seq, "sentAt": sentAt]
        if let data = data { out["data"] = data }
        return out
    }

    public func encoded() throws -> Data {
        try JSONSerialization.data(withJSONObject: json)
    }

    public static func decode(_ data: Data) -> WatchMessage? {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return WatchMessage(json: object)
    }
}

// MARK: - Senden

/// Sendet nur Änderungen; ohne Änderung spätestens alle 5 s einen Herzschlag (Verbindungserkennung auf der Watch).
public final class WatchSync {
    private var last: WatchState?
    private var seq = 0
    private var lastSentAt = Date.distantPast
    private let send: (WatchMessage) -> Void
    private let now: () -> Date
    public let epoch: String

    public init(send: @escaping (WatchMessage) -> Void, now: @escaping () -> Date = { Date() }, epoch: String = String(UUID().uuidString.prefix(8)).lowercased()) {
        self.send = send
        self.now = now
        self.epoch = epoch
    }

    /// Letzter gesendeter Zustand (z. B. als vollständige Nachricht für den Application Context)
    public var current: WatchState? { last }

    /// Vollständige Nachricht des aktuellen Zustands (ohne neue Folgenummer), z. B. für `updateApplicationContext`
    public func snapshot() -> WatchMessage? {
        guard let state = last else { return nil }
        var all: [String: Any] = [:]
        for key in WatchState.keys { all[key] = state.json(key) }
        return WatchMessage(kind: .state, epoch: epoch, seq: seq, sentAt: Int(now().timeIntervalSince1970.rounded()), data: all)
    }

    /// Nur geänderte Felder. Beim Lochwechsel immer Entfernung/Zeitpunkt mitsenden (nie alte Entfernung mit neuem Loch).
    public static func diff(_ prev: WatchState?, _ next: WatchState) -> [String: Any]? {
        guard let prev = prev else {
            var all: [String: Any] = [:]
            for key in WatchState.keys { all[key] = next.json(key) }
            return all
        }
        var out: [String: Any] = [:]
        for key in WatchState.keys where !sameValue(prev.json(key), next.json(key)) {
            out[key] = next.json(key)
        }
        if out["hole"] != nil {
            for key in ["distance", "timestamp", "front", "center", "back"] { out[key] = next.json(key) }
        }
        return out.isEmpty ? nil : out
    }

    private static func sameValue(_ a: Any, _ b: Any) -> Bool {
        switch (a, b) {
        case (is NSNull, is NSNull): return true
        case let (x as Bool, y as Bool): return x == y
        case let (x as Int, y as Int): return x == y
        case let (x as String, y as String): return x == y
        default: return false
        }
    }

    @discardableResult
    public func update(_ state: WatchState) -> WatchMessage? {
        guard let data = WatchSync.diff(last, state) else { return nil }
        seq += 1
        let message = WatchMessage(kind: last == nil ? .state : .patch, epoch: epoch, seq: seq, sentAt: Int(now().timeIntervalSince1970.rounded()), data: data)
        last = state
        lastSentAt = now()
        send(message)
        return message
    }

    @discardableResult
    public func heartbeat() -> WatchMessage? {
        guard last != nil, now().timeIntervalSince(lastSentAt) >= GPSConfig.watchHeartbeat else { return nil }
        seq += 1
        let message = WatchMessage(kind: .heartbeat, epoch: epoch, seq: seq, sentAt: Int(now().timeIntervalSince1970.rounded()), data: nil)
        lastSentAt = now()
        send(message)
        return message
    }

    /// z. B. nach neuer Verbindung: nächster Aufruf sendet wieder den vollständigen Zustand
    public func reset() {
        last = nil
    }
}

// MARK: - Empfangen

public struct WatchReceiver {
    public private(set) var state: WatchState?
    public private(set) var epoch: String?
    public private(set) var seq = 0
    /// Empfang der letzten Nachricht (Uhr der Watch)
    public private(set) var receivedAt: Date?
    /// Sendezeit der letzten Nachricht (iPhone-Uhr, s)
    public private(set) var sentAt: Int?

    public init() {}

    public mutating func receive(_ message: WatchMessage, at now: Date) {
        if message.epoch != epoch {
            // neuer Sender (App neu gestartet): nur mit vollständigem Zustand übernehmen
            guard message.kind == .state else { return }
            self = WatchReceiver()
            epoch = message.epoch
        } else if message.seq <= seq {
            return
        }
        switch message.kind {
        case .heartbeat:
            guard state != nil else { return }
            seq = message.seq
            receivedAt = now
            sentAt = message.sentAt
        case .patch where state == nil:
            return // auf vollständigen Zustand warten
        case .state, .patch:
            var next = state ?? WatchState()
            for (key, value) in message.data ?? [:] { next.apply(key, value) }
            state = next
            seq = message.seq
            receivedAt = now
            sentAt = message.sentAt
        }
    }

    /// Alter der Messung: (sentAt − timestamp) auf dem iPhone + Zeit seit dem Empfang – ohne Uhrenvergleich.
    public func fixAge(at now: Date) -> TimeInterval? {
        guard let ts = state?.timestamp, let sentAt = sentAt, let receivedAt = receivedAt else { return nil }
        return max(0, Double(sentAt - ts)) + max(0, now.timeIntervalSince(receivedAt))
    }
}

// MARK: - Anzeige

public struct WatchDisplay: Equatable {
    public enum Kind: String {
        case noRound = "NO_ROUND"
        case connectionLost = "CONNECTION_LOST"
        case acquiring = "ACQUIRING"
        case noGPS = "NO_GPS"
        case noGreen = "NO_GREEN"
        case distance = "DISTANCE"
    }

    public struct Row: Equatable {
        public var label: String
        public var value: String?
        public var primary: Bool
    }

    /// Farbe der GPS-Zeile (zusätzlich zum Text): gut, ungenau, ohne Messung
    public enum Tone: String {
        case good, poor, none
    }

    public var kind: Kind
    /// „LOCH 7“
    public var hole: String?
    /// „PAR 4“
    public var par: String?
    /// Zahl ohne Einheit – nie „0“
    public var distance: String?
    public var approx: Bool
    public var unit: String
    /// „MITTE“ / „FRONT“ / „BACK“
    public var target: String
    public var rows: [Row]
    /// „GPS ● ±5 m“ bzw. Statuszeile
    public var gps: String
    public var tone: Tone
    /// „vor 1:02 min“
    public var age: String?
    public var notice: String?
    public var dim: Bool
    /// Vorlesetext (VoiceOver)
    public var spoken: String

    /// Was die Watch zeigt – abhängig von Zustand, Verbindung und Alter der Messung.
    public static func make(_ r: WatchReceiver, now: Date, locale: GPSMessages.Locale = .de) -> WatchDisplay {
        let t = { (key: String, params: [String: String]) in GPSMessages.text(key, params, locale: locale) }
        let s = r.state
        let base = WatchDisplay(
            kind: .noRound, hole: nil, par: nil, distance: nil, approx: false, unit: (s?.unit ?? .meters).rawValue,
            target: t("target.short.\((s?.target ?? .greenCenter).rawValue)", [:]).uppercased(),
            rows: [], gps: "", tone: .none, age: nil, notice: nil, dim: false, spoken: t("watch.noRound", [:])
        )
        guard let state = s, state.roundActive, let receivedAt = r.receivedAt else {
            var d = base
            d.gps = t("watch.noRound", [:])
            return d
        }

        let hole = state.hole.map { t("hole", ["n": String($0)]).uppercased() }
        let par = state.par.map { t("par", ["par": String($0)]).uppercased() }
        let sinceReceipt = max(0, now.timeIntervalSince(receivedAt))
        let lost = sinceReceipt > GPSConfig.watchConnectionLost
        let fixAge = r.fixAge(at: now)
        func shown(_ n: Int?) -> String? { n.flatMap { $0 > 0 ? String($0) : nil } }
        let value = shown(state.distance)
        var rows: [Row] = []
        if state.front != nil || state.back != nil {
            rows = [
                Row(label: t("target.short.green_front", [:]).uppercased(), value: shown(state.front), primary: state.target == .greenFront),
                Row(label: t("target.short.green_center", [:]).uppercased(), value: shown(state.center), primary: state.target == .greenCenter),
                Row(label: t("target.short.green_back", [:]).uppercased(), value: shown(state.back), primary: state.target == .greenBack),
            ]
        }
        let gps: String
        switch state.status {
        case .ok, .poor:
            let label = state.status == .poor ? t("gps.poor", [:]) : t("gps.label", [:])
            gps = "\(label) ●" + (state.gpsAccuracy.map { " " + t("gps.accuracy", ["accuracy": String($0)]) } ?? "")
        case .acquiring:
            gps = t("watch.acquiring", [:])
        case .noSignal, .off:
            gps = t("watch.noData", [:])
        }
        let ageText: String? = {
            guard let age = fixAge, lost || age > GPSConfig.watchShowAgeAfter else { return nil }
            return t("watch.age", ["age": DistanceFormat.age(age)])
        }()
        let unitSpoken = t("unit.spoken.\(state.unit.rawValue)", [:])
        let targetSpoken = t("target.spoken.\(state.target.rawValue)", [:])

        var d = base
        d.hole = hole
        d.par = par
        d.rows = rows
        d.gps = gps
        d.tone = state.status == .ok ? .good : state.status == .poor ? .poor : .none
        d.unit = state.unit.rawValue

        if lost {
            d.kind = .connectionLost
            d.tone = .none
            d.distance = value
            d.approx = state.approx
            d.age = value != nil ? ageText : nil
            d.notice = t("watch.connectionLost", [:])
            d.dim = true
            d.spoken = t("watch.connectionLost", [:]) + (value.map { ", \($0) \(unitSpoken), " + t("watch.notCurrent", [:]) } ?? "")
            return d
        }
        if state.noGreen {
            d.kind = .noGreen
            d.notice = t("watch.noGreen", [:])
            d.spoken = t("watch.noGreen", [:])
            return d
        }
        guard let distance = value else {
            let acquiring = state.status == .acquiring || state.status == .ok || state.status == .poor
            d.kind = acquiring ? .acquiring : .noGPS
            d.notice = acquiring ? nil : t("watch.checkPhone", [:])
            d.spoken = acquiring ? t("watch.acquiring", [:]) : t("watch.noData", [:]) + ", " + t("watch.checkPhone", [:])
            return d
        }
        let stale = (fixAge ?? 0) > GPSConfig.watchStaleAfter
        d.kind = .distance
        d.distance = distance
        d.approx = state.approx
        d.age = ageText
        d.notice = stale ? t("watch.stale", [:]) : nil
        d.dim = stale
        if stale { d.tone = .none }
        let sentence = t(state.approx ? "spoken.approx" : "spoken.distance", ["distance": distance, "unit": unitSpoken, "target": targetSpoken])
        d.spoken = ([hole ?? "", sentence].filter { !$0.isEmpty }.joined(separator: " ")) + (stale ? ", " + t("watch.notCurrent", [:]) : "")
        return d
    }
}
