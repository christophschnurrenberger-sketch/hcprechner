# Native Golf-App für iPhone (Phase 1)

Eigenständige iPhone-App mit Golf-GPS, Scorekarte und Handicap-Rechnung je Runde – Arbeitstitel **„Carry“**
(Name in `native/apple/Config/Base.xcconfig` und `GolfApp/App/AppBrand.swift`). Quellcode: `native/apple/GolfApp`
(SwiftUI) und das Swift-Paket `native/apple/HCPGolfKit` (Logik, ohne UI).

> **Stand:** Phase 1 laut Master-Prompt §86 (Projektstruktur, Datenmodelle, Design-System, Demo-Daten, Navigation,
> Start, Platzsuche, Platzvorschau, Rundeneinrichtung, Rundenbildschirm, Scorekarte). Die CI
> (`.github/workflows/native-apple.yml`) baut die App mit Xcode 16.4 ohne Warnungen aus eigenem Code und startet sie
> auf dem iPhone-Simulator mit einem UI-Rauchtest (grün). Auf echten Geräten und auf dem Platz ist sie noch **nicht**
> getestet.

Die bestehende Web-App und die iPhone-/Watch-Begleit-App „Golf HCP“ (`native/apple/Companion`, `Watch`, siehe
[`native/apple/README.md`](../native/apple/README.md)) bleiben funktional unverändert; im Companion wurde nur ein
Compilerfehler behoben, der erst mit dem CI-Build sichtbar wurde. Die neue App teilt mit ihnen nur die WHS-Regeln
(gleiche Testwerte) und die Geodäsie aus `HCPGolfKit`.

## Grundsätze

- **Eigene Marke, eigene Daten.** Keine Namen, Logos, Icons, Texte, Grafiken, Platzdaten oder Codes anderer Golf-Apps;
  kein Scraping, kein Reverse Engineering. Icon und Design-System sind eigene Entwürfe.
- **Keine erfundenen Platzwerte.** Für echte Plätze gilt die harte Regel des Projekts: Course Rating, Slope, Par und
  Hcp-Index werden nie erfunden oder abgeleitet (kein CR₉ = CR₁₈ / 2); fehlende Werte bleiben `nil`, und die App
  bietet dann nur an, was ohne sie geht (z. B. Brutto ohne Netto/Stableford). Die drei **Demo-Plätze** sind als Ganzes
  fiktiv (Name „Demo Golf Club“, Geometrie, Ratings); ihre Ratings tragen den Status `fictional`, die App zeigt
  „Demo“ an, und eine Runde dort kann nie fürs Handicap zählen.
- **Keine erfundenen Statistiken.** Kennzahlen entstehen nur aus tatsächlich erfassten Werten abgeschlossener Runden;
  Quoten aus Summen, nie aus Durchschnitten von Prozentwerten. Ohne Daten steht „–“ bzw. ein Leerzustand.
- **Datenschutz.** Standort nur während einer Runde bzw. auf der Karte und nach Zustimmung; kein Bewegungsprofil, keine
  Positionen an einen Server. Runden sind standardmäßig privat. Export (JSON) und „Alle Runden löschen“ im Profil.
- **Keine Geheimnisse im Client.** Keine API-Schlüssel im Swift-Code; spätere Dienste (Platzdaten, Wetter, KI) laufen
  über das eigene Backend.
- **Regeln getrennt von der UI.** Views rechnen nichts: Handicap, Wertung, Entfernungen, Lochwechsel und
  Synchronisation liegen in `GolfCore` und sind dort getestet.

## Aufbau

```
GolfApp (SwiftUI, iOS 17)            native/apple/GolfApp
  App/            Einstieg, Navigation (5 Tabs + Rundenmodus als Vollbild), AppEnvironment (Abhängigkeiten)
  Core/           Design-System, Karten (Canvas-Vektorkarte, MapKit-Satellit), Standort, Texte, lokale Einstellungen
  Features/       Home · Courses · CoursePreview · RoundSetup · Round · Scorecard · Rounds · Stats · Profile · Developer
        │
        ▼
HCPGolfKit (Swift-Paket)             native/apple/HCPGolfKit
  GolfCore         nur Foundation: Modelle, Geometrie, WHS-Regeln, Wertung, Score-Assistent, Statistik,
                   GPS-Qualität, Lochwechsel, Runden-Repository, Offline-Ausgang, Synchronisation, Abo-Stufen
  GolfDemo         fiktive Demo-Plätze, Mock-Platzdatenquelle, Demo-Spieler, GPS-Simulator
  GolfPersistence  SwiftData-Speicher für Runden (iOS 17 / macOS 14)
  HCPGolfKit       (bestehend) Geodäsie, PositionFilter, Watch-Protokoll v1
```

