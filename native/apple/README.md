# Apple Watch & iPhone-App (Golf-GPS)

> **Stand:** Quellcode für Xcode. In der Entwicklungsumgebung dieses Projekts (Linux, ohne Xcode/Swift-Toolchain)
> konnte er **nicht kompiliert und nicht auf Geräten getestet** werden. Die Logik ist in `HCPGolfKit` gekapselt
> und wird dort mit denselben Testwerten geprüft wie die Web-App (`swift test` auf einem Mac).

## Warum nativ?

Die Golf-HCP-Anwendung ist eine Web-App/PWA (Next.js). Eine Web-App kann **nicht** mit der Apple Watch
kommunizieren (WatchConnectivity gibt es nur für native iOS-Apps), und im Watch-Browser wäre sie keine brauchbare
Lösung. Deshalb:

- Die **Web-App bleibt** Mitgliederbereich, Scorecard und Distance-Screen (keine doppelte Geschäftslogik; WHS/HCP
  bleibt im Backend).
- Eine schlanke **iPhone-App** („Golf HCP“) zeigt die Web-App in einer WKWebView und verbindet die laufende Runde mit
  der Watch.
- Eine **watchOS-App** zeigt nur Loch, Entfernung, Ziel und GPS-Status.

## Datenfluss

```
iPhone GPS (CoreLocation / Browser-Geolocation)
      │
      ▼
LocationService ──► PositionFilter ──► DistanceEngine        (Web-App: src/lib/gps · App: HCPGolfKit)
      │                                     │
      │                     WatchState (Loch, Par, Entfernung, Ziel, GPS, Zeitpunkt)
      │                                     │  nur Änderungen (Patch), Herzschlag alle 5 s
      ▼                                     ▼
Web-App (Distance-Screen)  ──► iPhone-App ──► WatchConnectivity ──► Apple Watch (DistanceView)
                                  ▲                                      │
                                  └──────── Befehle: Loch ← →, Ziel ◄────┘
```

- **Bildschirm an:** Die Web-App rechnet (dieselbe Zahl wie auf dem Distance-Screen) und schickt die
  Protokollnachrichten über `window.webkit.messageHandlers.hcpWatch` an die App. Die App spiegelt sie und gibt sie mit
  eigener Folgenummer an die Watch weiter.
- **iPhone gesperrt:** Die Web-Ansicht pausiert. Die App rechnet selbst mit CoreLocation und dem Rundenkontext
  (Löcher mit Grün-Koordinaten, von der Web-App übergeben). Die Regeln sind dieselben (HCPGolfKit).
- **Watch-App:** Sie hat in Version 1 kein eigenes GPS (spart Akku). Vorbereitet ist das über HCPGolfKit
  (DistanceEngine, PositionFilter, RoundContext); später z. B. mit einer `HKWorkoutSession` (Golf).

## Komponenten

| Teil | Dateien | Aufgabe |
|---|---|---|
| HCPGolfKit (Swift Package) | `HCPGolfKit/Sources` | Geodäsie (Vincenty/Haversine), DistanceEngine, Rundung, PositionFilter, Watch-Protokoll v1, Anzeige-Logik, Texte (de/en) |
| iPhone-App | `Companion/HCPCompanionApp.swift` | Einstieg, Adresse der Installation (Build-Einstellung oder einmalige Eingabe) |
| | `Companion/WebContainer.swift` | WKWebView mit der Web-App, Brücke `hcpWatch`, Ereignisse an die Web-App |
| | `Companion/RoundDistanceService.swift` | Standort nur bei aktiver Runde, Quelle Web-App bzw. nativ, Befehle der Watch |
| | `Companion/WatchSessionManager.swift` | WatchConnectivity: `sendMessage` (erreichbar), sonst `updateApplicationContext` |
| Watch-App | `Watch/HCPWatchApp.swift` | startet direkt im Distance-Screen |
| | `Watch/ConnectivityManager.swift` | empfängt Protokollnachrichten, sendet Befehle |
| | `Watch/DistanceView.swift`, `HoleView.swift`, `GPSStatusView.swift` | Anzeige, skaliert von 40 bis 49 mm |

## Protokoll (Version 1)

Nachricht iPhone → Watch (JSON, über WatchConnectivity als `Data` unter dem Schlüssel `m`):

```json
{ "v": 1, "type": "patch", "epoch": "k3j9x2ab", "seq": 42, "sentAt": 1760000003,
  "data": { "distance": 148, "timestamp": 1760000003 } }
```

- `state` = vollständiger Zustand (erste Nachricht, neue Verbindung), `patch` = nur geänderte Felder,
  `heartbeat` = keine Änderung (alle 5 s, nur wenn die Watch erreichbar ist).
- Felder: `roundActive, hole, par, distance, approx, unit, target, front, center, back, gpsAccuracy, status,
  noGreen, timestamp` (entspricht Master-Prompt §30 plus Status). **Keine** Scorecard, **kein** Konto,
  **keine** Golfplatzdatenbank.
- Beim Lochwechsel werden Entfernung und Zeitpunkt immer mitgeschickt. So erscheint nie die Entfernung des
  vorigen Lochs.
