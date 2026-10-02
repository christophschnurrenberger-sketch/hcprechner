import Foundation
import GolfCore

// Alle Texte der App. Schlüssel + deutscher Standardtext; Übersetzungen im String-Katalog
// `Resources/Localizable.xcstrings` (de, en; fr/it/es vorbereitet). Platzhalter sind immer Strings (%@).
// Prüfung: `python3 native/apple/scripts/strings.py --check` (läuft auch in der CI).
// swiftlint:disable line_length

enum L10n {
    enum Common {
        static var add: String { String(localized: "common.add", defaultValue: "Hinzufügen") }
        static var back: String { String(localized: "common.back", defaultValue: "Zurück") }
        static var cancel: String { String(localized: "common.cancel", defaultValue: "Abbrechen") }
        static var close: String { String(localized: "common.close", defaultValue: "Schließen") }
        static var done: String { String(localized: "common.done", defaultValue: "Fertig") }
        static var next: String { String(localized: "common.next", defaultValue: "Weiter") }
        static var no: String { String(localized: "common.no", defaultValue: "Nein") }
        static var save: String { String(localized: "common.save", defaultValue: "Sichern") }
        static var yes: String { String(localized: "common.yes", defaultValue: "Ja") }
    }

    enum Tab {
        static var home: String { String(localized: "tab.home", defaultValue: "Start") }
        static var golf: String { String(localized: "tab.golf", defaultValue: "Golf") }
        static var rounds: String { String(localized: "tab.rounds", defaultValue: "Runden") }
        static var stats: String { String(localized: "tab.stats", defaultValue: "Statistik") }
        static var profile: String { String(localized: "tab.profile", defaultValue: "Profil") }
    }

    enum Home {
        static func greeting(_ name: String) -> String { String(localized: "home.greeting", defaultValue: "Hallo, \(name)") }
        static var subtitle: String { String(localized: "home.subtitle", defaultValue: "Bereit für die nächste Runde?") }
        static var readyTitle: String { String(localized: "home.readyTitle", defaultValue: "Ab auf den Platz") }
        static var readyText: String { String(localized: "home.readyText", defaultValue: "GPS-Entfernungen, Scorekarte und Handicap – auch ohne Netz.") }
        static var startRound: String { String(localized: "home.startRound", defaultValue: "Runde starten") }
        static var chooseCourse: String { String(localized: "home.chooseCourse", defaultValue: "Anderen Platz wählen") }
        static var activeRound: String { String(localized: "home.activeRound", defaultValue: "Laufende Runde") }
        static func activeRoundProgress(_ done: String, _ total: String) -> String { String(localized: "home.activeRoundProgress", defaultValue: "\(done) von \(total) Löchern erfasst") }
        static var resume: String { String(localized: "home.resume", defaultValue: "Runde fortsetzen") }
        static var handicapIndex: String { String(localized: "home.handicapIndex", defaultValue: "HCPI") }
        static var rounds: String { String(localized: "home.rounds", defaultValue: "Runden") }
        static var average18: String { String(localized: "home.average18", defaultValue: "Ø 18 Loch") }
        static var recent: String { String(localized: "home.recent", defaultValue: "Zuletzt gespielt") }
        static var favorites: String { String(localized: "home.favorites", defaultValue: "Favoriten") }
        static var lastRound: String { String(localized: "home.lastRound", defaultValue: "Letzte Runde") }
        static var allRounds: String { String(localized: "home.allRounds", defaultValue: "Alle Runden") }
    }

    enum Sync {
        static var idle: String { String(localized: "sync.idle", defaultValue: "Synchronisation bereit") }
        static var syncing: String { String(localized: "sync.syncing", defaultValue: "Wird synchronisiert …") }
        static var synced: String { String(localized: "sync.synced", defaultValue: "Synchronisiert") }
        static func offline(_ pending: String) -> String { String(localized: "sync.offline", defaultValue: "Offline – \(pending) Änderungen werden später übertragen") }
        static var failed: String { String(localized: "sync.failed", defaultValue: "Synchronisation fehlgeschlagen – Daten bleiben auf dem Gerät") }
    }

    enum Courses {
        static var title: String { String(localized: "courses.title", defaultValue: "Golfplätze") }
        static var searchPrompt: String { String(localized: "courses.searchPrompt", defaultValue: "Platz, Ort, Region oder Club") }
        static var filterAll: String { String(localized: "courses.filterAll", defaultValue: "Alle") }
        static var filterNearby: String { String(localized: "courses.filterNearby", defaultValue: "In der Nähe") }
        static var filterFavorites: String { String(localized: "courses.filterFavorites", defaultValue: "Favoriten") }
        static var filterRecent: String { String(localized: "courses.filterRecent", defaultValue: "Zuletzt") }
        static var loadFailed: String { String(localized: "courses.loadFailed", defaultValue: "Platzdaten nicht erreichbar. Gespeicherte Plätze sind weiter verfügbar.") }
        static var noResults: String { String(localized: "courses.noResults", defaultValue: "Keine Plätze gefunden.") }
        static var noFavorites: String { String(localized: "courses.noFavorites", defaultValue: "Noch keine Favoriten. Tippe auf den Stern bei einem Platz.") }
        static var holesShort: String { String(localized: "courses.holesShort", defaultValue: "Loch") }
        static func holesPar(_ holes: String, _ par: String) -> String { String(localized: "courses.holesPar", defaultValue: "\(holes) Loch · Par \(par)") }
        static var badgeGPS: String { String(localized: "courses.badgeGPS", defaultValue: "GPS") }
        static var badgeDemo: String { String(localized: "courses.badgeDemo", defaultValue: "Demo") }
        static var badgeNoHoleData: String { String(localized: "courses.badgeNoHoleData", defaultValue: "Lochdaten fehlen") }
        static var badgeOffline: String { String(localized: "courses.badgeOffline", defaultValue: "Offline verfügbar") }
        static var addFavorite: String { String(localized: "courses.addFavorite", defaultValue: "Als Favorit merken") }
        static var removeFavorite: String { String(localized: "courses.removeFavorite", defaultValue: "Favorit entfernen") }
        static var unavailableTitle: String { String(localized: "courses.unavailableTitle", defaultValue: "Platzdaten nicht verfügbar") }
        static var unavailableText: String { String(localized: "courses.unavailableText", defaultValue: "Bitte mit Internetverbindung erneut öffnen. Danach ist der Platz auch offline gespeichert.") }
        static var demoNotice: String { String(localized: "courses.demoNotice", defaultValue: "Demo-Platz: Geometrie und Ratings sind fiktiv. Runden hier zählen nicht fürs Handicap.") }
        static var noHoleDataNotice: String { String(localized: "courses.noHoleDataNotice", defaultValue: "Für diesen Platz fehlen Lochdaten (Par, Handicap). Stableford, Netto und GPS sind nicht möglich.") }
        static var preview: String { String(localized: "courses.preview", defaultValue: "Platzvorschau") }
        static var tees: String { String(localized: "courses.tees", defaultValue: "Abschläge") }
        static var noRating: String { String(localized: "courses.noRating", defaultValue: "Kein Rating hinterlegt") }
        static var holes: String { String(localized: "courses.holes", defaultValue: "Löcher") }
        static var noHoleData: String { String(localized: "courses.noHoleData", defaultValue: "Keine Lochdaten hinterlegt.") }
    }