- **Abhängigkeiten** werden einmal in `AppEnvironment` erzeugt und über `@Environment(AppEnvironment.self)`
  weitergegeben (`live()` für das Gerät, `preview()` für Vorschauen, Startargument `-uiTesting` für UI-Tests).
- **Repository-Muster:** `CourseRepository` = `GolfCourseDataProvider` (Quelle) + `CourseCache` (offline);
  `RoundRepository` = `RoundStore` (lokal) + Ausgang + Zusammenführen; `SyncEngine` spricht mit einem
  `RemoteRoundService`. Alle externen Dienste sind Protokolle mit Mock-Implementierung.
- **Persistenz:** Runden in SwiftData (`RoundRecord` mit dem Rundendokument als JSON), Rückfall auf Dateien;
  Platzdaten als Dateien (`FileCourseCache`); Einstellungen, Profil und Lochstrategien in `UserDefaults`.

## Funktionsumfang Phase 1

| Bereich | Umfang | Code |
|---|---|---|
| Start | Begrüßung, „Runde starten“ (Heimatplatz → zuletzt gespielt → Demo-Platz), laufende Runde fortsetzen, HCPI, Rundenzahl, Ø 18 Loch, zuletzt gespielte und favorisierte Plätze, letzte Runde, Sync-Status | `Features/Home` |
| Platzsuche | Suche nach Name, Ort, Region, Club; Filter Alle / In der Nähe / Favoriten / Zuletzt; Kennzeichen GPS, Demo, Lochdaten fehlen, offline verfügbar; Favoriten | `Features/Courses` |
| Platzdetail | Abschläge mit Rating je Geschlecht und Umfang (18, Front 9, Back 9), Lochliste mit Par, Hcp, Länge; Hinweise bei Demo-Platz und fehlenden Daten | `CourseDetailView` |
| Platzvorschau | jedes Loch auf der Karte (Vektor oder Satellit), Abschlag bis Grünmitte, Messen per Tippen (Abschlag → Punkt → Grün), Zwei-Punkt-Messung, Strategie mit bis zu drei Zielpunkten je Loch (gespeichert) | `Features/CoursePreview` |
| Rundeneinrichtung | Platz → Löcher (18, Front 9, Back 9 – nur wenn die Daten es erlauben) → Datum → Spielform (Zählspiel, Stableford, Lochspiel bei 2 Spielern) → Handicap (Index mit Prozentsatz, Spielvorgabe manuell, ohne) → Erfassung (voll, einfach, nur GPS) → Privatsphäre → Spieler mit Abschlag (Freunde, Gäste) → „zählt fürs Handicap“; Prüfung mit verständlichen Hinweisen | `Features/RoundSetup`, `GolfCore/Round/RoundSetup.swift` |
| Rundenbildschirm | Loch-Kopf (Loch, Par, Hcp, Länge, Zwischenstand), große Front/Mitte/Back-Anzeige (geglättet, zur GPS-Genauigkeit passend gerundet), Hindernisse (erreichen / Mitte / überfliegen, links/rechts), Karte mit Spieler, Grün, Fahne, Zielpunkt, Distanzbögen, Zoom aufs Grün; langer Druck setzt Tagesfahne bzw. Ziel; GPS-Qualität; Lochwahl; automatischer Lochwechsel mit Rückfrage bei Unsicherheit; ohne GPS Entfernungen vom Abschlag | `Features/Round`, `Core/Map` |
| Score-Eingabe | Assistent: Score → Mitspieler → Putts → Fairway → GIR → Extras (Bunker, Strafschläge, Notiz); ein Tipp je Frage, „Fertig“ jederzeit; jede Antwort sofort gespeichert; danach optional nächstes Loch | `Features/Scorecard/ScoreEntrySheet.swift`, `GolfCore/Scorecard` |
| Scorekarte | Tabelle mit Kreis/Quadrat-Markierung, Out/In/Gesamt, Putts, Summen je Spieler, Netto, Stableford, Lochspiel-Stand, Leaderboard; Loch antippen → bearbeiten | `ScorecardViews.swift`, `GolfCore/Scoring` |
| Rundenabschluss | Score, Stableford, Score Differential mit Rechenweg-Hinweis (zählt / zählt nicht und warum), Putts, Fairways, GIR, Highlights, Teilen als Text | `Features/Rounds/RoundSummaryView.swift` |
| Runden | laufende Runde, Verlauf mit Filtern (18 / 9 Loch / handicaprelevant) und Sortierung, Detail, Löschen | `Features/Rounds` |
| Statistik | Scoring, Driving, Annäherung, kurzes Spiel, Putting, Verteilung der Lochergebnisse – nur aus abgeschlossenen Runden | `Features/Stats`, `GolfCore/Stats` |
| Profil | Name, Handicap Index (inkl. Plus-Handicap), Geschlecht, Händigkeit, Abschlag, Heimatplatz; Einstellungen (Einheit, Lochwechsel, Erfassung, Distanzbögen, Haptik, Bildschirm an, Erscheinungsbild, Sprache); Export, Löschen | `Features/Profile` |
| Entwicklermenü | 7 × auf die Version tippen: Fake-GPS, Position je Loch (Abschlag, Fairway, Grün, nächster Abschlag), Genauigkeit, Rauschen, GPS-Sprung, ganze Runde abspielen, Offline-Modus, Sync erzwingen, Demo-Daten zurücksetzen, Design-System-Galerie | `Features/Developer` |

