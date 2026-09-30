# GPS: Entfernung zum Grün und Apple Watch (Version 2.4)

> „Ich stehe auf dem Golfplatz, schaue auf mein Smartphone oder meine Apple Watch und sehe innerhalb weniger
> Sekunden, wie viele Meter ich noch bis zur Mitte des Grüns habe.“

Während einer laufenden Runde zeigt die mobile Scorecard mit einem Tipp die Entfernung vom Standort des Spielers
zum Grün des gewählten Lochs: Mitte, vorne und hinten. Dazu kommen die GPS-Genauigkeit und eine Anzeige auf der
Apple Watch.

Das Feature ist ein Zusatz. Scorecard, Rundenablauf, WHS-Berechnung und Golfplatzdaten bleiben unverändert und
funktionieren ohne GPS, ohne Berechtigung und ohne Grün-Koordinaten.

```
           LOCH 7                          LOCH 7
            PAR 4
                                            151 m
           151 m
        MITTE GRÜN                         CENTER

          GPS ●
           ±5 m
```

## Grundsätze

| Grundsatz | Umsetzung |
|---|---|
| Keine erfundenen Geodaten | Wie bei CR/Slope wird nichts geschätzt oder abgeleitet. Ohne hinterlegte Koordinate zeigt die App „Für dieses Loch sind noch keine GPS-Gründaten hinterlegt.“ Mitgeliefert werden **keine** Grün-Koordinaten, auch nicht für Ottobeuren. |
| Grün je Loch, nicht je Abschlag | Alle Abschläge spielen auf dasselbe Grün. Die Geodaten hängen am Platz (Layout) und an der Lochnummer. Abschlagpositionen sind vorbereitet (`tee_positions`). |
| GPS nur in der aktiven Runde | Der Standort läuft nur, wenn die Runde aktiv ist, der Platz Grün-Koordinaten hat und der Spieler zugestimmt hat. Pause, Übersicht, Abschluss oder Verlassen schalten ihn ab. |
| Kein Bewegungsverlauf | Nur die jeweils letzte gefilterte Position liegt im Arbeitsspeicher. Sie wird weder gespeichert noch an den Server übertragen. Beim Stoppen wird sie verworfen. |
| Nie „0 m“ | Ohne gültige Entfernung erscheint „— m“ bzw. „Nicht verfügbar“, nie eine erfundene Zahl. |
| Keine Scheingenauigkeit | Die Anzeige wird passend zur gemeldeten Genauigkeit gerundet. Bei ±35 m erscheint „≈ 150 m“ statt „147 m“. |
| Scorecard hat Vorrang | GPS blockiert nie eine Eingabe und ändert nie das Loch der Scorecard. Einen anderen Loch-Wechsel in der Entfernungsansicht übernimmt die Scorecard nicht. |
| Keine doppelte Logik | Grün-Koordinaten stecken in den bestehenden Platzdaten (DTOs, Datensatz, Repository, CSV, Admin). Es gibt keinen eigenen GPS-Platzdienst. WHS bleibt unverändert im Backend. |

## Bedienung (Smartphone)

1. **Runde starten** (mobile Scorecard). Hat der Platz Grün-Koordinaten, erscheint beim Start der Hinweis
   „GPS-Entfernung zum Grün verfügbar“.
2. In der Fußzeile jedes Lochs steht neben „Weiter“ der Schnellzugriff **„◎ 151 m“**. Ohne Standortfreigabe heißt
   er „Distanz“. Ein Tipp öffnet den **Distance-Screen**.
3. Der Distance-Screen zeigt:
   - „LOCH 7 / PAR 4“ und die Entfernung zur Grünmitte als größtes Element.
   - Front, Mitte und Back als Zeilen; die gewählte Zeile ist hervorgehoben. Antippen wählt das Ziel.
   - GPS-Status: „GPS ● ±5 m“, „GPS ungenau“, „GPS wird ermittelt…“ oder „Kein GPS-Signal“.
   - „← Loch“ / „Loch →“ und eine Lochauswahl. Weicht das Loch von der Scorecard ab, stellt
     „Zu Loch n (Scorecard)“ die Anzeige wieder auf das Loch der Scorecard.
   - „Scorecard“ schließt die Ansicht. Die Eingabe steht dort, wo sie war.
