# Datenstatus Golfplätze Bayern

Stand: 29.09.2026

## Kurzfassung

| Kennzahl | Wert |
|---|---|
| Anlagen in der ausgelieferten Datenbank | **0** |
| Verifizierte Rating-Sets | **0** |
| Importer / CSV-Import / Admin | einsatzbereit, getestet |

Die Datenbank wird **leer** ausgeliefert. Es sind keine Golfanlagen und keine CR-/Slope-Werte enthalten.

## Warum leer?

Während der Entwicklung war der Netzzugang der Build-Umgebung auf Paketquellen beschränkt. Die Quellen
`bayerischer-golfverband.de`, `golf.de`, `dgv-intranet.de` und die Websites der Clubs waren nicht erreichbar
(HTTP 403 durch die Egress-Richtlinie). Die BGV-Clubübersicht konnte daher nicht durchlaufen werden.

Eine aus dem Gedächtnis erstellte Liste oder geschätzte Ratingwerte wären ein Verstoß gegen die Grundregel
„keine erfundenen Platzdaten“. Deshalb wurde bewusst nichts eingetragen.

## So wird die Datenbank befüllt

1. In einer Umgebung mit Internetzugang:

   ```bash
   npm run import:bavaria                      # Probelauf: Bericht in data/reports/
   npm run import:bavaria -- --details --apply # Anlagen + Websites übernehmen
   npm run import:bavaria -- --details --scan-websites --apply   # zusätzlich Rating-Kandidaten
   ```

   Der Importer sucht die Clubübersicht auf der BGV-Startseite (oder `--list-url` / `BGV_CLUB_LIST_URL`), folgt der
   Paginierung, speichert die Rohseiten in `data/raw/bgv/<Lauf>/`, dedupliziert (Name, Ort, PLZ, Website, Club-ID),
   unterscheidet Golfanlage, Kurzplatz, Par-3 und Driving Range und legt Anlagen **unverifiziert** an.
   Der Parser ist gegen typische Listenstrukturen getestet, aber noch nicht gegen die echte BGV-Seite – beim ersten
   Lauf daher den Probelauf-Bericht prüfen (Strategie je Seite, Anzahl Einträge).

2. Rating-Kandidaten (`data/reports/rating-candidates-*.csv`) sind **ungeprüft** (`verified=false`, Vertrauen LOW).
   Jede Zeile gegen die offizielle Scorekarte / das DGV-Serviceportal prüfen, Platzname, Abschlag, Geschlecht, Par,
   Gültigkeit ergänzen, dann `verified=true` setzen und im Admin unter **CSV-Import** hochladen (Vorschau → Bestätigen).

3. 9-Loch-Ratings nur übernehmen, wenn ein offizielles 9-Loch-Rating existiert (Front/Back Nine angeben).

4. Im Admin unter **Datenqualität** fehlende Ratings, Quellen, Prüfdaten, Widersprüche und Duplikate abarbeiten.

## Quellenpriorität

1. DGV / DGV-Serviceportal
2. Offizielle Club-Website, offizielle Scorekarte, offizielle WHS-/Course-Handicap-Dokumente
3. Bayerischer Golfverband
4. Seriöse Verzeichnisse nur zum Gegencheck / Auffinden fehlender Anlagen
