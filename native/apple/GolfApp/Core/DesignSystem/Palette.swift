import SwiftUI
import UIKit

/// Farben der Marke und der Platzkarte, jeweils für helles und dunkles Erscheinungsbild.
/// Kontraste: Text auf Fläche ≥ 4,5 : 1; Bedeutung nie nur über Farbe (immer Text oder Form dazu).
enum Palette {
    // Flächen
    static let background = Color(light: 0xF4F6F3, dark: 0x0A0F0D)
    static let surface = Color(light: 0xFFFFFF, dark: 0x141B18)
    static let surfaceMuted = Color(light: 0xECEFEA, dark: 0x1C2521)
    static let separator = Color(light: 0xD9DED7, dark: 0x2A3530)

    // Text
    static let textPrimary = Color(light: 0x0B1411, dark: 0xF1F5F2)
    static let textSecondary = Color(light: 0x4A5751, dark: 0xA7B5AE)
    static let textOnBrand = Color(light: 0xFFFFFF, dark: 0x06140E)

    // Marke
    static let brand = Color(light: 0x127A52, dark: 0x3BC58A)
    static let brandDeep = Color(light: 0x0D3B2B, dark: 0x0C241B)
    static let brandSoft = Color(light: 0xDCEFE5, dark: 0x163327)
    /// Signal auf dunklem Grund (aktiver Wert, Hervorhebung)
    static let lime = Color(light: 0xC6EE5A, dark: 0xC6EE5A)

    // Zustände
    static let warning = Color(light: 0xB76E00, dark: 0xF2B544)
    static let danger = Color(light: 0xC0392B, dark: 0xF16B5D)
    static let info = Color(light: 0x1D63C9, dark: 0x6EA8FF)

    // Ergebnis relativ zu Par (zusätzlich Kreis/Quadrat als Form)
    static let underPar = Color(light: 0x1D63C9, dark: 0x6EA8FF)
    static let overPar = Color(light: 0xA2551C, dark: 0xF0A066)

    // Platzkarte
    static let mapRough = Color(light: 0x9DBE85, dark: 0x22392A)
    static let mapFairway = Color(light: 0x6FBF56, dark: 0x2F7040)
    static let mapGreen = Color(light: 0x49B04E, dark: 0x3E9A4D)
    static let mapGreenEdge = Color(light: 0x2A7A33, dark: 0x8FDB95)
    static let mapTee = Color(light: 0xE4F3D5, dark: 0xBFD9AE)
    static let mapBunker = Color(light: 0xEDDDB0, dark: 0x9E8A5A)
    static let mapWater = Color(light: 0x4C97DE, dark: 0x2D6AA6)
    static let mapTrees = Color(light: 0x2D6339, dark: 0x173822)
    static let mapLine = Color(light: 0xFFFFFF, dark: 0xE8F0EA)
    static let mapPlayer = Color(light: 0x1A73E8, dark: 0x5AA2FF)
    static let mapTarget = Color(light: 0xFF6A2B, dark: 0xFF8A55)
    static let mapLabel = Color(light: 0x0B1411, dark: 0x0B1411)
}

extension Color {
    /// Dynamische Farbe aus zwei Hex-Werten (RGB).
    init(light: UInt32, dark: UInt32) {
        self.init(uiColor: UIColor { traits in
            UIColor(hex: traits.userInterfaceStyle == .dark ? dark : light)
        })
    }
}

extension UIColor {
    convenience init(hex: UInt32) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255,
                  blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
    }
}
