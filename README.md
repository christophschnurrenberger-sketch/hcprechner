# Golf HCP Rechner – WHS 2026 (Bayern)

Webanwendung zur Berechnung und Simulation des **Handicap Index (HCPI)** nach dem World Handicap System in der
deutschen Ausprägung (DGV, Regelversion 2026) – mit Golfplatzdatenbank für Bayern.

Kein altes EGA-System: keine Stableford-Pufferzonen, keine Vorgabenklassen, keine 0,1/0,2-Anpassungen.
Zentrale Bewertungsgröße ist das **Score Differential**.

## Funktionsumfang

Drei getrennte Bereiche mit eigener Navigation und eigenem Layout:

| Bereich | Inhalt |
|---|---|
| Öffentlich (`/`) | Startseite, Anmelden, Registrieren, Passwort vergessen/zurücksetzen, E-Mail bestätigen, Golfplätze Bayern (SEO-Seiten), Rechenregeln & Methodik, Hilfe/FAQ, Datenschutz, Impressum |
| Mitglieder (`/member`) | Startseite mit großem HCPI und Veränderung, HCP-Verlauf und Rechenweg, **„+ Runde erfassen“** (Assistent: Löcher → Platz → Abschlag → Ergebnis als GBE oder Loch für Loch; nur hinterlegte Abschläge; ungeprüfte Ratings bestätigt der Spieler mit seiner Scorekarte; Hinweis zur 9-Loch-Methode), Ergebnisseite „HCPI vorher → nachher“, Runden mit Detail und Rechenweg-Akkordeon, Bearbeiten und Löschen (Papierkorb), Entwürfe mit automatischem Speichern, Golfplätze mit Favoriten, Heimatplatz und zuletzt gespielt, Onboarding (Start-HCPI, Heimatplatz), Profil (Konto, Sicherheit, Datenschutz mit Export und Kontolöschung), CSV-Import, Werkzeuge (Simulator, GBE-Rechner). **Seit 2.2:** optional „Runde detailliert tracken“ (Putts, GIR, FIR, Bunker, Sand Save, Up & Down, Strafschläge, private Notiz – ein Loch pro Ansicht), „Statistiken ergänzen“ für gespeicherte Runden, Statistikseite mit Filtern und Verläufen, **Community** mit Ranking (nur mit Zustimmung), Mitgliederprofilen und geteilten Runden (Nur ich / Basisdaten / Details). Mobil: untere Navigation Home · HCP · Runden · Community · Profil |
| Admin (`/admin`) | Eigenes Layout mit Seitenleiste und kompakten Tabellen: Dashboard, Benutzer (Filter, Detail, HCP-Ansicht, protokollierte Benutzeransicht), Runden, Community (Übersicht, Ranking, Moderation geteilter Runden, Schalter), Golfplätze, Ratings, Quellen, Datenqualität, Duplikate, Import, Änderungen, Regelwerk, System, Audit-Log, Berechtigungen, Einstellungen (inkl. Mailversand), globale Suche |
| Berechnung | Score Differential, 9-Loch-Methode (gespielt + erwartet, DGV-PCC-Tabelle), Course Handicap 9/18, Netto-Doppelbogey/GBE, WHS-Tabelle (3–20 Ergebnisse), ESR rückwirkend, Low HCPI, Soft/Hard Cap, 26,5-Bremse, Tageslogik, abgebrochene Runden 10–17, Stableford, Ergebnisarten |
| Golfplatzdaten | Anlage → Platz/Layout → Rating-Set (Abschlag, Geschlecht, 9/18, Front/Back, Gültigkeit, Quelle, Prüfdatum, verifiziert) → Löcher; CSV-Import mit Vorschau, Datenqualität, Duplikate, Änderungsprotokoll, Bayern-Importer |

**Rollen:** `USER` (Mitglied), `SUPPORT` (Admin-Bereich nur lesend), `ADMIN` (Benutzer und Golfplätze verwalten),
`SUPER_ADMIN` (zusätzlich Rollen, endgültiges Löschen, Einstellungen). Die Rolle kommt ausschließlich aus der
Sitzung des Backends; jede Admin-Aktion wird serverseitig geprüft, Mitglieder bekommen nur ihre eigenen Daten
ausgeliefert. Kritische Aktionen (Rollen, Status, Passwort-Reset, Benutzeransicht, Runden- und Platzänderungen) landen
im Audit-Log mit Zeitpunkt, Admin, betroffenem Benutzer, altem und neuem Wert.

**Community und Statistik** sind strikt Opt-in: Ohne Zustimmung ist ein Mitglied nirgends sichtbar. Die API liefert
private Runden, E-Mail-Adressen und interne IDs nie an andere Mitglieder aus; Notizen bleiben privat, solange sie
nicht ausdrücklich freigegeben sind. Statistiken verändern das Handicap nicht. Details: [`docs/COMMUNITY.md`](docs/COMMUNITY.md).

