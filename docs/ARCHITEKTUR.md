# Architektur

## Schichten

```
src/rules/whs/de/2026/   Regelversion DE/DGV 2026 – Konfiguration + reine Rechenfunktionen
src/rules/whs/registry   Verfügbare Regelversionen (neue Versionen/Länder hier registrieren)
src/lib/whs/             Engine: Einzelrunde, chronologischer Scoring Record, Simulation, Statistik, Texte
src/lib/courses/         Platzdaten-Logik: Rating-Auswahl, Suche, Duplikate, CSV, Qualität, Validierung
src/lib/importer/        Parser der BGV-Clubübersicht (Discovery)
src/lib/rounds/          Wizard-Formularzustand → unveränderliche Runde
src/lib/store/           Local Mode (Browser-Speicher), Import/Export-Schema
src/lib/export/          CSV/PDF-Export, Runden-CSV-Import
src/db/                  Drizzle-Schema, Client (PostgreSQL oder PGlite)
src/server/              Repositories (Platzdaten, Sync), Admin-Schutz
src/app/                 Next.js-Seiten, API-Routen, Server Actions
src/components/          UI
scripts/                 Bayern-Importer, DB-Check
tests/                   Vitest
```

Die Berechnungslogik hat keine Abhängigkeit zu React oder Next.js. Die UI ruft ausschließlich `calculateScoringRecord`,
`evaluateRound`, `simulateRound`, `analyzeTarget` usw. auf. Texte zu Codes stehen in `src/lib/whs/messages.ts`.

## Regelversionen

`WhsRuleSet` (`src/rules/whs/types.ts`) ist der Vertrag einer Regelversion. `DE_2026` bündelt alle Zahlenwerte
(`config.ts`: WHS-Tabelle, PCC-Tabelle 9 Loch, Faktoren des erwarteten 9-Loch-Differentials, ESR-Schwellen, Cap-Grenzen,
26,5-Schwelle, Rundungsmodus …). Jede Zahl steht genau einmal im Code; die Methodik-Seite liest dieselbe Konfiguration.

Eine Regelversion 2027 entsteht durch Kopie von `config.ts` mit geänderten Werten und – nur wo nötig – überschriebenen
Funktionen, registriert in `registry.ts`. Das Spielerprofil speichert `ruleSet: { country, version }`.

Dateien je Regelversion (Spezifikation §64): `indexCalculation.ts`, `nineHoleCalculation.ts`, `scoreDifferential.ts`,
`exceptionalScore.ts`, `cap.ts`, `courseHandicap.ts`, `gbE.ts`, `rounding.ts` sowie `brake265.ts`, `lowHandicapIndex.ts`,
`partialRound.ts`, `stableford.ts`, `relevance.ts`.

## Chronologischer Algorithmus (`src/lib/whs/scoringRecord.ts`)

1. Runden sortieren (Datum, Reihenfolge am Tag, Erfassung).
2. Für jeden Spieltag: Start-HCPI = aktueller HCPI zu Tagesbeginn.
3. Jede Runde des Tages bewerten (`evaluateRound`) – Course Handicap, GBE, Score Differential (9 Loch: erwartetes
   Differential mit dem Start-HCPI), ESR gegen den Start-HCPI.
4. Relevante Ergebnisse an den Record anhängen; ESR-Abzüge des Tages (addiert) auf die jüngsten 20 anwenden
   (`originalSD` bleibt, `adjustedSD` ändert sich).
5. Revision berechnen: Fenster (≤ 20) → WHS-Tabelle → kalkulierter HCPI (max. 54,0) → Low HCPI (ab 20 Ergebnissen,
   365 Tage aus der HCPI-Historie) → Soft Cap → Hard Cap → 26,5-Bremse → aktueller HCPI (gültig ab Folgetag).
6. Optional: offiziell übernommener HCPI (Import) überschreibt die Rekonstruktion für diesen Tag.
7. Aufhebung der 26,5-Bremse an einem Tag ohne Runde erzeugt eine eigene Revision (gültig ab diesem Tag).

## Rundungspunkte (zentral in `rounding.ts`)

| Wert | Rundung | Funktion |
|---|---|---|
| Score Differential (18 Loch, 9 Loch gespielt) | 0,1 | `roundScoreDifferential` |
| Erwartetes 9-Loch-Differential | 0,1 | `roundScoreDifferential` |
| HCPI / 2 für 9-Loch-Course-Handicap | 0,1 | `roundWHS(…, 1)` |
| Course Handicap | ganze Zahl (erst am Ende) | `roundCourseHandicap` |
| Playing Handicap | ganze Zahl | `roundPlayingHandicap` |
| Handicap Index (Durchschnitt + Anpassung), Soft Cap | 0,1 | `roundHandicapIndex` |

Modus: kaufmännisch (.5 vom Nullpunkt weg), mit relativer Toleranz gegen Gleitkomma-Artefakte (z. B. 2,3 + 0,05).
Summen bereits gerundeter Werte werden nur von Gleitkommarauschen befreit (`normalizeDecimal`) – keine Doppelrundung.

## Datenmodell

```
courses        Anlage (Name, offizieller Name, Club, Ort, PLZ, Adresse, Region, Koordinaten, Website,
               offizielle Quelle, BGV-URL, Club-ID, Anlagentyp inkl. DRIVING_RANGE, aktiv, verifiziert, Prüfdatum)
layouts        Platz/Layout (9_HOLE, 18_HOLE, 27_HOLE, 36_HOLE, SHORT_COURSE; Kombination A-B …)
rating_sets    je Geschlecht, Abschlag, 9/18 Loch, Front/Back Nine, Gültig ab/bis; Par, CR, Slope, Länge;
               Quelle (Typ, URL), geprüft am, verifiziert, Vertrauen, aktiv
holes          Loch: Par, Stroke Index, Längen, optional je Abschlag/Geschlecht
change_log     Protokoll aller Änderungen (Admin, CSV-Import, Importer)
import_runs    Importläufe
player_profiles, rounds   optionale anonyme Synchronisation
```

Constraints in der Datenbank: Slope 55–155, Par 3–6 je Loch, `verified` nur mit CR, Slope, Par und Quelle.
Driving Ranges können keine Layouts erhalten (Repository-Regel).

Eine gespeicherte Runde enthält einen **Snapshot** des verwendeten Ratings (CR, Slope, Par, Abschlag, Layout, Quelle,
Gültigkeit). Spätere Änderungen an den Platzdaten verändern historische Runden nicht. Die Rating-Auswahl im Wizard
wählt das zum Spieldatum gültige Rating (`selectRatingSet`).

## Diagrammfarben

HCPI-Verlauf: Aktueller HCPI `#1f7a4d`, Low HCPI `#2a78d6`, kalkulierter HCPI `#eb6834` (dunkel: `#3fa56f`, `#3987e5`,
`#d95926`), Score Differentials neutral grau. Mit dem Palette-Validator geprüft; Grün/Orange liegt für Protanopie im
Grenzbereich (ΔE 6,5), daher Legende, Endbeschriftung und Tabellenansicht als zusätzliche Kodierung.

## Sicherheit / Datenschutz

- Spielerdaten bleiben standardmäßig im Browser (Local Mode); keine personenbezogenen Pflichtangaben.
- Synchronisation: anonymes Profil, 192-Bit-Schlüssel, gespeichert wird nur der SHA-256-Hash; Vergleich zeitkonstant.
- Admin: `ADMIN_PASSWORD` → HttpOnly-/SameSite-Strict-Cookie (HMAC); jede Server Action und API prüft die Berechtigung;
  in Produktion ohne Passwort gesperrt.