4. Das Loch folgt der Scorecard. Wechselt man in der Entfernungsansicht das Loch, gilt das nur für die Anzeige.
   Beim nächsten Lochwechsel in der Scorecard folgt die Anzeige wieder der Scorecard.

### Berechtigung

| Zustand | Anzeige |
|---|---|
| Noch nicht gefragt (`UNKNOWN`) | „Standortzugriff erforderlich – Damit wir deine Entfernung zum Grün berechnen können, benötigt die App deinen aktuellen Standort.“ Darunter „Nur während der laufenden Runde. Es wird kein Bewegungsverlauf gespeichert.“ und die Schaltfläche „Standort aktivieren“. Erst dieser Tipp löst die Abfrage des Browsers aus. |
| Erteilt (`AUTHORIZED`) | Standort läuft automatisch, solange die Runde aktiv ist |
| Verweigert (`DENIED`) | „Standortzugriff deaktiviert – Bitte aktiviere den Standortzugriff in den Geräteeinstellungen.“ und „Erneut versuchen“ |
| Nicht möglich (`RESTRICTED`) | „Standortzugriff nicht möglich“: kein HTTPS, oder der Server verbietet Geolocation per `Permissions-Policy` |
| Nicht verfügbar (`UNAVAILABLE`) | „Keine GPS-Position verfügbar – Die Runde kannst du ganz normal weiterspielen.“ |

Die Zustimmung („Standort aktivieren“) merkt sich das Gerät (`localStorage` `hcp.gps.optIn`, nur `true`/`false`).
Danach startet der Standort bei den folgenden Runden ohne Erklärung, auch in Browsern, die den
Berechtigungsstatus nicht melden. Ist die Berechtigung bereits erteilt, startet er ohnehin automatisch.

### Anzeige-Regeln

| Genauigkeit (vom Gerät) | Anzeige |
|---|---|
| ≤ 10 m | „GPS ● ±5 m“ (grün), auf den Meter („151 m“) |
| ≤ 20 m | „GPS ● ±15 m“, auf den Meter |
| ≤ 30 m | „GPS ungenau ● ±25 m“ (orange), auf 5 m gerundet mit „≈“ |
| > 30 m | „GPS ungenau“, auf 10 m gerundet mit „≈“ |
| > 100 m | Messung verworfen (reine WLAN-/Funkzellenortung) |

| Situation | Verhalten |
|---|---|
| Letzte Messung älter als 20 s | „GPS wird ermittelt…“, Zahl abgeblendet |
| älter als 60 s | keine Entfernung mehr („— m“) |
| 30 s ohne jede Messung | „Kein GPS-Signal“ |
| Entfernung > 1500 m | „> 1.500 m“ und „Weit vom Grün entfernt – richtiges Loch gewählt?“ |
| Lochwechsel | Die alte Entfernung verschwindet sofort. Eine Messung bis 10 s Alter wird für das neue Loch verwendet. |
| Unplausibler Sprung (> 12 m/s) | Erst übernommen, wenn 2 weitere Messungen ihn bestätigen |
| Aktualisierung | Höchstens alle 800 ms und nur, wenn sich der **gerundete** Wert ändert. Statuswechsel, Lochwechsel und erste Entfernung erscheinen sofort. |

Einheit: Meter (Standard) oder Yards unter Profil → Konto → **Distanz** (`preferences.distanceUnit`, `M` | `YD`,
1 yd = 0,9144 m).

