# Abschluss-Check

Stand: 29.09.2026 · Version 2.0.0 · **365 automatisierte Tests** (231 WHS-Engine, 46 Rechte/Sicherheit/Service-Schicht
inkl. PHP-API gegen `php -S`), ESLint und TypeScript ohne Befund, Node-Build (standalone) und Webspace-ZIP erfolgreich.

## Version 2 – Frontend mit Mitgliederbereich und Admin-Backend (Master-Prompt)

### Abläufe A–K (§157)

Automatisiert mit Playwright (`e2e/flows.cjs`) gegen beide Editionen: Webspace-ZIP installiert unter `php -S`
(PHP 8.4, Unterordner `/hcp`, Mail im Modus „Ablage“) und Node-Standalone-Server mit PGlite (`MAIL_MODE=outbox`).
Ergebnis: **Webspace 61/61, Node 62/62 Prüfungen** (Node zusätzlich: fremde Runde per REST `GET /api/me/rounds/<id>`
→ 404). Testdaten: ein fiktiver Testplatz („E2E Testclub“) nur in der Testinstallation.

| Ablauf | Inhalt | Ergebnis |
|---|---|---|
| A | Registrierung mit Feldvalidierung → Bestätigungsmail → Anmeldung vor Bestätigung abgelehnt → Link → erste Anmeldung → Onboarding | ✅ |
| B | mehrere Runden → aktiver HCPI (3 Ergebnisse: bestes SD − 2,0 = 11,6), Ergebnisseite HCPI vorher/nachher | ✅ |
| C | 9-Loch-Runde (Ergänzung um erwartetes Ergebnis), Hinweis „Kein 9-Loch-Rating vorhanden“ ohne Ableitung aus 18 Loch, Filter 9 Loch | ✅ |
| D | 18-Loch-Runde als GBE auf Datenbank-Platz mit Vorschau, SD 15,2 vom Backend; Scorekarte Loch für Loch mit Netto-Doppelbogey im Rechenweg | ✅ |
| E | Benutzer ohne Runden und ohne Start-HCPI → 54,0, leerer Zustand auf der Startseite | ✅ |
| F | Benutzer mit Start-HCPI (Onboarding fragt ihn ab) → Startseite zeigt 18,4 | ✅ |
| G | Admin: Dashboard, Startdaten übernehmen, CSV-Import, Lochdaten, Ratings/Quellen, Benutzer anlegen, HCP des Benutzers, Benutzeransicht (lesend, protokolliert), Rundenübersicht, Audit-Log, Regeln, System, globale Suche, Registrierung schließen | ✅ |
| H | anonym `/member` und `/admin` → Anmeldeseite; Mitglied auf `/admin` → zurück mit Hinweis; Admin-API als Mitglied → 403 | ✅ |
| I | fremde Daten: eigenes Dokument ohne fremde Runden; fremde Runde per ID lesen oder löschen → nicht gefunden | ✅ |
| J | Smartphone 390 px: untere Navigation, Loch-für-Loch-Eingabe, keine horizontale Scrollleiste | ✅ |
| K | Desktop 1440 px: Startseite, Admin mit Seitenleiste | ✅ |
| – | Runde bearbeiten/löschen, Entwurf automatisch gespeichert, Favorit, HCP-Seite mit Rechenweg, CSRF ohne Token abgelehnt, deaktiviertes Konto (Anmeldung abgelehnt, Sitzung beendet), Passwort vergessen, Abmelden, keine JavaScript-Fehler | ✅ |

### Sicherheit (§1, §156)

| Anforderung | Status | Umsetzung / Nachweis |
|---|---|---|
| Berechtigung serverseitig, nicht nur UI | ✅ | jede Admin-Aktion mit fester Berechtigung (`requirePermission` bzw. Aktionsmatrix in `admin.php`); Seiten vorab durch `proxy.server.ts`/Server-Layout bzw. `gate.php`; Test „Mitglied → Admin-API 403“ (PHP-Test, E2E H) |
| Rolle aus Backend/Session, nie clientseitig | ✅ | `useSession()` lädt `/api/auth/me`; kein Rollen-Default im Client; `tests/auth/security.test.ts` |
| Normale User können nie ADMIN wählen | ✅ | Registrierung setzt fest `USER`; Rollenwechsel nur `users.roles` (Super-Admin), nie für das eigene Konto; PHP-Test „Registrierung: Rolle aus der Anfrage wird ignoriert“ |
| Passwort nie im Klartext gespeichert/geloggt | ✅ | scrypt bzw. `password_hash`; Audit speichert keine Passwörter; Mail-Protokoll nur Empfänger, Betreff, Status |
| Kein Token in localStorage/sessionStorage | ✅ | HttpOnly-Cookie; CSRF-Token nur im Arbeitsspeicher (`transport.ts`) |
| Keine hartkodierten URLs/IDs/Passwörter/Secrets | ✅ | `APP_URL`, `SESSION_SECRET`, `ADMIN_EMAIL/PASSWORD`, `SMTP_URL` aus der Umgebung; Webspace: `data/config.php` aus `install.php` |
| Admin-Secrets nie im Browser | ✅ | SMTP-Passwort wird nicht ausgeliefert (nur `hasPassword`), Sitzungsschlüssel nur serverseitig |
| User sieht nur eigene Daten | ✅ | Benutzer-ID ausschließlich aus der Sitzung; PHP-Test „Isolation“, E2E I |
| Impersonation protokolliert, nur lesend | ✅ | `IMPERSONATION_VIEW` im Audit-Log, deutlich markiertes Banner, keine Schreibaktionen |
| Deaktivierte Benutzer: kein Login, Daten bleiben | ✅ | Status `DISABLED`/`LOCKED` → `ACCOUNT_DISABLED`/`ACCOUNT_LOCKED`; PHP-Test und E2E G |
| Audit kritischer Aktionen | ✅ | Zeitpunkt, `user_id`, `admin_id`, Aktion, Entität, alter/neuer Wert (`audit_log` bzw. `data/audit/`) |
| CSRF, Ratenbegrenzung, gleiche Antwort für unbekannte Konten | ✅ | PHP-Tests „CSRF“, „unbekanntes Konto“; Anmeldung je IP und Konto begrenzt |
| Letzter Super-Admin geschützt | ✅ | Herabstufen, Deaktivieren, Löschen und Kontolöschung verweigert |

