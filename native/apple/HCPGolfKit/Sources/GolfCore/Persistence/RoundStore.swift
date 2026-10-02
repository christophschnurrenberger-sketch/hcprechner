import Foundation

/// Einheitliche JSON-Kodierung für Speicherung und Übertragung.
public enum GolfJSON {
    public static func encoder() -> JSONEncoder {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .millisecondsSince1970
        e.outputFormatting = [.sortedKeys]
        return e
    }

    public static func decoder() -> JSONDecoder {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .millisecondsSince1970
        return d
    }
}

/// Lokaler Speicher für Runden (Repository-Schicht „Local“). Jede Eingabe wird sofort gespeichert; die App
/// verwendet auf dem iPhone eine SwiftData-Implementierung, Tests und Watch die Dateiablage.
public protocol RoundStore: Sendable {
    func loadAll() async throws -> [StoredRound]
    func load(id: UUID) async throws -> StoredRound?
    func save(_ round: StoredRound) async throws
    /// Endgültig entfernen (nach übertragenem Löschen)
    func remove(id: UUID) async throws
}

/// Arbeitsspeicher – für Tests und Vorschauen.
public actor InMemoryRoundStore: RoundStore {
    private var rounds: [UUID: StoredRound]

    public init(_ rounds: [StoredRound] = []) {
        self.rounds = Dictionary(uniqueKeysWithValues: rounds.map { ($0.id, $0) })
    }

    public func loadAll() async throws -> [StoredRound] { Array(rounds.values) }
    public func load(id: UUID) async throws -> StoredRound? { rounds[id] }
    public func save(_ round: StoredRound) async throws { rounds[round.id] = round }
    public func remove(id: UUID) async throws { rounds[id] = nil }
}

/// Dateiablage: eine JSON-Datei je Runde, atomar geschrieben (erst temporäre Datei, dann Umbenennen) – ein Absturz
/// oder leerer Akku mitten im Schreiben hinterlässt nie eine halbe Datei.
public actor FileRoundStore: RoundStore {
    public let directory: URL
    private let fileManager = FileManager.default

    public init(directory: URL) throws {
        self.directory = directory
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    private func url(for id: UUID) -> URL {
        directory.appendingPathComponent(id.uuidString.lowercased() + ".json")
    }

    public func loadAll() async throws -> [StoredRound] {
        let files = try fileManager.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
        var out: [StoredRound] = []
        for file in files where file.pathExtension == "json" {
            // Eine beschädigte Datei darf die anderen Runden nicht blockieren
            if let round = try? GolfJSON.decoder().decode(StoredRound.self, from: Data(contentsOf: file)) {
                out.append(round)
            }
        }
        return out
    }

    public func load(id: UUID) async throws -> StoredRound? {
        let file = url(for: id)
        guard fileManager.fileExists(atPath: file.path) else { return nil }
        return try GolfJSON.decoder().decode(StoredRound.self, from: Data(contentsOf: file))
    }

    public func save(_ round: StoredRound) async throws {
        let data = try GolfJSON.encoder().encode(round)
        try data.write(to: url(for: round.id), options: [.atomic])
    }

    public func remove(id: UUID) async throws {
        let file = url(for: id)
        if fileManager.fileExists(atPath: file.path) {
            try fileManager.removeItem(at: file)
        }
    }
}