Barrierefreiheit:
- Die Zahl hat einen Vorlesetext („151 Meter zur Mitte des Grüns“, „ungefähr 150 Meter …“).
- `aria-live` sagt die Entfernung bei Loch- oder Zielwechsel und bei Änderungen ab 10 m an, nicht bei jedem Meter.
- Zielzeilen tragen `aria-pressed`.
- Für Sonnenlicht ist die Zahl sehr groß und fett in der dunkelsten Textfarbe. Der GPS-Status steht immer als Text
  neben der Farbe.
- Dunkelmodus; Hauptschaltflächen 56 px hoch.

Texte: `src/lib/gps/messages.ts` (Deutsch, Englisch vorbereitet, gleiche Schlüssel).

## Rechenweg

```
Browser-Geolocation / CoreLocation
      │  LocationService (Berechtigung, Start/Stopp, Pause im Hintergrund)
      ▼
PositionFilter        verwirft Messungen > 100 m Genauigkeit, erkennt Sprünge, glättet (Kalman-Filter)
      ▼
DistanceEngine        geodätische Entfernung (Vincenty, WGS-84; Rückfall Haversine) zu Front / Mitte / Back
      ▼
distanceView / format Zustand (ACQUIRING, NO_SIGNAL, NO_GREEN …), Rundung nach Genauigkeit, Vorlesetext
      ▼
Distance-Screen · Schnellzugriff „◎ 151 m“ · Watch-Protokoll
```

- `calculateDistance(player, target)` liefert die Entfernung in Metern. Bei ungültigen Koordinaten (z. B.
  Breite 999) wirft die Funktion einen Fehler, statt eine Zahl zu erfinden.
- `calculateGreenDistances(player, green)` rechnet Front, Mitte, Back und Fahne in einem Schritt. Fehlende
  Punkte sind `null`.
- `computeHoleDistance(…)` liefert für das aktuelle Loch eine Struktur mit `courseId`, `holeId`, `distance`
  (Meter, ungerundet), `unit`, `target`, `accuracy`, `timestamp` und `status`.
  - `status` ist `valid` oder `STALE`, `NO_TARGET`, `NO_POSITION`, `NO_HOLE`, `INVALID_POSITION` bzw.
    `INVALID_TARGET`.
  - Außer bei `valid` und `STALE` ist `distance` immer `null`.
  - Das Ergebnis ist an Loch und Ziel gebunden. Ein Wert des vorigen Lochs kann so nie beim neuen Loch
    erscheinen.
- Genauigkeit: Vincenty auf dem WGS-84-Ellipsoid (Abweichung zu GeographicLib < 1 mm in den Testwerten).
  Längendifferenzen über den 180. Längengrad werden normalisiert. Konvergiert Vincenty nicht (fast antipodal),
  rechnet Haversine.
- Alle Schwellen stehen einmal in `src/lib/gps/config.ts` (`GPS_CONFIG`). Die Swift-Fassung
  `GPSConfig.swift` hat dieselben Werte; gemeinsame Testwerte sichern das ab (siehe Tests).

## Rundenstatus → Standort

`RoundGpsController` (`src/lib/gps/roundGps.ts`) koppelt den LocationService an den Status der Scorecard:

| Scorecard | Rundenstatus | Standort |
|---|---|---|
| Start-Bildschirm | `NOT_STARTED` | aus |
| Loch 1–18, Zwischenstand nach Loch 9 | `ACTIVE` | an, wenn der Platz Grün-Koordinaten hat und die Berechtigung erteilt ist bzw. der Spieler zugestimmt hat |
| Übersicht vor dem Abschluss | `PAUSED` | aus |
| Scorecard verlassen (X → „Runde verlassen“) | `PAUSED` | aus; beim Fortsetzen wieder an |
| Seite verborgen, Gerät gesperrt | unverändert | pausiert, bis die Seite wieder sichtbar ist (LocationService) |
| Ergebnis, Bearbeiten einer gespeicherten Runde | `COMPLETED` | aus, letzte Position verworfen |

Es gibt keine automatische Locherkennung. Das Loch kommt aus der Scorecard oder der manuellen Wahl. Die
Abschlagpositionen dafür sind im Datenmodell vorbereitet.

## Offline

