import HCPGolfKit
import SwiftUI

/// „LOCH 7  PAR 4“ – oben, klein; die Entfernung bleibt die größte Information.
struct HoleView: View {
    let display: WatchDisplay
    let scale: CGFloat

    var body: some View {
        if let hole = display.hole {
            HStack(spacing: 6 * scale) {
                Text(hole).font(.system(size: 15 * scale, weight: .bold)).tracking(1.5)
                if let par = display.par {
                    Text(par).font(.system(size: 13 * scale, weight: .semibold)).foregroundStyle(.secondary)
                }
            }
            .lineLimit(1)
            .minimumScaleFactor(0.7)
        }
    }
}
