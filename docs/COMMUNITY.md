# Community, Ranking und Golfstatistik (Version 2.2)

Erweiterung des Mitgliederbereichs um Community-Ranking, Mitgliederprofile, geteilte Runden und detaillierte
Lochstatistik. Die WHS-Berechnung ist davon unberührt: Keine dieser Funktionen verändert GBE, Score Differential
oder Handicap Index.

## Drei getrennte Domänen

| Domäne | Code | Inhalt | Wirkung aufs Handicap |
|---|---|---|---|
| WHS | `src/rules/whs/de/2026/`, `src/lib/whs/` | Score Differential, Scoring Record, HCPI | maßgeblich |
| Golfstatistik | `src/lib/stats/` | Lochdaten (Putts, GIR, FIR, Bunker, Sand Save, Up & Down, Strafschläge, Notiz), Runden- und Mehrrunden-Statistik, Hinweise | keine |
| Community | `src/lib/community/` | Einstellungen, Sichtbarkeit, Projektion (was andere sehen), Ranking | keine |

Die Service-Schicht `src/lib/member/community.ts` verbindet die Domänen mit dem Mitglieder-Dokument
(`saveRoundStats`, `setRoundVisibility`, `updateCommunitySettings`, `memberSummary`, `performanceOf`).
`saveRoundStats` ändert nur `holeStats` und `computed.stats` einer Runde. Das Handicap wird dabei nicht neu berechnet.

## Datenschutz: alles Opt-in, Filterung im Backend

Standard für jedes Konto ist „alles privat“:

| Einstellung | Bedeutung | Voraussetzung |
|---|---|---|
| `rankingVisible` | Teilnahme am Ranking (Anzeigename, Profilbild, HCPI, Heimatclub, Rundenzahl) | – |
| `profileVisible` | Profil für Mitglieder sichtbar | – |
| `roundsVisible` | einzeln freigegebene Runden sichtbar | Profil sichtbar |
| `statsVisible` | Spielleistung im Profil, Scorekarte/Statistik in Runden der Stufe „Details“ | Profil sichtbar |
| `notesVisible` | Notizen in Runden der Stufe „Details“ | Runden und Statistik geteilt |
| `defaultRoundVisibility` | Vorauswahl im Runden-Assistenten | – |

Die Abhängigkeiten regelt `normalizeSettings` (`src/lib/community/policy.ts`). Die Sichtbarkeit einer Runde
(`PRIVATE` / `MEMBERS_BASIC` / `MEMBERS_FULL`) wählt das Mitglied beim Erfassen oder später in der Rundenansicht.
Die tatsächliche Stufe ergibt sich aus Runde, Einstellungen und Betreiber-Schaltern (`roundLevel`,
`levelWithFlags`). Beispiel: `MEMBERS_FULL` ohne `statsVisible` wird zur Stufe „Basis“.

Die **Projektion** (`src/lib/community/projection.ts`, PHP: `hcp_cm_project`) entscheidet als einzige Stelle,
welche Felder das Mitglieder-Dokument verlassen. Andere Mitglieder erhalten nie:

- E-Mail-Adresse, Kontaktdaten oder die interne Benutzer-ID. Verweise laufen über eine zufällige `publicId`.
- private oder gelöschte Runden sowie von der Administration ausgeblendete Runden.
- Notizen ohne ausdrückliche Freigabe, Lochdaten und Statistik unterhalb der Stufe „Details“.

Die API filtert, bevor sie antwortet. Das Frontend blendet nichts aus, was es erhalten hätte. Deaktivierte oder
gesperrte Konten erscheinen nirgends. Profilbilder liefert die API nur an angemeldete Mitglieder aus, und nur,
wenn das Profil oder die Ranking-Teilnahme freigegeben ist. Die Dateien liegen nicht im öffentlichen Webordner.

Die Administration kann Freigaben **nur ausschalten**, nie einschalten (`hideUserCommunity`). Moderationsaktionen:

- `HIDE`: für andere ausblenden
- `UNHIDE`: wieder freigeben
- `MAKE_PRIVATE`: Sichtbarkeit auf „Nur ich“ setzen
- `REMOVE_NOTES`: Notizen der Runde entfernen

Runden werden durch Moderation nie gelöscht, das Handicap bleibt gleich. Jede Aktion landet im Audit-Log:

- `PUBLIC_ROUND_MODIFIED`, `PUBLIC_ROUND_HIDDEN`, `PUBLIC_ROUND_UNHIDDEN`
- `USER_RANKING_VISIBILITY_CHANGED`, `USER_PROFILE_VISIBILITY_CHANGED`
- `RANKING_REFRESHED`
- Änderungen der Mitglieder selbst: `COMMUNITY_SETTINGS_CHANGED`, `ROUND_VISIBILITY_CHANGED`, `ROUND_STATS_UPDATED`

## Ranking

- **Teilnahme:** nur Mitglieder mit `rankingVisible` und aktivem Konto.
- **Sortierung:** Handicap Index aufsteigend, verglichen in Zehnteln.
- **Gleichstand:** Wettkampf-Rang 1, 1, 3 (`COMMUNITY_POLICY.ranking.ties`, alternativ `DENSE` = 1, 1, 2).
- **Filter:** Gesamt, Heimatclub oder Region (Region = Bezirk des Heimatplatzes). Heimatclub und Region gibt es nur mit hinterlegtem Heimatplatz.
- **Nicht-Teilnehmer:** sehen ihre hypothetische Position („Du wärst auf Platz 7“). Nur sie selbst sehen diese Angabe (`hiddenUserSeesOwnPosition`).
- **Trend (Gesamt-Ranking):** Täglich wird ein Ranking-Stand gespeichert, und zwar beim ersten Aufruf des Tages oder über „Ranking aktualisieren“ im Admin-Bereich. Der Trend vergleicht die aktuelle Position mit dem letzten Stand vor heute; + heißt verbessert.
- **Leistung:**
  - Node berechnet die Position per SQL (`rank()` über `round(handicap_index*10)`) auf der materialisierten Tabelle `community_profiles`.
  - PHP arbeitet mit einer Indexdatei `data/community/profiles.php`. Die Mitglieder-Dokumente werden dabei nicht geöffnet.

## Golfstatistik: Definitionen

- **Nenner:** immer die erfassten Löcher. Bei 9 Loch heißt es z. B. „GIR 5 von 9“, nie „von 18“.
- **FIR:** nur auf Par 4 und Par 5. Par 3 zählt nie mit.
- **GIR:** markiert der Spieler selbst. Aus der Schlagzahl wird nichts abgeleitet. Ungewöhnliche Kombinationen sind ein Hinweis, kein Fehler, z. B. GIR = Ja mit Schläge − Putts > Par − 2.
- **Sand Save / Up & Down:** ohne Versuch bleibt die Quote leer (`null`) statt 0 %.
- **Mehrere Runden:** Summe der Treffer ÷ Summe der Versuche (`summarize`, `ratesFromSums`). Prozentwerte werden nie gemittelt.
- **Fehler, die das Speichern verhindern (`validateHoleStats`):**
  - mehr Putts plus Strafschläge als Schläge − 1
  - Fairway auf Par 3
  - Bunkerschläge oder Sand Save ohne Bunker
  - Up & Down bei getroffenem Grün
  - Sand Save oder Up & Down mit einem Ergebnis über Par
- **Vollständig:** Ein Loch gilt als vollständig erfasst mit Schlägen, Putts, GIR und Strafschlägen.
- **Schlagzahl bei „Loch für Loch“:** Die Schläge der Statistik stammen immer aus der WHS-Eingabe (`alignHoleStats`). Par und Handicap je Loch kommen aus den Platzdaten.

## Oberfläche