- Beim Start einer Runde und beim Fortsetzen legt die Scorecard die Platzdaten des Platzes einschließlich der
  Grün-Koordinaten auf dem Gerät ab (`localStorage` `hcp.courseCache.v1`, höchstens 3 Plätze, nur öffentliche
  Platzdaten).
- Die Entfernung braucht danach keine Verbindung: GPS und Rechnung laufen auf dem Gerät.
- Eine Runde lässt sich nach einem Neuladen auch bei Funkloch aus dem Entwurf fortsetzen
  (`fetchCourseOfflineFirst`).
- Grenze wie in 2.3: Ohne Service Worker lässt sich die App ganz ohne Verbindung nicht neu öffnen.

## Golfplatzdaten

### Datenmodell

Node-Edition: Tabelle `hole_geo` (Migration `drizzle/0004_hole_geo.sql`). Sie legt nur eine neue Tabelle an; alle
Spalten außer dem Schlüssel sind optional.

| Spalte | Inhalt |
|---|---|
| `layout_id`, `hole_number` | Schlüssel: Platz und Loch (1–36), unabhängig vom Abschlag |
| `green_front_lat/lng`, `green_center_lat/lng`, `green_back_lat/lng` | Grünpunkte. MVP ist die Mitte; Front/Back werden im Admin-Bereich optional erfasst. |
| `green_polygon` | GeoJSON-Polygon der Grünfläche (vorbereitet) |
| `pin_lat/lng`, `pin_set_at` | Fahnenposition mit Zeitpunkt (vorbereitet) |
| `tee_positions` | Abschlagpositionen je Farbe (vorbereitet) |
| `source` | `MANUAL`, `DEVICE_GPS`, `CSV_IMPORT` oder `MAP` |

Datenbank-Constraints: Breite −90…90, Länge −180…180, Breite und Länge nur paarweise, Loch 1–36. Beim Löschen des
Layouts werden die Zeilen mitgelöscht.

API/DTO: `LayoutDto.holeGeo: HoleGeoDto[]` mit `{ holeNumber, green: { front, center, back, polygon, pin }, tees,
source, updatedAt }`. Er kommt über die bestehenden Platz-Endpunkte bzw. den Datensatz, ohne neuen Endpunkt.

Webspace-Edition: gleiche Struktur im JSON-Datensatz (`layouts[].holeGeo`, `schemaVersion: 2`). Datensätze der
Version 1 ohne `holeGeo` werden weiter gelesen.

Ein 9-Loch-Platz, der für eine 18-Loch-Runde zweimal gespielt wird, nutzt für Loch 10–18 die Grüns von Loch 1–9,
sofern keine eigenen Einträge bestehen (`greenForHole`).

### Admin: Grün-Koordinaten pflegen

Admin → Golfplätze → Anlage → Platz → **„GPS-Daten“**:

- Je Loch die Grünmitte als „Breite, Länge“ in Dezimalgrad eintragen (aus Kartendiensten einfügbar), oder am
  Grün stehend **„GPS-Position verwenden“** tippen.
  - Liegt die Genauigkeit über 10 m, fragt die App vor dem Übernehmen nach.
  - Die Quelle wird als `DEVICE_GPS` vermerkt, sonst `MANUAL`.
- Optional **„Front/Back erfassen“**.
- Prüfungen:
  - Fehler (Speichern abgelehnt): Breite/Länge außerhalb des gültigen Bereichs, Lochnummer außerhalb des Platzes,
    doppelte Löcher.
  - Warnungen: Punkt mehr als 5 km von der Anlage entfernt; Breite und Länge vermutlich vertauscht; Front/Back mehr
    als 80 m von der Mitte entfernt.
- Jeder Punkt hat einen Link zur Kontrolle auf OpenStreetMap.
- Abdeckung in der Anlagenliste (Spalte „Green GPS“, Filter „GPS fehlt“), im Platz-Editor und in der Datenqualität
  (`GREEN_GPS_INCOMPLETE`): „18/18 ✓“, „11/18 ⚠“ oder „–“.
