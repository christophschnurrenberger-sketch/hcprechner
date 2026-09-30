# Abschluss-Check

Stand: 30.09.2026 · Version 2.3.0 · **439 automatisierte Tests** (231 WHS-Engine; Rechte, Sicherheit, Service-Schicht,
Statistik, Community, Ablauf der mobilen Scorecard, idempotentes Speichern, Parität TypeScript ↔ PHP, Node-API mit PGlite
und PHP-API gegen `php -S`), ESLint und TypeScript ohne Befund, Node-Build (standalone) und Webspace-ZIP erfolgreich.

## Version 2.3 – Mobile Rundeneingabe als eigenständige Scorecard (Master-Prompt, Definition of Done §161)

Browser-Abläufe (`e2e/flows.cjs`, Abschnitt J neu) gegen beide Editionen: **Node 100/100** und **Webspace 99/99** (ZIP
installiert auf dem IONOS-ähnlichen Apache). Konzept: [`MOBILE-RUNDENEINGABE.md`](MOBILE-RUNDENEINGABE.md).

| Punkt | Status | Nachweis |
|---|---|---|
| Mobile Scorecard komplett neu (keine responsive Desktop-Tabelle) | ✅ | eigene Komponenten `src/components/member/mobile/`; Desktop-Eingabe unverändert |
| Wizard funktioniert (Start → Score → Putts → Statistik → nächstes Loch) | ✅ | `holeFlow.ts` + Tests; E2E 18 Loch |
| Quick Mode / Detailed Mode | ✅ | Auswahl beim Start, Standard im Profil; E2E beide Modi |
| 9 Loch / 18 Loch (Front Nine, Übersicht nach Loch 9 bzw. 18) | ✅ | E2E 9 Loch schnell, 18 Loch detailliert mit Front-Nine-Zwischenstand |
| Score, Putts, FIR (nur Par 4/5), GIR, Bunker, Sand Save (nur nach Bunker), Up & Down (nur bei verfehltem Grün), Strafschläge (Standard 0), Notiz (optional, privat) | ✅ | `screens.tsx`, sichere Folgerungen in `normalizeHole`; E2E: Par 3 ohne Fairway-Frage, Bunker mit Sand Save |
| Auto Save / Offline-Entwurf / Sync | ✅ | jede Eingabe lokal, Server-Entwurf kurz danach, Statusanzeige; E2E Funkloch |
| Recovery | ✅ | „Du hast eine laufende Runde … Loch 6 von 9“; E2E nach Reload fortgesetzt an der richtigen Stelle |
| Keine Duplikate | ✅ | `clientRef` (Service, Node, PHP); Unit- und PHP-Tests; E2E offline beendet → genau eine Runde mehr |
| Back-Navigation, Loch bearbeiten | ✅ | ← behält Daten (E2E), Lochleiste und Übersicht zum Springen |
| Abbrechen ohne Datenverlust | ✅ | X: Weiter erfassen / Als Entwurf speichern / Runde verlassen; Verwerfen nur nach Rückfrage (E2E) |
| Front Nine Summary, Final Summary | ✅ | Schläge, zu Par, Putts, GIR, FIR; Löcher antippbar |
| WHS-Berechnung und Score Differential unverändert | ✅ | keine Änderung an Engine/Regeln; Ergebnis kommt vom Backend (E2E: SD 7,7, HCPI 13,6 → 9,7); 231 Engine-Tests grün |
| Ranking nach Abschluss aktualisiert, Community unverändert | ✅ | Backend-Synchronisation wie bisher; Ergebnisbildschirm zeigt den Ranking-Platz; Abschnitt L grün |
| Desktop funktional, Tablet (hoch = Scorecard, quer = Desktop) | ✅ | Abläufe A–K unverändert grün; E2E Tablet 768 × 1024 / 1024 × 768 |
| Accessibility | ✅ | Buttons mit `aria-label`/`aria-pressed`, Gruppen mit Überschrift, `aria-live` für Schlagzahl und Status, Tastatur, Kontrast, Symbol + Text statt nur Farbe, reduzierte Bewegung |
| Touch-Ziele ≥ 44–48 px, kein unnötiges Scrollen, kleine Smartphones | ✅ | E2E: 18 Löcher ohne Scrollen (390 × 844), Schritte ohne Scrollen auf 375 × 667 |
| „Statistiken ergänzen“ nach Quick-Runde | ✅ | gleiche Schritte, Schläge gesperrt; E2E |
| PWA, Vollbild, Screen Wake Lock, Haptik | ✅ | Manifest + Icons, Scorekarte als Vollbild, Wake Lock/Vibration wo unterstützt (sonst still) |

