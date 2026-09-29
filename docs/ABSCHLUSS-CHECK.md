# Abschluss-Check (Spezifikation §79)

Stand: 29.09.2026 · 315 automatisierte Tests (davon 231 für die WHS-Engine), ESLint und TypeScript ohne Befund,
Produktions-Build erfolgreich, Standalone-Server mit PGlite und mit PostgreSQL 16 geprüft, Browser-Tests (Desktop und
390 px) für Dashboard, Wizard (manuell und Datenbank, 9 Loch, Scorekarte), Rundendetail, Scoring Record, Simulator,
Einstellungen/Export, Admin (CRUD, CSV-Import), Golfplatzsuche und öffentliche Golfplatzseite.

Webspace-Edition: ZIP-Paket mit `php -S` (PHP 8.4) als simuliertem Webspace geprüft – Installation im Unterordner und
in der Domain-Wurzel, Update über bestehende Installation, Admin (Anmeldung, Anlage/Platz/Rating, Validierung,
Speichern auf dem Server), Golfplatzsuche und Anlagen-Seite, Runde mit Platz aus der Datenbank erfassen,
Synchronisation, 404-Seite, Schutz von `data/`, CSRF-Schutz, Sitemap, Mobilansicht (je 28/28 Prüfungen).
Nicht geprüft: echter Apache mit `.htaccess` (kein Apache in der Build-Umgebung) – die `.htaccess`-Anweisungen sind
in `<IfModule>` gekapselt, und `install.php` schaltet bei HTTP 500 automatisch auf eine minimale Fassung um.

| Prüfpunkt | Status | Nachweis |
|---|---|---|
| Score Differential korrekt | ✅ | `tests/whs/scoreDifferential.test.ts` (TEST 1: 94/71,8/135 → 18,6) |
| GBE korrekt | ✅ | `tests/whs/gbe.test.ts`, Browser-Test (GBE 116 bzw. 54) |
| Netto-Doppelbogey korrekt | ✅ | `gbe.test.ts` (Par + 2 + Vorgabenschläge, Kappung, nicht beendet) |
| 9-Loch korrekt | ✅ | `tests/whs/nineHole.test.ts` (TEST 6: 8,1 + 8,5 = 16,6) |
| 9-Loch Expected SD korrekt | ✅ | `nineHole.test.ts` ((HCPI × 1,04 + 2,4) / 2) |
| 9-Loch PCC halbiert | ✅ | `scoreDifferential.test.ts`, `nineHole.test.ts` (TEST 7) |
| 18-Loch korrekt | ✅ | `scoreDifferential.test.ts`, `scoringRecord.test.ts` |
| weniger als 20 Scores korrekt | ✅ | `indexCalculation.test.ts` (Tabelle 3–20 vollständig) |
| beste 8 aus 20 korrekt | ✅ | `indexCalculation.test.ts` (TEST 2/5), `scoringRecord.test.ts` |
| ESR korrekt | ✅ | `exceptionalScore.test.ts` (TEST 8/9) |
| ESR rückwirkend korrekt | ✅ | `exceptionalScore.test.ts` (nur jüngste 20, spätere Runden ohne Abzug) |
| 26,5-Bremse korrekt | ✅ | `capsAndBrake.test.ts` (TEST 10/11, Aufhebung, Heraufsetzung höchstens bis 26,5) |
| Low Handicap Index korrekt | ✅ | `lowHandicapIndex.test.ts` (365-Tage-Fenster, nicht Minimum aller Werte) |
| Soft Cap korrekt | ✅ | `capsAndBrake.test.ts` (TEST 12: 13,4 → 13,2) |
| Hard Cap korrekt | ✅ | `capsAndBrake.test.ts` (TEST 13: höchstens 15,0) |
| gleiche Start-HCPs am selben Tag | ✅ | `scoringRecord.test.ts` (TEST 14) |
| historische HCPI für 9-Loch korrekt | ✅ | `nineHole.test.ts` (TEST 15) |
| historische CR/Slope unveränderlich | ✅ | Rating-Snapshot je Runde; `scoringRecord.test.ts`, `courses.test.ts` (Rating nach Spieldatum) |
| keine erfundenen Platzdaten | ✅ | Datenbank leer ausgeliefert; `NULL` statt Schätzung; DB-Constraint `verified` nur mit Werten und Quelle |
| 9-Loch-Ratings nie aus 18-Loch abgeleitet | ✅ | `courses.test.ts`, `nineHole.test.ts`, `partialRound.test.ts` |
| Golfplätze Bayern vollständig erfasst / Status dokumentiert | ⚠️ Status dokumentiert, **nicht erfasst** | Egress-Sperre in der Build-Umgebung, siehe `DATENSTATUS-BAYERN.md` |
| alle Datenquellen gespeichert | ✅ | `rating_sets.source_type/source_url/checked_at/verified/confidence`, `change_log` |
| mobile Scorekarteneingabe funktioniert | ✅ | Browser-Test 390 px (Loch für Loch, Schnellauswahl, NDB-Anzeige) |
| CSV-Import funktioniert | ✅ | `courses.test.ts`, `repository.test.ts`, Browser-Test Admin-Import und Runden-CSV |
| alle Unit Tests erfolgreich | ✅ | `npm test` |