- Protokoll in beiden Editionen: Audit-Log `GREENS_UPDATED` („GPS-Grünkoordinaten geändert“) und
  Änderungsprotokoll des Platzes `SET_GREENS`.

### CSV-Import und -Export

Admin → Import → **GPS-Grünkoordinaten** mit dem Ablauf prüfen → Vorschau → übernehmen. Geändert werden
ausschließlich Grün-Koordinaten; Ratings, Abschläge und Lochdaten bleiben unberührt.

Aufbau (Beispiel mit einem fiktiven Platz und Platzhalter-Koordinaten):

```csv
course_id,course_name,layout_id,layout_name,hole_number,green_front_lat,green_front_lng,green_center_lat,green_center_lng,green_back_lat,green_back_lng
,Musterclub,,18-Loch-Platz,1,,,48.100000,11.500000,,
```

- Platz über `course_id`, Slug oder Name; Layout über `layout_id`, Name oder das einzige aktive Layout.
- Leere Zellen lassen vorhandene Werte stehen.
- Ungültige Zeilen werden mit Grund angezeigt und nicht übernommen.
- Export: Node `/api/admin/export?format=gps`, Webspace Admin → Export → „GPS-Grünkoordinaten (CSV)“. Der Export
  enthält alle Löcher, auch leere, und dient damit als Vorlage.

Mögliche Quellen: eigene Erfassung auf dem Platz, Luftbild oder OpenStreetMap (Lizenz ODbL, Namensnennung
beachten). Nicht verwenden: Daten kommerzieller GPS-Anbieter ohne Lizenz.

## Apple Watch

Eine Web-App kann nicht mit der Apple Watch sprechen. WatchConnectivity gibt es nur für native iOS-Apps. Deshalb
liegt unter `native/apple/` eine schlanke native Ergänzung:

- **iPhone-App „Golf HCP“:** zeigt die bestehende Web-App in einer WKWebView (normale Sitzung, kein zusätzliches
  Login) und leitet den Rundenstand an die Watch weiter. Bei gesperrtem iPhone rechnet sie selbst mit CoreLocation
  und denselben Regeln.
- **watchOS-App:** startet direkt im Distance-Screen und zeigt Loch, Entfernung, Ziel und GPS-Status.
  Drei Schaltflächen unten wechseln Loch (‹ ›) und Ziel (◎). Ohne eigenes GPS spart sie Akku.
- **HCPGolfKit** (Swift Package): dieselbe Geodäsie, Rundung, Filterung, Anzeige-Logik und dasselbe Protokoll wie
  die Web-App.

Protokoll (Version 1, JSON), iPhone → Watch:
- `state` enthält den vollständigen Zustand.
- `patch` enthält nur die geänderten Felder.
- `heartbeat` kommt alle 5 s, wenn sich nichts geändert hat.
- Jede Nachricht trägt `epoch` und `seq`. Veraltete oder doppelte Nachrichten verwirft die Watch.

Übertragen werden nur `roundActive, hole, par, distance, approx, unit, target, front, center, back, gpsAccuracy,
status, noGreen, timestamp`: keine Scorecard, kein Konto, keine Grün-Koordinaten.

| Watch | Anzeige |
|---|---|
| keine Runde | „Keine aktive Runde“ |
| Entfernung älter als 10 s | „vor 0:18 min“ |
| älter als 60 s | „GPS-Daten veraltet“ |
| 15 s ohne Nachricht | „Verbindung verloren“, letzte Entfernung abgeblendet mit Alter |
| iPhone ohne Position | „GPS wird ermittelt…“ bzw. „Keine GPS-Daten · iPhone prüfen“ |
| Loch ohne Grün-Koordinaten | „Keine Gründaten“ |

Befehle der Watch („← Loch“, „Loch →“, Ziel) ändern nur die Entfernungsansicht, nie die Scorecard.

