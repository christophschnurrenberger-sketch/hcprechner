import SwiftUI

/// Design-Tokens: Es gibt im Projekt keine freien Zahlen für Abstände, Radien, Schatten oder Touch-Flächen.

enum Spacing {
    static let xxs: CGFloat = 4
    static let xs: CGFloat = 8
    static let s: CGFloat = 12
    static let m: CGFloat = 16
    static let l: CGFloat = 24
    static let xl: CGFloat = 32
    static let xxl: CGFloat = 48
}

enum Radius {
    static let s: CGFloat = 8
    static let m: CGFloat = 14
    static let l: CGFloat = 20
    static let xl: CGFloat = 28
}

enum IconSize {
    static let s: CGFloat = 16
    static let m: CGFloat = 22
    static let l: CGFloat = 28
    static let xl: CGFloat = 40
}

/// Mindestgrößen für Bedienelemente – draußen, mit Handschuh, in der Sonne.
enum TouchArea {
    static let minimum: CGFloat = 44
    static let large: CGFloat = 56
    static let score: CGFloat = 64
}

enum Shadow {
    case card, floating

    var color: Color { .black.opacity(self == .card ? 0.06 : 0.16) }
    var radius: CGFloat { self == .card ? 10 : 18 }
    var y: CGFloat { self == .card ? 3 : 8 }
}

extension View {
    func golfShadow(_ shadow: Shadow) -> some View {
        self.shadow(color: shadow.color, radius: shadow.radius, x: 0, y: shadow.y)
    }
}

/// Typografie. Alle Stile skalieren mit Dynamic Type; Zahlen mit festen Ziffernbreiten (kein Springen beim Ändern).
enum Typography {
    static let display = Font.system(.largeTitle, design: .rounded, weight: .bold)
    static let title = Font.system(.title2, design: .rounded, weight: .bold)
    static let section = Font.system(.headline, design: .rounded, weight: .semibold)
    static let body = Font.body
    static let bodyEmphasis = Font.body.weight(.semibold)
    static let caption = Font.caption
    static let captionEmphasis = Font.caption.weight(.semibold)
    static let label = Font.system(.footnote, design: .rounded, weight: .semibold)
    static let metric = Font.system(.title, design: .rounded, weight: .heavy).monospacedDigit()
    static let metricSmall = Font.system(.title3, design: .rounded, weight: .bold).monospacedDigit()
}