    enum Rating {
        static func values(cr: String, slope: String, par: String) -> String { String(localized: "rating.values", defaultValue: "CR \(cr) · Slope \(slope) · Par \(par)") }
        static var verified: String { String(localized: "rating.verified", defaultValue: "Geprüft") }
        static var unverified: String { String(localized: "rating.unverified", defaultValue: "Ungeprüft") }
        static var fictional: String { String(localized: "rating.fictional", defaultValue: "Fiktiv") }
        static var men: String { String(localized: "rating.men", defaultValue: "Herren") }
        static var women: String { String(localized: "rating.women", defaultValue: "Damen") }
        static var scope18: String { String(localized: "rating.scope18", defaultValue: "18 Loch") }
        static var scopeFront9: String { String(localized: "rating.scopeFront9", defaultValue: "Löcher 1–9") }
        static var scopeBack9: String { String(localized: "rating.scopeBack9", defaultValue: "Löcher 10–18") }

        static func scope(gender: Gender, scope: RatingScope) -> String {
            let g = gender == .male ? men : women
            switch scope {
            case .eighteen: return g + " · " + scope18
            case .front9: return g + " · " + scopeFront9
            case .back9: return g + " · " + scopeBack9
            }
        }
    }

    enum Location {
        static var denied: String { String(localized: "location.denied", defaultValue: "Standortzugriff ist nicht erlaubt. Plätze in der Nähe brauchen deinen Standort.") }
        static var deniedRound: String { String(localized: "location.deniedRound", defaultValue: "Standortzugriff ist nicht erlaubt – Entfernungen werden vom Abschlag gemessen.") }
        static var locating: String { String(localized: "location.locating", defaultValue: "Standort wird ermittelt …") }
        static var openSettings: String { String(localized: "location.openSettings", defaultValue: "Einstellungen") }
    }

    enum Map {
        static func accessibility(_ hole: String) -> String { String(localized: "map.accessibility", defaultValue: "Karte von Loch \(hole). Tippen misst die Entfernung zu einem Punkt.") }
        static var satellite: String { String(localized: "map.satellite", defaultValue: "Satellit") }
        static var vector: String { String(localized: "map.vector", defaultValue: "Platzkarte") }
        static var zoomGreen: String { String(localized: "map.zoomGreen", defaultValue: "Grün vergrößern") }
        static var reset: String { String(localized: "map.reset", defaultValue: "Ansicht zurücksetzen") }
        static var arcs: String { String(localized: "map.arcs", defaultValue: "Distanzbögen") }
    }

    enum Preview {
        static var title: String { String(localized: "preview.title", defaultValue: "Platzvorschau") }
        static var modeMeasure: String { String(localized: "preview.modeMeasure", defaultValue: "Messen") }
        static var modeTwoPoints: String { String(localized: "preview.modeTwoPoints", defaultValue: "2 Punkte") }
        static var modeStrategy: String { String(localized: "preview.modeStrategy", defaultValue: "Strategie") }
        static func teeToGreen(_ distance: String) -> String { String(localized: "preview.teeToGreen", defaultValue: "Abschlag bis Grünmitte: \(distance). Tippe auf die Karte, um zu messen.") }
        static func measured(_ toTarget: String, _ toGreen: String) -> String { String(localized: "preview.measured", defaultValue: "Bis zum Punkt \(toTarget) · danach \(toGreen) bis Grünmitte") }
        static var tapTwoPoints: String { String(localized: "preview.tapTwoPoints", defaultValue: "Tippe zwei Punkte an.") }
        static func between(_ distance: String) -> String { String(localized: "preview.between", defaultValue: "Entfernung zwischen den Punkten: \(distance)") }
        static var strategyHint: String { String(localized: "preview.strategyHint", defaultValue: "Tippe bis zu drei Zielpunkte an: Abschlag → Layup → Annäherung → Grün.") }
        static func strategyCount(_ count: String) -> String { String(localized: "preview.strategyCount", defaultValue: "\(count) Zielpunkte geplant") }
        static var saveStrategy: String { String(localized: "preview.saveStrategy", defaultValue: "Strategie sichern") }
        static var clearStrategy: String { String(localized: "preview.clearStrategy", defaultValue: "Löschen") }
    }

