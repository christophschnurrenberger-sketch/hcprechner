import Foundation

/// Zeitstempel einer hybriden logischen Uhr (HLC): Wanduhr in Millisekunden, Zähler und Kennung des Geräts.
/// Total geordnet und als Text sortierbar („0001760000000000-0000-iphone“), damit auch der Server (PostgreSQL)
/// Änderungen per Textvergleich ordnen kann.
public struct HLCTimestamp: Hashable, Comparable, Sendable, CustomStringConvertible {
    public var millis: Int64
    public var counter: Int
    public var node: String

    public init(millis: Int64, counter: Int, node: String) {
        self.millis = millis
        self.counter = counter
        self.node = node
    }

    public static func < (a: HLCTimestamp, b: HLCTimestamp) -> Bool {
        if a.millis != b.millis { return a.millis < b.millis }
        if a.counter != b.counter { return a.counter < b.counter }
        return a.node < b.node
    }

    public var description: String {
        let ms = String(millis)
        let counterHex = String(counter, radix: 16)
        return String(repeating: "0", count: max(0, 16 - ms.count)) + ms + "-"
            + String(repeating: "0", count: max(0, 4 - counterHex.count)) + counterHex + "-" + node
    }

    public init?(_ text: String) {
        let parts = text.split(separator: "-", maxSplits: 2, omittingEmptySubsequences: false)
        guard parts.count == 3, let ms = Int64(parts[0]), let counter = Int(parts[1], radix: 16), !parts[2].isEmpty else { return nil }
        self.init(millis: ms, counter: counter, node: String(parts[2]))
    }

    public var date: Date { Date(timeIntervalSince1970: Double(millis) / 1000) }
}

extension HLCTimestamp: Codable {
    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let text = try container.decode(String.self)
        guard let value = HLCTimestamp(text) else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Ungültiger HLC-Zeitstempel \(text)")
        }
        self = value
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(description)
    }
}

/// Hybride logische Uhr eines Geräts (Kulkarni et al.). Liefert streng steigende Zeitstempel, auch wenn die Wanduhr
/// springt, und übernimmt beim Empfang fremder Änderungen deren Zeit – so gewinnt bei Konflikten die zuletzt
/// gemachte Änderung, ohne dass die Uhren der Geräte exakt gleich gehen müssen.
public struct HybridLogicalClock: Sendable {
    public let node: String
    public private(set) var last: HLCTimestamp?

    public init(node: String, last: HLCTimestamp? = nil) {
        self.node = node.isEmpty ? "device" : node
        self.last = last
    }

    static func millis(_ date: Date) -> Int64 { Int64((date.timeIntervalSince1970 * 1000).rounded(.down)) }

    /// Zeitstempel für eine lokale Änderung.
    public mutating func tick(now: Date = Date()) -> HLCTimestamp {
        let physical = Self.millis(now)
        let next: HLCTimestamp
        if let last, last.millis >= physical {
            next = HLCTimestamp(millis: last.millis, counter: last.counter + 1, node: node)
        } else {
            next = HLCTimestamp(millis: physical, counter: 0, node: node)
        }
        last = next
        return next
    }

    /// Zeitstempel einer empfangenen Änderung berücksichtigen.
    public mutating func observe(_ remote: HLCTimestamp, now: Date = Date()) {
        let physical = Self.millis(now)
        let local = last ?? HLCTimestamp(millis: 0, counter: 0, node: node)
        let maxMillis = max(local.millis, remote.millis, physical)
        let counter: Int
        if maxMillis == local.millis && maxMillis == remote.millis {
            counter = max(local.counter, remote.counter) + 1
        } else if maxMillis == local.millis {
            counter = local.counter + 1
        } else if maxMillis == remote.millis {
            counter = remote.counter + 1
        } else {
            counter = 0
        }
        last = HLCTimestamp(millis: maxMillis, counter: counter, node: node)
    }
}
