// End-to-End-Abläufe A–K (Master-Prompt §157) für beide Editionen.
//   E2E_BASE=http://127.0.0.1:8090/hcp E2E_EDITION=webspace E2E_OUTBOX=<installation>/data/mail-outbox node e2e/flows.cjs
//   E2E_BASE=http://127.0.0.1:3200 E2E_EDITION=node E2E_OUTBOX=<MAIL_OUTBOX_DIR> node e2e/flows.cjs
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const fs = require("fs");
const path = require("path");

const BASE = process.env.E2E_BASE;
const EDITION = process.env.E2E_EDITION;
const OUTBOX = process.env.E2E_OUTBOX;
const SHOTS = process.env.E2E_SHOTS ?? path.join(__dirname, "..", ".e2e", EDITION);
const ADMIN = { email: "admin@example.de", password: "Admin-Passwort-1" };
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` – ${detail}` : ""}`);
}

function mails() {
  if (!fs.existsSync(OUTBOX)) return [];
  return fs
    .readdirSync(OUTBOX)
    .map((f) => path.join(OUTBOX, f))
    .sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs || a.localeCompare(b))
    .map((f) => JSON.parse(fs.readFileSync(f, "utf8").replace(/^<\?php exit; \?>\n/, "")));
}
function lastLink(to, pattern) {
  const m = mails().filter((x) => x.to === to && pattern.test(x.text));
  if (!m.length) return null;
  const link = m.at(-1).text.match(/https?:\/\/\S+/)[0];
  // Adresse aus der Mail → Testserver (Mails verwenden die eingestellte Website-Adresse)
  return link.startsWith(BASE) ? link : link.replace(/^https?:\/\/[^/]+(\/hcp(?=\/))?/, BASE);
}

const api = {
  me: EDITION === "webspace" ? "/api/me.php?action=load" : "/api/me",
  adminUsers: EDITION === "webspace" ? ["/api/admin.php?action=users", "POST"] : ["/api/admin/users", "GET"],
  roundGet: (id) => (EDITION === "webspace" ? null : `/api/me/rounds/${id}`),
  activity: EDITION === "webspace" ? "/api/community.php?action=activity" : "/api/community/activity",
  ranking: EDITION === "webspace" ? "/api/community.php?action=ranking" : "/api/community/ranking",
  publicRound: (member, round) => (EDITION === "webspace" ? `/api/community.php?action=round&member=${member}&round=${round}` : `/api/community/rounds/${member}/${round}`),
};

async function call(page, url, method = "GET", body, csrf = true) {
  return page.evaluate(
    async ({ url, method, body, csrf }) => {
      const headers = { "content-type": "application/json" };
      if (csrf) {
        const me = await fetch(url.includes(".php") ? url.replace(/api\/\w+\.php.*/, "api/auth.php?action=me") : "/api/auth/me").then((r) => r.json());
        if (me.csrf) headers["x-csrf-token"] = me.csrf;
      }
      const r = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: "same-origin" });
      let json = null;
      try {
        json = await r.json();
      } catch {}
      return { status: r.status, json };
    },
    { url: BASE + url, method, body, csrf },
  );
}

async function login(page, email, password) {
  await page.goto(`${BASE}/login/`);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click("form button[type=submit]");
}

/** Wartet, bis das Element sichtbar ist (isVisible() wartet nicht). */
async function visible(locator, timeout = 10000) {
  return locator
    .first()
    .waitFor({ state: "visible", timeout })
    .then(() => true)
    .catch(() => false);
}

const BASE_PATH = new URL(BASE).pathname.replace(/\/$/, "");
/** Wartet, bis der Pfad (ohne Installationsordner) samt Query `re` entspricht. */
async function waitPath(page, re, timeout = 15000) {
  await page.waitForURL((u) => {
    const url = new URL(u);
    const path = BASE_PATH && url.pathname.startsWith(`${BASE_PATH}/`) ? url.pathname.slice(BASE_PATH.length) : url.pathname;
    return re.test(path + url.search);
  }, { timeout });
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const watch = (p, label) => {
    p.on("pageerror", (e) => errors.push(`${label}: ${e.message}`));
    p.on("console", (m) => m.type() === "error" && !/Failed to load resource|401|403|404|409/.test(m.text()) && errors.push(`${label} console: ${m.text()}`));
  };

  // ---------------------------------------------------------------- Öffentliche Seiten
  const pub = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  watch(pub, "public");
  await pub.goto(`${BASE}/`);
  await pub.waitForSelector("text=Dein Handicap. Klar berechnet.");
  check("Landingpage erreichbar", true);
  await pub.screenshot({ path: `${SHOTS}/01-landing.png` });
  for (const [p, t] of [
    ["/hilfe/", "Hilfe & FAQ"],
    ["/datenschutz/", "Datenschutz"],
    ["/impressum/", "Impressum"],
    ["/golfplaetze/", "Golfplätze"],
  ]) {
    await pub.goto(BASE + p);
    const ok = await visible(pub.locator("h1", { hasText: t }).first(), 10000);
    check(`Öffentliche Seite ${p}`, ok);
  }

  // ---------------------------------------------------------------- H (anonym): geschützte Bereiche
  await pub.goto(`${BASE}/member/rounds/`);
  await waitPath(pub, /\/login/);
  check("H: /member ohne Anmeldung → Anmeldeseite", pub.url().includes("next="));
  await pub.goto(`${BASE}/admin/`);
  await waitPath(pub, /\/login/);
  check("H: /admin ohne Anmeldung → Anmeldeseite", true);

  // ---------------------------------------------------------------- G: Admin richtet Testdaten ein
  const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const admin = await adminCtx.newPage();
  watch(admin, "admin");
  await login(admin, ADMIN.email, ADMIN.password);
  await waitPath(admin, /\/member/);
  await admin.goto(`${BASE}/admin/`);
  await admin.waitForSelector("text=Admin-Dashboard");
  check("G: Admin-Dashboard mit Kennzahlen", await admin.locator("text=Datenqualität").first().isVisible());
  await admin.screenshot({ path: `${SHOTS}/10-admin-dashboard.png` });

  // Mitgelieferte Startdaten übernehmen (Node-Edition: Datenbank startet leer)
  await admin.goto(`${BASE}/admin/courses/`);
  await admin.waitForSelector("text=Anlagen");
  const seedButton = admin.getByRole("button", { name: /Anlage übernehmen|Anlagen übernehmen/ });
  if (await visible(seedButton, 3000)) {
    await seedButton.click();
    await admin.waitForSelector("text=/Übernommen:/", { timeout: 20000 });
    check("G: Mitgelieferte Startdaten übernommen", true);
  }

  // CSV-Import eines fiktiven Test-Platzes (nur Testumgebung)
  const csv = [
    "course_name,official_name,city,region,layout_name,holes,gender,tee_color,tee_name,par,course_rating,slope_rating,yardage,source_type,source_url,valid_from,valid_to,verified,nine,postal_code,checked_at",
    "E2E Testclub (fiktiv),E2E Testclub,Teststadt,SCHWABEN,Meisterschaftsplatz,18,M,Gelb,Gelb,72,71.8,135,,OFFICIAL_SCORECARD,https://example.org/scorekarte,2020-01-01,,true,,87724,2026-01-15",
    "E2E Testclub (fiktiv),E2E Testclub,Teststadt,SCHWABEN,Meisterschaftsplatz,9,M,Gelb,Gelb,36,35.9,133,,OFFICIAL_SCORECARD,https://example.org/scorekarte,2020-01-01,,true,FRONT,87724,2026-01-15",
  ].join("\n");
  const csvFile = path.join(SHOTS, "testplatz.csv");
  fs.writeFileSync(csvFile, csv);
  await admin.goto(`${BASE}/admin/import/`);
  await admin.setInputFiles('input[type=file][name=file]', csvFile);
  await admin.click("text=Vorschau erstellen");
  await admin.waitForSelector("text=2. Vorschau");
  await admin.getByRole("button", { name: /importieren|übernehmen/i }).last().click();
  await admin.waitForSelector("text=/neue Anlagen|importiert|übernommen/i", { timeout: 20000 });
  check("G: CSV-Import eines Platzes mit geprüften Ratings", true);

  // Lochdaten eintragen
  await admin.goto(`${BASE}/admin/courses/`);
  await admin.click("text=E2E Testclub (fiktiv)");
  await admin.waitForSelector("text=Meisterschaftsplatz");
  await admin.getByRole("button", { name: "Lochdaten" }).first().click();
  const pars = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
  const sis = [7, 11, 15, 1, 5, 13, 17, 3, 9, 8, 12, 16, 2, 6, 14, 18, 4, 10];
  for (let i = 0; i < 18; i++) {
    await admin.fill(`input[aria-label="Par ${i + 1}"]`, String(pars[i]));
    await admin.fill(`input[aria-label="HCP ${i + 1}"]`, String(sis[i]));
  }
  await admin.click("text=Lochdaten speichern");
  await admin.waitForSelector("text=18 Löcher gespeichert", { timeout: 20000 });
  check("G: Lochdaten gepflegt", true);
  await admin.screenshot({ path: `${SHOTS}/11-admin-course.png`, fullPage: true });

  // Rating von Ottobeuren verifizieren (Startdaten) – Ratings-Übersicht zeigt Status
  await admin.goto(`${BASE}/admin/ratings/`);
  await admin.waitForSelector("text=Ratings");
  check("G: Ratings-Übersicht", await admin.locator("td", { hasText: "E2E Testclub (fiktiv)" }).first().isVisible());
  await admin.goto(`${BASE}/admin/sources/`);
  check("G: Quellen-Übersicht", await visible(admin.locator("td", { hasText: "Offizielle Scorekarte" }).first(), 10000));

  // ---------------------------------------------------------------- A + F: Neuer Benutzer mit Start-HCPI
  const userCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const u = await userCtx.newPage();
  watch(u, "user");
  await u.goto(`${BASE}/register/`);
  await u.fill("#firstName", "Max");
  await u.fill("#lastName", "Muster");
  await u.fill("#email", "max@example.de");
  await u.fill("#password", "Max-Passwort-1");
  await u.fill("#passwordRepeat", "Max-Passwort-2");
  await u.fill("#handicapIndex", "18,4");
  await u.click("form button[type=submit]");
  await u.waitForSelector("text=Die Passwörter stimmen nicht überein");
  check("A: Validierung am Feld (Passwort-Wiederholung)", (await u.inputValue("#firstName")) === "Max");
  await u.fill("#passwordRepeat", "Max-Passwort-1");
  await u.click("form button[type=submit]");
  await u.waitForSelector("text=Bitte akzeptiere Datenschutz");
  await u.check('input[type=checkbox]');
  await u.click("form button[type=submit]");
  await u.waitForSelector("text=Fast geschafft!");
  check("A: Registrierung → Bestätigungs-E-Mail", true);
  await login(u, "max@example.de", "Max-Passwort-1");
  await u.waitForSelector("text=Bitte bestätige zuerst deine E-Mail-Adresse");
  check("A: Anmeldung vor Bestätigung abgelehnt", true);
  const verify = lastLink("max@example.de", /verify-email/);
  check("A: Bestätigungslink in der E-Mail", Boolean(verify), verify ?? "");
  await u.goto(verify);
  await u.waitForSelector("text=E-Mail bestätigt");
  await u.click("text=Jetzt anmelden");
  await u.fill("#email", "max@example.de");
  await u.fill("#password", "Max-Passwort-1");
  await u.click("form button[type=submit]");
  await waitPath(u, /\/member\/welcome/);
  check("A: erste Anmeldung → Onboarding", true);
  await u.waitForSelector("#w-hcp");
  check("F: Onboarding fragt Start-HCPI", true);
  await u.fill("#w-hcp", "18,4");
  await u.getByRole("button", { name: "Weiter", exact: true }).click();
  await u.fill('input[aria-label="Golfplatz suchen"]', "E2E Testclub");
  await u.click("text=E2E Testclub (fiktiv)");
  await u.waitForSelector("text=ändern");
  await u.click("text=Fertig");
  await waitPath(u, /^\/member\/?$/);
  await u.waitForSelector("text=Hallo Max!");
  const hero = await u.locator("#hcp-hero-title").locator("xpath=..").innerText();
  check("F: Dashboard zeigt Start-HCPI 18,4 (Initial Handicap)", hero.includes("18,4") && hero.includes("Start-Handicap"), hero.replace(/\s+/g, " ").slice(0, 120));
  check("E: Dashboard ohne Runden zeigt leeren Zustand", await u.locator("text=Noch keine Runden").isVisible());
  await u.screenshot({ path: `${SHOTS}/20-member-empty.png` });

  // ---------------------------------------------------------------- D: 18-Loch-Runde (GBE) auf DB-Platz
  async function wizardDbRound({ date, gbe, holes = 18, nine = null, scorecard = null }) {
    await u.goto(`${BASE}/member/rounds/new/`);
    await u.waitForSelector("text=Wann hast du gespielt?");
    await u.fill('input[aria-label="Spieldatum"]', date);
    await u.click("text=Privatrunde");
    if (holes === 9) await u.getByRole("radio", { name: "9 Loch" }).click();
    await u.getByRole("button", { name: "Weiter", exact: true }).click();
    await u.waitForSelector("text=Wo hast du gespielt?");
    await u.click("button:has-text('E2E Testclub (fiktiv)') >> nth=0");
    await u.waitForSelector("text=Von welchem Abschlag?");
    if (nine === "BACK") await u.getByRole("radio", { name: "Loch 10–18" }).click();
    await u.getByRole("radio", { name: /Gelb/ }).first().click();
    await u.getByRole("button", { name: "Weiter", exact: true }).click();
    await u.waitForSelector("text=Wie willst du dein Ergebnis eingeben?");
    if (scorecard) {
      await u.getByRole("radio", { name: /Loch für Loch/ }).click();
      for (let i = 0; i < scorecard.length; i++) {
        await u.getByRole("button", { name: new RegExp(`^Loch ${i + 1}:`) }).click();
        const target = scorecard[i];
        // Par-Taste, dann +/- bis zum Ziel
        await u.getByRole("button", { name: /^Par\s*\d+$/ }).click();
        const par = pars[i];
        for (let k = par; k < target; k++) await u.getByRole("button", { name: "Einen Schlag mehr" }).click();
        for (let k = par; k > target; k--) await u.getByRole("button", { name: "Einen Schlag weniger" }).click();
      }
    } else {
      await u.fill("#gbe", String(gbe));
    }
    await u.getByRole("button", { name: "Weiter", exact: true }).click();
    await u.waitForSelector("text=Dein Ergebnis");
    await u.waitForSelector("text=/GBE \\d+/", { timeout: 20000 });
    const preview = await u.locator("text=Handicap Index").first().locator("xpath=../..").innerText();
    await u.getByRole("button", { name: "Runde speichern" }).click();
    await u.waitForSelector("text=Runde gespeichert", { timeout: 20000 });
    const saved = await u.locator("main").innerText();
    return { preview, saved };
  }

  const r1 = await wizardDbRound({ date: "2026-05-01", gbe: 90 });
  check("D: 18-Loch-Runde (GBE) – Vorschau vor dem Speichern", r1.preview.includes("vorher 18,4"), r1.preview.replace(/\s+/g, " ").slice(0, 100));
  // SD = 113/135 × (90 − 71,8 − 0) = 15,23 → 15,2
  check("D: Score Differential 15,2 (Backend)", r1.saved.includes("15,2"), r1.saved.replace(/\s+/g, " ").slice(0, 160));
  await u.screenshot({ path: `${SHOTS}/21-round-saved.png` });

  // ---------------------------------------------------------------- B: mehrere Runden → aktiver HCPI
  await wizardDbRound({ date: "2026-05-10", gbe: 88 });
  const r3 = await wizardDbRound({ date: "2026-05-20", gbe: 94 });
  await u.goto(`${BASE}/member/`);
  await u.waitForSelector("text=Hallo Max!");
  const hero3 = await u.locator("#hcp-hero-title").locator("xpath=../..").innerText();
  // 3 Ergebnisse: bestes SD (88 → 13,6) − 2,0 = 11,6
  check("B: Nach 3 Runden berechneter HCPI 11,6", hero3.includes("11,6"), hero3.replace(/\s+/g, " ").slice(0, 160));
  check("B: Ergebnisseite zeigt HCP vorher/nachher", /vorher/.test(r3.saved));

  // ---------------------------------------------------------------- C: 9-Loch-Runde
  const nine = await wizardDbRound({ date: "2026-06-01", gbe: 45, holes: 9 });
  check("C: 9-Loch-Runde gespeichert (Ergänzung um erwartetes Ergebnis)", nine.saved.includes("Runde gespeichert"));
  await u.goto(`${BASE}/member/rounds/`);
  await u.waitForSelector("text=Meine Runden");
  await u.getByRole("radio", { name: "9 Loch" }).click();
  await u.waitForTimeout(800);
  const nineList = await u.locator("main").innerText();
  check("C: Filter 9 Loch", nineList.includes("E2E Testclub") && !nineList.includes("Keine 9-Loch-Runden"));

  // 9-Loch-Hinweis: hintere neun ohne 9-Loch-Rating
  await u.goto(`${BASE}/member/rounds/new/`);
  await u.getByRole("radio", { name: "9 Loch" }).click();
  await u.getByRole("button", { name: "Weiter", exact: true }).click();
  await u.click("button:has-text('E2E Testclub (fiktiv)') >> nth=0");
  await u.getByRole("radio", { name: "Loch 10–18" }).click();
  check("C: Hinweis „Kein 9-Loch-Rating vorhanden“ (keine Ableitung aus 18 Loch)", await visible(u.locator("text=Kein 9-Loch-Rating vorhanden"), 5000));

  // Scorekarte Loch für Loch
  const card = pars.map((p, i) => (i === 3 ? p + 5 : p + 1)); // ein Katastrophenloch → Netto-Doppelbogey
  const sc = await wizardDbRound({ date: "2026-06-10", scorecard: card });
  check("D: Loch-für-Loch-Scorekarte gespeichert", sc.saved.includes("Runde gespeichert"));
  await u.click("text=Details ansehen");
  await u.waitForSelector("text=Berechnung anzeigen");
  await u.click("text=Berechnung anzeigen");
  const detail = await u.locator("main").innerText();
  check("D: Rechenweg mit Netto-Doppelbogey je Loch", detail.includes("Netto-Doppelbogey") && detail.includes("113"), "");
  const roundId = new URL(u.url()).searchParams.get("id");
  await u.screenshot({ path: `${SHOTS}/22-round-detail.png`, fullPage: true });

  // Runde bearbeiten und löschen
  await u.click("text=Bearbeiten");
  await u.waitForSelector("text=Runde bearbeiten");
  await u.getByRole("button", { name: "Änderungen speichern" }).click();
  await u.waitForSelector("text=Runde aktualisiert", { timeout: 20000 });
  check("Runde bearbeiten (Verlauf neu berechnet)", true);

  // Entwurf: Wizard verlassen, Entwurf fortsetzen
  await u.goto(`${BASE}/member/rounds/new/`);
  await u.getByRole("button", { name: "Weiter", exact: true }).click();
  await u.click("button:has-text('E2E Testclub (fiktiv)') >> nth=0");
  await u.waitForTimeout(2200);
  await u.goto(`${BASE}/member/`);
  const draftVisible = await visible(u.locator("text=Nicht abgeschlossene Runden"), 8000);
  check("Entwurf automatisch gespeichert und auf dem Dashboard", draftVisible);

  // Favoriten
  await u.goto(`${BASE}/member/courses/`);
  await u.fill('input[aria-label="Golfplatz suchen"]', "Ottobeuren");
  await u.getByRole("button", { name: /zu Favoriten hinzufügen/ }).first().click();
  await u.waitForSelector("text=/ist jetzt ein Favorit/");
  await u.fill('input[aria-label="Golfplatz suchen"]', "");
  check("Favorit gespeichert", await visible(u.locator("section", { hasText: "Favoriten" }).locator("text=Ottobeuren").first(), 8000));

  // Ungeprüftes Rating (Startdaten Ottobeuren): Werte mit der Scorekarte bestätigen statt abtippen
  await u.goto(`${BASE}/member/rounds/new/`);
  await u.waitForSelector("text=Wie viele Löcher hast du gespielt?");
  await u.getByRole("button", { name: "Weiter", exact: true }).click();
  await u.click("button:has-text('Allgäuer Golf- und Landclub Ottobeuren') >> nth=0");
  await u.getByRole("radio", { name: /18-Loch-Platz/ }).click();
  await u.getByRole("radio", { name: /Gelb/ }).first().click();
  const confirmBox = await visible(u.locator("text=Stimmen diese Werte mit deiner Scorekarte überein?"), 5000);
  await u.getByRole("button", { name: "Weiter", exact: true }).click();
  const needsConfirm = await visible(u.locator("text=Bitte bestätige die Werte"), 3000);
  await u.getByRole("button", { name: "Ja, Werte stimmen" }).click();
  await u.getByRole("button", { name: "Weiter", exact: true }).click();
  await u.fill("#gbe", "90");
  await u.getByRole("button", { name: "Weiter", exact: true }).click();
  await u.waitForSelector("text=/GBE \\d+/", { timeout: 20000 });
  // SD = 113/131 × (90 − 72,3) = 15,3 (Werte der Startdaten, nur zum Test)
  const confirmedPreview = await u.locator("main").innerText();
  check("Ungeprüftes Rating: Werte bestätigen statt abtippen", confirmBox && needsConfirm && confirmedPreview.includes("15,3"));
  // Löcher im Platz-Schritt umschaltbar; ohne 9-Loch-Rating klarer Hinweis
  await u.getByRole("button", { name: "Zurück", exact: true }).click();
  await u.getByRole("button", { name: "Zurück", exact: true }).click();
  await u.getByRole("radio", { name: "Loch 1–9", exact: true }).click();
  const nineHint = await visible(u.locator("text=Kein 9-Loch-Rating vorhanden"), 5000);
  await u.getByRole("radio", { name: "18 Loch", exact: true }).click();
  check("Löcher im Platz-Schritt umschaltbar (18 Loch / Loch 1–9 / Loch 10–18)", nineHint && (await visible(u.getByRole("radio", { name: /Gelb/ }).first(), 5000)));

  // ---------------------------------------------------------------- L: Lochstatistik, Sichtbarkeit, Community (Version 2.2)
  const heroBeforeStats = await (async () => {
    await u.goto(`${BASE}/member/`);
    await u.waitForSelector("text=Hallo Max!");
    return u.locator("#hcp-hero-title").locator("xpath=../..").innerText();
  })();
  await u.goto(`${BASE}/member/rounds/new/`);
  await u.waitForSelector("text=Wann hast du gespielt?");
  await u.fill('input[aria-label="Spieldatum"]', "2026-06-20");
  await u.click("text=Sonstige"); // Training: zählt nicht fürs Handicap – die bisherigen HCPI-Prüfungen bleiben gültig
  await u.getByRole("button", { name: "Weiter", exact: true }).click();
  await u.click("button:has-text('E2E Testclub (fiktiv)') >> nth=0");
  await u.getByRole("radio", { name: /Gelb/ }).first().click();
  await u.getByRole("button", { name: "Weiter", exact: true }).click();
  await u.fill("#gbe", "89");
  await u.getByRole("switch", { name: /Runde detailliert tracken/ }).check();
  const group = (name) => u.getByRole("group", { name, exact: true });
  await u.getByRole("button", { name: /^Par\s*\d+$/ }).click();
  await group("Putts").getByRole("button", { name: "2", exact: true }).click();
  await group("Fairway getroffen").getByRole("button", { name: "Ja" }).click();
  await group("Grün in Regulation").getByRole("button", { name: "Ja" }).click();
  await group("Strafschläge").getByRole("button", { name: "0", exact: true }).click();
  await u.click("text=Private Notiz hinzufügen");
  await u.fill("#note-1", "Geheime Lochnotiz");
  const progress1 = await visible(u.locator("text=1 von 18 Löchern vollständig"), 5000);
  await u.getByRole("button", { name: "Weiter zu Loch 2" }).click();
  await u.getByRole("button", { name: /^Bogey\s*\d+$/ }).click();
  await group("Putts").getByRole("button", { name: "3", exact: true }).click();
  await group("Grün in Regulation").getByRole("button", { name: "Nein" }).click();
  await group("Up & Down").getByRole("button", { name: "Nein" }).click();
  await group("Strafschläge").getByRole("button", { name: "0", exact: true }).click();
  await u.getByRole("button", { name: "Weiter zu Loch 3" }).click();
  await u.getByRole("button", { name: /^Par\s*\d+$/ }).click();
  await group("Putts").getByRole("button", { name: "5", exact: true }).click();
  const impossible = await visible(u.locator("text=/Loch 3: 5 Putts passen nicht/").first(), 5000);
  await group("Putts").getByRole("button", { name: "2", exact: true }).click();
  check("L: Detaillierte Scorecard – Fortschritt, Lochnavigation, Prüfung am Loch", progress1 && impossible && (await u.getByRole("button", { name: "Loch 1: vollständig" }).isVisible()));
  await u.getByRole("button", { name: "Weiter", exact: true }).click();
  await u.waitForSelector("text=Deine Statistik", { timeout: 20000 });
  await u.getByRole("radio", { name: /Alle Mitglieder – Details/ }).click();
  const consentShown = await visible(u.locator("text=Deine Runden sind für andere Mitglieder noch nicht freigegeben"), 5000);
  await u.getByRole("button", { name: "Profil, Runden und Statistik freigeben" }).click();
  await u.waitForSelector("text=/Freigabe gespeichert/");
  check("L: Sichtbarkeit beim Speichern – Freigabe nur mit ausdrücklicher Zustimmung", consentShown);
  await u.getByRole("button", { name: "Runde speichern" }).click();
  await u.waitForSelector("text=Runde gespeichert", { timeout: 20000 });
  const statsSaved = await u.locator("main").innerText();
  // SD = 113/135 × (89 − 71,8) = 14,40 → 14,4 – Statistik ändert daran nichts
  check("L: Runde mit Statistik gespeichert, Score Differential unverändert (14,4)", statsSaved.includes("14,4") && statsSaved.includes("Deine Statistik"), statsSaved.replace(/\s+/g, " ").slice(0, 160));
  await u.click("text=Ganze Statistik ansehen");
  await u.waitForSelector("text=Statistik dieser Runde");
  const statTab = await u.locator("main").innerText();
  check("L: Rundendetail – Reiter Statistik (GIR 1 von 2 erfassten Grüns)", statTab.includes("1 von 2 Grüns") && statTab.includes("Drei-Putts"), statTab.replace(/\s+/g, " ").slice(0, 200));
  await u.getByRole("radio", { name: "Scorekarte" }).click();
  check("L: Rundendetail – Scorekarte mit privater Notiz", await visible(u.locator("text=Geheime Lochnotiz"), 5000));
  const sharedRoundId = new URL(u.url()).searchParams.get("id");
  await u.screenshot({ path: `${SHOTS}/24-round-scorecard.png`, fullPage: true });

  // Statistiken nachträglich ergänzen (ältere Runde) – Handicap bleibt gleich
  await u.goto(`${BASE}/member/rounds/stats/?id=${encodeURIComponent(roundId)}`);
  await u.waitForSelector("text=/Statistik (ergänzen|bearbeiten)/");
  const lockedScore = await visible(u.locator("text=Schläge (aus deinem Ergebnis)"), 5000);
  await group("Putts").getByRole("button", { name: "2", exact: true }).click();
  await group("Grün in Regulation").getByRole("button", { name: "Nein" }).click();
  await group("Strafschläge").getByRole("button", { name: "0", exact: true }).click();
  await u.getByRole("button", { name: "Statistik speichern" }).click();
  await u.waitForSelector("text=/Statistik gespeichert/", { timeout: 20000 });
  await u.goto(`${BASE}/member/`);
  await u.waitForSelector("text=Hallo Max!");
  const heroAfterStats = await u.locator("#hcp-hero-title").locator("xpath=../..").innerText();
  check("L: Statistiken ergänzen – Schläge gesperrt (Loch für Loch), Handicap unverändert", lockedScore && heroAfterStats === heroBeforeStats, heroAfterStats.replace(/\s+/g, " ").slice(0, 80));
  check("L: Dashboard – Statistik der letzten Runde", await visible(u.locator("text=Statistik der letzten Runde"), 5000));

  // Statistikseite
  await u.goto(`${BASE}/member/stats/`);
  await u.waitForSelector("text=Putts pro Loch");
  const statsPage = await u.locator("main").innerText();
  check("L: Statistikseite mit Filtern, Kennzahlen und Verlauf", statsPage.includes("2 Runden") && statsPage.includes("Grüns und Fairways") && statsPage.includes("So zählen wir"), statsPage.replace(/\s+/g, " ").slice(0, 160));
  await u.getByRole("radio", { name: "9 Loch" }).click();
  check("L: Statistik-Filter 9 Loch (keine 9-Loch-Runde mit Statistik)", await visible(u.locator("text=Keine Runden für diese Auswahl"), 8000));
  await u.screenshot({ path: `${SHOTS}/25-stats.png`, fullPage: true });

  // Community: Ranking nur mit Zustimmung
  await u.goto(`${BASE}/member/community/`);
  await u.waitForSelector("text=Du nimmst nicht teil");
  await u.getByRole("button", { name: "Am Ranking teilnehmen" }).click();
  await u.getByRole("dialog").getByRole("button", { name: "Teilnehmen" }).click();
  await u.waitForSelector("text=Deine Position");
  const rankingPage = await u.locator("main").innerText();
  check("L: Ranking – Teilnahme per Zustimmung, eigene Position hervorgehoben", rankingPage.includes("Platz 1") && rankingPage.includes("Du"), rankingPage.replace(/\s+/g, " ").slice(0, 160));
  await u.screenshot({ path: `${SHOTS}/26-community-ranking.png`, fullPage: true });
  await u.goto(`${BASE}/member/profile/?tab=community`);
  await u.waitForSelector("text=Freigaben");
  const settingsTab = await u.locator("main").innerText();
  check("L: Profil → Community: Freigaben sichtbar, Notizen weiterhin privat", settingsTab.includes("Notizen teilen") && (await u.getByRole("checkbox", { name: /Notizen teilen/ }).isChecked()) === false);

  // HCP-Seite
  await u.goto(`${BASE}/member/hcp/`);
  await u.waitForSelector("text=So entsteht dein Handicap Index");
  check("HCP-Seite erklärt die Berechnung", await u.locator("text=Diese Score Differentials zählen aktuell").isVisible());
  await u.screenshot({ path: `${SHOTS}/23-hcp.png`, fullPage: true });

  // ---------------------------------------------------------------- H: normaler Benutzer im Admin-Bereich
  await u.goto(`${BASE}/admin/`);
  await waitPath(u, /\/member\/?\?denied=admin/);
  check("H: /admin als Mitglied → zurück mit Hinweis", await visible(u.locator("text=Für den Admin-Bereich fehlt dir die Berechtigung"), 8000));
  const [adminUrl, adminMethod] = api.adminUsers;
  const forbidden = await call(u, adminUrl, adminMethod, adminMethod === "POST" ? {} : undefined);
  check("H: Admin-API als Mitglied → 403", forbidden.status === 403, `HTTP ${forbidden.status}`);
  const noCsrf = await call(u, EDITION === "webspace" ? "/api/me.php?action=draft-delete" : "/api/me/drafts/x", EDITION === "webspace" ? "POST" : "DELETE", { id: "x" }, false);
  check("CSRF: schreibender Aufruf ohne Token abgelehnt", noCsrf.status === 401 || noCsrf.status === 403, `HTTP ${noCsrf.status}`);
  const escalate = await call(u, EDITION === "webspace" ? "/api/auth.php?action=update-profile" : "/api/auth/update-profile", "POST", { firstName: "Max", lastName: "Muster", email: "max@example.de", role: "SUPER_ADMIN" });
  check("Rolle kann nicht selbst gesetzt werden", escalate.json?.user?.role === "USER", JSON.stringify(escalate.json?.user?.role));

  // ---------------------------------------------------------------- I: fremde Daten
  const otherCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const o = await otherCtx.newPage();
  watch(o, "other");
  // Zweites Konto legt der Admin an (vorläufiges Passwort) → erzwungene Passwortänderung
  await admin.goto(`${BASE}/admin/users/new/`);
  await admin.fill("#n-first", "Erika");
  await admin.fill("#n-last", "Beispiel");
  await admin.fill("#n-email", "erika@example.de");
  await admin.getByRole("radio", { name: "Vorläufiges Passwort" }).click();
  await admin.fill("#n-pw", "Start-Passwort-1");
  await admin.click("form button[type=submit]");
  await admin.waitForSelector("text=Erika Beispiel");
  check("G: Admin legt Benutzer an", true);
  const erikaUrl = admin.url();
  await login(o, "erika@example.de", "Start-Passwort-1");
  await waitPath(o, /\/member\/password/);
  check("Vorläufiges Passwort → Passwortänderung erzwungen", true);
  await o.fill("#f-cur", "Start-Passwort-1");
  await o.fill("#f-new", "Erika-Passwort-1");
  await o.fill("#f-rep", "Erika-Passwort-1");
  await o.click("form button[type=submit]");
  await waitPath(o, /\/member\/welcome/);
  await o.getByRole("button", { name: "Weiter", exact: true }).click();
  await o.click("text=Überspringen");
  await waitPath(o, /^\/member\/?$/);
  await o.waitForSelector("text=Hallo Erika!");
  const heroO = await o.locator("#hcp-hero-title").locator("xpath=..").innerText();
  check("E: Benutzer ohne Runden und ohne Start-HCPI → 54,0", heroO.includes("54,0"));
  const own = await call(o, api.me, "GET", undefined, false);
  const ownRounds = EDITION === "webspace" ? own.json?.doc?.rounds ?? [] : [];
  check("I: eigenes Dokument enthält keine fremden Runden", EDITION === "webspace" ? ownRounds.length === 0 : own.json?.user?.email === "erika@example.de");
  if (EDITION === "node") {
    const foreign = await call(o, `/api/me/rounds/${roundId}`, "GET", undefined, false);
    check("I: fremde Runde per ID → nicht gefunden", foreign.status === 404, `HTTP ${foreign.status}`);
  } else {
    const foreign = await call(o, `/api/me.php?action=round-delete`, "POST", { id: roundId });
    check("I: fremde Runde löschen → nicht gefunden", foreign.status === 404, `HTTP ${foreign.status}`);
  }

  // ---------------------------------------------------------------- L: Community aus Sicht eines anderen Mitglieds
  const act = await call(o, api.activity, "GET", undefined, false);
  const items = act.json?.items ?? [];
  const actJson = JSON.stringify(act.json ?? {});
  check("L: Aktivität zeigt nur die freigegebene Runde", act.status === 200 && items.length === 1 && items[0].round.member.displayName === "Max M.", `HTTP ${act.status}, ${items.length} Einträge`);
  check("L: keine E-Mail, keine interne ID in Community-Daten", !actJson.includes("max@example.de") && !actJson.includes('"userId"'));
  const memberId = items[0]?.round.member.publicId ?? "x";
  const pubRound = await call(o, api.publicRound(memberId, items[0]?.round.roundId ?? "x"), "GET", undefined, false);
  check("L: geteilte Runde (Details) ohne private Notiz", pubRound.status === 200 && pubRound.json?.level === "FULL" && !JSON.stringify(pubRound.json).includes("Geheime Lochnotiz"), `HTTP ${pubRound.status}`);
  const privRound = await call(o, api.publicRound(memberId, roundId), "GET", undefined, false);
  check("L: private Runde eines anderen Mitglieds → nicht gefunden", privRound.status === 404, `HTTP ${privRound.status}`);
  const rk = await call(o, api.ranking, "GET", undefined, false);
  check("L: Ranking für andere – nur Teilnehmer, eigene hypothetische Position", rk.json?.total === 1 && rk.json?.me?.participating === false && rk.json?.me?.position === 2, JSON.stringify(rk.json?.me ?? null));
  await o.goto(`${BASE}/member/community/?tab=aktivitaet`);
  await o.waitForSelector("text=hat eine Runde gespielt");
  await o.click("text=Ansehen");
  await o.waitForSelector("text=Zusammenfassung");
  await o.getByRole("radio", { name: "Scorekarte" }).click();
  check("L: Mitglied öffnet geteilte Runde mit Scorekarte", await visible(o.locator("table").first(), 5000));
  await o.screenshot({ path: `${SHOTS}/27-public-round.png`, fullPage: true });

  // Moderation durch den Admin: ausblenden (Runde bleibt, Handicap unverändert), protokolliert
  await admin.goto(`${BASE}/admin/community/?tab=rounds`);
  await admin.waitForSelector("text=Max Muster");
  await admin.getByRole("button", { name: "Ausblenden" }).first().click();
  await admin.fill("#mod-reason", "E2E-Test");
  await admin.getByRole("dialog").getByRole("button", { name: "Für andere ausblenden" }).click();
  await admin.waitForSelector("text=Gespeichert und protokolliert.");
  const actAfter = await call(o, api.activity, "GET", undefined, false);
  check("L: Admin blendet Runde aus → für andere unsichtbar", (actAfter.json?.items ?? []).length === 0);
  await u.goto(`${BASE}/member/rounds/view/?id=${encodeURIComponent(sharedRoundId)}`);
  check("L: Mitglied sieht Hinweis zur Moderation, Runde bleibt", await visible(u.locator("text=Für andere Mitglieder ausgeblendet").first(), 8000));
  await admin.goto(`${BASE}/admin/community/`);
  await admin.waitForSelector("text=Im Ranking");
  await admin.getByRole("button", { name: "Ranking aktualisieren" }).click();
  await admin.waitForSelector("text=/Aktualisiert: \\d+ Mitglieder/", { timeout: 20000 });
  check("G: Admin-Community – Übersicht und „Ranking aktualisieren“", true);
  await admin.screenshot({ path: `${SHOTS}/12-admin-community.png`, fullPage: true });

  // ---------------------------------------------------------------- G: Admin sieht Benutzer, HCP, Runden, Logs
  await admin.goto(`${BASE}/admin/users/`);
  await admin.fill('input[aria-label="Benutzer suchen"]', "max");
  await admin.click("text=Max Muster");
  await admin.waitForSelector("text=aktiver WHS Scoring Record");
  check("G: Admin sieht Handicap des Benutzers (aktiver Scoring Record)", await admin.locator("text=11,6").first().isVisible().catch(() => false));
  await admin.click("text=Benutzeransicht öffnen");
  await admin.waitForSelector("text=nur lesend, dieser Zugriff wird protokolliert");
  check("G: Benutzeransicht (lesend, protokolliert)", true);
  await admin.goto(`${BASE}/admin/logs/`);
  await admin.waitForSelector("text=Audit-Log");
  const logs = await admin.locator("main").innerText();
  check("G: Audit-Log enthält Benutzeransicht und Datenzugriff", logs.includes("Benutzeransicht geöffnet") && logs.includes("Benutzerdaten angesehen"));
  check("G: Audit-Log enthält Runden der Mitglieder", logs.includes("Runde gespeichert"));
  check("G: Audit-Log enthält Moderation, Lochstatistik und Community-Einstellungen", logs.includes("Öffentliche Runde verborgen") && logs.includes("Lochstatistik ergänzt") && logs.includes("Community-Einstellungen geändert"));
  await admin.goto(`${BASE}/admin/rounds/`);
  await admin.waitForSelector("text=Runden");
  check("G: Rundenübersicht aller Mitglieder", (await admin.locator("tbody tr").count()) >= 5);
  await admin.goto(`${BASE}/admin/system/`);
  check("G: Systemstatus", await visible(admin.locator("text=Prüfungen"), 10000));
  await admin.goto(`${BASE}/admin/rules/`);
  check("G: Regeln & Engine", await visible(admin.locator("text=Aktive Regelversion"), 10000));
  await admin.goto(`${BASE}/admin/search/?q=erika`);
  check("G: globale Suche", await visible(admin.locator("text=Erika Beispiel").first(), 10000));

  // Deaktivieren → Anmeldung abgelehnt, Daten bleiben
  await admin.goto(erikaUrl);
  await admin.getByRole("button", { name: "Deaktivieren" }).click();
  await admin.getByRole("dialog").getByRole("button", { name: "Deaktivieren" }).click();
  await admin.waitForSelector("text=Konto deaktiviert.");
  await o.goto(`${BASE}/member/`);
  await waitPath(o, /\/login/);
  check("Deaktiviertes Konto: Sitzung beendet", true);
  await o.fill("#email", "erika@example.de");
  await o.fill("#password", "Erika-Passwort-1");
  await o.click("form button[type=submit]");
  check("Deaktiviertes Konto: Anmeldung abgelehnt", await visible(o.locator("text=Dieses Konto ist deaktiviert"), 8000));

  // Einstellungen: Registrierung schließen
  await admin.goto(`${BASE}/admin/settings/`);
  await admin.waitForSelector("text=Registrierung für alle offen");
  await admin.getByText("Registrierung für alle offen").click();
  await admin.click("text=Einstellungen speichern");
  await admin.waitForSelector("text=Einstellungen gespeichert.");
  await pub.goto(`${BASE}/register/`);
  check("G: Registrierung geschlossen (Einstellung)", await visible(pub.locator("text=Registrierung geschlossen"), 8000));

  // ---------------------------------------------------------------- Passwort vergessen
  await pub.goto(`${BASE}/forgot-password/`);
  await pub.fill("#email", "max@example.de");
  await pub.click("form button[type=submit]");
  await pub.waitForSelector("text=E-Mail ist unterwegs");
  const reset = lastLink("max@example.de", /reset-password/);
  await pub.goto(reset);
  await pub.fill("#password", "Max-Neu-Passwort-1");
  await pub.fill("#passwordRepeat", "Max-Neu-Passwort-1");
  await pub.click("form button[type=submit]");
  await pub.waitForSelector("text=Dein Passwort wurde geändert");
  check("Passwort vergessen → zurückgesetzt", true);
  await u.goto(`${BASE}/member/`);
  await waitPath(u, /\/login/);
  check("Nach Passwort-Reset: alte Sitzung beendet", true);

  // ---------------------------------------------------------------- J: Smartphone
  const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const m = await mobileCtx.newPage();
  watch(m, "mobile");
  await login(m, "max@example.de", "Max-Neu-Passwort-1");
  await waitPath(m, /\/member/);
  await m.waitForSelector("text=Hallo Max!");
  const bottomNav = m.locator('nav[aria-label="Mitgliederbereich"]').last();
  check("J: Smartphone – Navigation unten", await bottomNav.isVisible());
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("J: Smartphone – keine horizontale Scrollleiste", overflow <= 1, `${overflow}px`);
  await m.screenshot({ path: `${SHOTS}/30-mobile-dashboard.png` });
  await m.click('a[aria-label="Runde erfassen"]');
  await m.waitForSelector("text=Wann hast du gespielt?");
  await m.getByRole("button", { name: "Weiter", exact: true }).click();
  await m.click("button:has-text('E2E Testclub (fiktiv)') >> nth=0");
  await m.getByRole("radio", { name: /Gelb/ }).first().click();
  await m.getByRole("button", { name: "Weiter", exact: true }).click();
  await m.getByRole("radio", { name: /Loch für Loch/ }).click();
  await m.screenshot({ path: `${SHOTS}/31-mobile-scorecard.png` });
  check("J: Smartphone – Loch-für-Loch-Eingabe", await m.locator("text=Loch 1").first().isVisible());
  await m.getByRole("switch", { name: /Runde detailliert tracken/ }).check();
  await m.getByRole("group", { name: "Putts", exact: true }).getByRole("button", { name: "2", exact: true }).click();
  const overflowCard = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await m.screenshot({ path: `${SHOTS}/32-mobile-detailed.png`, fullPage: true });
  check("J: Smartphone – detaillierte Scorecard ohne horizontale Scrollleiste", overflowCard <= 1 && (await m.getByRole("progressbar").isVisible()), `${overflowCard}px`);
  await m.goto(`${BASE}/member/community/`);
  await m.waitForSelector("text=Deine Position");
  const overflowCm = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("J: Smartphone – Community (Ranking als Karten)", overflowCm <= 1 && (await m.locator('nav[aria-label="Mitgliederbereich"]').last().locator("text=Community").isVisible()), `${overflowCm}px`);
  await m.screenshot({ path: `${SHOTS}/33-mobile-community.png`, fullPage: true });

  // ---------------------------------------------------------------- K: Desktop
  await login(u, "max@example.de", "Max-Neu-Passwort-1");
  await waitPath(u, /\/member/);
  await u.waitForSelector("text=Hallo Max!");
  await u.screenshot({ path: `${SHOTS}/40-desktop-dashboard.png`, fullPage: true });
  check("K: Desktop-Dashboard", await u.locator('header nav[aria-label="Mitgliederbereich"]').isVisible());
  await admin.goto(`${BASE}/admin/users/`);
  await admin.screenshot({ path: `${SHOTS}/41-desktop-admin-users.png`, fullPage: true });

  // Abmelden
  await u.getByRole("button", { name: /Max/ }).first().click();
  await u.getByRole("menuitem", { name: "Abmelden" }).click();
  await waitPath(u, /\/login/);
  check("Abmelden", await visible(u.locator("text=Du wurdest abgemeldet"), 8000));

  check("Keine JavaScript-Fehler", errors.length === 0, errors.slice(0, 5).join(" | "));
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} bestanden`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error("ABBRUCH:", e.message);
  process.exit(2);
});