## Test-Orakel (§66)

Die Erwartungswerte stammen aus den Beispielen der Spezifikation und aus nachgerechneten Beispielen. Offizielle
DGV-/WHS-Beispielrechnungen konnten in der Build-Umgebung nicht abgerufen werden. Empfehlung: einige reale Runden
mit bekanntem offiziellem Score Differential und HCPI (z. B. aus der DGV-App) in `tests/whs/` als Orakel ergänzen;
Abweichungen > 0,1 als Fehler behandeln.

## Offene Verifikationspunkte

Diese Annahmen sind im Regelset hinterlegt, sichtbar in der App (`/methodik`) und sollten gegen offizielle DGV-Beispiele
bestätigt werden:

1. **Abgebrochene Runden 10–17 Löcher:** 10–13 → Hochrechnung über die vollständig gespielten neun Löcher mit deren
   9-Loch-Rating plus erwartetem Differential; 14–17 → nicht gespielte Löcher mit Netto-Par. Im Regelset als
   `UNVERIFIED` markiert; die Runde zeigt einen Hinweis.
2. **Rundung negativer Werte** (Plus-Handicaps): kaufmännisch vom Nullpunkt weg (konfigurierbar).
3. **Mehrere außergewöhnliche Ergebnisse an einem Tag:** Abzüge werden addiert und am Tagesende auf die jüngsten 20 angewendet.
4. **ESR für Neugolfer:** Prüfung ab dem ersten Ergebnis gegen den Start-HCPI (z. B. 54,0).
5. **26,5-Bremse von unten:** Liegt der HCPI unter 26,5, erfolgt eine Heraufsetzung höchstens bis 26,5.
6. **Low HCPI:** Das Fenster schließt den HCPI ein, der am Tag des jüngsten Ergebnisses galt.
7. **Ergebnisarten:** Kürzel NRa/NRo/DQa/DQo als „anrechenbar“ bzw. „ohne Wertung“ interpretiert.
8. **Kalkulierter HCPI:** in der App der rechnerische Wert aus dem Scoring Record vor Cap-Verfahren und Bremse; die
   Abweichung zum aktuellen HCPI wird mit Ursache (Soft/Hard Cap, 26,5-Bremse) angezeigt.

## Deployment

- `npm run build && npm start` bzw. `node .next/standalone/server.js` (getestet).
- `Dockerfile` und `docker-compose.yml` (App + PostgreSQL 16) liegen bei; ein Docker-Build war in der Build-Umgebung
  mangels Docker-Daemon nicht möglich. Das Image entspricht dem getesteten Standalone-Aufbau.
- Für Produktion `ADMIN_PASSWORD` setzen (sonst ist der Admin-Bereich gesperrt).
- Klassischer PHP-Webspace: `npm run build:webspace` → ZIP hochladen → `install.php` (siehe [`WEBSPACE.md`](WEBSPACE.md)).
