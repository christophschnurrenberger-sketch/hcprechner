# Webspace-Edition (PHP-Webspace, FTP-Upload)

Die Webspace-Edition macht den Golf HCP Rechner auf jedem klassischen PHP-Webspace lauffähig – ohne Node.js,
ohne Datenbank, ohne Kommandozeile. Hochladen, `install.php` aufrufen, fertig.

## Installation

| Schritt | Was tun |
|---|---|
| 1 | ZIP entpacken → Ordner `golf-hcp-rechner/` |
| 2 | Per FTP hochladen: den Ordner (→ `https://domain.de/golf-hcp-rechner/`, darf umbenannt werden) **oder** seinen Inhalt in die Domain-Wurzel. Versteckte `.htaccess`-Dateien mit hochladen. |
| 3 | `…/install.php` im Browser öffnen, Admin-Passwort (≥ 8 Zeichen) festlegen, „Installieren“ |

Voraussetzungen: PHP ≥ 7.4 (empfohlen 8.x) mit `json`, `session`, `random_bytes`, `password_hash` (Standard);
Apache (für `.htaccess`; ohne `.htaccess` funktioniert die Anwendung ebenfalls, nur ohne eigene 404-Seite und Cache-Header).
`install.php` prüft alle Voraussetzungen und zeigt fehlende rot an.

Was `install.php` tut:

1. Installationsordner aus der eigenen URL ermitteln (änderbar), z. B. `/hcp` oder `""` für die Domain-Wurzel.
2. Den beim Build eingesetzten Platzhalter `/__HCP_BASE__` in allen Seiten-, Skript- und Stildateien durch den Ordner
   ersetzen (vorher Schreibrechte aller Dateien prüfen; `index.html` zuletzt, sie dient als Kennzeichen „fertig“).
3. `data/config.php` anlegen: Passwort-Hash (`password_hash`), Basispfad, Synchronisation an/aus.
4. `.htaccess` schreiben (eigener, markierter Block; fremde Einträge bleiben erhalten): 404-Seite, MIME-Typen,
   Sicherheits-Header, Kompression. Liefert der Server danach HTTP 500 (Hoster erlaubt einzelne Anweisungen nicht),
   stellt die Erfolgsseite automatisch auf eine minimale Fassung um.
5. Bei Installation in der Domain-Wurzel: `robots.txt` mit Verweis auf `sitemap.php`.

Solange die Installation nicht abgeschlossen ist, leitet jede Seite automatisch zu `install.php` weiter.

## Update

Neue ZIP-Datei über die alte hochladen (der Ordner `data/` wird nicht überschrieben – er enthält im ZIP nur
Schutzdateien) und `install.php` erneut aufrufen. Da die neuen Dateien wieder den Platzhalter enthalten, erkennt
`install.php` die Aktualisierung und verlangt nur das bestehende Admin-Passwort.

## Aufbau

```
golf-hcp-rechner/
├── index.html, runden/, golfplaetze/, admin/, …   statischer Next.js-Export (alle Seiten)
├── _next/static/                                 JS/CSS (mit .htaccess für dauerhaftes Caching)
├── golfplaetze-daten.json                        Startdaten der Golfplatzdatenbank (aus data/seed/, z. B. Ottobeuren)
├── install.php                                   Installation / Update
├── sitemap.php                                   Sitemap inkl. Golfanlagen
├── api/
│   ├── _lib.php                                  gemeinsame Funktionen
│   ├── courses.php                               veröffentlichter Golfplatz-Datensatz (lesen)
│   ├── admin.php                                 Admin-Anmeldung (Haupt-Passwort oder Co-Admin), Datensatz, Benutzerverwaltung
│   ├── account.php                               Benutzerkonten: Anmeldung, Passwort, Runden laden/speichern
│   └── sync.php                                  optionale anonyme Synchronisation
└── data/                                         Serverdaten (per .htaccess gesperrt, Dateien zusätzlich PHP-geschützt)
    ├── config.php                                Passwort-Hash, Basispfad, Optionen
    ├── courses.php                               veröffentlichter Golfplatz-Datensatz
    ├── users.php                                 Benutzerkonten (Passwort-Hashes, Rolle, Status)
    ├── userdata/<id>.php                         Profil, Runden und Einstellungen je Benutzer (mit Revision)
    ├── backups/                                  die letzten 10 Fassungen des Datensatzes
    ├── sync/                                     Sync-Profile (nur Hash des Schlüssels)
    ├── ratelimit/, sessions/                     Schutz vor Passwort-Raten, PHP-Sitzungen
```

### Build

`npm run build:webspace` baut mit `BUILD_TARGET=webspace`:

- `next.config.ts` schaltet auf `output: "export"`, `trailingSlash: true` und `basePath: "/__HCP_BASE__"`.
- `pageExtensions` wählt die Dateien: Nur-Server-Dateien der Node-Edition heißen `*.server.tsx`/`*.server.ts`
  (Route Handler, SEO-Seiten, Admin mit Server Actions), ihre Webspace-Gegenstücke `*.static.tsx`.
  Alle übrigen Seiten sind in beiden Editionen identisch.
- Das Skript kopiert `webspace/php/` dazu, schreibt `golfplaetze-daten.json`, `version.txt`, `LIESMICH.txt`
  und packt alles ohne externe Werkzeuge als ZIP nach `release/`.

### Unterschiede zur Node-Edition

