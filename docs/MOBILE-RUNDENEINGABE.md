# Mobile Rundeneingabe (Version 2.3)

Auf dem Smartphone erfasst man eine Runde mit einer eigenen, schrittweisen digitalen Scorekarte. Sie ist
keine verkleinerte Fassung der Desktop-Eingabe. Datenmodell, API, WHS-Berechnung und Statistik sind in
beiden Varianten identisch: Beide erzeugen dieselbe Eingabe (`WizardState` → `toRoundInput`). Score
Differential und Handicap Index berechnet ausschließlich das Backend.

## Wann welche Eingabe?

`useMobileEntry()` (`src/components/member/mobile/hooks.ts`) wählt die Eingabe:

| Gerät | Eingabe |
|---|---|
| Smartphone (< 768 px) | mobile Scorecard |
| Tablet hochkant (≤ 1100 px, Touch) | mobile Scorecard |
| Tablet quer, Desktop | bisherige Eingabe (unverändert) |

Über „Andere Eingabe“ (`?classic=1`) bleibt die bisherige Eingabe auch auf dem Smartphone erreichbar. Das ist
nötig für Stableford, einen Platz ohne Datenbankeintrag oder Werte von der Scorekarte, wenn kein offizielles
Rating hinterlegt ist.

## Ablauf

```
Runde starten → Loch 1: Schläge → Putts → Statistik → Loch 2 … → Loch 9
              → (bei 18 Loch) Front Nine geschafft → Loch 10 … Loch 18
              → Übersicht → Runde beenden → Ergebnis vom Backend
```

- **Start:** Golfplatz (Heimatplatz bzw. zuletzt gespielt vorausgewählt), Löcher (18 / 1–9 / 10–18),
  Abschlag, Erfassungsart. Datum, Art der Runde und Herren/Damen stehen zusammengefasst in einer Zeile und
  lassen sich dort ändern. CR, Slope, PCC und Rechenwerte erscheinen beim Start nicht.
  - Ausnahme: Ein ungeprüftes Rating muss der Spieler mit seiner Scorekarte bestätigen (Regel seit 2.1).
- **Erfassungsart:**
  - *Schnell*: nur Schläge, 1–2 Taps pro Loch.
  - *Detailliert*: Schläge, Putts und die für das Loch relevante Statistik.
  - Ohne Lochdaten auf dem Platz: Eingabe des Gesamtergebnisses.
- **Ein Schritt = eine Entscheidung:**
  - Die Schlagzahl ist das größte Element: große Schnellauswahl Par −1 bis Par +3 und „mehr“, dazu − / +.
    Das Ergebnis wird relativ zu Par als Symbol, Text und Farbe angezeigt (nie nur als Farbe).
  - Nach der Schlagzahl geht es erst auf „Weiter“ weiter, weil sich hier leicht vertippt wird.
  - Putts: ein Tap, danach automatisch weiter.
  - Statistik: Die Fragen erscheinen nacheinander – Fairway (nur Par 4/5), GIR, Up & Down (nur bei verfehltem
    Grün und höchstens Par). Sind alle Fragen beantwortet, geht es automatisch zum nächsten Loch.
  - Bunker, Sand Save (nur nach Bunker), Strafschläge und die private Notiz liegen unter
    „Weitere Statistiken“.
  - Ohne Angabe gelten Bunker „Nein“ und Strafschläge 0.
- **Sichere Folgerungen** (`normalizeHole`, `completeHole` in `src/lib/rounds/holeFlow.ts`):
  - Liegt die Schlagzahl über Par, sind Up & Down und Sand Save sicher nicht geschafft.
  - GIR und Fairway werden nie aus der Schlagzahl abgeleitet.
- **Navigation:**
  - ← führt zum vorigen Schritt, die Daten bleiben erhalten.
  - Über die Lochleiste (✓ erfasst, ● begonnen, ○ offen; höchstens 44 px hoch, horizontal scrollbar) springt
    man zu jedem Loch. Σ öffnet die Übersicht.
  - Wischen nach rechts = zurück, nach links = nächstes Loch. Das ist eine zusätzliche Navigation; die
    Buttons bleiben.
  - Doppeltipp-Schutz: Zwei Tipps auf Weiter ohne Eingabe dazwischen blättern nur einmal weiter.
- **Übersicht:** Schläge und zu Par, im Detailmodus Putts, GIR und FIR. Jedes Loch lässt sich antippen und
  ändern. Dazu kommen die Sichtbarkeit (Community) sowie Notiz und PCC in einem Bottom Sheet.
- **Ergebnis:** Score Differential und HCPI vorher → nachher (vom Backend), 3 Kernwerte der Statistik,
  Ranking-Platz (wenn freigegeben), „Statistiken ergänzen“ bei schnell erfassten Runden.
