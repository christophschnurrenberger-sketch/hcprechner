# Golf HCP Rechner – WHS 2026 (Bayern)

Webanwendung zur Berechnung und Simulation des **Handicap Index (HCPI)** nach dem World Handicap System in der
deutschen Ausprägung (DGV, Regelversion 2026) – mit Golfplatzdatenbank für Bayern.

Kein altes EGA-System: keine Stableford-Pufferzonen, keine Vorgabenklassen, keine 0,1/0,2-Anpassungen.
Zentrale Bewertungsgröße ist das **Score Differential**.

## Funktionsumfang

| Bereich | Inhalt |
|---|---|
| Berechnung | Score Differential, 9-Loch-Methode (gespielt + erwartet, DGV-PCC-Tabelle), Course Handicap 9/18, Netto-Doppelbogey/GBE, WHS-Tabelle (3–20 Ergebnisse), ESR rückwirkend (original/adjusted SD), Low HCPI (365 Tage aus HCPI-Historie), Soft/Hard Cap, 26,5-Bremse, Tageslogik, abgebrochene Runden 10–17, Stableford, Ergebnisarten (NA, TA, NRa/NRo, DQa/DQo, Penalty) |
| Chronologie | Vollständige Rekonstruktion: jede Runde mit dem HCPI zu Beginn ihres Spieltags; alle Runden eines Tages mit demselben Start-HCPI |
| Transparenz | Rechenweg je Runde (GBE-Tabelle, Formeln mit Zahlen, HCPI-Kette Tabelle → Durchschnitt → Low HCPI → Soft/Hard Cap → Bremse), Debug-Objekt |
| Oberfläche | Dashboard, Runde erfassen (Wizard, mobile Scorekarte Loch für Loch), Meine Runden, Scoring Record, Golfplätze, HCP-Simulator (Was-wäre-wenn, Ziel-HCPI), GBE-Rechner, Statistiken inkl. Platzanalyse, Einstellungen, Admin, Methodik |
| Golfplatzdaten | Relationales Modell Anlage → Platz/Layout → Rating-Set (Abschlag, Geschlecht, 9/18, Front/Back, Gültigkeit, Quelle, Prüfdatum, verifiziert) → Löcher; Suche, öffentliche SEO-Seiten, CSV-Import mit Vorschau, Datenqualität, Duplikate, Änderungsprotokoll, Bayern-Importer |
| Daten des Spielers | Local Mode (Browser-Speicher, kein Konto), Export CSV/JSON/PDF, Runden-CSV-Import, optionale anonyme Synchronisation |

## Schnellstart

```bash
npm install
npm run dev          # http://localhost:3000 – eingebettetes PostgreSQL (PGlite) in .data/pglite
npm test             # 296 Tests (231 für die WHS-Engine)
```

Ohne `DATABASE_URL` läuft die App mit eingebettetem PostgreSQL (PGlite). Für den Produktivbetrieb:

```bash
DATABASE_URL=postgres://user:pass@host:5432/db ADMIN_PASSWORD=… npm run build && npm start
# oder
ADMIN_PASSWORD=… docker compose up --build
```

Alle Variablen: siehe [`.env.example`](.env.example). Migrationen (`drizzle/`) werden beim ersten Datenbankzugriff automatisch angewendet.

### Supabase

`DATABASE_URL` auf den Connection-String (Session-Pooler) setzen, ggf. `DATABASE_SSL=true`. Weitere Konfiguration ist nicht nötig.

## Befehle

| Befehl | Zweck |
|---|---|
| `npm run dev` / `build` / `start` | Entwicklung, Produktions-Build, Start |
| `npm test` | Vitest (Engine, Platzdaten, Importer, Repository mit PGlite) |
| `TEST_DATABASE_URL=… npm test` | Repository-Tests gegen echtes PostgreSQL |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run db:generate` | neue SQL-Migration aus `src/db/schema.ts` erzeugen |
| `npm run db:check` | Datenbankverbindung und Migrationen prüfen |
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

Aktueller Stand und Einschränkungen: [`docs/DATENSTATUS-BAYERN.md`](docs/DATENSTATUS-BAYERN.md).

## Dokumentation

- [`docs/ARCHITEKTUR.md`](docs/ARCHITEKTUR.md) – Aufbau, Regel-Engine, Datenmodell, Rundungspunkte
- [`docs/ABSCHLUSS-CHECK.md`](docs/ABSCHLUSS-CHECK.md) – Checkliste aus der Spezifikation mit Status
- [`docs/DATENSTATUS-BAYERN.md`](docs/DATENSTATUS-BAYERN.md) – Datenstand Golfplätze
- In der App: **Rechenregeln & Methodik** (`/methodik`), direkt aus der Regelkonfiguration erzeugt

## Technik

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS 4 · Drizzle ORM · PostgreSQL/Supabase bzw. PGlite ·
Recharts · Lucide · Zod · Vitest · jsPDF.