    enum Setup {
        static var title: String { String(localized: "setup.title", defaultValue: "Runde starten") }
        static var holes: String { String(localized: "setup.holes", defaultValue: "Löcher") }
        static var holes18: String { String(localized: "setup.holes18", defaultValue: "18 Loch") }
        static var holes9: String { String(localized: "setup.holes9", defaultValue: "9 Loch") }
        static var front9: String { String(localized: "setup.front9", defaultValue: "Vordere 9") }
        static var back9: String { String(localized: "setup.back9", defaultValue: "Hintere 9") }
        static var date: String { String(localized: "setup.date", defaultValue: "Datum") }
        static var format: String { String(localized: "setup.format", defaultValue: "Spielform") }
        static var strokePlay: String { String(localized: "setup.strokePlay", defaultValue: "Zählspiel") }
        static var stableford: String { String(localized: "setup.stableford", defaultValue: "Stableford") }
        static var matchPlay: String { String(localized: "setup.matchPlay", defaultValue: "Lochspiel") }
        static var matchPlayHint: String { String(localized: "setup.matchPlayHint", defaultValue: "Lochspiel gibt es mit genau zwei Spielern.") }
        static var handicap: String { String(localized: "setup.handicap", defaultValue: "Handicap") }
        static var handicapIndex: String { String(localized: "setup.handicapIndex", defaultValue: "HCPI") }
        static var playingHandicap: String { String(localized: "setup.playingHandicap", defaultValue: "Playing Hcp") }
        static var noHandicap: String { String(localized: "setup.noHandicap", defaultValue: "Ohne") }
        static func allowance(_ percent: String) -> String { String(localized: "setup.allowance", defaultValue: "Handicap-Verrechnung \(percent) %") }
        static var scoring: String { String(localized: "setup.scoring", defaultValue: "Erfassung") }
        static var scoringFull: String { String(localized: "setup.scoringFull", defaultValue: "Vollständig") }
        static var scoringSimple: String { String(localized: "setup.scoringSimple", defaultValue: "Nur Score") }
        static var scoringGPS: String { String(localized: "setup.scoringGPS", defaultValue: "Nur GPS") }
        static var privacy: String { String(localized: "setup.privacy", defaultValue: "Sichtbarkeit") }
        static var privacyPrivate: String { String(localized: "setup.privacyPrivate", defaultValue: "Privat") }
        static var privacyFriends: String { String(localized: "setup.privacyFriends", defaultValue: "Freunde") }
        static var privacyPublic: String { String(localized: "setup.privacyPublic", defaultValue: "Öffentlich") }
        static var privacyHint: String { String(localized: "setup.privacyHint", defaultValue: "Gilt, sobald Konten und Teilen verfügbar sind. Bis dahin bleibt jede Runde auf dem Gerät.") }
        static var players: String { String(localized: "setup.players", defaultValue: "Spieler und Abschläge") }
        static var addPlayer: String { String(localized: "setup.addPlayer", defaultValue: "Mitspieler hinzufügen") }
        static var addGuest: String { String(localized: "setup.addGuest", defaultValue: "Gastspieler") }
        static func playerHandicap(_ hcpi: String) -> String { String(localized: "setup.playerHandicap", defaultValue: "HCPI \(hcpi)") }
        static func removePlayer(_ name: String) -> String { String(localized: "setup.removePlayer", defaultValue: "\(name) entfernen") }
        static func manualPlayingHandicap(_ value: String) -> String { String(localized: "setup.manualPlayingHandicap", defaultValue: "Playing Handicap: \(value)") }
        static var tee: String { String(localized: "setup.tee", defaultValue: "Abschlag") }
        static var gender: String { String(localized: "setup.gender", defaultValue: "Rating für") }
        static var male: String { String(localized: "setup.male", defaultValue: "Herren") }
        static var female: String { String(localized: "setup.female", defaultValue: "Damen") }
        static var confirmRating: String { String(localized: "setup.confirmRating", defaultValue: "Werte stimmen mit meiner Scorekarte überein") }
        static var noRatingForTee: String { String(localized: "setup.noRatingForTee", defaultValue: "Für diesen Abschlag und diese Lochzahl ist kein Rating hinterlegt – Netto und Stableford entfallen für diesen Spieler.") }
        static var guestName: String { String(localized: "setup.guestName", defaultValue: "Name") }
        static var guestHandicap: String { String(localized: "setup.guestHandicap", defaultValue: "Handicap Index (optional)") }
        static var countsTitle: String { String(localized: "setup.countsTitle", defaultValue: "Handicap-Wertung") }
        static var countsToggle: String { String(localized: "setup.countsToggle", defaultValue: "Runde fürs Handicap werten") }
        static var countsHint: String { String(localized: "setup.countsHint", defaultValue: "Privatrunden zählen nur, wenn sie vorher beim Club angemeldet und mit Zähler gespielt werden. Die App berechnet das Score Differential nach WHS (DGV 2026).") }
        static var countsDemo: String { String(localized: "setup.countsDemo", defaultValue: "Demo-Plätze haben fiktive Ratings – die Runde zählt nicht fürs Handicap.") }
        static var start: String { String(localized: "setup.start", defaultValue: "Runde starten") }
        static var startFailed: String { String(localized: "setup.startFailed", defaultValue: "Die Runde konnte nicht gespeichert werden. Bitte erneut versuchen.") }
        static var issueMatchPlay: String { String(localized: "setup.issueMatchPlay", defaultValue: "Lochspiel braucht genau zwei Spieler.") }
        static var issueStableford: String { String(localized: "setup.issueStableford", defaultValue: "Stableford braucht Par je Loch.") }
        static func issueTooMany(_ max: String) -> String { String(localized: "setup.issueTooMany", defaultValue: "Höchstens \(max) Spieler je Runde.") }
        static var issueName: String { String(localized: "setup.issueName", defaultValue: "Bitte jedem Spieler einen Namen geben.") }
        static func issueTee(_ name: String) -> String { String(localized: "setup.issueTee", defaultValue: "Bitte einen Abschlag für \(name) wählen.") }
        static func issueHandicap(_ name: String) -> String { String(localized: "setup.issueHandicap", defaultValue: "Für \(name) fehlt das Handicap.") }
        static func issueRating(_ name: String) -> String { String(localized: "setup.issueRating", defaultValue: "\(name): kein vollständiges Rating – gewertet wird nur brutto.") }
        static func issueUnverified(_ name: String) -> String { String(localized: "setup.issueUnverified", defaultValue: "\(name): Das Rating ist ungeprüft. Bitte mit der Scorekarte vergleichen und bestätigen, damit die Runde zählen kann.") }
    }