### Oberfläche (Auswahl §156)

| Punkt | Status |
|---|---|
| Getrennte Layouts für Öffentlich/Mitglied/Admin | ✅ `PublicShell`, `MemberShell`, `AdminShell` |
| Mitglied: höchstens 5 Navigationspunkte, mobile Leiste unten, „+ Runde erfassen“ | ✅ |
| Großer HCPI mit Veränderung, Ergebnisseite vorher/nachher | ✅ |
| Wizard nur mit hinterlegten Abschlägen, GBE oder Loch für Loch, 9-Loch-Hinweis | ✅ |
| Rechenweg je Runde (Akkordeon), Bearbeiten, Löschen (Papierkorb), Entwürfe mit Autospeichern | ✅ |
| Favoriten, Heimatplatz, zuletzt gespielt; Onboarding | ✅ |
| Profil: Konto, Sicherheit (Passwort, E-Mail-Wechsel mit Bestätigung), Datenschutz (Export, Konto löschen), Abmelden | ✅ |
| Admin: dichte Tabellen mit Filter/Sortierung/Seiten, globale Suche, Berechtigungsübersicht | ✅ |
| Lade-, Leer- und Fehlerzustände (Skeleton, Retry), Toasts, Bestätigungsdialoge | ✅ |
| Barrierefreiheit: Labels, `aria-live`, Fokus, Tastatur, `prefers-reduced-motion`, Kontrast (hell/dunkel) | ✅ |
| Deutsche Formate (Komma, Datum), strukturierte Fehlermeldungen mit Feldbezug | ✅ |
| OpenAPI-Dokumentation | ✅ `docs/openapi.yaml` (45 Pfade) |

### Bewusste Abweichungen

- **Detailrouten mit Query-Parameter** (`/member/rounds/view?id=…`) statt `/member/rounds/[id]`: Die Webspace-Edition
  ist ein statischer Export ohne dynamische Routen; beide Editionen teilen sich dieselben Seiten.
- **Webspace-Edition rechnet im Browser** (gleiche Service-Schicht wie der Node-Server, gekapselt im API-Adapter):
  PHP kann die TypeScript-Engine nicht ausführen. Autorisierung, Datentrennung, Strukturprüfung, Revisionen und
  Audit bleiben auf dem Server.
- **Mailversand** muss auf dem Zielsystem eingerichtet werden (SMTP empfohlen); ohne Mail legt der Admin Konten mit
  temporärem Passwort an.

## Version 1 – WHS-Engine und Golfplatzdaten (Spezifikation §79)

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
| Golfplätze Bayern vollständig erfasst / Status dokumentiert | ⚠️ Status dokumentiert, **1 Anlage** (Ottobeuren, unverifiziert) | Egress-Sperre in der Build-Umgebung, siehe `DATENSTATUS-BAYERN.md` |
| alle Datenquellen gespeichert | ✅ | `rating_sets.source_type/source_url/checked_at/verified/confidence`, `change_log` |
| mobile Scorekarteneingabe funktioniert | ✅ | E2E C und J (390 px, Loch für Loch, Schnellauswahl) |
| CSV-Import funktioniert | ✅ | `courses.test.ts`, `repository.test.ts`, E2E G (Admin-Import), `tests/member` (Runden-CSV) |
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
- Für Produktion `APP_URL`, `SESSION_SECRET`, `ADMIN_EMAIL`/`ADMIN_PASSWORD` (erster Super-Admin) und `SMTP_URL` setzen.
- Klassischer PHP-Webspace: `npm run build:webspace` → ZIP hochladen → `install.php` (siehe [`WEBSPACE.md`](WEBSPACE.md)).
- Nicht geprüft: echter Apache mit `.htaccess`/`mod_rewrite` (in der Build-Umgebung simuliert ein PHP-Router die
  Weiterleitung auf `gate.php`); Docker-Build (kein Docker-Daemon). Die Selbstprüfung in `install.php` zeigt an, ob der
  Mitgliederbereich auf dem Webspace wirklich vorab geschützt ist.
