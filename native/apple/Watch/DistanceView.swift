import HCPGolfKit
import SwiftUI

/// Wichtigster Watch-Screen: LOCH 7 · PAR 4 · 151 m · MITTE · GPS ● ±5 m.
/// Aktualisiert sich jede Sekunde (Alter der Messung), im Always-on-Modus nur minütlich (Akku).
struct DistanceView: View {
    @EnvironmentObject private var store: ConnectivityManager
    @Environment(\.isLuminanceReduced) private var luminanceReduced

    var body: some View {
        TimelineView(.periodic(from: .now, by: luminanceReduced ? 60 : 1)) { context in
            let display = store.display(at: context.date)
            GeometryReader { geo in
                let scale = geo.size.width / 184 // 184 pt ≈ 44/45 mm; skaliert auf 40–49 mm
                VStack(spacing: 2 * scale) {
                    HoleView(display: display, scale: scale)
                    content(display, scale: scale)
                    GPSStatusView(display: display, scale: scale)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(display.spoken)
            }
        }
        .toolbar {
            ToolbarItemGroup(placement: .bottomBar) {
                Button(action: store.previousHole) { Image(systemName: "chevron.left") }
                    .accessibilityLabel("Vorheriges Loch")
                Button(action: store.cycleTarget) { Image(systemName: "scope") }
                    .accessibilityLabel("Ziel wechseln")
                Button(action: store.nextHole) { Image(systemName: "chevron.right") }
                    .accessibilityLabel("Nächstes Loch")
            }
        }
    }

    @ViewBuilder
    private func content(_ d: WatchDisplay, scale: CGFloat) -> some View {
        switch d.kind {
        case .noRound:
            Text(d.gps).font(.system(size: 17 * scale, weight: .semibold)).multilineTextAlignment(.center)
        case .distance, .connectionLost:
            if !d.rows.isEmpty && d.kind == .distance {
                VStack(spacing: 1 * scale) {
                    ForEach(d.rows, id: \.label) { row in
                        HStack {
                            Text(row.label).font(.system(size: 11 * scale, weight: .semibold)).foregroundStyle(.secondary)
                            Spacer()
                            Text((row.value ?? "—") + " " + d.unit)
                                .font(.system(size: (row.primary ? 28 : 18) * scale, weight: .heavy, design: .rounded))
                                .monospacedDigit()
                        }
                        .padding(.horizontal, 6 * scale)
                        .background(row.primary ? Color.green.opacity(0.25) : .clear, in: RoundedRectangle(cornerRadius: 8 * scale))
                    }
                }
                .opacity(d.dim ? 0.45 : 1)
            } else if let distance = d.distance {
                VStack(spacing: 0) {
                    (Text((d.approx ? "≈" : "") + distance)
                        .font(.system(size: 58 * scale, weight: .black, design: .rounded))
                        .monospacedDigit()
                        + Text(d.unit).font(.system(size: 20 * scale, weight: .heavy, design: .rounded)))
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)
                    Text(d.target).font(.system(size: 13 * scale, weight: .bold)).tracking(2).foregroundStyle(.secondary)
                }
                .opacity(d.dim ? 0.45 : 1)
            } else {
                Text(d.notice ?? d.gps).font(.system(size: 16 * scale, weight: .semibold)).multilineTextAlignment(.center)
            }
        case .acquiring:
            Text(d.gps).font(.system(size: 16 * scale, weight: .semibold)).multilineTextAlignment(.center)
        case .noGPS, .noGreen:
            Text(d.kind == .noGPS ? d.gps : (d.notice ?? "")).font(.system(size: 16 * scale, weight: .semibold)).multilineTextAlignment(.center)
        }
    }
}
