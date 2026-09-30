# Webspace-Edition (PHP-Webspace, FTP-Upload)

Die Webspace-Edition macht den Golf HCP Rechner auf jedem klassischen PHP-Webspace lauffähig – ohne Node.js,
ohne Datenbank, ohne Kommandozeile. Hochladen, `install.php` aufrufen, fertig.

## Installation

| Schritt | Was tun |
|---|---|
| 1 | ZIP entpacken → Ordner `golf-hcp-rechner/` |
| 2 | Per FTP hochladen: den Ordner (→ `https://domain.de/golf-hcp-rechner/`, darf umbenannt werden) **oder** seinen Inhalt in die Domain-Wurzel. Versteckte `.htaccess`-Dateien mit hochladen. |
| 3 | `…/install.php` im Browser öffnen, Super-Admin-Konto (Name, E-Mail, Passwort ≥ 8 Zeichen), Website-Adresse und E-Mail-Versand festlegen, „Installieren“ |

Voraussetzungen: PHP ≥ 7.4 (empfohlen 8.x) mit `json`, `session`, `random_bytes`, `password_hash` (Standard);
Apache mit `mod_rewrite` (Standard bei deutschen Hostern) für die Vorprüfung von `/member` und `/admin` durch `gate.php`.
Ohne `.htaccess`/`mod_rewrite` funktioniert die Anwendung ebenfalls – die Seiten werden dann ohne Vorprüfung
ausgeliefert, Daten liefert die API trotzdem nur nach Anmeldung und mit Berechtigung.
`install.php` prüft alle Voraussetzungen und zeigt fehlende rot an.

Was `install.php` tut:

1. Installationsordner aus der eigenen URL ermitteln (änderbar), z. B. `/hcp` oder `""` für die Domain-Wurzel.
2. Den beim Build eingesetzten Platzhalter `/__HCP_BASE__` in allen Seiten-, Skript- und Stildateien durch den Ordner
   ersetzen (vorher Schreibrechte aller Dateien prüfen; `index.html` zuletzt, sie dient als Kennzeichen „fertig“).
3. `data/config.php` anlegen: zufälliger Schlüssel für Sitzungen/CSRF, Basispfad, Website-Adresse (für Links in
   E-Mails), E-Mail-Versand (`mail()`, SMTP, Ablage in `data/mail-outbox/` oder aus). `data/users.php` mit dem
   Super-Admin-Konto anlegen (nur Passwort-Hash).
4. `.htaccess` schreiben (eigener, markierter Block; fremde Einträge bleiben erhalten): Weiterleitung von
   `/member` und `/admin` an `gate.php`, 404-Seite, MIME-Typen, Sicherheits-Header, Kompression. Die Weiterleitung
   verwendet den absoluten Pfad (`/<ordner>/gate.php`), damit sie auch bei Hostern ohne passende `RewriteBase`
   funktioniert (z. B. IONOS), und hängt Verzeichnissen den Schrägstrich selbst an – sonst ergänzt Apache die interne
   Angabe `?area=…` in der Adresse. Liefert der Server danach HTTP 500 (Hoster erlaubt einzelne Anweisungen nicht),
   stellt die Erfolgsseite automatisch auf eine minimale Fassung um; antwortet `/member/` mit 404 (Weiterleitung
   läuft ins Leere), wird nur die Vorprüfung abgeschaltet.
5. `robots.txt` (bei Installation in der Domain-Wurzel) mit Verweis auf `sitemap.php`; `/member`, `/admin`, `/api`
   und `/data` sind ausgeschlossen.
6. Veraltete Skripte der Version 1 (`api/account.php`, `api/sync.php`) löschen.
7. Selbsttest auf der Erfolgsseite: Ist der Mitgliederbereich ohne Anmeldung gesperrt?

Solange die Installation nicht abgeschlossen ist, leitet jede Seite automatisch zu `install.php` weiter.

## Update

Neue ZIP-Datei über die alte hochladen (der Ordner `data/` wird nicht überschrieben – er enthält im ZIP nur
Schutzdateien) und `install.php` erneut aufrufen. Da die neuen Dateien wieder den Platzhalter enthalten, erkennt
`install.php` die Aktualisierung und verlangt die Anmeldung mit einem Super-Admin-Konto.

