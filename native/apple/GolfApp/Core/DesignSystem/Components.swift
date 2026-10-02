import GolfCore
import SwiftUI

// MARK: - Buttons

/// Hauptaktion: volle Breite, groß, Markenfarbe.
struct PrimaryButton: View {
    let title: String
    var systemImage: String?
    var isEnabled = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: Spacing.xs) {
                if let systemImage { Image(systemName: systemImage).font(.headline) }
                Text(title).font(Typography.section)
            }
            .frame(maxWidth: .infinity, minHeight: TouchArea.large)
            .foregroundStyle(Palette.textOnBrand)
            .background(isEnabled ? Palette.brand : Palette.textSecondary.opacity(0.4), in: RoundedRectangle(cornerRadius: Radius.l, style: .continuous))
        }
        .buttonStyle(PressableStyle())
        .disabled(!isEnabled)
    }
}

/// Nebenaktion: getönte Fläche.
struct SecondaryButton: View {
    let title: String
    var systemImage: String?
    var role: ButtonRole?
    let action: () -> Void

    var body: some View {
        Button(role: role, action: action) {
            HStack(spacing: Spacing.xs) {
                if let systemImage { Image(systemName: systemImage) }
                Text(title).font(Typography.bodyEmphasis)
            }
            .frame(maxWidth: .infinity, minHeight: TouchArea.minimum + 4)
            .foregroundStyle(role == .destructive ? Palette.danger : Palette.brand)
            .background(Palette.brandSoft, in: RoundedRectangle(cornerRadius: Radius.m, style: .continuous))
        }
        .buttonStyle(PressableStyle())
    }
}

/// Leichtes Eindrücken als Rückmeldung (respektiert „Bewegung reduzieren“ über die kurze Dauer).
struct PressableStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .opacity(configuration.isPressed ? 0.85 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

// MARK: - Karten

struct GolfCard<Content: View>: View {
    var padding: CGFloat = Spacing.m
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s) { content }
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.surface, in: RoundedRectangle(cornerRadius: Radius.l, style: .continuous))
            .golfShadow(.card)
    }
}

/// Abschnittsüberschrift mit optionaler Aktion.
struct SectionHeader: View {
    let title: String
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).font(Typography.section).foregroundStyle(Palette.textPrimary)
            Spacer()
            if let actionTitle, let action {
                Button(actionTitle, action: action).font(Typography.label).foregroundStyle(Palette.brand)
            }
        }
        .accessibilityAddTraits(.isHeader)
    }
}

// MARK: - Score

/// Markierung wie auf der Scorekarte: Kreis = unter Par (doppelt = Eagle oder besser), Quadrat = über Par
/// (doppelt = Doppelbogey oder schlechter). Die Bedeutung hängt so nie nur an der Farbe.
struct ScoreMark: View {
    let strokes: Int?
    let par: Int?
    var pickedUp = false
    var size: CGFloat = 30

    var body: some View {
        let diff = strokes.flatMap { s in par.map { s - $0 } }
        ZStack {
            if let diff, diff < 0 {
                Circle().stroke(Palette.underPar, lineWidth: 1.5)
                if diff <= -2 { Circle().stroke(Palette.underPar, lineWidth: 1.5).padding(3) }
            } else if let diff, diff > 0 {
                RoundedRectangle(cornerRadius: 3).stroke(Palette.overPar, lineWidth: 1.5)
                if diff >= 2 { RoundedRectangle(cornerRadius: 2).stroke(Palette.overPar, lineWidth: 1.5).padding(3) }
            }
            Text(verbatim: pickedUp ? "–" : strokes.map(String.init) ?? "·")
                .font(.system(.callout, design: .rounded, weight: .bold).monospacedDigit())
                .foregroundStyle(Palette.textPrimary)
        }
        .frame(width: size, height: size)
    }
}

