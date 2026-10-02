import Foundation

/// Marke der App an einer Stelle. Der Arbeitstitel „Carry“ (Carry = Flugweite des Balls) ist ein Platzhalter:
/// Name auf dem Homescreen in `Config/Base.xcconfig` (`GOLF_APP_DISPLAY_NAME`), Texte hier.
enum AppBrand {
    static var name: String {
        (Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "Carry"
    }

    static var version: String {
        let short = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0"
        return "\(short) (\(build))"
    }
}