Die Browser-Vorschau **`/member/watch/`** zeigt die Watch-Anzeige in 40 und 49 mm. Sie empfängt über
`BroadcastChannel` dieselben Protokollnachrichten wie die Watch von einer laufenden Runde in einem anderen Tab
desselben Browsers. Das ist hilfreich für Entwicklung und E2E-Tests, aber kein Ersatz für die Watch.

Bauen, Energie, Datenschutz und Testplan auf Geräten: [`native/apple/README.md`](../native/apple/README.md).

> **Stand:** Der Swift-Code ist vollständig, konnte aber in der Build-Umgebung (Linux, ohne Xcode/Swift) weder
> kompiliert noch auf Geräten getestet werden. Die Logik in HCPGolfKit prüft `swift test` mit denselben
> Testwerten wie die Web-App.

## Sicherheit und Datenschutz

- `Permissions-Policy: camera=(), microphone=(), geolocation=(self)`: Geolocation nur für die eigene Seite, nie für
  eingebettete fremde Inhalte.
  - Node: `next.config.ts`.
  - Webspace: `.htaccess`, geschrieben von `install.php`. Bestehende Installationen `install.php` nach dem Update
    erneut aufrufen; vorher sperrte `geolocation=()` den Standort.
- Standort nur über HTTPS (Browser-Vorgabe), nur nach ausdrücklicher Zustimmung, nur in der aktiven Runde.
- Die Entfernung zum Grün speichert und überträgt keine Positionen; der Server erfährt den Standort dabei nie.
  Zwei bewusste Ausnahmen:
  - Der Admin speichert mit „GPS-Position verwenden“ ausdrücklich eine **Grün**-Koordinate.
  - Die bestehende Platzsuche „Meinen Standort verwenden“ schickt die Position nur auf Klick als Suchparameter
    an `/api/courses` (Node) für die Umkreissuche. Der Server speichert sie nicht. Die Webspace-Edition rechnet im
    Browser.
- Grün-Koordinaten sind öffentliche Platzdaten. Ändern dürfen sie nur Konten mit `courses.write`, serverseitig
  geprüft (Server Actions mit `requireAdmin` bzw. `admin.php?action=courses-save`) und protokolliert.
- Watch: keine Anmeldung, keine personenbezogenen Daten, kein Server-Kontakt.

## Code

| Datei | Inhalt |
|---|---|
| `src/lib/gps/config.ts` | alle Schwellen und Zeiten |
| `src/lib/gps/geodesy.ts` | Koordinatenprüfung, Vincenty, Haversine, lokale Meter-Projektion |
| `src/lib/gps/distanceEngine.ts` | `calculateDistance`, `calculateGreenDistances`, Ziele, Status |
| `src/lib/gps/filter.ts` | `PositionFilter`: Genauigkeit, Sprünge, Kalman-Glättung |
| `src/lib/gps/format.ts`, `messages.ts` | Rundung, Einheit, Vorlesetext, GPS-Status; Texte de/en |
| `src/lib/gps/locationService.ts` | Abstraktion der Geolocation (Berechtigung, Start/Stopp, Pause), austauschbar für Tests |
| `src/lib/gps/distanceView.ts`, `roundGps.ts` | Anzeige-Zustand; Kopplung an den Rundenstatus, Drosselung |
| `src/lib/gps/watch/protocol.ts`, `bridge.ts` | Watch-Protokoll v1 (Diff, Herzschlag, Empfang, Anzeige); Transport zur iPhone-App bzw. Vorschau |
| `src/lib/courses/geo.ts`, `greenCsv.ts`, `offlineCache.ts` | Grün-Koordinaten: Zugriff, Abdeckung, Prüfung, Zusammenführen; CSV; Platzdaten auf dem Gerät |
| `src/components/gps/` | Distance-Screen, Schnellzugriff, Anzeige, Status, Watch-Vorschau, Hooks |
| `src/components/admin/GreensForm.tsx`, `GreenCsvImporter.tsx` | Admin: Grün-Koordinaten pflegen, CSV |
| `src/server/courseRepository.ts` (`setGreenCoordinates`, `applyGreenCsvPlan`) | Node: Speichern in `hole_geo` |
| `src/lib/courses/dataset.ts` (gleichnamige Funktionen) | Webspace: dieselben Regeln auf dem JSON-Datensatz |
| `native/apple/` | HCPGolfKit, iPhone-App, watchOS-App, XcodeGen-Projekt |

