import XCTest

/// Rauchtest der Kernstrecke auf dem Simulator: Start → Runde einrichten → Rundenbildschirm → Score erfassen →
/// Runde minimieren → fortsetzen. Läuft mit `-uiTesting` (simuliertes GPS, Runden nur im Speicher, Demo-Plätze).
final class GolfAppUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    @MainActor
    func testStartRoundEnterScoreAndResume() {
        let app = XCUIApplication()
        app.launchArguments += ["-uiTesting", "-AppleLanguages", "(de)", "-AppleLocale", "de_DE"]
        app.launch()

        // Start: „Runde starten“ öffnet die Einrichtung mit dem Demo-Platz
        let start = app.buttons["home.startRound"]
        XCTAssertTrue(start.waitForExistence(timeout: 15), "Startseite ohne „Runde starten“")
        start.tap()

        // Einrichtung: alles vorbelegt – nur starten
        let setupStart = app.buttons["setup.start"]
        XCTAssertTrue(setupStart.waitForExistence(timeout: 15), "Einrichtung lädt nicht")
        scrollUntilHittable(setupStart, in: app)
        setupStart.tap()

        // Rundenbildschirm mit Entfernungen und Score-Knopf
        let scoreTab = app.buttons["roundbar.score"]
        XCTAssertTrue(scoreTab.waitForExistence(timeout: 15), "Rundenbildschirm erscheint nicht")
        XCTAssertTrue(app.buttons["roundbar.distance"].exists)
        scoreTab.tap()

        // Score-Assistent: ersten Score wählen, dann „Fertig“
        let option = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'score.option.'")).firstMatch
        XCTAssertTrue(option.waitForExistence(timeout: 10), "Score-Auswahl fehlt")
        option.tap()
        let done = app.buttons["score.done"]
        XCTAssertTrue(done.waitForExistence(timeout: 5))
        done.tap()

        // Zurück auf dem Rundenbildschirm; minimieren und über die Startseite fortsetzen
        XCTAssertTrue(scoreTab.waitForExistence(timeout: 10))
        let minimize = app.buttons["round.minimize"]
        XCTAssertTrue(minimize.waitForExistence(timeout: 5))
        minimize.tap()
        let resume = app.buttons["home.resumeRound"]
        XCTAssertTrue(resume.waitForExistence(timeout: 10), "Laufende Runde fehlt auf der Startseite")
        resume.tap()
        XCTAssertTrue(scoreTab.waitForExistence(timeout: 10), "Runde lässt sich nicht fortsetzen")
    }

    @MainActor
    private func scrollUntilHittable(_ element: XCUIElement, in app: XCUIApplication) {
        var attempts = 0
        while !element.isHittable && attempts < 10 {
            app.swipeUp()
            attempts += 1
        }
    }
}