    enum Round {
        static func holeTitle(_ number: String) -> String { String(localized: "round.holeTitle", defaultValue: "Loch \(number)") }
        static func par(_ par: String) -> String { String(localized: "round.par", defaultValue: "Par \(par)") }
        static func hcp(_ si: String) -> String { String(localized: "round.hcp", defaultValue: "HCP \(si)") }
        static var previousHole: String { String(localized: "round.previousHole", defaultValue: "Vorheriges Loch") }
        static var nextHole: String { String(localized: "round.nextHole", defaultValue: "Nächstes Loch") }
        static var minimize: String { String(localized: "round.minimize", defaultValue: "Rundenmodus verlassen (Runde läuft weiter)") }
        static var menu: String { String(localized: "round.menu", defaultValue: "Rundenmenü") }
        static var scorecard: String { String(localized: "round.scorecard", defaultValue: "Scorekarte") }
        static var end: String { String(localized: "round.end", defaultValue: "Runde beenden") }
        static var endTitle: String { String(localized: "round.endTitle", defaultValue: "Runde beenden?") }
        static func endMessage(_ done: String, _ total: String) -> String { String(localized: "round.endMessage", defaultValue: "\(done) von \(total) Löchern sind erfasst.") }
        static var finish: String { String(localized: "round.finish", defaultValue: "Runde abschließen") }
        static var abandon: String { String(localized: "round.abandon", defaultValue: "Runde abbrechen") }
        static var tabDistance: String { String(localized: "round.tabDistance", defaultValue: "Distanz") }
        static var tabMap: String { String(localized: "round.tabMap", defaultValue: "Karte") }
        static var tabScore: String { String(localized: "round.tabScore", defaultValue: "Score") }
        static var tabHole: String { String(localized: "round.tabHole", defaultValue: "Loch") }
        static var chooseHole: String { String(localized: "round.chooseHole", defaultValue: "Loch wählen") }
        static func holeState(_ hole: String, _ state: String) -> String { String(localized: "round.holeState", defaultValue: "Loch \(hole), \(state)") }
        static var holeDone: String { String(localized: "round.holeDone", defaultValue: "erfasst") }
        static var holeOpen: String { String(localized: "round.holeOpen", defaultValue: "offen") }
        static var suggestionTitle: String { String(localized: "round.suggestionTitle", defaultValue: "Zum nächsten Loch wechseln?") }
        static func switchTo(_ hole: String) -> String { String(localized: "round.switchTo", defaultValue: "Zu Loch \(hole)") }
        static func suggestionScoreMissing(_ hole: String) -> String { String(localized: "round.suggestionScoreMissing", defaultValue: "Du stehst am nächsten Abschlag. Der Score für Loch \(hole) fehlt noch – du kannst ihn später nachtragen.") }
        static func suggestionUnexpected(_ hole: String) -> String { String(localized: "round.suggestionUnexpected", defaultValue: "Du stehst offenbar am Abschlag von Loch \(hole).") }
        static func suggestionConfirm(_ hole: String) -> String { String(localized: "round.suggestionConfirm", defaultValue: "Du stehst am Abschlag von Loch \(hole).") }
        static var noGreenData: String { String(localized: "round.noGreenData", defaultValue: "Für dieses Loch sind keine GPS-Daten hinterlegt. Die Scorekarte funktioniert trotzdem.") }
        static var fromTeeNoGPS: String { String(localized: "round.fromTeeNoGPS", defaultValue: "GPS wird ermittelt – bis dahin Entfernungen vom Abschlag.") }
        static var offCourse: String { String(localized: "round.offCourse", defaultValue: "Du bist nicht auf diesem Loch – Entfernungen vom Abschlag.") }
        static var lowPower: String { String(localized: "round.lowPower", defaultValue: "Akku niedrig: GPS misst sparsamer.") }
        static var loadFailedTitle: String { String(localized: "round.loadFailedTitle", defaultValue: "Runde nicht verfügbar") }
        static var loadFailedText: String { String(localized: "round.loadFailedText", defaultValue: "Runde oder Platzdaten konnten nicht geladen werden. Deine Eingaben sind gespeichert.") }
    }

    enum GPS {
        static func excellent(_ accuracy: String) -> String { String(localized: "gps.excellent", defaultValue: "GPS sehr gut ±\(accuracy) m") }
        static func good(_ accuracy: String) -> String { String(localized: "gps.good", defaultValue: "GPS gut ±\(accuracy) m") }
        static func weak(_ accuracy: String) -> String { String(localized: "gps.weak", defaultValue: "GPS schwach ±\(accuracy) m") }
        static var stale: String { String(localized: "gps.stale", defaultValue: "GPS veraltet") }
        static var none: String { String(localized: "gps.none", defaultValue: "Kein GPS") }
        static var weakNotice: String { String(localized: "gps.weakNotice", defaultValue: "GPS-Signal schwach. Wir verwenden die letzte zuverlässige Position.") }
    }

    enum Distance {
        static var front: String { String(localized: "distance.front", defaultValue: "Front") }
        static var center: String { String(localized: "distance.center", defaultValue: "Mitte") }
        static var centerFromTee: String { String(localized: "distance.centerFromTee", defaultValue: "Mitte vom Abschlag") }
        static var back: String { String(localized: "distance.back", defaultValue: "Back") }
        static var pin: String { String(localized: "distance.pin", defaultValue: "Fahne") }
        static func toTarget(_ toTarget: String, _ toGreen: String) -> String { String(localized: "distance.toTarget", defaultValue: "Ziel \(toTarget) · danach \(toGreen)") }
        static var clearTarget: String { String(localized: "distance.clearTarget", defaultValue: "Ziel entfernen") }
        static var hazards: String { String(localized: "distance.hazards", defaultValue: "Hindernisse und Ziele") }
        static var noHazards: String { String(localized: "distance.noHazards", defaultValue: "Keine Hindernisse vor dir.") }
        static var inside: String { String(localized: "distance.inside", defaultValue: "Du stehst darin") }
        static var reach: String { String(localized: "distance.reach", defaultValue: "bis Anfang") }
        static var reachCenterCarry: String { String(localized: "distance.reachCenterCarry", defaultValue: "Anfang / Mitte / Ende") }
    }