**Handicap:** Berechnet werden je Runde Course/Playing Handicap (18 und 9 Loch, Prozentsatz, Plus-Handicap),
Schlagverteilung, Netto-Doppelbogey/GBE, Stableford, Score Differential mit PCC und die 9-Loch-Methode (gespielt +
erwartet). Die Regeln sind eine Swift-Portierung von `src/rules/whs/de/2026` mit denselben Testwerten
(`GolfCore/Rules`). Den **Handicap Index** selbst rechnet die App in Phase 1 nicht fort; er kommt aus dem Profil.

**Offline und Synchronisation:** Jede Eingabe wird sofort lokal gespeichert. Eine Runde ist ein Dokument mit Feldern
(Kopf, Status, Score je Spieler und Loch); jede Änderung trägt einen Zeitstempel einer hybriden logischen Uhr.
Zusammengeführt wird je Feld nach „letzter Schreiber gewinnt“, Löschen gewinnt immer. Der Ausgang merkt sich geänderte
Felder (nicht Versionen), damit auch Eingaben mit älterem Zeitstempel (z. B. von der Watch) übertragen werden. So gehen
bei zwei Geräten ohne Netz keine Eingaben verloren und nichts wird doppelt angelegt (getestet in `SyncTests`).

**GPS:** Glättung und Qualitätsstufen (sehr gut / gut / schwach / veraltet / kein GPS), Front/Mitte/Back dynamisch
entlang der Linie Spieler → Grünmitte, Hysterese gegen springende Zahlen, automatischer Lochwechsel mit Verweildauer,
Genauigkeitsgrenze, Verlassen des Grüns, Rückweg- und Abkühlregeln. Im Hintergrund nur während einer Runde
(Hintergrundmodus `location`), bei niedrigem Akku sparsamer.

## Was funktioniert – was Mock ist – was fehlt

### Funktioniert (in Phase 1 umgesetzt und getestet)

- Alle Abläufe der Tabelle oben mit den Demo-Plätzen, offline, ohne Konto.
- Logik in `GolfCore`/`GolfDemo`/`GolfPersistence`: 102 automatisierte Tests (100 auf Linux, dazu 2 SwiftData-Tests auf
  macOS), u. a. eine simulierte 18-Loch-Runde mit automatischem Lochwechsel (2 → 18), GPS-Sprüngen und schwachem
  Signal, eine komplette Offline-Runde mit Neustart und zwei Geräte, die offline ändern und danach zusammenführen.
- CI: Paket-Tests (Linux und macOS), String-Katalog-Prüfung, Build der App für den Simulator, UI-Rauchtest
  (Runde starten → Score eingeben → Runde minimieren → fortsetzen), Build der bestehenden Companion- und Watch-App.

### Mock (austauschbar über Protokolle)