**Von Version 1:** `install.php` fragt einmalig das bisherige Admin-Passwort ab und legt damit das Super-Admin-Konto an
(E-Mail frei wählbar, Passwort = bisheriges Admin-Passwort). Vorhandene Benutzer werden übernommen: Spieler → `USER`,
Golfplatzpflege → `ADMIN`; Runden bleiben erhalten. Benutzer ohne E-Mail-Adresse melden sich weiter mit ihrem
Benutzernamen an.

**Passwort vergessen, kein Mailversand:** per FTP eine leere Datei `data/recovery.txt` anlegen und `install.php`
aufrufen. Dort lässt sich für ein bestehendes Konto ein neues Passwort setzen (es erhält die Rolle Super-Admin); die
Datei wird danach gelöscht und der Vorgang im Audit-Log vermerkt.

## Aufbau

```
golf-hcp-rechner/
├── index.html, login/, member/, admin/, golfplaetze/, …   statischer Next.js-Export (alle Seiten)
├── _next/static/                                 JS/CSS (mit .htaccess für dauerhaftes Caching)
├── golfplaetze-daten.json                        Startdaten der Golfplatzdatenbank (aus data/seed/, z. B. Ottobeuren)
├── install.php                                   Installation / Update / Umstellung von Version 1 / Notfall-Zugang
├── gate.php                                      Vorprüfung von /member und /admin (Sitzung, Berechtigung)
├── sitemap.php                                   Sitemap inkl. Golfanlagen
├── api/
│   ├── _lib.php                                  gemeinsame Funktionen: Sitzung, Rechte-Matrix, Speicher, Audit, Mail
│   ├── auth.php                                  Anmeldung, Registrierung, E-Mail bestätigen, Passwort, Profil, Export, Konto löschen
│   ├── me.php                                    eigene Daten des Mitglieds: laden, Runden, Entwürfe, Einstellungen, Import,
│   │                                             Lochstatistik, Sichtbarkeit, Community-Einstellungen, Profilbild
│   ├── community.php                             Community (nur lesen, nur freigegebene Daten): Ranking, Mitglieder, Profil, Runden, Aktivität, Profilbild
│   ├── _community.php                            Projektion „was andere sehen“, Ranking, Indexdateien (Parität zu src/lib/community per Test)
│   ├── admin.php                                 Admin: Benutzer, Runden, Audit-Log, System, Einstellungen, Suche, Golfplatz-Datensatz
│   └── courses.php                               veröffentlichter Golfplatz-Datensatz (lesen)
└── data/                                         Serverdaten (per .htaccess gesperrt, Dateien zusätzlich PHP-geschützt)
    ├── config.php                                Schlüssel, Basispfad, Website-Adresse, Mailversand
    ├── settings.php                              Einstellungen aus dem Admin-Bereich (Registrierung, Impressum, …)
    ├── users.php                                 Konten (Passwort-Hashes, Rolle, Status, Token-Hashes)
    ├── userdata/<id>.php                         Profil, Runden, Entwürfe und Einstellungen je Mitglied (mit Revision)
    ├── courses.php, backups/                     Golfplatz-Datensatz, die letzten 10 Fassungen
    ├── community/                                Indexdateien: profiles.php, rounds/<id>.php, feed.php, admin.php, ranking/<datum>.php
    ├── avatars/<id>.php                          Profilbilder (nur über community.php abrufbar)
    ├── audit/<JJJJ-MM>.php                       Audit-Log
    ├── logs/                                     Fehler- und Mailprotokoll
    ├── mail-outbox/                              E-Mails im Modus „Ablage“ (Test ohne Mailserver)
    └── ratelimit/                                Schutz vor Passwort-Raten
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
| Oberfläche | identisch (gleiche Seiten, gleicher API-Adapter `src/lib/api`) | identisch |
| Anmeldung, Rechte, Datentrennung, Audit | Route Handler + PostgreSQL | `api/*.php` + Dateien in `data/` – gleiche Rechte-Matrix, gleiche Fehlercodes |
| HCP-Berechnung | auf dem Server (Route Handler) | im Browser mit derselben Service-Schicht `src/lib/member`, gekapselt im Adapter `webspace.ts`; PHP prüft und speichert |
| Seitenschutz | `proxy.server.ts` + Server-Layouts | `gate.php` über `.htaccess` |
| Golfplatzdaten | PostgreSQL/PGlite, relationale Tabellen | ein JSON-Datensatz (`data/courses.php`), gleiche Struktur wie die DTOs |
| Golfplatz-Admin | Server Actions | gleiche Formulare; Änderungen werden im Browser mit denselben Regeln (`src/lib/courses/dataset.ts`) angewendet und über `admin.php?action=courses-save` gespeichert; der Server setzt den Bearbeiter und protokolliert |
| Gleichzeitige Änderungen | Transaktionen mit Zeilensperre | Revisionsnummer: veralteter Stand → HTTP 409, der Adapter lädt neu und wiederholt |
| Detailseiten | `/admin/courses/<id>`, `/golfplaetze/<region>/<slug>` | `/admin/courses/view?id=`, `/golfplaetze/anlage/?slug=` |
| Community, Ranking | Tabellen `community_profiles`, `public_rounds`, `ranking_snapshots`; Position per SQL | Indexdateien in `data/community/`; gleiche Projektion und gleiche Ranking-Regeln (Paritätstest) |
| Ranking-Kennzahlen | vom Server berechnet | vom Browser mitgeschickt (`summary`), PHP prüft Wertebereiche – siehe Grenzen |
| Bayern-Importer (Discovery) | `npm run import:bavaria` | nicht auf dem Webspace; Ergebnis als CSV importieren oder JSON-Export der Node-Edition einspielen |

Warum rechnet der Browser? PHP kann die TypeScript-Engine nicht ausführen, und eine zweite Implementierung der WHS-Regeln
in PHP wäre eine Fehlerquelle. Der Adapter rechnet deshalb mit genau dem Code, den die Node-Edition auf dem Server
nutzt; die UI sieht in beiden Editionen dieselben DTOs. Sicherheitsrelevant bleibt alles auf dem Server: PHP liefert
nur das eigene Dokument aus (Benutzer-ID aus der Sitzung), prüft jede gespeicherte Runde auf Struktur und
Wertebereiche, lehnt veraltete Revisionen ab und protokolliert Änderungen.

## Konten und Rollen

- Registrierung unter `/register/` (im Admin-Bereich abschaltbar) mit Bestätigungslink per E-Mail (48 Stunden
  gültig); selbst registrierte Konten erhalten immer die Rolle `USER`. Der Admin kann Konten auch direkt anlegen –
  mit Einladungsmail oder temporärem Passwort (Pflicht zum Wechsel bei der ersten Anmeldung).
- Passwort vergessen: Link per E-Mail (1 Stunde gültig, einmalig). Die Antwort ist für bekannte und unbekannte
  Adressen gleich.
- Rollen `USER`, `SUPPORT`, `ADMIN`, `SUPER_ADMIN` (siehe `docs/ARCHITEKTUR.md`). Deaktivierte oder gesperrte Konten
  können sich nicht anmelden, laufende Sitzungen enden sofort; die Daten bleiben erhalten.
- Benutzeransicht („Impersonation“) ist nur lesend, deutlich markiert und wird im Audit-Log vermerkt.

## Mitgelieferte Golfplatzdaten

`golfplaetze-daten.json` enthält die Startdaten aus `data/seed/golfplaetze-bayern.json`. Bei einer neuen Installation
sind sie sofort sichtbar. Bestehende Installationen behalten ihre Daten; fehlende Anlagen aus einer neuen Version
übernimmt der Admin auf der Übersichtsseite mit „Mitgelieferte Golfplatzdaten → übernehmen“ (bereits bearbeitete
Anlagen bleiben unverändert).

## Sicherheit

- Passwörter nur als `password_hash`; nichts im Klartext, nichts im Log.
- Sitzung: signiertes HttpOnly-Cookie `hcp_session` (14 Tage gleitend, SameSite=Lax, Secure bei HTTPS), gebunden an
  den Passwortstand. Jede Änderung braucht zusätzlich den CSRF-Token im Header `X-CSRF-Token`; der Browser hält ihn nur
  im Arbeitsspeicher, nie im Web Storage.
- Rechte: jede Aktion in `admin.php` hat eine feste Berechtigung aus der Rechte-Matrix; `me.php` kennt nur die
  Benutzer-ID der Sitzung. Der letzte Super-Admin ist gegen Herabstufen, Deaktivieren und Löschen geschützt.
- Ratenbegrenzung: Anmeldung 10 Versuche je IP und 8 je Konto in 15 Minuten; Registrierung, Bestätigungs- und
  Reset-Mails je IP und Adresse begrenzt.
- Audit-Log (`data/audit/`): Rollen- und Statusänderungen, Passwort-Resets, Benutzeransicht, Anlegen/Löschen von
  Konten, Runden (angelegt/geändert/gelöscht/importiert), Golfplatzänderungen, Einstellungen – jeweils mit Zeitpunkt,
  Admin, betroffenem Benutzer, Entität, altem und neuem Wert.
- SMTP-Passwort und Sitzungsschlüssel verlassen den Server nicht (die Einstellungsseite zeigt nur „gesetzt“).
- Alle Dateien in `data/` beginnen mit `<?php exit; ?>` – selbst wenn der Server `.htaccess` ignoriert, liefert ein
  direkter Aufruf keinen Inhalt.
- Schreiben atomar (temporäre Datei + Umbenennen) und mit Dateisperre; vor jedem Speichern des Golfplatz-Datensatzes
  eine Sicherung.
- `install.php` ist nach der Installation ohne Super-Admin-Anmeldung wirkungslos und kann für künftige Updates liegen
  bleiben. **Direkt nach dem Hochladen installieren** – vor der Installation könnte sonst jemand anderes das
  Super-Admin-Konto anlegen.

## E-Mail-Versand

Registrierung und „Passwort vergessen“ brauchen einen funktionierenden Mailversand. In `install.php` bzw. unter
**Admin → Einstellungen** wählbar:

| Modus | Wann |
|---|---|
| SMTP (empfohlen) | Postfach des Hosters: Server, Port 587 (STARTTLS) oder 465 (SSL), Benutzer, Passwort, Absender |
| PHP `mail()` | funktioniert bei vielen Hostern ohne Einrichtung, landet aber öfter im Spam |
| Ablage | Mails werden nur in `data/mail-outbox/` gespeichert (Test) |
| Aus | kein Versand; Konten dann nur durch den Admin mit temporärem Passwort anlegen |

„Testmail senden“ unter Einstellungen prüft die Konfiguration. Die Links in Mails verwenden die Website-Adresse aus
den Einstellungen, nie den Host-Header der Anfrage.

## Grenzen

- PHP ist Pflicht: Anmeldung, Mitgliederdaten und Admin laufen über `api/*.php`. Ohne PHP bleiben nur die
  öffentlichen Seiten (Golfplätze aus `golfplaetze-daten.json`, Methodik, Hilfe).
- nginx ohne `.htaccess`: funktioniert; `data/` sollte dann per Serverkonfiguration gesperrt werden (die Dateien sind
  zusätzlich PHP-geschützt).
- Mitgeliefert wird nur, was in `data/seed/` liegt (derzeit Ottobeuren, Ratings unverifiziert – siehe
  [`DATENSTATUS-BAYERN.md`](DATENSTATUS-BAYERN.md)); mit `npm run build:webspace -- --seed <export.json>` lässt sich
  ein geprüfter Datensatz mitliefern.
- Ranking: Handicap Index, Rundenzahl und Spielleistung für Ranking und Profil berechnet der Browser mit derselben
  Engine und schickt sie mit; PHP verwirft Werte außerhalb der gültigen Bereiche, rechnet aber nicht nach. Ein technisch
  versiertes Mitglied könnte so den eigenen Ranking-Wert verfälschen (nie Daten anderer). Für ein manipulationssicheres
  Ranking die Node-Edition verwenden; im Webspace kann der Admin Einträge jederzeit aus dem Ranking entfernen.
- Sehr viele gleichzeitige Nutzer: Die Dateispeicherung ist für Vereinsgröße (einige hundert Mitglieder) ausgelegt;
  darüber die Node-Edition mit PostgreSQL verwenden.