    enum Hazard {
        static var bunker: String { String(localized: "hazard.bunker", defaultValue: "Bunker") }
        static var water: String { String(localized: "hazard.water", defaultValue: "Wasser") }
        static var outOfBounds: String { String(localized: "hazard.outOfBounds", defaultValue: "Aus") }
        static var trees: String { String(localized: "hazard.trees", defaultValue: "Bäume") }
        static var rough: String { String(localized: "hazard.rough", defaultValue: "Rough") }
        static var layup: String { String(localized: "hazard.layup", defaultValue: "Layup") }
        static var dogleg: String { String(localized: "hazard.dogleg", defaultValue: "Dogleg") }
        static var target: String { String(localized: "hazard.target", defaultValue: "Ziel") }
        static var left: String { String(localized: "hazard.left", defaultValue: "links") }
        static var right: String { String(localized: "hazard.right", defaultValue: "rechts") }
        static var center: String { String(localized: "hazard.center", defaultValue: "Mitte") }
    }

    enum Score {
        static var even: String { String(localized: "score.even", defaultValue: "±0") }
        static func points(_ points: String) -> String { String(localized: "score.points", defaultValue: "\(points) Pkt.") }
    }

    enum Relative {
        static var holeInOne: String { String(localized: "relative.holeInOne", defaultValue: "Ass") }
        static var albatross: String { String(localized: "relative.albatross", defaultValue: "Albatros") }
        static var eagle: String { String(localized: "relative.eagle", defaultValue: "Eagle") }
        static var birdie: String { String(localized: "relative.birdie", defaultValue: "Birdie") }
        static var par: String { String(localized: "relative.par", defaultValue: "Par") }
        static var bogey: String { String(localized: "relative.bogey", defaultValue: "Bogey") }
        static var doubleBogey: String { String(localized: "relative.doubleBogey", defaultValue: "Doppelbogey") }
        static var tripleBogey: String { String(localized: "relative.tripleBogey", defaultValue: "Triple") }
        static var worse: String { String(localized: "relative.worse", defaultValue: "Mehr") }
    }

    enum ScoreEntry {
        static func step(_ index: String, _ count: String) -> String { String(localized: "scoreEntry.step", defaultValue: "Schritt \(index) von \(count)") }
        static func scoreTitle(_ name: String) -> String { String(localized: "scoreEntry.scoreTitle", defaultValue: "Score \(name)") }
        static var groupTitle: String { String(localized: "scoreEntry.groupTitle", defaultValue: "Mitspieler") }
        static var puttsTitle: String { String(localized: "scoreEntry.puttsTitle", defaultValue: "Putts") }
        static var fairwayTitle: String { String(localized: "scoreEntry.fairwayTitle", defaultValue: "Fairway") }
        static var girTitle: String { String(localized: "scoreEntry.girTitle", defaultValue: "Grün in Regulation?") }
        static var extrasTitle: String { String(localized: "scoreEntry.extrasTitle", defaultValue: "Strafschläge und Bunker") }
        static var pickedUp: String { String(localized: "scoreEntry.pickedUp", defaultValue: "Aufgehoben") }
        static var fewer: String { String(localized: "scoreEntry.fewer", defaultValue: "Ein Schlag weniger") }
        static var more: String { String(localized: "scoreEntry.more", defaultValue: "Ein Schlag mehr") }
        static func fewerFor(_ name: String) -> String { String(localized: "scoreEntry.fewerFor", defaultValue: "Ein Schlag weniger für \(name)") }
        static func moreFor(_ name: String) -> String { String(localized: "scoreEntry.moreFor", defaultValue: "Ein Schlag mehr für \(name)") }
        static var parShort: String { String(localized: "scoreEntry.parShort", defaultValue: "Par") }
        static func puttsCount(_ putts: String) -> String { String(localized: "scoreEntry.puttsCount", defaultValue: "\(putts) Putts") }
        static var fairwayHit: String { String(localized: "scoreEntry.fairwayHit", defaultValue: "Getroffen") }
        static var fairwayLeft: String { String(localized: "scoreEntry.fairwayLeft", defaultValue: "Links") }
        static var fairwayRight: String { String(localized: "scoreEntry.fairwayRight", defaultValue: "Rechts") }
        static var fairwayShort: String { String(localized: "scoreEntry.fairwayShort", defaultValue: "Zu kurz") }
        static var penalties: String { String(localized: "scoreEntry.penalties", defaultValue: "Strafschläge") }
        static var sand: String { String(localized: "scoreEntry.sand", defaultValue: "Schlag aus dem Bunker") }
        static var girUnlikely: String { String(localized: "scoreEntry.girUnlikely", defaultValue: "GIR „Ja“, aber mehr Schläge bis zum Grün als üblich – bitte prüfen.") }
    }

    enum Scorecard {
        static var hole: String { String(localized: "scorecard.hole", defaultValue: "Loch") }
        static var par: String { String(localized: "scorecard.par", defaultValue: "Par") }
        static var hcp: String { String(localized: "scorecard.hcp", defaultValue: "HCP") }
        static var putts: String { String(localized: "scorecard.putts", defaultValue: "Putts") }
        static var front: String { String(localized: "scorecard.front", defaultValue: "Vorne") }
        static var back: String { String(localized: "scorecard.back", defaultValue: "Hinten") }
        static var total: String { String(localized: "scorecard.total", defaultValue: "Gesamt") }
        static var gross: String { String(localized: "scorecard.gross", defaultValue: "Brutto") }
        static var toPar: String { String(localized: "scorecard.toPar", defaultValue: "Zu Par") }
        static var netToPar: String { String(localized: "scorecard.netToPar", defaultValue: "Netto zu Par") }
        static var stableford: String { String(localized: "scorecard.stableford", defaultValue: "Stableford") }
        static func playingHandicap(_ value: String) -> String { String(localized: "scorecard.playingHandicap", defaultValue: "Playing Hcp \(value)") }
        static func thru(_ holes: String) -> String { String(localized: "scorecard.thru", defaultValue: "nach \(holes)") }
        static var leaderboardGross: String { String(localized: "scorecard.leaderboardGross", defaultValue: "Rangliste brutto") }
        static var leaderboardNet: String { String(localized: "scorecard.leaderboardNet", defaultValue: "Rangliste netto") }
        static var leaderboardStableford: String { String(localized: "scorecard.leaderboardStableford", defaultValue: "Rangliste Stableford") }
        static var matchPlay: String { String(localized: "scorecard.matchPlay", defaultValue: "Lochspiel") }
        static var matchNotStarted: String { String(localized: "scorecard.matchNotStarted", defaultValue: "Noch kein Loch gespielt") }
        static var allSquare: String { String(localized: "scorecard.allSquare", defaultValue: "All Square") }
        static func matchUp(_ name: String, _ lead: String) -> String { String(localized: "scorecard.matchUp", defaultValue: "\(name) \(lead) auf") }
        static func matchDormie(_ name: String, _ lead: String) -> String { String(localized: "scorecard.matchDormie", defaultValue: "\(name) \(lead) auf (dormie)") }
        static func matchWon(_ name: String, _ lead: String, _ remaining: String) -> String { String(localized: "scorecard.matchWon", defaultValue: "\(name) gewinnt \(lead) & \(remaining)") }
        static func matchHoles(_ played: String, _ remaining: String) -> String { String(localized: "scorecard.matchHoles", defaultValue: "\(played) gespielt · \(remaining) offen") }
    }

