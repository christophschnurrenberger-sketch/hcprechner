# Architektur

## Schichten

```
src/rules/whs/de/2026/   Regelversion DE/DGV 2026 – Konfiguration + reine Rechenfunktionen
src/rules/whs/registry   Verfügbare Regelversionen (neue Versionen/Länder hier registrieren)
src/lib/whs/             Engine: Einzelrunde, chronologischer Scoring Record, Simulation, Statistik, Texte
src/lib/stats/           Golfstatistik (getrennt von WHS): Lochdaten + Prüfung, Runden-/Mehrrunden-Statistik, Hinweise
src/lib/community/       Community: Einstellungen/Policy (Opt-in), Projektion „was andere sehen“, Ranking
src/lib/member/          Service-Schicht Mitglied: Dokument (Profil, Runden, Entwürfe, Einstellungen), Runde prüfen
                         und speichern, HCPI/Verlauf/Rechenweg (DTOs), Import, Admin-Sichten, Regelwerk-Info
src/lib/api/             API-Adapter: client.ts (Schnittstellen + lazy `api`), node.ts, webspace.ts, transport.ts, types.ts
src/lib/auth/            Rollen und Berechtigungen (permissions.ts), Formularvalidierung, sichere Weiterleitung
src/lib/courses/         Platzdaten-Logik: Rating-Auswahl, Suche, Duplikate, CSV, Qualität, Validierung,
                         JSON-Datensatz-Operationen (dataset.ts), Datenzugriff im Browser (client.ts)
src/lib/importer/        Parser der BGV-Clubübersicht (Discovery)
src/lib/rounds/          Wizard-Formularzustand → unveränderliche Runde
src/lib/export/          CSV/PDF-Export, Runden-CSV-Import
src/lib/runtime.ts       Build-Variante (node | webspace), Basispfad
src/db/                  Drizzle-Schema, Client (PostgreSQL oder PGlite)
src/server/              Node-Backend: Sitzung, Sicherheit, Benutzer, Mitglieder-Dokumente, Audit, Mail, Einstellungen,
                         Platzdaten-Repository, Bootstrap des Super-Admins, community.ts / communityAdmin.ts
                         (materialisierte Community-Tabellen, Ranking per SQL, Moderation)
src/proxy.server.ts      Node: leitet /member und /admin ohne Sitzungs-Cookie zu /login
src/app/(public)/        öffentliche Seiten und Anmeldung
src/app/member/          Mitgliederbereich (Layout: MemberShell)
src/app/admin/           Admin-Bereich (Layout: AdminShell); (courses)/ = Golfplatzverwaltung
src/components/          UI: layout/ (Shells), session/, ui/ (Feedback, Dialoge), auth/, member/, admin/, courses/
webspace/php/            install.php, gate.php, api/*.php (auth, me, community, admin, courses; _community.php =
                         PHP-Fassung der Projektion, per Paritätstest abgeglichen), Schutzdateien
data/seed/               mitgelieferte Golfplatz-Startdaten (JSON-Datensatz)
scripts/                 Bayern-Importer, DB-Check, Startdaten, create-admin, build-webspace.mjs
tests/                   Vitest (Engine, Service-Schicht, Rechte, PHP-API)   e2e/  Browser-Abläufe A–K
```

Die Berechnungslogik hat keine Abhängigkeit zu React oder Next.js. React-Komponenten rechnen nicht: Sie importieren
nur `api` und die DTO-Typen aus `src/lib/api`. Texte zu Codes stehen in `src/lib/whs/messages.ts`.

## Drei Bereiche