- `epoch` kennzeichnet den Sender (neu nach einem Neustart). Ein neuer Sender beginnt mit `state`. Ältere oder
  doppelte Nachrichten (`seq`) verwirft die Watch.
- **Alter ohne Uhrenvergleich:** Alter = (`sentAt` − `timestamp`) auf dem iPhone + Zeit seit dem Empfang auf der
  Watch.
- Anzeige: ab 10 s Alter „vor 0:18 min“, ab 60 s „GPS-Daten veraltet“, nach 15 s ohne Nachricht „Verbindung
  verloren“ (letzte Entfernung abgeblendet, „nicht aktuell“). Nie „0 m“.
- Befehle Watch → iPhone: `{ "type": "hole", "delta": ±1 }`, `{ "type": "target", "target": "green_front" }`.
  Sie ändern nur die Entfernungsansicht, nie die Scorecard.

Die gemeinsamen Testwerte liegen in `tests/fixtures/gps-vectors.json` (Web-App). Eine Kopie liegt in
`HCPGolfKit/Tests/HCPGolfKitTests/Resources/`, und ein Vitest-Test prüft, dass beide identisch sind.

## Energie

- **iPhone:** Der Standort läuft nur während einer aktiven Runde, mit `distanceFilter` 3 m, `activityType .fitness`
  und automatischem Ende bei Rundenende oder Verlassen. Im Hintergrund zeigt iOS den blauen Standort-Hinweis
  (Hintergrundmodus `location`, Berechtigung „Beim Verwenden“ genügt, weil der Start im Vordergrund erfolgt).
- **Übertragung:** Gesendet wird nur, wenn sich eine *angezeigte* Zahl ändert (gerundete Werte). Einen Herzschlag
  gibt es nur bei erreichbarer Watch. Sonst hält der Application Context den letzten vollständigen Zustand
  (höchstens alle 10 s, bei Lochwechsel sofort).
- **Watch:** Kein GPS. Sie rendert nur, wenn eine Nachricht kommt, und jede Sekunde für die Altersanzeige; im
  Always-on-Modus nur minütlich.

## Datenschutz & Sicherheit

- Standort nur bei aktiver Runde und erteilter Berechtigung. Es wird nur die jeweils letzte Position im Speicher
  gehalten, kein Bewegungsverlauf, keine Übertragung an einen Server.
- Keine Anmeldung auf der Watch. Die iPhone-App nutzt die normale Sitzung der Web-App (Cookies der WKWebView).
- Die Watch erhält nur die Rundenwerte oben. Der Rundenkontext (Grün-Koordinaten) bleibt auf dem iPhone.
- Keine fest einprogrammierte Server-Adresse: `HCP_BASE_URL` in `Config/Base.xcconfig` oder Eingabe beim ersten
  Start (nur HTTPS).

## Bauen und testen (Mac mit Xcode 15+)

1. Logik testen:
   ```sh
   cd native/apple/HCPGolfKit && swift test
   ```
2. In `Config/Base.xcconfig` die Bundle-ID und das Team eintragen, optional die Adresse der Installation.
3. Projekt erzeugen und öffnen:
   ```sh
   brew install xcodegen   # einmalig
   cd native/apple && xcodegen generate && open HCPGolf.xcodeproj
   ```
   Alternativ in Xcode: iOS-App mit eingebetteter watchOS-App anlegen, dann die Ordner `Companion`, `Watch` und das
   lokale Paket `HCPGolfKit` hinzufügen.
4. Auf iPhone und gekoppelter Watch installieren und im Mitgliederbereich eine Runde auf einem Platz mit
   GPS-Gründaten starten.

### Testplan auf Geräten (Master-Prompt §80–§83, §109)

| Test | Erwartung |
|---|---|
| Synchronisation | iPhone 151 m → Watch 151 m; nach Bewegung iPhone 148 m → Watch 148 m |
| Watch getrennt (Flugmodus auf der Watch) | Watch: „Verbindung verloren“, letzte Entfernung abgeblendet mit Alter; iPhone rechnet weiter |
| GPS-Signal weg | „GPS wird ermittelt…“ bzw. „Keine GPS-Daten · iPhone prüfen“, Scorecard funktioniert weiter |
| iPhone sperren | Watch zeigt weiter aktuelle Entfernungen (native Berechnung) |
| Runde beenden | Watch: „Keine aktive Runde“; Standort-Hinweis auf dem iPhone verschwindet |
| Loch ← / → auf der Watch | Entfernung für das gewählte Loch; die Scorecard bleibt unverändert |
| Kleine (40/41 mm) und große Watch (45/49 mm) | nichts abgeschnitten; Vorschau im Browser unter `/member/watch/` |

Die Browser-Vorschau `/member/watch/` zeigt die Watch-Anzeige in 40 und 49 mm. Sie empfängt dieselben
Protokollnachrichten von einer laufenden Runde in einem anderen Tab desselben Browsers. Sie dient zur Entwicklung
und ist kein Ersatz für die Watch-App.
