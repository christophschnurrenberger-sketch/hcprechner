# Datenstatus Golfplätze Bayern

Stand: 29.09.2026

## Kurzfassung

| Kennzahl | Wert |
|---|---|
| Anlagen in den mitgelieferten Startdaten (`data/seed/golfplaetze-bayern.json`) | **1** (Allgäuer Golf- und Landclub Ottobeuren) |
| Rating-Sets | **2** (18 Loch: Gelb Herren, Rot Damen) – **nicht verifiziert** |
| Verifizierte Rating-Sets | **0** |
| Importer / CSV-Import / Admin | einsatzbereit, getestet |

## Allgäuer Golf- und Landclub Ottobeuren

| Abschlag | Par | CR | Slope | Länge | Quelle |
|---|---|---|---|---|---|
| Gelb, Herren, 18 Loch | 72 | 72,3 | 131 | 6096 m | Club-Website „Scorekarte & Vorgabe“ |
| Rot, Damen, 18 Loch | 72 | 74,3 | 127 | 5398 m | Club-Website „Scorekarte & Vorgabe“ |

- Quelle: <https://www.golfclub-ottobeuren.de/golfplatz/scorekarte-vorgabe>. Die Seite selbst war aus der
  Build-Umgebung **nicht abrufbar** (Egress-Sperre); die Werte stammen aus übereinstimmenden Suchergebnissen
  (Auszüge dieser Club-Seite) vom 29.09.2026. Deshalb `verified = false`, Vertrauen MEDIUM, kein Prüfdatum.
- **Nicht erfasst** (nicht verfügbar, nichts geschätzt): Par und Handicap (Stroke Index) je Loch, Längen je Loch,
  weitere Abschläge (z. B. Weiß/Blau/Orange), 9-Loch-Ratings (Front/Back Nine), Gültigkeitszeitraum, Koordinaten.
  Diese stehen auf der Scorekarte bzw. im Birdiebook des Clubs.
- 6-Loch-Kurzplatz als Layout ohne Rating angelegt (die Suchergebnisse enthielten widersprüchliche Angaben).
- Freigabe: im Admin-Bereich die Werte mit der aktuellen Scorekarte abgleichen, Lochdaten ergänzen und die Ratings
  per Klick verifizieren. Erst dann werden sie im Runden-Assistenten automatisch verwendet; bis dahin werden CR und
  Slope bei der Erfassung manuell von der Scorekarte eingegeben („Rating selbst eingeben“).
- Stammdaten (Adresse Hofgut Boschach, 87724 Ottobeuren) aus Sekundärquellen, nicht verifiziert.

Die Startdaten werden mit der Webspace-Edition ausgeliefert (`golfplaetze-daten.json`); bestehende Installationen
übernehmen fehlende Anlagen im Admin-Bereich über „Mitgelieferte Golfplatzdaten“. Node-Edition: `npm run db:seed`
oder dieselbe Karte im Admin-Bereich.

## Warum (noch) so wenige Anlagen?

Während der Entwicklung war der Netzzugang der Build-Umgebung auf Paketquellen beschränkt. Die Quellen
`bayerischer-golfverband.de`, `golf.de`, `dgv-intranet.de` und die Websites der Clubs waren nicht erreichbar
(HTTP 403 durch die Egress-Richtlinie). Die BGV-Clubübersicht konnte daher nicht durchlaufen werden.

Eine aus dem Gedächtnis erstellte Liste oder geschätzte Ratingwerte wären ein Verstoß gegen die Grundregel
„keine erfundenen Platzdaten“. Deshalb wurden nur Werte eingetragen, die aus der Quelle belegt sind.

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