| Thema | Node-Edition | Webspace-Edition |
|---|---|---|
| Handicap-Engine, Runden, Statistik, Simulator, Export | identisch (läuft im Browser) | identisch |
| Golfplatzdaten | PostgreSQL/PGlite, relationale Tabellen | ein JSON-Datensatz (`data/courses.php`), gleiche Struktur wie die DTOs |
| Golfplatzsuche | `/api/courses` (Server) | im Browser, gleiche Funktion `runCourseSearch` |
| Anlagen-Seiten | serverseitig gerendert: `/golfplaetze/<region>/<slug>` | `/golfplaetze/anlage/?slug=…`, Regionen über `/golfplaetze/?region=…` |
| Admin | Server Actions, Passwort per Umgebungsvariable | gleiche Formulare/Ansichten; Änderungen werden im Browser mit denselben Regeln (`src/lib/courses/dataset.ts`, gleiche Zod-Schemas) angewendet und sofort über `api/admin.php` gespeichert |
| Gleichzeitige Admin-Änderungen | Datenbank-Transaktionen | Revisionsnummer: veralteter Stand wird mit HTTP 409 abgelehnt |
| Bayern-Importer (Discovery) | `npm run import:bavaria` | nicht auf dem Webspace; Ergebnis als CSV importieren oder JSON-Export der Node-Edition einspielen |
| Synchronisation | `/api/sync` (REST) | `api/sync.php` (nur POST, Schlüssel im Header `X-Sync-Key`, da viele Hoster PUT/DELETE bzw. `Authorization` blockieren) |

Die Admin-Formulare, Listen, Qualitäts- und Duplikatansichten sind gemeinsamer Code (`src/components/admin/`);
nur die Schreibschicht (`AdminBackend`) unterscheidet sich.

## Benutzerkonten

Im Admin-Bereich unter **Benutzer** (nur mit dem Haupt-Passwort aus der Installation) werden Zugänge angelegt. Das
Startpasswort wird im Browser erzeugt, einmalig angezeigt und muss bei der ersten Anmeldung geändert werden.

- Spieler melden sich unter `/anmelden/` an; ihre Daten liegen danach in `data/userdata/<id>.php` und werden bei
  jeder Änderung automatisch gespeichert (Revisionsprüfung; bei gleichzeitiger Änderung auf zwei Geräten werden die
  Runden zusammengeführt). Beim Abmelden werden die Kontodaten aus dem Browser entfernt.
- Rolle „Spieler + Golfplatzpflege“: Anmeldung im Admin-Bereich mit Benutzername und Passwort; Golfplatzdaten
  bearbeiten ja, Benutzerverwaltung, Admin-Passwort und „Datensatz einspielen“ nein.
- Anmeldung über ein signiertes HttpOnly-Cookie (30 Tage, SameSite=Lax, Secure bei HTTPS) mit an den Passwortstand
  gebundenem CSRF-Token. Passwort ändern oder zurücksetzen meldet alle Geräte ab; gesperrte Konten verlieren den Zugang
  sofort. Fehlversuche werden je IP begrenzt.

## Mitgelieferte Golfplatzdaten

`golfplaetze-daten.json` enthält die Startdaten aus `data/seed/golfplaetze-bayern.json`. Bei einer neuen Installation
sind sie sofort sichtbar. Bestehende Installationen behalten ihre Daten; fehlende Anlagen aus einer neuen Version
übernimmt der Admin auf der Übersichtsseite mit „Mitgelieferte Golfplatzdaten → übernehmen“ (bereits bearbeitete
Anlagen bleiben unverändert).

## Sicherheit

- Admin-Passwort nur als `password_hash` gespeichert; Anmeldung über PHP-Session (HttpOnly, SameSite=Strict,
  Secure bei HTTPS, 12 h gleitend), zusätzlich CSRF-Token im Header `X-CSRF-Token` bei jeder Änderung.
- Fehlversuche werden je IP begrenzt (10 pro 15 Minuten).
- Alle Dateien in `data/` beginnen mit `<?php exit; ?>` – selbst wenn der Server `.htaccess` ignoriert, liefert ein
  direkter Aufruf keinen Inhalt.
- Schreiben atomar (temporäre Datei + Umbenennen) und mit Dateisperre; vor jedem Speichern eine Sicherung.
- `install.php` ist nach der Installation ohne Admin-Passwort wirkungslos und kann für künftige Updates liegen bleiben.
  **Direkt nach dem Hochladen installieren** – vor der Installation könnte sonst jemand anderes das Passwort festlegen.
- Passwort vergessen: `data/config.php` per FTP löschen und `install.php` erneut aufrufen (Daten bleiben erhalten).

## Grenzen

- Auf Webspaces ohne PHP (reines Static Hosting) funktionieren Rechner, Runden und Statistik trotzdem; Golfplatzdaten
  werden dann schreibgeschützt aus `golfplaetze-daten.json` gelesen, Admin und Synchronisation stehen nicht zur Verfügung.
- nginx ohne `.htaccess`: funktioniert; `data/` sollte dann per Serverkonfiguration gesperrt werden (die Dateien sind
  zusätzlich PHP-geschützt).
- Die Golfplatzdatenbank wird leer ausgeliefert, solange keine verifizierten Daten vorliegen (siehe
  [`DATENSTATUS-BAYERN.md`](DATENSTATUS-BAYERN.md)); mit `npm run build:webspace -- --seed <export.json>` lässt sich
  ein geprüfter Datensatz mitliefern.
