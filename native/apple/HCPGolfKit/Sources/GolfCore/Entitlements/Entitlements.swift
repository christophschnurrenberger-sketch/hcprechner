import Foundation

/// Abo-Stufe. Die Zuordnung Funktion → Stufe steht nur in `EntitlementPolicy` und lässt sich dort ändern;
/// es gibt keine Paywall-Logik in den Views.
public enum SubscriptionTier: Int, Codable, Sendable, Comparable, CaseIterable {
    case free = 0
    case premium = 1
    case intelligence = 2

    public static func < (a: SubscriptionTier, b: SubscriptionTier) -> Bool { a.rawValue < b.rawValue }
}

public enum Feature: String, Codable, Sendable, CaseIterable {
    // Free
    case courseSearch, gpsDistances, frontCenterBack, basicScorecard, basicRounds, basicWatch, basicSocial
    // Premium
    case playsLike, shotTracker, clubRecommendation, hazardDistances, distanceArcs, stats, handicapTools
    case watchScoring, watchMaps, notes, highlights, adFree
    // Intelligence
    case aiCaddie, autoShotDetection, strokesGained, benchmarks, performanceTrends
}

public struct EntitlementPolicy: Sendable, Equatable {
    public var requiredTier: [Feature: SubscriptionTier]

    public init(requiredTier: [Feature: SubscriptionTier]) {
        self.requiredTier = requiredTier
    }

    /// Zuordnung laut Produktkonzept (§53).
    public static let standard = EntitlementPolicy(requiredTier: {
        var map: [Feature: SubscriptionTier] = [:]
        for f in [Feature.courseSearch, .gpsDistances, .frontCenterBack, .basicScorecard, .basicRounds, .basicWatch, .basicSocial] {
            map[f] = .free
        }
        for f in [Feature.playsLike, .shotTracker, .clubRecommendation, .hazardDistances, .distanceArcs, .stats, .handicapTools,
                  .watchScoring, .watchMaps, .notes, .highlights, .adFree] {
            map[f] = .premium
        }
        for f in [Feature.aiCaddie, .autoShotDetection, .strokesGained, .benchmarks, .performanceTrends] {
            map[f] = .intelligence
        }
        return map
    }())

    /// Unbekannte Funktionen sind sicherheitshalber der höchsten Stufe vorbehalten.
    public func isEnabled(_ feature: Feature, for tier: SubscriptionTier) -> Bool {
        tier >= (requiredTier[feature] ?? .intelligence)
    }

    public func features(for tier: SubscriptionTier) -> [Feature] {
        Feature.allCases.filter { isEnabled($0, for: tier) }
    }
}