    enum HandicapIssue {
        static var disabled: String { String(localized: "handicapIssue.disabled", defaultValue: "Ohne Handicap-Wertung") }
        static var indexMissing: String { String(localized: "handicapIssue.indexMissing", defaultValue: "Kein Handicap angegeben – nur brutto.") }
        static var ratingMissing: String { String(localized: "handicapIssue.ratingMissing", defaultValue: "Kein vollständiges Rating für diesen Abschlag – nur brutto.") }
        static var scopeMismatch: String { String(localized: "handicapIssue.scopeMismatch", defaultValue: "Kein Rating für diese Lochzahl (wird nicht abgeleitet) – nur brutto.") }
        static var holeData: String { String(localized: "handicapIssue.holeData", defaultValue: "Par oder Handicap je Loch fehlen – nur brutto.") }
        static var invalid: String { String(localized: "handicapIssue.invalid", defaultValue: "Rating-Werte unplausibel – nur brutto.") }
    }

    enum Differential {
        static var incomplete: String { String(localized: "differential.incomplete", defaultValue: "Score Differential: erst mit Ergebnis auf allen Löchern (aufgehoben zählt als Netto-Doppelbogey).") }
        static var indexMissing: String { String(localized: "differential.indexMissing", defaultValue: "Score Differential: kein Handicap Index angegeben.") }
        static var ratingMissing: String { String(localized: "differential.ratingMissing", defaultValue: "Score Differential: kein vollständiges Rating (CR, Slope, Par).") }
        static var scopeMismatch: String { String(localized: "differential.scopeMismatch", defaultValue: "Score Differential: kein Rating für diese Lochzahl.") }
        static var holeData: String { String(localized: "differential.holeData", defaultValue: "Score Differential: Par oder Handicap je Loch fehlen.") }
        static var invalid: String { String(localized: "differential.invalid", defaultValue: "Score Differential: Eingaben unplausibel.") }
    }

    enum Summary {
        static var title: String { String(localized: "summary.title", defaultValue: "Runde") }
        static var finishedTitle: String { String(localized: "summary.finishedTitle", defaultValue: "Runde beendet") }
        static var score: String { String(localized: "summary.score", defaultValue: "Score") }
        static var stableford: String { String(localized: "summary.stableford", defaultValue: "Stableford") }
        static var differential: String { String(localized: "summary.differential", defaultValue: "Differential") }
        static var putts: String { String(localized: "summary.putts", defaultValue: "Putts") }
        static var fairways: String { String(localized: "summary.fairways", defaultValue: "Fairways") }
        static var gir: String { String(localized: "summary.gir", defaultValue: "GIR") }
        static var yourRound: String { String(localized: "summary.yourRound", defaultValue: "Deine Runde") }
        static var highlights: String { String(localized: "summary.highlights", defaultValue: "Highlights") }
        static func eagles(_ n: String) -> String { String(localized: "summary.eagles", defaultValue: "\(n) × Eagle oder besser") }
        static func birdies(_ n: String) -> String { String(localized: "summary.birdies", defaultValue: "\(n) × Birdie") }
        static func pars(_ n: String) -> String { String(localized: "summary.pars", defaultValue: "\(n) × Par") }
        static func onePutts(_ n: String) -> String { String(localized: "summary.onePutts", defaultValue: "\(n) × Ein-Putt") }
        static var noPenalties: String { String(localized: "summary.noPenalties", defaultValue: "Keine Strafschläge") }
        static var counts: String { String(localized: "summary.counts", defaultValue: "Diese Runde zählt fürs Handicap (Rechenweg nach WHS, DGV 2026).") }
        static var notCounted: String { String(localized: "summary.notCounted", defaultValue: "Das Differential ist berechnet, die Runde zählt aber nicht fürs Handicap (nicht als Handicap-Runde markiert, Demo-Platz oder ungeprüftes Rating).") }
        static var share: String { String(localized: "summary.share", defaultValue: "Runde teilen") }
    }