**Bewusste Grenze:** Kein Service Worker. Eine laufende Runde arbeitet offline weiter und geht nicht verloren; die App
ohne jede Verbindung neu zu öffnen, ist nicht möglich (Anmeldung und Platzdaten brauchen das Netz).

## Version 2.2 – Community, Ranking, Mitgliederprofile und Lochstatistik (Master-Prompt, Checkliste §172)

Browser-Abläufe (`e2e/flows.cjs`, Abschnitt L und Ergänzungen in G/J) gegen beide Editionen:
**Node 87/87** (Standalone, PGlite) und **Webspace 86/86** (ZIP 2.2.0 installiert auf einem IONOS-ähnlichen Apache
mit PHP-FPM, Unterordner `/hcprechner`). Konzept und Definitionen: [`COMMUNITY.md`](COMMUNITY.md).

| Punkt | Status | Umsetzung / Nachweis |
|---|---|---|
| WHS unverändert, Engine nicht dupliziert | ✅ | Statistik und Community in eigenen Domänen (`src/lib/stats`, `src/lib/community`); `saveRoundStats` ändert nur `holeStats`/`computed.stats`; E2E „Statistiken ergänzen – Handicap unverändert“, SD der Statistik-Runde 14,4; alle 231 Engine-Tests grün |
| Drei getrennte Domänen WHS / Statistik / Social | ✅ | `docs/COMMUNITY.md`, `docs/ARCHITEKTUR.md` |
| Navigation Home / HCP / Runden / Community / Profil | ✅ | `MemberShell`; bei ausgeschalteter Community wieder „Golfplätze“; Statistik und Golfplätze im Benutzermenü und auf „Runden“ |
| Quick Score Standard, „Runde detailliert tracken“ optional | ✅ | Schalter im Schritt „Ergebnis“; ohne Schalter wird keine Statistik gesendet (`tests/member/wizard.test.ts`) |
| Mobile Scorecard: ein Loch pro Ansicht, Navigation ✓/●/○, Fortschritt, Autosave | ✅ | `DetailedHoleInput`; Entwurf speichert Lochdaten mit; E2E J ohne horizontale Scrollleiste (390 px) |
| Putts, GIR, FIR (nur Par 4/5), Bunker/Bunkerschläge, Sand Save, Up & Down, Strafschläge, Notiz | ✅ | `HoleStat`, Prüfung am Loch (`validateHoleStats`): unmögliche Angaben blockieren, ungewöhnliche sind Hinweise; nichts wird aus der Schlagzahl abgeleitet |
| Loch für Loch: Schläge aus der WHS-Eingabe, Par/Handicap aus Platzdaten | ✅ | `alignHoleStats` (Backend), `statsWithStrokes` (Assistent); Statistik-Editor sperrt die Schlagzahl |
| „Statistiken ergänzen“ später, ohne SD/HCP zu ändern | ✅ | `/member/rounds/stats?id=`; Hinweis nach dem Speichern „Möchtest du diese Runde detailliert tracken?“ |
| Statistik im Backend aggregiert, konsistente Definitionen | ✅ | Nenner = erfasste Löcher, `null` statt 0 % ohne Versuch, Summen statt Durchschnitt von Prozenten (`tests/stats`) |
| `/member/stats` mit Filtern (5/10/20/Alle, 9/18, Platz, Zeitraum, Abschlag), Kennzahlen, Verläufe, Fakten | ✅ | Diagramme mit validierter Palette, Tabellenansicht, „So zählen wir“ |
| Rundendetail: Zusammenfassung / Scorekarte / Statistik | ✅ | E2E „Reiter Statistik“, „Scorekarte mit privater Notiz“ |
| Dashboard: Statistik der letzten Runde, Ranking-Position | ✅ | `LastStatsCard`, `RankingCard` |
| `/member/community`: Ranking / Aktivität / Mitglieder | ✅ | Top 3, Tabelle (Desktop) bzw. Karten (Smartphone), Trend, Filter Gesamt/Heimatclub/Region, Suche mit Verzögerung |
| Ranking nur Opt-in, niedrigster HCPI zuerst, Gleichstand 1-1-3 zentral konfigurierbar | ✅ | `COMMUNITY_POLICY.ranking`; Zustimmungsdialog; E2E: anderes Mitglied sieht nur Teilnehmer, eigene hypothetische Position 2 |
| Eigene Position hervorgehoben, Trend über Tagesstände | ✅ | `ranking_snapshots` bzw. `data/community/ranking/`; „Ranking aktualisieren“ im Admin-Bereich |
| Privatsphäre: rankingVisible, profileVisible, roundsVisible, statsVisible, notesVisible – alles Opt-in | ✅ | Standard aus; Abhängigkeiten `normalizeSettings`; Profil → Community |
| Sichtbarkeit je Runde PRIVATE / MEMBERS_BASIC / MEMBERS_FULL, Freigabe ausdrücklich | ✅ | Frage beim Prüfen mit Zustimmungs-Schaltfläche; änderbar im Rundendetail; Vorauswahl aus den Einstellungen |
| Notizen standardmäßig privat | ✅ | nur bei FULL + `notesVisible`; E2E „geteilte Runde ohne private Notiz“ |
| Anzeigename und optionales Profilbild – nie E-Mail oder interne ID | ✅ | Anzeigename ohne @/Links; Bild im Browser verkleinert, serverseitig geprüft (Magic Bytes, 150 KB), nur über geschützte API; E2E „keine E-Mail, keine interne ID“ |
| Backend filtert private Runden – nicht das Frontend | ✅ | Projektion als einzige Freigabestelle; E2E „private Runde eines anderen Mitglieds → 404“; `tests/community/node-community.test.ts` |
| Admin umgeht Privatsphäre nicht stillschweigend | ✅ | Admin kann Freigaben nur ausschalten und Runden ausblenden, nie einschalten; jede Aktion mit Begründung im Audit-Log |
| Admin: Übersicht, Ranking (Opt-in/Opt-out), geteilte Runden mit Moderation, aggregierte Statistik, Datenqualität | ✅ | `/admin/community`; Aggregate erst ab 5 Runden; Status und Ausblenden in der Benutzeransicht; Moderation in der Admin-Rundenansicht |
| Schalter communityEnabled / rankingEnabled / publicRoundsEnabled / statsSharingEnabled / activityFeedEnabled | ✅ | Admin → Einstellungen → Community (Audit `community.*`); wirken beim Lesen zusätzlich zu den Einstellungen der Mitglieder |
| Audit PUBLIC_ROUND_MODIFIED/HIDDEN, USER_RANKING/PROFILE_VISIBILITY_CHANGED | ✅ | plus `PUBLIC_ROUND_UNHIDDEN`, `RANKING_REFRESHED`, `COMMUNITY_SETTINGS_CHANGED`, `ROUND_VISIBILITY_CHANGED`, `ROUND_STATS_UPDATED`; E2E G prüft das Audit-Log |
| APIs (§111) | ✅ | `docs/openapi.yaml` (65 Pfade): `/api/community/*`, `/api/me/{statistics,community,avatar,ranking}`, `/api/me/rounds/:id/{stats,visibility}`, `/api/admin/community/*` |
| Beide Editionen gleichwertig | ✅ | PHP-Fassung der Projektion (`_community.php`) per Paritätstest identisch zu TypeScript (`tests/community/php-parity.test.ts`) |
| Performantes Ranking | ✅ | Node: SQL `rank()` auf materialisierter Tabelle mit Indizes; Webspace: eine Indexdatei statt aller Mitglieder-Dokumente |

