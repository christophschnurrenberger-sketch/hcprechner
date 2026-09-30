// swift-tools-version:5.9
// HCPGolfKit – gemeinsame Logik für die iPhone-App (Companion) und die Apple-Watch-App:
// geodätische Distanz, Anzeige-Rundung, Positionsfilter und das Watch-Protokoll (Version 1).
// Nur Foundation – die Tests laufen mit `swift test` auf macOS (und Linux).
import PackageDescription

let package = Package(
    name: "HCPGolfKit",
    platforms: [.iOS(.v17), .watchOS(.v10), .macOS(.v13)],
    products: [
        .library(name: "HCPGolfKit", targets: ["HCPGolfKit"]),
    ],
    targets: [
        .target(name: "HCPGolfKit"),
        .testTarget(
            name: "HCPGolfKitTests",
            dependencies: ["HCPGolfKit"],
            resources: [.process("Resources")]
        ),
    ]
)