/// Große Taste der Score-Eingabe.
struct ScoreButton: View {
    let value: Int
    var caption: String?
    var par: Int?
    var isSelected = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 2) {
                Text(verbatim: String(value))
                    .font(.system(.title, design: .rounded, weight: .heavy).monospacedDigit())
                if let caption {
                    Text(caption).font(.caption2.weight(.semibold)).lineLimit(1).minimumScaleFactor(0.7)
                }
            }
            .frame(maxWidth: .infinity, minHeight: TouchArea.score)
            .foregroundStyle(isSelected ? Palette.textOnBrand : Palette.textPrimary)
            .background(isSelected ? Palette.brand : Palette.surfaceMuted, in: RoundedRectangle(cornerRadius: Radius.m, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: Radius.m, style: .continuous)
                    .stroke(isSelected ? Palette.brand : Palette.separator, lineWidth: 1)
            }
        }
        .buttonStyle(PressableStyle())
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

/// Auswahltaste für kurze Antworten (Putts, Fairway, GIR …).
struct ChoiceButton: View {
    let title: String
    var systemImage: String?
    var isSelected = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: Spacing.xxs) {
                if let systemImage { Image(systemName: systemImage).font(.title3.weight(.semibold)) }
                Text(title).font(Typography.bodyEmphasis).lineLimit(1).minimumScaleFactor(0.7)
            }
            .frame(maxWidth: .infinity, minHeight: TouchArea.score)
            .foregroundStyle(isSelected ? Palette.textOnBrand : Palette.textPrimary)
            .background(isSelected ? Palette.brand : Palette.surfaceMuted, in: RoundedRectangle(cornerRadius: Radius.m, style: .continuous))
        }
        .buttonStyle(PressableStyle())
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

// MARK: - Entfernungen

/// Eine Entfernung zur Anzeige (bereits gerundet).
struct DistanceValue: Equatable {
    var value: Int?
    var approx = false
    var far = false

    var text: String {
        guard let value else { return "–" }
        return (far ? ">" : approx ? "≈" : "") + "\(value)"
    }
}

/// Front / Mitte / Back mit großer Mittelzahl – das Wichtigste der Runde.
struct DistanceCard: View {
    let front: DistanceValue
    let center: DistanceValue
    let back: DistanceValue
    var pin: DistanceValue?
    let unit: String
    let labels: (front: String, center: String, back: String, pin: String)
    @ScaledMetric(relativeTo: .largeTitle) private var heroSize: CGFloat = 76

    var body: some View {
        HStack(alignment: .center, spacing: Spacing.s) {
            side(labels.front, front)
            VStack(spacing: 0) {
                Text(labels.center.uppercased()).font(Typography.label).tracking(1.5).foregroundStyle(Palette.textSecondary)
                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    Text(center.text)
                        .font(.system(size: heroSize, weight: .heavy, design: .rounded).monospacedDigit())
                        .minimumScaleFactor(0.5)
                        .lineLimit(1)
                    Text(unit).font(.system(.title3, design: .rounded, weight: .bold)).foregroundStyle(Palette.textSecondary)
                }
                if let pin, pin.value != nil {
                    Text(verbatim: "\(labels.pin) \(pin.text) \(unit)").font(Typography.label).foregroundStyle(Palette.mapTarget)
                }
            }
            .frame(maxWidth: .infinity)
            side(labels.back, back)
        }
        .foregroundStyle(Palette.textPrimary)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: "\(labels.center) \(center.text) \(unit), \(labels.front) \(front.text), \(labels.back) \(back.text)"))
    }

    private func side(_ label: String, _ value: DistanceValue) -> some View {
        VStack(spacing: Spacing.xxs) {
            Text(label.uppercased()).font(Typography.label).tracking(1.2).foregroundStyle(Palette.textSecondary)
            Text(value.text).font(Typography.metric).lineLimit(1).minimumScaleFactor(0.6)
        }
        .frame(minWidth: 64)
    }
}

// MARK: - Loch

/// Kopf des Rundenmodus: Loch, Par, Handicap, Länge und Zwischenstand.
struct HoleHeader: View {
    let holeTitle: String
    let details: String
    let scoreSummary: String?
    var onPrevious: (() -> Void)?
    var onNext: (() -> Void)?
    var previousLabel: String = ""
    var nextLabel: String = ""