**Rundeneingabe auf dem Smartphone (ab 2.3):** eine eigene, schrittweise digitale Scorekarte statt eines verkleinerten
Formulars – Loch für Loch Schläge, Putts und nur die relevanten Statistikfragen, große Tasten, Bedienung mit einer Hand,
Wahl zwischen „Schnell“ und „Detailliert“. Jede Eingabe wird sofort auf dem Gerät gesichert; bei Funkloch geht es weiter,
eine offline beendete Runde wird später übertragen – ohne doppelte Runden. Installierbar als App (PWA). Desktop und
Tablet quer behalten die bisherige Eingabe. Details: [`docs/MOBILE-RUNDENEINGABE.md`](docs/MOBILE-RUNDENEINGABE.md).

## Auf den eigenen Webspace hochladen (ohne Node.js, ohne Datenbank)

Für klassischen PHP-Webspace (Strato, IONOS, all-inkl, netcup, …) gibt es die **Webspace-Edition**:

1. `release/golf-hcp-rechner-webspace-<version>.zip` erzeugen (`npm run build:webspace`) oder fertig herunterladen und entpacken.
2. Den Ordner `golf-hcp-rechner` per FTP hochladen (beliebiger Ordnername, auch die Domain-Wurzel ist möglich – versteckte
   `.htaccess`-Dateien mit hochladen).
3. `https://ihre-domain.de/<ordner>/install.php` aufrufen, Super-Admin-Konto (E-Mail + Passwort) und Mailversand
   festlegen – fertig. Bestehende Installationen der Version 1 werden dort mit dem bisherigen Admin-Passwort umgestellt.

Voraussetzung: PHP ≥ 7.4 (empfohlen 8.x), Apache. Details, Sicherheit und Unterschiede zur Node-Edition:
[`docs/WEBSPACE.md`](docs/WEBSPACE.md); Kurzanleitung für den Upload liegt als `LIESMICH.txt` im ZIP.

## Schnellstart (Entwicklung / Node-Edition)

```bash
npm install
npm run dev          # http://localhost:3000 – eingebettetes PostgreSQL (PGlite) in .data/pglite
npm test             # Vitest: Engine, Service-Schicht, Rechte, PHP-API
```

Ohne `DATABASE_URL` läuft die App mit eingebettetem PostgreSQL (PGlite). Den ersten Super-Admin legt
`ADMIN_EMAIL`/`ADMIN_PASSWORD` beim Start an (oder `npm run user:create-admin -- --email … --password …`).
Für den Produktivbetrieb:

```bash
DATABASE_URL=postgres://… APP_URL=https://hcp.example.de SESSION_SECRET=… ADMIN_EMAIL=… ADMIN_PASSWORD=… \
  SMTP_URL=smtp://user:pass@mail.example.de:587 npm run build && npm start
# oder
docker compose up --build   # Variablen in .env
```

Alle Variablen: siehe [`.env.example`](.env.example). Migrationen (`drizzle/`) werden beim ersten Datenbankzugriff
automatisch angewendet – auch die Übernahme der Benutzer aus Version 1 (`0002_members_v2.sql`: Spieler → `USER`,
Golfplatzpflege → `ADMIN`).

### Supabase

`DATABASE_URL` auf den Connection-String (Session-Pooler) setzen, ggf. `DATABASE_SSL=true`. Weitere Konfiguration ist nicht nötig.

## Befehle