- **Kopfzeile:** Loch x/18 und bisheriger Stand („+3 (34)“), Platz, Speicherstatus (✓ Gespeichert,
  ⟳ Synchronisierung, Offline). HCPI, Score Differential und Ranking erscheinen während der Runde nicht.
- **„Statistiken ergänzen“** (`/member/rounds/stats?id=`) nutzt auf dem Smartphone dieselben Schritte.
  Schläge sind bei Runden mit Loch-für-Loch-Ergebnis gesperrt; das Handicap bleibt unverändert.

## Entfernung zum Grün (ab 2.4)

Hat der Platz GPS-Grünkoordinaten, steht in der Fußzeile jedes Lochs neben „Weiter“ der Schnellzugriff
**„◎ 151 m“** (ohne Standortfreigabe „Distanz“).
- Ein Tipp öffnet den Distance-Screen: Loch, Par, Entfernung zu Mitte, Front und Back, GPS-Status, Lochwechsel.
- „Scorecard“ führt zurück an dieselbe Stelle.
- Der Start-Bildschirm weist mit „GPS-Entfernung zum Grün verfügbar“ darauf hin.

Die Scorecard bleibt davon unabhängig:
- GPS blockiert keine Eingabe und ändert nie das Loch der Scorecard.
- Ohne Berechtigung, ohne Signal oder ohne Grün-Koordinaten funktioniert alles wie bisher.
- Der Standort läuft nur von Loch 1 bis zum letzten Loch, einschließlich des Zwischenstands nach Loch 9. Beim
  Start, in der Übersicht und im Ergebnis ist er aus, und beim Verlassen der Runde stoppt er.

Beim Start legt die Scorecard die Platzdaten auf dem Gerät ab (höchstens 3 Plätze). So funktionieren Entfernung
und Wiederaufnahme auch im Funkloch. Details: [`GPS-DISTANZ.md`](GPS-DISTANZ.md).

## Nichts verlieren: Entwurf, Offline, Wiederaufnahme

| Situation | Verhalten |
|---|---|
| jede Eingabe | sofort als lokaler Entwurf auf dem Gerät (`localStorage`, Schlüssel je Benutzer, nur Rundendaten – keine Tokens); kurz danach als Entwurf auf dem Server |
| Funkloch | Hinweis „Offline – deine Runde wird lokal gespeichert.“; die Eingabe geht weiter, die Server-Entwürfe werden bei Verbindung nachgereicht |
| App/Tab geschlossen, Absturz | beim nächsten Öffnen: „Du hast eine laufende Runde. … Loch 7 von 18 – Fortsetzen / Verwerfen“; auch auf dem Dashboard |
| Runde offline beendet | „Die Runde konnte noch nicht synchronisiert werden. Sie ist sicher auf deinem Gerät gespeichert.“ Bei Verbindung wird sie automatisch übertragen – im Wizard oder später im Hintergrund (`RoundSyncAgent` im Mitgliederbereich) |
| doppelte Übertragung | ausgeschlossen: Die Entwurfs-ID dient als Kennung (`clientRef`). Kennt der Server sie schon, liefert er das Ergebnis der vorhandenen Runde statt eine zweite anzulegen (Service-Schicht, Node-Route und PHP) |
| X (verlassen) | „Weiter erfassen“, „Als Entwurf speichern“, „Runde verlassen“ (Stand bleibt erhalten); „Runde verwerfen“ nur nach Rückfrage |
| neue Runde, obwohl eine läuft | zuerst die Rückfrage zur laufenden Runde (es gibt nur eine aktive Runde) |

Angefangene Runden werden nie automatisch gelöscht.

## App-artige Nutzung

- **PWA:** `manifest.webmanifest` (Start im Mitgliederbereich, eigenständiges Fenster, Icons, Kurzbefehl
  „Runde starten“); `apple-icon` und `appleWebApp` für „Zum Home-Bildschirm“ auf dem iPhone.
- **Vollbild:** Die Scorekarte legt sich über die Navigation. Kopf- und Fußzeile beachten die Safe Area
  (`env(safe-area-inset-*)`).
- **Bildschirm bleibt an:** Screen Wake Lock während der Runde, wo der Browser ihn unterstützt; sonst still
  ohne Fehler.
- **Haptik:** kurze Vibration beim Tippen der Schlagzahl und bei abgeschlossenem Loch (Android); iOS-Browser
  unterstützen das nicht.