    enum Rounds {
        static var title: String { String(localized: "rounds.title", defaultValue: "Runden") }
        static var active: String { String(localized: "rounds.active", defaultValue: "Laufende Runde") }
        static var history: String { String(localized: "rounds.history", defaultValue: "Verlauf") }
        static var empty: String { String(localized: "rounds.empty", defaultValue: "Noch keine abgeschlossenen Runden.") }
        static var filterAll: String { String(localized: "rounds.filterAll", defaultValue: "Alle") }
        static var filterCounting: String { String(localized: "rounds.filterCounting", defaultValue: "Handicap") }
        static var sort: String { String(localized: "rounds.sort", defaultValue: "Sortierung") }
        static var sortNewest: String { String(localized: "rounds.sortNewest", defaultValue: "Neueste") }
        static var sortBest: String { String(localized: "rounds.sortBest", defaultValue: "Beste") }
        static var sortWorst: String { String(localized: "rounds.sortWorst", defaultValue: "Schlechteste") }
        static func putts(_ n: String) -> String { String(localized: "rounds.putts", defaultValue: "\(n) Putts") }
        static var delete: String { String(localized: "rounds.delete", defaultValue: "Runde löschen") }
        static var deleteTitle: String { String(localized: "rounds.deleteTitle", defaultValue: "Runde löschen?") }
        static var deleteMessage: String { String(localized: "rounds.deleteMessage", defaultValue: "Die Runde wird auf allen Geräten gelöscht. Das lässt sich nicht rückgängig machen.") }
        static var notFound: String { String(localized: "rounds.notFound", defaultValue: "Runde nicht gefunden") }
        static var statusInProgress: String { String(localized: "rounds.statusInProgress", defaultValue: "läuft") }
        static var statusCompleted: String { String(localized: "rounds.statusCompleted", defaultValue: "abgeschlossen") }
        static var statusAbandoned: String { String(localized: "rounds.statusAbandoned", defaultValue: "abgebrochen") }
    }

    enum Stats {
        static var title: String { String(localized: "stats.title", defaultValue: "Statistik") }
        static var emptyTitle: String { String(localized: "stats.emptyTitle", defaultValue: "Noch keine Statistik") }
        static var emptyText: String { String(localized: "stats.emptyText", defaultValue: "Schließe eine Runde ab – Werte entstehen nur aus deinen tatsächlichen Eingaben.") }
        static var scoring: String { String(localized: "stats.scoring", defaultValue: "Scoring") }
        static var rounds: String { String(localized: "stats.rounds", defaultValue: "Runden") }
        static var average18: String { String(localized: "stats.average18", defaultValue: "Ø Score 18 Loch") }
        static var average9: String { String(localized: "stats.average9", defaultValue: "Ø Score 9 Loch") }
        static var best18: String { String(localized: "stats.best18", defaultValue: "Bester Score 18 Loch") }
        static func overPar(_ value: String) -> String { String(localized: "stats.overPar", defaultValue: "Ø \(value) über Par") }
        static var driving: String { String(localized: "stats.driving", defaultValue: "Abschlag") }
        static var fairways: String { String(localized: "stats.fairways", defaultValue: "Fairways") }
        static func ofHoles(_ part: String, _ whole: String) -> String { String(localized: "stats.ofHoles", defaultValue: "\(part) von \(whole)") }
        static var missLeftRight: String { String(localized: "stats.missLeftRight", defaultValue: "Fehlschlag links / rechts") }
        static func missShort(_ n: String) -> String { String(localized: "stats.missShort", defaultValue: "\(n) × zu kurz") }
        static var approach: String { String(localized: "stats.approach", defaultValue: "Annäherung") }
        static var gir: String { String(localized: "stats.gir", defaultValue: "Grüns in Regulation") }
        static var shortGame: String { String(localized: "stats.shortGame", defaultValue: "Kurzes Spiel") }
        static var scrambling: String { String(localized: "stats.scrambling", defaultValue: "Scrambling") }
        static var sandSaves: String { String(localized: "stats.sandSaves", defaultValue: "Sand Saves") }
        static var putting: String { String(localized: "stats.putting", defaultValue: "Putting") }
        static var puttsPerRound: String { String(localized: "stats.puttsPerRound", defaultValue: "Putts je 18 Loch") }
        static var puttsPerGIR: String { String(localized: "stats.puttsPerGIR", defaultValue: "Putts je GIR") }
        static var threePutts: String { String(localized: "stats.threePutts", defaultValue: "Dreiputts") }
        static var onePutts: String { String(localized: "stats.onePutts", defaultValue: "Ein-Putts") }
        static var distribution: String { String(localized: "stats.distribution", defaultValue: "Verteilung der Lochergebnisse") }
        static var triplePlus: String { String(localized: "stats.triplePlus", defaultValue: "Triple und mehr") }
        static var definitions: String { String(localized: "stats.definitions", defaultValue: "Fairways nur Par 4/5. Scrambling: Grün verfehlt, danach Par oder besser. Sand Save: nach Bunkerschlag Par oder besser. Statistik verändert nie das Handicap.") }
    }

    enum Profile {
        static var title: String { String(localized: "profile.title", defaultValue: "Profil") }
        static func handicapLine(_ hcpi: String) -> String { String(localized: "profile.handicapLine", defaultValue: "Handicap Index \(hcpi)") }
        static var edit: String { String(localized: "profile.edit", defaultValue: "Profil bearbeiten") }
        static var demoAccount: String { String(localized: "profile.demoAccount", defaultValue: "Demo-Konto: Alle Daten bleiben auf diesem Gerät, bis Konten und Synchronisation mit dem Server verfügbar sind.") }
        static var name: String { String(localized: "profile.name", defaultValue: "Name") }
        static var handicapIndex: String { String(localized: "profile.handicapIndex", defaultValue: "Handicap Index") }
        static var handicapHint: String { String(localized: "profile.handicapHint", defaultValue: "Trage den offiziellen Handicap Index deines Verbands ein (Plus-Handicap mit „+“, z. B. +1,5).") }
        static var handedness: String { String(localized: "profile.handedness", defaultValue: "Spielhand") }
        static var rightHanded: String { String(localized: "profile.rightHanded", defaultValue: "Rechtshänder") }
        static var leftHanded: String { String(localized: "profile.leftHanded", defaultValue: "Linkshänder") }
        static var preferredTee: String { String(localized: "profile.preferredTee", defaultValue: "Bevorzugter Abschlag") }
        static var homeCourse: String { String(localized: "profile.homeCourse", defaultValue: "Heimatplatz") }
        static var noHomeCourse: String { String(localized: "profile.noHomeCourse", defaultValue: "Keiner") }
        static var version: String { String(localized: "profile.version", defaultValue: "Version") }
        static var footer: String { String(localized: "profile.footer", defaultValue: "Golfplatzdaten in dieser Version sind fiktive Demo-Daten. Handicap-Regeln: WHS, Deutschland/DGV 2026.") }
        static var white: String { String(localized: "profile.teeWhite", defaultValue: "Weiß") }
        static var yellow: String { String(localized: "profile.teeYellow", defaultValue: "Gelb") }
        static var blue: String { String(localized: "profile.teeBlue", defaultValue: "Blau") }
        static var red: String { String(localized: "profile.teeRed", defaultValue: "Rot") }
        static var black: String { String(localized: "profile.teeBlack", defaultValue: "Schwarz") }
        static var gold: String { String(localized: "profile.teeGold", defaultValue: "Gold") }
        static var orange: String { String(localized: "profile.teeOrange", defaultValue: "Orange") }
        static var green: String { String(localized: "profile.teeGreen", defaultValue: "Grün") }