| Befehl | Zweck |
|---|---|
| `npm run dev` / `build` / `start` | Entwicklung, Produktions-Build, Start |
| `npm run build:webspace` | Webspace-Edition bauen und als ZIP packen (Startdaten aus `data/seed/`; `--seed <datei>` bzw. `--no-seed`) |
| `npm test` | Vitest (Engine, Platzdaten, Importer, Repository mit PGlite, Service-Schicht, Rechte, PHP-API mit `php -S`) |
| `npm run test:e2e` | Browser-Abläufe A–K (Playwright) gegen eine laufende Instanz, siehe `e2e/flows.cjs` |
| `npm run user:create-admin` | Super-Admin anlegen bzw. Passwort setzen (Node-Edition) |
| `TEST_DATABASE_URL=… npm test` | Repository-Tests gegen echtes PostgreSQL |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run db:generate` | neue SQL-Migration aus `src/db/schema.ts` erzeugen |
| `npm run db:check` | Datenbankverbindung und Migrationen prüfen |
| `npm run db:seed` | mitgelieferte Golfplatz-Startdaten (`data/seed/`) übernehmen – vorhandene Anlagen bleiben unverändert |
| `npm run import:bavaria -- [--apply]` | Bayern-Importer (siehe unten) |

## Golfplatzdatenbank Bayern

**Harte Regel:** CR- und Slope-Werte werden nie erfunden, geschätzt oder abgeleitet (kein CR₉ = CR₁₈/2, kein Slope₉ = Slope₁₈).
Fehlende Werte bleiben `NULL`; nicht verifizierte Ratings werden angezeigt, aber nicht automatisch für die Berechnung verwendet.

Befüllung:

1. **Discovery** – `npm run import:bavaria` durchläuft die BGV-Clubübersicht (alle Seiten), normalisiert Namen, dedupliziert,
   ermittelt Websites (`--details`) und schreibt mit `--apply` in die Datenbank. Gefundene CR/Slope-Angaben auf Club-Websites
   (`--scan-websites`) landen ausschließlich als ungeprüfte Prüf-CSV in `data/reports/`.
   Alternativ: `--html-dir <dir>` (gespeicherte Seiten) oder `--csv <datei>` (Discovery-Liste).
2. **Ratings** – nach Prüfung gegen die offizielle Quelle (DGV, Club/Scorekarte) per CSV-Import im Admin-Bereich
   (Vorlage: [`data/templates/golfplaetze-import-vorlage.csv`](data/templates/golfplaetze-import-vorlage.csv)) oder per Formular.

Mitgelieferte Startdaten: [`data/seed/golfplaetze-bayern.json`](data/seed/golfplaetze-bayern.json) (derzeit Allgäuer
Golf- und Landclub Ottobeuren, Ratings noch nicht verifiziert). Aktueller Stand und Einschränkungen:
[`docs/DATENSTATUS-BAYERN.md`](docs/DATENSTATUS-BAYERN.md).

## Konten, Anmeldung und Sicherheit

- **Registrieren** (abschaltbar) mit E-Mail-Bestätigung; der Admin kann Konten auch direkt anlegen (Einladung per
  E-Mail oder temporäres Passwort mit Pflicht zum Wechsel). Selbst registrierte Konten erhalten immer die Rolle `USER`.
- **Sitzung:** signiertes HttpOnly-Cookie (`SameSite=Lax`, `Secure` bei HTTPS, 14 Tage gleitend); kein Token in
  `localStorage`/`sessionStorage`. Änderungen brauchen zusätzlich den CSRF-Token (Header `X-CSRF-Token`, nur im
  Arbeitsspeicher). Passwortwechsel meldet alle Geräte ab.
- **Passwörter:** nur als Hash (Node: scrypt, PHP: `password_hash`), nie im Log. Anmeldung, Registrierung,
  „Passwort vergessen“ und Bestätigungslinks sind je IP und Konto begrenzt; unbekannte Konten erhalten dieselbe
  Antwort wie bekannte.
- **Deaktivierte/gesperrte Konten** können sich nicht anmelden, laufende Sitzungen enden sofort; die Daten bleiben
  erhalten. Nur ein Super-Admin löscht endgültig; der letzte Super-Admin ist geschützt.
- **Seitenschutz:** `/member` und `/admin` werden vor der Auslieferung geprüft (Node: `src/proxy.server.ts` und
  Server-Layouts; Webspace: `gate.php` über `.htaccess`) – der Browser bekommt Admin-Seiten ohne Berechtigung gar nicht.
- **Mail:** Node über `SMTP_URL` (oder `MAIL_MODE=outbox|log|off`), Webspace über PHP `mail()` oder SMTP (Einstellungen
  im Admin-Bereich bzw. in `install.php`). Links in Mails basieren auf `APP_URL` bzw. der Website-Adresse aus den
  Einstellungen – nie auf dem Host-Header.

API beider Editionen: [`docs/openapi.yaml`](docs/openapi.yaml). Das Frontend spricht nur über den Adapter
`src/lib/api` mit dem Backend.

## Dokumentation

- [`docs/ARCHITEKTUR.md`](docs/ARCHITEKTUR.md) – Aufbau, Bereiche, API-Adapter, Rechte, Regel-Engine, Datenmodell, Rundungspunkte
- [`docs/COMMUNITY.md`](docs/COMMUNITY.md) – Community, Ranking, Privatsphäre, Golfstatistik (Definitionen, Speicherung, Grenzen)
- [`docs/MOBILE-RUNDENEINGABE.md`](docs/MOBILE-RUNDENEINGABE.md) – mobile Scorecard: Ablauf, Offline-Entwurf, Wiederaufnahme, keine doppelten Runden, PWA
- [`docs/openapi.yaml`](docs/openapi.yaml) – API (Auth, Mitglied, Community, Admin)
- [`docs/WEBSPACE.md`](docs/WEBSPACE.md) – Webspace-Edition: Installation, Update, Sicherheit, Aufbau
- [`docs/ABSCHLUSS-CHECK.md`](docs/ABSCHLUSS-CHECK.md) – Checkliste aus der Spezifikation mit Status
- [`docs/DATENSTATUS-BAYERN.md`](docs/DATENSTATUS-BAYERN.md) – Datenstand Golfplätze
- In der App: **Rechenregeln & Methodik** (`/methodik`), direkt aus der Regelkonfiguration erzeugt

## Technik

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS 4 · Drizzle ORM · PostgreSQL/Supabase bzw. PGlite ·
Recharts · Lucide · Zod · Vitest · Playwright · jsPDF · nodemailer · Inter.
