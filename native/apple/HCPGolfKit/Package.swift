// swift-tools-version:5.9
// HCPGolfKit – gemeinsame Swift-Logik aller Apple-Apps des Projekts. Bis auf GolfPersistence nur Foundation, damit alles
// mit `swift test` auf macOS und Linux geprüft werden kann (UI, CoreLocation und MapKit liegen in den App-Targets).
//
//  HCPGolfKit  Watch-Anbindung der Web-App (Version 2.4): Geodäsie, DistanceEngine, PositionFilter, Watch-Protokoll v1
//  GolfCore    native Golf-App: Datenmodell, Geometrie (Grün, Hindernisse, Lochkarte), WHS-Regeln DE 2026,
//              Scoring (Zählspiel, Stableford, Lochspiel), Scorecard-Ablauf, Statistik, GPS-Auswertung,
//              automatischer Lochwechsel, Speicherung und Synchronisation (offline-first)
//  GolfDemo    Demo-Plätze (fiktiv), Mock-Datenanbieter, Demo-Spieler und GPS-Simulator für die Entwicklung
//  GolfPersistence  lokale Speicherung der Runden mit SwiftData (nur Apple-Plattformen; auf Linux leer)
import PackageDescription

let package = Package(
    name: "HCPGolfKit",
    platforms: [.iOS(.v17), .watchOS(.v10), .macOS(.v14)],
    products: [
        .library(name: "HCPGolfKit", targets: ["HCPGolfKit"]),
        .library(name: "GolfCore", targets: ["GolfCore"]),
        .library(name: "GolfDemo", targets: ["GolfDemo"]),
        .library(name: "GolfPersistence", targets: ["GolfPersistence"]),
    ],
    targets: [
        .target(name: "HCPGolfKit"),
        .target(name: "GolfCore", dependencies: ["HCPGolfKit"]),
        .target(name: "GolfDemo", dependencies: ["GolfCore"]),
        .target(name: "GolfPersistence", dependencies: ["GolfCore"]),
        .testTarget(
            name: "HCPGolfKitTests",
            dependencies: ["HCPGolfKit"],
            resources: [.process("Resources")]
        ),
        .testTarget(name: "GolfCoreTests", dependencies: ["GolfCore"]),
        .testTarget(name: "GolfDemoTests", dependencies: ["GolfDemo", "GolfCore"]),
        .testTarget(name: "GolfPersistenceTests", dependencies: ["GolfPersistence", "GolfCore"]),
    ]
)
