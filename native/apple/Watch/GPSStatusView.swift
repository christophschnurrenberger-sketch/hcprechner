import HCPGolfKit
import SwiftUI

/// GPS-Status und Aktualität: „GPS ● ±5 m“, „GPS ungenau ● ±28 m“, „vor 1:02 min“, „Verbindung verloren“.
/// Die Farbe ist nie die einzige Information (Text daneben).
struct GPSStatusView: View {
    let display: WatchDisplay
    let scale: CGFloat

    var body: some View {
        VStack(spacing: 1 * scale) {
            if display.kind != .noRound && display.kind != .acquiring && display.kind != .noGreen {
                Text(display.gps)
                    .font(.system(size: 12 * scale, weight: .semibold))
                    .foregroundStyle(color)
            }
            if display.distance != nil, let notice = display.notice {
                Text(notice).font(.system(size: 11 * scale, weight: .semibold)).foregroundStyle(.orange)
            }
            if let age = display.age {
                Text(age).font(.system(size: 11 * scale, weight: .semibold)).foregroundStyle(.orange)
            }
            if display.kind == .noGPS, let notice = display.notice {
                Text(notice).font(.system(size: 11 * scale)).foregroundStyle(.secondary)
            }
        }
        .lineLimit(1)
        .minimumScaleFactor(0.7)
    }

    private var color: Color {
        switch display.tone {
        case .good: return .green
        case .poor: return .orange
        case .none: return .secondary
        }
    }
}