| Seite | Inhalt |
|---|---|
| `/member/community` | Reiter Ranking (eigene Position, Top 3, Tabelle/Karten, Trend, Filter, Zustimmung per Dialog), Aktivität, Mitglieder (Suche mit Verzögerung, Sortierung) |
| `/member/community/member?id=` | Profil eines Mitglieds (HCPI, Heimatplatz, Rang, Spielleistung, geteilte Runden) |
| `/member/community/round?member=&round=` | geteilte Runde: Basisdaten, bei „Details“ Reiter Zusammenfassung / Scorekarte / Statistik |
| `/member/stats` | Filter (letzte 5/10/20/alle, 9/18, Platz, Zeitraum, Abschlag), Kennzahlen, Verteilung, Verläufe, Tabellenansicht, Definitionen |
| `/member/rounds/new` | Schnelleingabe als Standard. Optional „Runde detailliert tracken“: ein Loch pro Ansicht, Fortschritt, Lochnavigation ✓/●/○, Entwurf wird automatisch gespeichert. Beim Prüfen „Wer darf diese Runde sehen?“ mit ausdrücklicher Freigabe |
| `/member/rounds/view?id=` | Reiter Zusammenfassung / Scorekarte / Statistik, Sichtbarkeit, Hinweis bei Moderation |
| `/member/rounds/stats?id=` | „Statistiken ergänzen“ für gespeicherte Runden. Das Handicap bleibt unverändert; bei „Loch für Loch“ ist die Schlagzahl gesperrt |
| `/member/profile?tab=community` | Anzeigename, Profilbild (im Browser auf 256 px verkleinert, höchstens 150 KB), Freigaben, Vorauswahl |
| `/admin/community` | Übersicht (Kennzahlen, aggregierte Spielleistung ab 5 Runden, Datenqualität, Ranking aktualisieren), Ranking inkl. Nicht-Teilnehmern, geteilte Runden mit Moderation |

Die Navigation im Mitgliederbereich lautet Home / HCP / Runden / Community / Profil. Ist die Community
ausgeschaltet, steht dort wieder „Golfplätze“.

Die Betreiber-Schalter liegen unter Admin → Einstellungen → Community:

- `communityEnabled`
- `rankingEnabled`
- `publicRoundsEnabled`
- `statsSharingEnabled`
- `activityFeedEnabled`

## Speicherung

**Node:**

- Das Mitglieder-Dokument bleibt die Quelle.
- `syncCommunity(userId)` materialisiert nach jeder Änderung `community_profiles`, `public_rounds` und `round_statistics`. Das geschieht in einer Transaktion (Migration `0003_community.sql`).
- Ranking-Stände liegen in `ranking_snapshots`, Profilbilder in `user_avatars`.

**Webspace:**

- `hcp_cm_reindex` schreibt Indexdateien: `data/community/profiles.php`, `rounds/<id>.php`, `feed.php`, `admin.php` und `ranking/<datum>.php`.
- Profilbilder liegen in `data/avatars/`.
- Alle Dateien sind per `.htaccess` und PHP-Kopfzeile vor direktem Abruf geschützt.

## Bekannte Grenze der Webspace-Edition

Die Webspace-Edition rechnet das Handicap im Browser, weil PHP die TypeScript-Engine nicht ausführen kann.
Deshalb schickt der Browser auch die Kennzahlen fürs Ranking mit (`summary`: HCPI, Rundenzahl, Spielleistung).
PHP prüft die Wertebereiche und verwirft ungültige Werte (`hcp_cm_clean_summary`). Rechnet PHP aber nicht nach,
könnte ein technisch versiertes Mitglied den eigenen Ranking-Wert verfälschen. Daten anderer Mitglieder sind
davon nicht betroffen, und Freigaben und Datentrennung prüft PHP vollständig.

Für ein manipulationssicheres Ranking bitte die Node-Edition verwenden, die alles serverseitig berechnet. Im
Webspace kann die Administration Auffälligkeiten jederzeit aus dem Ranking entfernen.

## Tests

| Datei | Prüft |
|---|---|
| `tests/stats/statistics.test.ts` | Validierung, Nenner, 9 Loch, FIR ohne Par 3, `null` statt 0 %, Aggregation aus Summen |
| `tests/community/community.test.ts` | Opt-in-Standard, Abhängigkeiten, Projektion (keine E-Mail/ID/Notiz), Stufen, Ranking 1-1-3, Trend |
| `tests/member/performance.test.ts` | Statistik ergänzen ohne HCP-Änderung, Filter, Sichtbarkeit, Zusammenfassung |
| `tests/member/wizard.test.ts` | Assistent: Sichtbarkeit, Statistik nur mit Schalter, Schlagzahl aus WHS-Eingabe, Lochliste |
| `tests/community/node-community.test.ts` | Node-API mit PGlite: private Runden nie ausgeliefert, Nicht-Teilnehmer, Moderation, Admin nur ausschalten |
| `tests/community/php-parity.test.ts` | TypeScript- und PHP-Projektion liefern identische Daten; Ranking und Namensprüfung gleich |
| `tests/webspace/php-api.test.ts` | PHP-Endpunkte inkl. Freigaben, Moderation, Profilbild |