    var body: some View {
        HStack(spacing: Spacing.s) {
            navButton("chevron.left", onPrevious, previousLabel)
            VStack(spacing: 2) {
                Text(holeTitle).font(Typography.title).lineLimit(1)
                Text(details).font(Typography.captionEmphasis).foregroundStyle(Palette.textSecondary).lineLimit(1).minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity)
            if let scoreSummary {
                Text(scoreSummary)
                    .font(Typography.metricSmall)
                    .padding(.horizontal, Spacing.s)
                    .padding(.vertical, Spacing.xxs)
                    .background(Palette.surfaceMuted, in: Capsule())
            }
            navButton("chevron.right", onNext, nextLabel)
        }
        .foregroundStyle(Palette.textPrimary)
    }

    @ViewBuilder
    private func navButton(_ icon: String, _ action: (() -> Void)?, _ label: String) -> some View {
        Button { action?() } label: {
            Image(systemName: icon).font(.title3.weight(.bold)).frame(width: TouchArea.minimum, height: TouchArea.minimum)
        }
        .disabled(action == nil)
        .opacity(action == nil ? 0.3 : 1)
        .accessibilityLabel(label)
    }
}

// MARK: - Kennzahlen

struct StatCard: View {
    let title: String
    let value: String
    var subtitle: String?
    var systemImage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xxs) {
            HStack(spacing: Spacing.xxs) {
                if let systemImage { Image(systemName: systemImage).font(.caption.weight(.semibold)) }
                Text(title).font(Typography.label)
            }
            .foregroundStyle(Palette.textSecondary)
            Text(value).font(Typography.metric).foregroundStyle(Palette.textPrimary).lineLimit(1).minimumScaleFactor(0.6)
            if let subtitle {
                Text(subtitle).font(Typography.caption).foregroundStyle(Palette.textSecondary).lineLimit(2)
            }
        }
        .padding(Spacing.m)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.surface, in: RoundedRectangle(cornerRadius: Radius.l, style: .continuous))
        .golfShadow(.card)
        .accessibilityElement(children: .combine)
    }
}

/// Kompakte Kennzahl in einer Zeile (z. B. Rundenzusammenfassung).
struct MetricCard: View {
    let label: String
    let value: String

