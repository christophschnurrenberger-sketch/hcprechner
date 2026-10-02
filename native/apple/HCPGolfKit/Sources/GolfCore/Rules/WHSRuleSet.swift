import Foundation

/// Rundungsmodus der Regelversion.
public enum WHSRoundingMode: String, Codable, Sendable {
    /// kaufmännisch, .5 vom Nullpunkt weg (DGV)
    case halfAwayFromZero
    /// .5 Richtung +∞
    case halfUp
}

/// Fachlicher Eingabefehler: Die Berechnung ist mit den vorhandenen Daten nach dem Regelwerk nicht möglich.
/// `code` entspricht den Codes der Web-App (`src/rules/whs/errors.ts`).
public struct WHSError: Error, Equatable, Sendable, CustomStringConvertible {
    public var code: String
    public var params: [String: String]

    public init(_ code: String, _ params: [String: String] = [:]) {
        self.code = code
        self.params = params
    }

    public var description: String {
        params.isEmpty ? code : code + " " + params.sorted { $0.key < $1.key }.map { "\($0.key)=\($0.value)" }.joined(separator: ",")
    }
}

/// Regelversion des World Handicap Systems – Deutschland / DGV 2026.
///
/// Swift-Fassung von `src/rules/whs/de/2026/config.ts` (Web-App). Jede Regelzahl steht genau einmal hier; die
/// Rechenfunktionen (Erweiterungen dieses Typs) lesen ausschließlich diese Werte. Gleiche Testwerte wie die Web-App
/// (`tests/whs/*.test.ts`) prüfen, dass beide Fassungen dieselben Ergebnisse liefern.
public struct WHSRuleSet: Sendable, Identifiable {
    public struct IndexTableRow: Sendable, Equatable {
        public var minScores: Int
        public var maxScores: Int
        public var count: Int
        public var adjustment: Double
    }

    public var id: String
    public var country: String
    public var version: String
    public var label: String
    public var roundingMode: WHSRoundingMode
    public var scoreDifferentialDecimals: Int
    public var handicapIndexDecimals: Int
    public var halvedHandicapIndexDecimals: Int
    public var slopeStandard: Double
    public var slopeMin: Double
    public var slopeMax: Double
    public var pccAllowed: [Int]
    /// DGV: PCC-Werte für 9-Loch-Runden (explizit hinterlegt, nie 1:1 übernommen)
    public var nineHolePCC: [Int: Double]
    public var maximumHandicapIndex: Double
    public var windowSize: Int
    public var minimumScores: Int
    public var indexTable: [IndexTableRow]
    public var netDoubleBogeyStrokesOverPar: Int
    public var nineHoleExpectedFactor: Double
    public var nineHoleExpectedConstant: Double
    public var nineHoleDivisor: Double
    /// Gespieltes und erwartetes 9-Loch-Differential werden jeweils auf 0,1 gerundet, dann addiert
    public var nineHoleRoundComponents: Bool
    public var maxHoleScore: Int
    /// zulässige Handicap-Verrechnung (Allowance) für das Playing Handicap
    public var allowanceRange: ClosedRange<Double>

    public static let de2026 = WHSRuleSet(
        id: "DE-2026",
        country: "DE",
        version: "2026",
        label: "Deutschland / DGV – World Handicap System, Regelversion 2026",
        roundingMode: .halfAwayFromZero,
        scoreDifferentialDecimals: 1,
        handicapIndexDecimals: 1,
        halvedHandicapIndexDecimals: 1,
        slopeStandard: 113,
        slopeMin: 55,
        slopeMax: 155,
        pccAllowed: [-1, 0, 1, 2, 3],
        nineHolePCC: [-1: -0.5, 0: 0, 1: 0.5, 2: 1.0, 3: 1.5],
        maximumHandicapIndex: 54.0,
        windowSize: 20,
        minimumScores: 3,
        indexTable: [
            IndexTableRow(minScores: 3, maxScores: 3, count: 1, adjustment: -2.0),
            IndexTableRow(minScores: 4, maxScores: 4, count: 1, adjustment: -1.0),
            IndexTableRow(minScores: 5, maxScores: 5, count: 1, adjustment: 0),
            IndexTableRow(minScores: 6, maxScores: 6, count: 2, adjustment: -1.0),
            IndexTableRow(minScores: 7, maxScores: 8, count: 2, adjustment: 0),
            IndexTableRow(minScores: 9, maxScores: 11, count: 3, adjustment: 0),
            IndexTableRow(minScores: 12, maxScores: 14, count: 4, adjustment: 0),
            IndexTableRow(minScores: 15, maxScores: 16, count: 5, adjustment: 0),
            IndexTableRow(minScores: 17, maxScores: 18, count: 6, adjustment: 0),
            IndexTableRow(minScores: 19, maxScores: 19, count: 7, adjustment: 0),
            IndexTableRow(minScores: 20, maxScores: 20, count: 8, adjustment: 0),
        ],
        netDoubleBogeyStrokesOverPar: 2,
        nineHoleExpectedFactor: 1.04,
        nineHoleExpectedConstant: 2.4,
        nineHoleDivisor: 2,
        nineHoleRoundComponents: true,
        maxHoleScore: 30,
        allowanceRange: 0.01...1.5
    )

    /// Regelversion nach Kennung (z. B. aus einer gespeicherten Runde).
    public static func ruleSet(id: String) -> WHSRuleSet? {
        id == de2026.id ? de2026 : nil
    }
}