        static func teeColor(_ color: TeeColor) -> String {
            switch color {
            case .white: return white
            case .yellow: return yellow
            case .blue: return blue
            case .red: return red
            case .black: return black
            case .gold: return gold
            case .orange: return orange
            case .green: return green
            }
        }
    }

    enum Settings {
        static var title: String { String(localized: "settings.title", defaultValue: "Einstellungen") }
        static var units: String { String(localized: "settings.units", defaultValue: "Einheit") }
        static var meters: String { String(localized: "settings.meters", defaultValue: "Meter") }
        static var yards: String { String(localized: "settings.yards", defaultValue: "Yards") }
        static var autoHole: String { String(localized: "settings.autoHole", defaultValue: "Automatischer Lochwechsel") }
        static var autoHoleAutomatic: String { String(localized: "settings.autoHoleAutomatic", defaultValue: "Automatisch") }
        static var autoHoleAsk: String { String(localized: "settings.autoHoleAsk", defaultValue: "Fragen") }
        static var autoHoleOff: String { String(localized: "settings.autoHoleOff", defaultValue: "Aus") }
        static var defaultScoring: String { String(localized: "settings.defaultScoring", defaultValue: "Standard-Erfassung") }
        static var arcs: String { String(localized: "settings.arcs", defaultValue: "Distanzbögen auf der Karte") }
        static var haptics: String { String(localized: "settings.haptics", defaultValue: "Haptisches Feedback") }
        static var keepScreenOn: String { String(localized: "settings.keepScreenOn", defaultValue: "Bildschirm während der Runde an") }
        static var appearance: String { String(localized: "settings.appearance", defaultValue: "Erscheinungsbild") }
        static var appearanceSystem: String { String(localized: "settings.appearanceSystem", defaultValue: "System") }
        static var appearanceLight: String { String(localized: "settings.appearanceLight", defaultValue: "Hell") }
        static var appearanceDark: String { String(localized: "settings.appearanceDark", defaultValue: "Dunkel") }
        static var language: String { String(localized: "settings.language", defaultValue: "Sprache (iOS-Einstellungen)") }
    }

    enum Privacy {
        static var title: String { String(localized: "privacy.title", defaultValue: "Datenschutz") }
        static var location: String { String(localized: "privacy.location", defaultValue: "Der Standort wird nur während einer Runde bzw. für „In der Nähe“ verwendet, bleibt auf dem Gerät und wird nicht als Bewegungsprofil gespeichert.") }
        static var export: String { String(localized: "privacy.export", defaultValue: "Meine Daten exportieren") }
        static var exportTitle: String { String(localized: "privacy.exportTitle", defaultValue: "Golfdaten (JSON)") }
        static var deleteAll: String { String(localized: "privacy.deleteAll", defaultValue: "Alle Runden löschen") }
        static var deleteAllTitle: String { String(localized: "privacy.deleteAllTitle", defaultValue: "Alle Runden löschen?") }
        static var deleteAllMessage: String { String(localized: "privacy.deleteAllMessage", defaultValue: "Alle Runden werden gelöscht. Das lässt sich nicht rückgängig machen.") }
    }

    enum Developer {
        static var title: String { String(localized: "developer.title", defaultValue: "Entwicklermenü") }
        static var gps: String { String(localized: "developer.gps", defaultValue: "GPS") }
        static var fakeGPS: String { String(localized: "developer.fakeGPS", defaultValue: "Fake GPS") }
        static func hole(_ n: String) -> String { String(localized: "developer.hole", defaultValue: "Loch \(n)") }
        static var spotTee: String { String(localized: "developer.spotTee", defaultValue: "Abschlag") }
        static var spotFairway: String { String(localized: "developer.spotFairway", defaultValue: "150 m") }
        static var spotGreen: String { String(localized: "developer.spotGreen", defaultValue: "Grün") }
        static var spotNextTee: String { String(localized: "developer.spotNextTee", defaultValue: "Nächster") }
        static func accuracy(_ m: String) -> String { String(localized: "developer.accuracy", defaultValue: "Genauigkeit ±\(m) m") }
        static func noise(_ m: String) -> String { String(localized: "developer.noise", defaultValue: "Rauschen \(m) m") }
        static var jump: String { String(localized: "developer.jump", defaultValue: "GPS-Sprung auslösen") }
        static func speed(_ factor: String) -> String { String(localized: "developer.speed", defaultValue: "Geschwindigkeit \(factor)×") }
        static var simulateRound: String { String(localized: "developer.simulateRound", defaultValue: "Runde simulieren (ab gewähltem Loch)") }
        static var position: String { String(localized: "developer.position", defaultValue: "Position") }
        static var network: String { String(localized: "developer.network", defaultValue: "Netz und Synchronisation") }
        static var offline: String { String(localized: "developer.offline", defaultValue: "Offline simulieren") }
        static var forceSync: String { String(localized: "developer.forceSync", defaultValue: "Synchronisation erzwingen") }
        static var syncState: String { String(localized: "developer.syncState", defaultValue: "Status") }
        static var data: String { String(localized: "developer.data", defaultValue: "Daten") }
        static var resetDemo: String { String(localized: "developer.resetDemo", defaultValue: "Demo-Daten zurücksetzen") }
        static var designSystem: String { String(localized: "developer.designSystem", defaultValue: "Design-System") }
        static var hide: String { String(localized: "developer.hide", defaultValue: "Entwicklermenü ausblenden") }
    }
}