| Teil | Mock in Phase 1 | Später |
|---|---|---|
| Platzdaten | `MockGolfCourseDataProvider`: drei fiktive Demo-Plätze (`demo-championship` 18 Loch, `demo-academy-9` 9 Loch, `demo-seepark` 18 Loch mit Seen), prozedural erzeugt, realistische Geometrie | lizenzierte Platzdatenbank über eigenes Backend (`GolfCourseDataProvider`) |
| Server | `InMemoryRemoteRoundService` (im Speicher, mit Offline-Schalter) | Supabase (Auth, Postgres mit Row Level Security, Realtime) als `RemoteRoundService` |
| Konto | lokales Demo-Profil („Demo-Account“), Demo-Freunde | Anmeldung (Sign in with Apple, E-Mail) |
| GPS im Simulator/Test | `SimulatedLocationSource` (Entwicklermenü, `-uiTesting`) | – (auf dem Gerät `DeviceLocationSource` mit CoreLocation) |
| Abo-Stufen | `EntitlementPolicy` (Free / Premium / Intelligence) vorbereitet, in Phase 1 alles frei | StoreKit 2 |

### Externe Dienste, die noch fehlen

- **Platzdaten:** lizenzierte Quelle mit Loch-Geometrie (Abschläge, Grün-Umrisse, Hindernisse) und offiziellen Ratings
  – nur über das eigene Backend, mit Herkunft und Prüfstand je Wert.
- **Backend:** Supabase (oder gleichwertig) für Konto, Runden-Synchronisation (Feld-Zeitstempel wie oben), Freunde,
  Live-Runden; Zugriff nur über Row Level Security.
- **StoreKit 2:** Produkte und Prüfung der Käufe für Premium/Intelligence.
- **Wetter/Wind und Höhe** (für „Plays Like“) über das Backend, kein Schlüssel in der App.
- **KI-Caddie:** Anbieter nur über das Backend.

### Nächste Phasen

1. Backend anbinden (Konto, Sync gegen Supabase, Konfliktfälle auf echten Geräten), lizenzierte Platzdaten.
2. Apple-Watch-App v2 mit eigenem GPS und Score-Eingabe (Logik aus `GolfCore`, Sync über das iPhone).
3. Handicap-Verlauf in der App (Portierung von `src/lib/whs/scoringRecord.ts`: beste 8 aus 20, Caps, ESR).
4. Schlag-Tracking, Schlägerdistanzen, Plays Like (Höhe, Wind), Schlägerempfehlung.
5. Premium mit StoreKit, Freunde/Live-Runden, Teilen.
6. Später: KI-Caddie, automatische Schlagerkennung, Strokes Gained.

## Texte, Barrierefreiheit, Erscheinungsbild

- Alle Texte in `GolfApp/Core/Localization/L10n.swift` (Schlüssel + deutscher Standardtext) und im String-Katalog
  `GolfApp/Resources/Localizable.xcstrings`: Deutsch und Englisch vollständig, Französisch, Italienisch und Spanisch
  vorbereitet (`CFBundleLocalizations`). Platzhalter sind immer `%@`. Prüfung: `python3 native/apple/scripts/strings.py
  --check` (auch in der CI); nach Textänderungen `--sync`.
- Dynamische Schrift, Mindest-Tippfläche 44 pt (Score-Tasten 64 pt), VoiceOver-Beschriftungen für Entfernungen,
  Karte und Scorekarte; Bedeutung nie nur über Farbe (Kreis/Quadrat, Text).
- Hell und dunkel über dynamische Farben (`Palette`), Auswahl in den Einstellungen.

## Bauen und testen

```sh
# Logik (macOS oder Linux)
swift test --package-path native/apple/HCPGolfKit
# Texte prüfen
python3 native/apple/scripts/strings.py --check
# App (Mac mit Xcode 16): Projekt erzeugen und öffnen, Schema „GolfApp“
brew install xcodegen
cd native/apple && xcodegen generate && open HCPGolf.xcodeproj
```

Für ein Gerät in `Config/Base.xcconfig` die Bundle-ID (`GOLF_APP_BUNDLE_ID`) und das Team (`DEVELOPMENT_TEAM`)
eintragen. Ohne Gerät: im Simulator über das Entwicklermenü (7 × auf die Version tippen) Fake-GPS einschalten und
„Runde simulieren“ wählen.