| Bereich | Pfade | Layout | Schutz |
|---|---|---|---|
| Öffentlich | `/`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`, `/golfplaetze`, `/methodik`, `/hilfe`, `/datenschutz`, `/impressum` | `PublicShell` | – |
| Mitglied | `/member`, `/member/hcp`, `/member/rounds`, `/member/rounds/new`, `/member/rounds/view?id=`, `/member/rounds/stats?id=`, `/member/stats`, `/member/community`, `/member/community/member?id=`, `/member/community/round?member=&round=`, `/member/courses`, `/member/profile`, `/member/welcome`, `/member/password`, `/member/import`, `/member/tools` | `MemberShell` (Desktop-Navigation, mobile Leiste unten, „+ Runde“) | angemeldet |
| Admin | `/admin`, `/admin/users`, `/admin/users/view?id=`, `/admin/users/impersonate?id=`, `/admin/rounds`, `/admin/community`, `/admin/courses`, `/admin/ratings`, `/admin/sources`, `/admin/data-quality`, `/admin/duplicates`, `/admin/import`, `/admin/changes`, `/admin/rules`, `/admin/system`, `/admin/logs`, `/admin/permissions`, `/admin/settings`, `/admin/search` | `AdminShell` (Seitenleiste nach Berechtigung, globale Suche) | `admin.access` + Berechtigung je Seite/Aktion |

Detailseiten verwenden Query-Parameter (`?id=`), weil die Webspace-Edition ein statischer Export ist; die Node-Edition
nutzt dieselben Seiten (Ausnahme: `/admin/courses/<id>` und die SEO-Seiten `/golfplaetze/<region>/<slug>`).

Seitenschutz vor der Auslieferung: Node `proxy.server.ts` (Cookie vorhanden?) + `layout.server.tsx` (`pageUser()`
prüft Sitzung, Status und Berechtigung); Webspace `.htaccess` → `gate.php?area=member|admin` (prüft die Sitzung und
liefert erst dann die statische Seite). Ohne Anmeldung → `/login?next=…`, Admin-Bereich ohne Berechtigung →
`/member?denied=admin`. Die eigentliche Prüfung passiert in jeder API-Aktion; die Shells blenden nur aus, was die
API ohnehin verweigert.

## Rollen und Berechtigungen

`src/lib/auth/permissions.ts` (PHP: identische Tabelle in `api/_lib.php`, per Test abgeglichen):

| Berechtigung | USER | SUPPORT | ADMIN | SUPER_ADMIN |
|---|:-:|:-:|:-:|:-:|
| admin.access, users.read, rounds.read, courses.read, logs.read, system.read, rules.read | | ✓ | ✓ | ✓ |
| community.read | | ✓ | ✓ | ✓ |
| users.write, users.impersonate, courses.write, import, community.moderate | | | ✓ | ✓ |
| users.roles, users.delete, settings.write | | | | ✓ |

Zusätzlich: Ein Admin verwaltet nur Konten mit niedrigerer Rolle (`canManageUser`, Super-Admin alle außer dem eigenen);
Rollen vergibt nur ein Super-Admin, und niemand ändert die eigene Rolle (`canAssignRole`). Der letzte aktive Super-Admin kann weder herabgestuft, deaktiviert
noch gelöscht werden. Die Rolle stammt immer aus der Sitzung des Servers (`/api/auth/me` bzw. `auth.php?action=me`).

## API-Adapter

```
UI ──► api.auth / api.member / api.admin   (src/lib/api/client.ts, lazy Proxy)
         ├─ node.ts      ──► /api/auth/*, /api/me/*, /api/admin/*   (Route Handler, Berechnung auf dem Server)
         └─ webspace.ts  ──► api/auth.php, api/me.php, api/admin.php (PHP: Auth, Rechte, Speicherung, Audit, Mail)
```

`transport.ts` sendet `credentials: "same-origin"`, hält den CSRF-Token nur im Arbeitsspeicher, wandelt Fehler in
`ApiError { code, message, fieldErrors }` und meldet einen Sitzungsverlust (`onSessionLost` → `/login?expired=1`).
Beschreibung aller Endpunkte: `docs/openapi.yaml`.

**Berechnung:** Die Node-Edition rechnet in den Route Handlern mit der Service-Schicht `src/lib/member` und liefert
fertige DTOs (HCPI, Verlauf, Rechenweg). PHP kann kein TypeScript ausführen – in der Webspace-Edition ruft deshalb der
Adapter dieselbe Service-Schicht im Browser auf. PHP bleibt maßgeblich für alles Sicherheitsrelevante: Sitzung, Rolle,
Filter nach `user_id`, Strukturprüfung jeder gespeicherten Runde (`me_check_round`), Revisionsprüfung (409 bei
veraltetem Stand), Audit-Log und Mail. Die UI ist in beiden Fällen identisch und sieht nur DTOs.

## Build-Varianten

| | Node-Edition (`npm run build`) | Webspace-Edition (`npm run build:webspace`) |
|---|---|---|
| Ausgabe | Next.js-Server (`output: "standalone"`) | statische Dateien (`output: "export"`) + PHP-Skripte, ZIP |
| Konten, Sitzung | Tabellen `users`, `auth_tokens`, scrypt, Cookie `hcp_session` (HMAC mit `SESSION_SECRET`) | `data/users.php`, `password_hash`, Cookie `hcp_session` (HMAC mit Secret aus `data/config.php`) |
| Mitgliederdaten | `member_data` (JSON-Dokument je Benutzer, Revision, Zeilensperre) | `data/userdata/<id>.php` (gleiche Struktur, Revision, Dateisperre) |
| Audit/Mail | `audit_log`, `mail_log`, `error_log` | `data/audit/`, `data/logs/`, `data/mail-outbox/` |
| Golfplatzdaten | PostgreSQL/PGlite über `src/server/courseRepository.ts`, Server Actions | JSON-Datensatz über `src/lib/courses/dataset.ts` + `admin.php?action=courses-save` |
| Seitenschutz | `proxy.server.ts` + Server-Layouts | `gate.php` + `.htaccess` |

Gemeinsam: alle Seiten außer `*.server.tsx`/`*.static.tsx`, die komplette Engine und Service-Schicht, die Admin-Formulare
(`src/components/admin/`, Schreibzugriff über den `AdminBackend`-Kontext), Validierung (Zod) und Suchlogik. Die Pfade
erzeugt ausschließlich `src/lib/courses/paths.ts`. Details: `docs/WEBSPACE.md`.

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
users          Konto: E-Mail, Name, Rolle, Status (ACTIVE/DISABLED/LOCKED), Passwort-Hash, E-Mail bestätigt,
               Passwort geändert am (bindet Sitzung und CSRF), Pflicht zum Passwortwechsel, letzte Anmeldung
auth_tokens    Einmal-Token (E-Mail bestätigen, Passwort zurücksetzen bzw. Einladung) – nur als SHA-256-Hash
member_data    Mitglieder-Dokument je Benutzer (Profil, Runden mit Status COMPLETED/DELETED, Entwürfe,
               Favoriten/Heimatplatz), Revision
audit_log      Zeitpunkt, Admin (actor_id, actor_name), betroffener Benutzer, Aktion, Entität, alter/neuer Wert
community_profiles   materialisiertes Community-Profil je Mitglied (publicId, Anzeigename, Freigaben, HCPI, Heimatplatz,
               Region, Spielleistung nur bei Statistik-Freigabe) – Grundlage für Ranking und Mitgliederliste
public_rounds  freigegebene Runden in ihrer Stufe (BASIC/FULL) als fertige Projektion
round_statistics  Statistik je Runde (auch privat) für Admin-Aggregate und Datenqualität – ohne Notizen
ranking_snapshots Tagesstände (Datum, Bereich, Mitglied, Position, HCPI) für den Trend
user_avatars   Profilbilder (JPEG/PNG/WebP, höchstens 150 KB), nur über die geschützte API
app_settings, mail_log, error_log   Einstellungen (inkl. Sitzungs-Secret, falls nicht per Umgebung), Mail- und Fehlerprotokoll
player_profiles, rounds, app_users, app_user_data   Tabellen der Version 1 (werden von 0002 übernommen, nicht mehr beschrieben)
```

Constraints in der Datenbank: Slope 55–155, Par 3–6 je Loch, `verified` nur mit CR, Slope, Par und Quelle.
Driving Ranges können keine Layouts erhalten (Repository-Regel).

Eine gespeicherte Runde enthält einen **Snapshot** des verwendeten Ratings (CR, Slope, Par, Abschlag, Layout, Quelle,
Gültigkeit). Ein ungeprüftes Rating wird nur übernommen, wenn der Spieler genau diese Werte im Assistenten mit seiner
Scorekarte bestätigt hat (`confirmRating`, im Snapshot `playerConfirmed: true`); weichen die hinterlegten Werte
inzwischen ab, lehnt das Backend mit `RATING_CHANGED` ab. Spätere Änderungen an den Platzdaten verändern historische Runden nicht. Die Rating-Auswahl im Wizard
wählt das zum Spieldatum gültige Rating (`selectRatingSet`).

## Diagrammfarben

HCPI-Verlauf: Aktueller HCPI `#1f7a4d`, Low HCPI `#2a78d6`, kalkulierter HCPI `#eb6834` (dunkel: `#3fa56f`, `#3987e5`,
`#d95926`), Score Differentials neutral grau. Mit dem Palette-Validator geprüft; Grün/Orange liegt für Protanopie im
Grenzbereich (ΔE 6,5), daher Legende, Endbeschriftung und Tabellenansicht als zusätzliche Kodierung.

Golfstatistik (`/member/stats`): GIR `var(--series-current)` und Fairways `var(--series-low)` auf einer %-Achse,
Fairways zusätzlich gestrichelt, mit Legende und Tabellenansicht (validiert hell/dunkel: ΔE ≥ 20,9). Schlagzahl-Verlauf
getrennt nach 9 und 18 Loch (nie eine gemeinsame Linie), Putts pro Loch als Einzelserie ohne Legende.

Das Mitglieder-Dokument bleibt die einzige Quelle; `syncCommunity(userId)` baut die Community-Tabellen nach jeder
Änderung in einer Transaktion neu auf (Migration `0003_community.sql`). Eine Runde (`MemberRound`) trägt neben den
unveränderten WHS-Feldern `visibility`, `holeStats`, `moderation` und `computed.stats`. Details: `docs/COMMUNITY.md`.

## Sicherheit / Datenschutz

- Datentrennung: Mitglieder-Endpunkte lesen die Benutzer-ID ausschließlich aus der Sitzung; es gibt keinen Parameter
  für fremde IDs. Admin-Endpunkte liefern personenbezogene Daten nur mit `users.read`/`rounds.read` und protokollieren
  den Zugriff (`USER_DATA_VIEWED`, `IMPERSONATION_VIEW`). Die Benutzeransicht ist nur lesend und im UI deutlich markiert.
- Sitzung: HttpOnly-Cookie, CSRF-Token (HMAC über Benutzer-ID und Passwortstand) im Header `X-CSRF-Token`, Node prüft
  zusätzlich den `Origin`. Kein Token im Web Storage; der Browser speichert nur unkritische Anzeige-Einstellungen.
- Passwörter nur als Hash, Mindestlänge 8, Anmeldung mit konstantem Zeitverhalten (Dummy-Hash für unbekannte Konten),
  Ratenbegrenzung je IP und Konto; Antworten auf „Passwort vergessen“/„Bestätigung erneut senden“ verraten nicht, ob ein
  Konto existiert.
- Keine Geheimnisse im Browser: SMTP-Passwort, Sitzungs-Secret und Admin-Daten verlassen den Server nicht; die
  Einstellungsseite zeigt nur „gesetzt/nicht gesetzt“. Keine hartkodierten URLs – Links aus `APP_URL` bzw. `siteUrl`.
- Community: alles Opt-in; die Projektion (`src/lib/community/projection.ts`, PHP `hcp_cm_project`) ist die einzige
  Stelle, die Felder für andere Mitglieder freigibt – nie E-Mail, interne ID, private/ausgeblendete Runden oder nicht
  freigegebene Notizen. Admins können Freigaben nur ausschalten und Runden ausblenden (protokolliert), nie einschalten.
- Fehler: strukturiert (`{ error: { code, message, fieldErrors } }`), Stacktraces nur im Serverprotokoll.