## Tests

- **Unit** (96 Tests):
  - `tests/gps/distance.test.ts`: Entfernungen gegen GeographicLib (Vincenty < 1 mm), ungültige Koordinaten,
    fehlende Ziele, Rundung, Yards, nie 0 m.
  - `tests/gps/location.test.ts`: PositionFilter (ungenaue Messungen, Sprünge, Glättung); LocationService
    (Berechtigung, verweigert, kein Signal, Pause im Hintergrund, ohne HTTPS, einzelne Position).
  - `tests/gps/roundGps.test.ts`: nur aktive Runde, Pause, Erstnutzung, Lochwechsel, GPS-Ausfall, schlechte
    Genauigkeit, fehlende Gründaten, Rendern nur bei relevanter Änderung, Meter/Yards, Rundenende.
  - `tests/gps/watch.test.ts`: gemeinsame Testwerte, Sync 151 → 148 m, Verbindungsverlust, Herzschlag und Alter,
    Lochwechsel, Rundenende, nur Rundendaten.
  - `tests/courses/geo.test.ts`: Koordinaten lesen und prüfen, Hinweise, Abdeckung, 9-Loch-Platz zweimal gespielt,
    Zusammenführen, Datensatz Version 1, CSV-Import.
  - `tests/courses/greens-repository.test.ts`: `hole_geo` mit PGlite (bestehende Plätze, Speichern,
    Prüfregeln, CSV, Löschen).
- **Gemeinsame Testwerte** `tests/fixtures/gps-vectors.json`: Entfernungen, Rundung, Status und 15
  Watch-Abläufe. Dieselbe Datei liegt in `native/apple/HCPGolfKit/Tests/…/Resources/`; ein Vitest-Test prüft, dass
  beide identisch sind. So rechnen Web-App und Swift gleich.
- **E2E** (`e2e/flows.cjs`, 30 Prüfungen, simulierte Geolocation):
  - Abschnitt G: ungültige Koordinate abgelehnt, 18 Grüns gespeichert, GPS-CSV mit Front/Back, Abdeckung
    „18/18 ✓“.
  - Abschnitt M:
    - kein Standort vor dem Start
    - Distance-Screen 137/151/167 m mit Vorlesetext
    - Watch-Sync 151 → 148 m
    - ±35 m mit „≈“
    - Lochwechsel ohne alte Entfernung
    - Loch-Befehl von der Watch
    - Signalverlust und „Verbindung verloren“
    - Scorecard ohne GPS
    - offline
    - Pause, Fortsetzen in Yards (219 yd)
    - Rundenende stoppt den Standort, Watch „Keine aktive Runde“
    - Erstnutzung und verweigerte Berechtigung

## Grenzen

- **Keine Grün-Koordinaten mitgeliefert.** Sie müssen je Platz erfasst werden (Admin, CSV). Ohne sie bleibt die
  Scorecard wie bisher.
- **Apple Watch** nicht kompiliert und nicht auf Geräten getestet (siehe oben).
- **Keine automatische Locherkennung**, keine Fahnenposition des Tages, keine Hindernisse oder Layups. Das
  Datenmodell ist für Pin, Polygon und Abschläge vorbereitet.
- **Browser im Hintergrund:** Ist die Seite verborgen oder das Gerät gesperrt, pausiert die Web-App den Standort
  (Browser-Vorgabe und Akku). Weiterrechnen im gesperrten Zustand kann nur die iPhone-App.
- **Genauigkeit** hängt vom Gerät ab (typisch ±3–10 m unter freiem Himmel). Die Anzeige rundet entsprechend.