**Bewusste Grenze (Webspace):** HCPI und Spielleistung fürs Ranking berechnet dort der Browser mit derselben Engine;
PHP prüft nur die Wertebereiche. Ein manipuliertes Frontend könnte den eigenen Ranking-Wert verfälschen, nie Daten
anderer. Manipulationssicher ist das Ranking in der Node-Edition; im Webspace kann der Admin Einträge entfernen.

**Änderung der API:** `GET /api/me/statistics` liefert seit 2.2 die Golfstatistik; die WHS-Auswertung der Score
Differentials liegt jetzt unter `GET /api/me/tools/statistics` (Oberfläche angepasst).

## Version 2 – Frontend mit Mitgliederbereich und Admin-Backend (Master-Prompt)

### Abläufe A–K (§157)

Automatisiert mit Playwright (`e2e/flows.cjs`) gegen beide Editionen: Webspace-ZIP installiert unter `php -S`
(PHP 8.4, Unterordner `/hcp`, Mail im Modus „Ablage“) und Node-Standalone-Server mit PGlite (`MAIL_MODE=outbox`).
Ergebnis: **Webspace 63/63, Node 64/64 Prüfungen** (Stand 2.1.0) (Node zusätzlich: fremde Runde per REST `GET /api/me/rounds/<id>`
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
| – | Ungeprüftes Rating (Ottobeuren): Werte werden angezeigt und mit der Scorekarte bestätigt statt abgetippt; Löcher im Platz-Schritt umschaltbar (18 Loch / Loch 1–9 / Loch 10–18) mit Hinweis bei fehlendem 9-Loch-Rating | ✅ |
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
| Wizard nur mit hinterlegten Abschlägen, GBE oder Loch für Loch, 9-Loch-Hinweis | ✅ Lochzahl als erste Frage und im Platz-Schritt umschaltbar |
| Ungeprüfte Ratings nicht automatisch verwenden | ✅ nur nach Bestätigung durch den Spieler (Werte müssen exakt übereinstimmen, sonst `RATING_CHANGED`); Snapshot `playerConfirmed` |
| Rechenweg je Runde (Akkordeon), Bearbeiten, Löschen (Papierkorb), Entwürfe mit Autospeichern | ✅ |
| Favoriten, Heimatplatz, zuletzt gespielt; Onboarding | ✅ |
| Profil: Konto, Sicherheit (Passwort, E-Mail-Wechsel mit Bestätigung), Datenschutz (Export, Konto löschen), Abmelden | ✅ |
| Admin: dichte Tabellen mit Filter/Sortierung/Seiten, globale Suche, Berechtigungsübersicht | ✅ |
| Lade-, Leer- und Fehlerzustände (Skeleton, Retry), Toasts, Bestätigungsdialoge | ✅ |
| Barrierefreiheit: Labels, `aria-live`, Fokus, Tastatur, `prefers-reduced-motion`, Kontrast (hell/dunkel) | ✅ |
| Deutsche Formate (Komma, Datum), strukturierte Fehlermeldungen mit Feldbezug | ✅ |
| OpenAPI-Dokumentation | ✅ `docs/openapi.yaml` (45 Pfade in 2.0; 65 seit 2.2) |

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
- Apache 2.4 mit PHP-FPM (wie bei IONOS: Kundenverzeichnis außerhalb der DocumentRoot, PHP über FastCGI):
  Neuinstallation, Update 2.0.0 → 2.0.1 über `install.php`, Abläufe A–K 61/61, Selbstprüfung „✓“; zusätzlich ein
  Server, auf dem die Weiterleitung an `gate.php` ins Leere läuft → `install.php` schaltet die Vorprüfung ab, die
  Anwendung bleibt nutzbar. In 2.0.0 führte `/member` dort zu `/member/?area=member` und „Seite nicht gefunden“
  (relative RewriteRule ohne `RewriteBase`, Verzeichnisweiterleitung von `mod_dir`) – behoben in 2.0.1.
- Nicht geprüft: Docker-Build (kein Docker-Daemon).