- **Bedienung:**
  - Touch-Ziele mindestens 44–48 px, Schlagzahl 72 px, Lochnummer 30 px, Texte mindestens 14–16 px.
  - Ja/Nein als große Segmented Buttons statt kleiner Checkboxen.
  - Erklärungen (ⓘ) öffnen ein Bottom Sheet.
  - Übergänge 180 ms; bei „Bewegung reduzieren“ abgeschaltet.

## Einstellung

Profil → Konto → **Rundeneingabe**: „Beim Start fragen“ (Standard), „Schnell“ oder „Detailliert“, gespeichert
in `preferences.roundEntryMode`.

- API: Node `PUT /api/me/preferences`, Webspace `me.php?action=prefs-save`.
- Bei „fragen“ ist die zuletzt auf diesem Gerät gewählte Art vorausgewählt.

Profil → Konto → **Distanz** (ab 2.4): „Meter“ (Standard) oder „Yards“ für die Entfernung zum Grün, gespeichert in
`preferences.distanceUnit` (`M` | `YD`) über dieselben Endpunkte.

## Grenzen

- **Kein Service Worker:** Eine laufende Runde arbeitet ohne Verbindung weiter und geht nicht verloren. Die
  App ganz ohne Verbindung neu zu öffnen, geht dagegen nicht: Anmeldung und Platzdaten brauchen das Netz.
  Beim nächsten Öffnen mit Verbindung wird die Runde fortgesetzt bzw. übertragen.
- **Platz ohne Lochdaten** (z. B. die Startdaten Ottobeuren): Es gibt nur das Gesamtergebnis. Für
  Lochstatistik braucht der Platz Par und Handicap je Loch (Admin → Anlage → Lochdaten).
- **Entfernung zum Grün** braucht Grün-Koordinaten je Loch (Admin → Anlage → Platz → „GPS-Daten“). Mitgeliefert
  werden keine; ohne sie erscheint der Schnellzugriff nicht.
- **Admin:** Der Admin-Bereich hat keine eigene mobile Scorecard und zeigt Runden unverändert an.

## Code

| Datei | Inhalt |
|---|---|
| `src/lib/rounds/holeFlow.ts` | Ablauf (Schritte, 9/18, Zwischenstand), Relevanz der Fragen, sichere Folgerungen, Summen – rein funktional, getestet (`tests/rounds/holeFlow.test.ts`) |
| `src/components/member/mobile/MobileRoundWizard.tsx` | Scorekarte: Start, Schritte, Zwischenstand, Übersicht, Ergebnis, Sheets |
| `src/components/member/mobile/screens.tsx` | Schritte Schläge / Putts / Statistik (auch für „Statistiken ergänzen“) |
| `src/components/member/mobile/MobileRoundEntry.tsx` | Einstieg: neue Runde, Bearbeiten, Wiederaufnahme |
| `src/components/member/mobile/hooks.ts`, `localDraft.ts` | Mobil/Desktop, Online-Status, Wake Lock, Haptik, automatisches Speichern, lokaler Entwurf |
| `src/components/member/mobile/RoundSyncAgent.tsx` | Nachreichen offline beendeter Runden, Hinweis auf dem Dashboard |
| `src/components/member/mobile/MobileStatsEditor.tsx` | „Statistiken ergänzen“ auf dem Smartphone |
| `src/lib/member/service.ts` (`createRound`, `roundByClientRef`) | idempotentes Speichern |

## Tests

- **Unit:** `tests/rounds/holeFlow.test.ts` (Ablauf 18 Loch detailliert / 9 Loch schnell, Zurück,
  Relevanz, Folgerungen, Summen, Wiederaufnahme) und `tests/member/idempotency.test.ts` (keine doppelte
  Runde, Einstellung).
- **PHP-API:** gleiche Kennung ergibt keine zweite Runde; die Einstellung wird gespeichert.
- **E2E** (`e2e/flows.cjs`, Abschnitt J):
  - 18 Loch detailliert von Loch 1 bis 18 ohne Scrollen (390 × 844)
  - Front Nine
  - Par 3 ohne Fairway-Frage
  - Zurück behält die Eingaben
  - Ergebnis vom Backend
  - 9 Loch schnell mit Funkloch, Wiederaufnahme nach dem Schließen und Offline-Abschluss
  - genau eine Runde nach der Synchronisierung
  - „Statistiken ergänzen“
  - Tablet hoch/quer
  - kleines Smartphone (375 × 667)
  - Verwerfen nur mit Rückfrage
- **E2E GPS** (Abschnitt M, ab 2.4): Schnellzugriff in der Scorecard, Distance-Screen, Lochwechsel ohne alte
  Entfernung, Scorecard ohne GPS, Offline, Pause/Fortsetzen, Rundenende stoppt den Standort (Liste in
  [`GPS-DISTANZ.md`](GPS-DISTANZ.md)).