    var body: some View {
        VStack(spacing: 2) {
            Text(value).font(Typography.metricSmall).lineLimit(1).minimumScaleFactor(0.6)
            Text(label).font(Typography.caption).foregroundStyle(Palette.textSecondary).lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Spacing.s)
        .background(Palette.surfaceMuted, in: RoundedRectangle(cornerRadius: Radius.m, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Personen und Listen

struct PlayerAvatar: View {
    let name: String
    var size: CGFloat = 36

    private var initials: String {
        let parts = name.split(separator: " ").prefix(2)
        let letters = parts.compactMap { $0.first.map(String.init) }.joined()
        return letters.isEmpty ? "?" : letters.uppercased()
    }

    private var tint: Color {
        let palette = [Palette.brand, Palette.info, Palette.warning, Palette.overPar, Palette.mapTrees]
        let sum = name.unicodeScalars.reduce(0) { $0 + Int($1.value) }
        return palette[sum % palette.count]
    }

    var body: some View {
        Text(initials)
            .font(.system(size: size * 0.4, weight: .bold, design: .rounded))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(tint, in: Circle())
            .accessibilityHidden(true)
    }
}

/// Zeile einer Runde (Verlauf, Startseite).
struct RoundRow: View {
    let course: String
    let date: String
    let score: String
    let detail: String

    var body: some View {
        HStack(spacing: Spacing.s) {
            VStack(alignment: .leading, spacing: 2) {
                Text(course).font(Typography.bodyEmphasis).lineLimit(1)
                Text(date).font(Typography.caption).foregroundStyle(Palette.textSecondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(score).font(Typography.metricSmall)
                Text(detail).font(Typography.caption).foregroundStyle(Palette.textSecondary)
            }
        }
        .foregroundStyle(Palette.textPrimary)
        .padding(.vertical, Spacing.xxs)
        .accessibilityElement(children: .combine)
    }
}

/// Zeile eines Schlägers (Club Bag, ab Phase 6; im Entwicklermenü als Vorschau).
struct ClubRow: View {
    let name: String
    let carry: String
    var isActive = true

    var body: some View {
        HStack {
            Image(systemName: "figure.golf").foregroundStyle(Palette.brand)
            Text(name).font(Typography.bodyEmphasis)
            Spacer()
            Text(carry).font(Typography.metricSmall)
        }
        .opacity(isActive ? 1 : 0.45)
        .padding(.vertical, Spacing.xxs)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Auswahl

/// Segment-Auswahl mit großen Flächen (auch mit Handschuh bedienbar).
struct SegmentControl<Option: Hashable>: View {
    let options: [Option]
    @Binding var selection: Option
    let title: (Option) -> String

    var body: some View {
        HStack(spacing: Spacing.xxs) {
            ForEach(options, id: \.self) { option in
                let selected = option == selection
                Button { selection = option } label: {
                    Text(title(option))
                        .font(Typography.label)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .frame(maxWidth: .infinity, minHeight: TouchArea.minimum)
                        .foregroundStyle(selected ? Palette.textOnBrand : Palette.textPrimary)
                        .background(selected ? Palette.brand : Color.clear, in: RoundedRectangle(cornerRadius: Radius.s, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selected ? .isSelected : [])
            }
        }
        .padding(Spacing.xxs)
        .background(Palette.surfaceMuted, in: RoundedRectangle(cornerRadius: Radius.m, style: .continuous))
    }
}

// MARK: - Blatt

extension View {
    /// Einheitliches Blatt (Bottom Sheet) mit Griff und mittlerer/großer Höhe.
    func bottomSheet<Content: View>(isPresented: Binding<Bool>, detents: Set<PresentationDetent> = [.medium, .large],
                                    @ViewBuilder content: @escaping () -> Content) -> some View {
        sheet(isPresented: isPresented) {
            content()
                .presentationDetents(detents)
                .presentationDragIndicator(.visible)
                .presentationCornerRadius(Radius.xl)
        }
    }
}

// MARK: - Rundenmodus

/// Untere Leiste im Rundenmodus: wenige große Aktionen, sonst nichts (§63).
struct GolfTabBar: View {
    struct Item: Identifiable {
        let id: String
        let title: String
        let systemImage: String
        var isSelected = false
        var isProminent = false
        let action: () -> Void
    }

    let items: [Item]

    var body: some View {
        HStack(spacing: Spacing.xs) {
            ForEach(items) { item in
                Button(action: item.action) {
                    VStack(spacing: 2) {
                        Image(systemName: item.systemImage).font(.system(size: IconSize.m, weight: .semibold))
                        Text(item.title).font(.caption2.weight(.bold)).lineLimit(1).minimumScaleFactor(0.7)
                    }
                    .frame(maxWidth: .infinity, minHeight: TouchArea.large)
                    .foregroundStyle(item.isProminent ? Palette.textOnBrand : (item.isSelected ? Palette.brand : Palette.textPrimary))
                    .background(item.isProminent ? Palette.brand : (item.isSelected ? Palette.brandSoft : Color.clear),
                                in: RoundedRectangle(cornerRadius: Radius.m, style: .continuous))
                }
                .buttonStyle(PressableStyle())
                .accessibilityIdentifier("roundbar.\(item.id)")
                .accessibilityAddTraits(item.isSelected ? .isSelected : [])
            }
        }
        .padding(.horizontal, Spacing.s)
        .padding(.vertical, Spacing.xs)
        .background(Palette.surface)
    }
}

/// Hinweisband (GPS schwach, offline, fehlende Daten).
struct NoticeBanner: View {
    enum Tone { case info, warning, danger }
    let text: String
    var systemImage = "info.circle"
    var tone: Tone = .info
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        HStack(alignment: .top, spacing: Spacing.xs) {
            Image(systemName: systemImage).font(.subheadline.weight(.semibold))
            Text(text).font(Typography.captionEmphasis).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            if let actionTitle, let action {
                Button(actionTitle, action: action).font(Typography.captionEmphasis).buttonStyle(.bordered).controlSize(.small)
            }
        }
        .padding(Spacing.s)
        .foregroundStyle(color)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: Radius.m, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    private var color: Color {
        switch tone {
        case .info: return Palette.textPrimary
        case .warning: return Palette.warning
        case .danger: return Palette.danger
        }
    }
}
