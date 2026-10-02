import Foundation
import HCPGolfKit

public enum Handedness: String, Codable, Sendable, CaseIterable {
    case right, left
}

/// Profil des Spielers auf diesem Gerät (später mit dem Konto synchronisiert).
public struct PlayerProfile: Codable, Equatable, Identifiable, Sendable {
    public var id: UUID
    public var displayName: String
    /// Handicap Index laut Spieler (offizieller Wert des Verbands); `nil` = keiner
    public var handicapIndex: Double?
    public var gender: Gender
    public var handedness: Handedness
    public var preferredTeeColor: TeeColor?
    public var homeCourseID: CourseID?
    public var unit: DistanceFormat.Unit

    public init(id: UUID = UUID(), displayName: String, handicapIndex: Double?, gender: Gender, handedness: Handedness = .right,
                preferredTeeColor: TeeColor? = nil, homeCourseID: CourseID? = nil, unit: DistanceFormat.Unit = .meters) {
        self.id = id
        self.displayName = displayName
        self.handicapIndex = handicapIndex
        self.gender = gender
        self.handedness = handedness
        self.preferredTeeColor = preferredTeeColor
        self.homeCourseID = homeCourseID
        self.unit = unit
    }

    /// Spieler für den Runden-Assistenten
    public func setupPlayer(teeID: TeeID? = nil) -> SetupPlayer {
        SetupPlayer(id: id, kind: .owner, name: displayName, handicapIndex: handicapIndex, gender: gender, teeID: teeID)
    }
}
