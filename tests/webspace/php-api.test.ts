/**
 * Sicherheits- und Ablauftests des PHP-Backends der Webspace-Edition gegen einen echten `php -S`-Server:
 * Installation, Registrierung mit Bestätigung, Datentrennung, Rollen, CSRF, Zugangsschutz (gate.php).
 * Wird übersprungen, wenn kein PHP installiert ist.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasPhp = spawnSync("php", ["-v"]).status === 0;
const PORT = 18_000 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}/hcp`;
let dir = "";
let server: ChildProcess | null = null;

class Client {
  cookies = new Map<string, string>();
  csrf: string | null = null;

  async req(url: string, init: { method?: string; body?: unknown; form?: Record<string, string>; csrf?: boolean; redirect?: RequestRedirect } = {}) {
    const headers: Record<string, string> = { cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ") };
    let body: string | undefined;
    if (init.form) {
      headers["content-type"] = "application/x-www-form-urlencoded";
      body = new URLSearchParams(init.form).toString();
    } else if (init.body !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(init.body);
    }
    if (init.csrf !== false && this.csrf) headers["x-csrf-token"] = this.csrf;
    const res = await fetch(BASE + url, { method: init.method ?? (body ? "POST" : "GET"), headers, body, redirect: init.redirect ?? "manual" });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const [k, v] = pair.split("=");
      if (v === "" || /expires=Thu, 01 Jan 1970/i.test(c)) this.cookies.delete(k);
      else this.cookies.set(k, v);
    }
    const text = await res.text();
    let json: Record<string, unknown> | null = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: res.status, json, text, location: res.headers.get("location") };
  }

  async login(email: string, password: string) {
    const r = await this.req("/api/auth.php?action=login", { body: { email, password } });
    this.csrf = (r.json?.csrf as string) ?? null;
    return r;
  }
}

function outboxLink(to: string, pattern: RegExp): string {
  const box = path.join(dir, "www/hcp/data/mail-outbox");
  const mails = readdirSync(box)
    .sort()
    .map((f) => JSON.parse(readFileSync(path.join(box, f), "utf8").replace(/^<\?php exit; \?>\n/, "")))
    .filter((m) => m.to === to && pattern.test(m.text));
  return mails.at(-1).text.match(/token=([A-Za-z0-9_-]+)/)[1];
}

const round = (id: string, date = "2026-05-01") => ({
  id,
  date,
  sequence: 0,
  title: "Runde",
  category: "RPR",
  format: "STROKE",
  resultStatus: "NORMAL",
  holes: 18,
  course: { courseName: "Testplatz", country: "DE" },
  rating: { holes: 18, par: 72, courseRating: 71.8, slopeRating: 135 },
  pcc: 0,
  entry: { mode: "AGS", adjustedGrossScore: 90 },
  createdAt: "2026-05-01T10:00:00Z",
  updatedAt: "2026-05-01T10:00:00Z",
});

describe.skipIf(!hasPhp)("Webspace-Backend (PHP)", () => {
  const admin = new Client();
  const max = new Client();
  const erika = new Client();

  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "hcp-php-"));
    const app = path.join(dir, "www/hcp");
    mkdirSync(app, { recursive: true });
    cpSync("webspace/php", app, { recursive: true });
    for (const d of ["_next", "member", "admin", "login"]) mkdirSync(path.join(app, d), { recursive: true });
    writeFileSync(path.join(app, "index.html"), '<a href="/__HCP_BASE__/login/">x</a>');
    writeFileSync(path.join(app, "member/index.html"), "<p>member</p>");
    writeFileSync(path.join(app, "admin/index.html"), "<p>admin</p>");
    writeFileSync(path.join(app, "login/index.html"), "<p>login</p>");
    server = spawn("php", ["-S", `127.0.0.1:${PORT}`, "-t", path.join(dir, "www"), path.resolve("e2e/php-router.php")], { stdio: "ignore" });
    for (let i = 0; i < 50; i++) {
      try {
        await fetch(`${BASE}/install.php`);
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    const installer = new Client();
    const page = await installer.req("/install.php");
    const token = page.text.match(/name="token" value="([a-f0-9]+)"/)![1];
    const done = await installer.req("/install.php", {
      form: { token, base: "/hcp", siteUrl: BASE, firstName: "Clara", lastName: "Chef", email: "admin@example.de", password: "Admin-Passwort-1", password2: "Admin-Passwort-1", mailMode: "outbox" },
    });
    expect(done.text).toContain("Installation abgeschlossen");
  }, 30_000);

  afterAll(() => {
    server?.kill();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("install.php ersetzt den Basispfad und legt das Super-Admin-Konto an", async () => {
    expect(readFileSync(path.join(dir, "www/hcp/index.html"), "utf8")).toContain('href="/hcp/login/"');
    const r = await admin.login("admin@example.de", "Admin-Passwort-1");
    expect(r.status).toBe(200);
    expect((r.json?.user as { role: string }).role).toBe("SUPER_ADMIN");
    expect(admin.cookies.get("hcp_session")).toBeTruthy();
  });

  it("Zugangsschutz: Mitglieder- und Admin-Seiten nur mit Anmeldung bzw. Berechtigung", async () => {
    const anon = new Client();
    const m = await anon.req("/member/");
    expect(m.status).toBe(302);
    expect(m.location).toContain("/hcp/login/?next=%2Fmember%2F");
    expect((await admin.req("/admin/")).status).toBe(200);
    // Internes area=… in der Adresse (Apache-Verzeichnisweiterleitung) wird entfernt, andere Parameter bleiben
    const leaked = await admin.req("/member/?area=member&area=member&x=1");
    expect(leaked.status).toBe(302);
    expect(leaked.location).toBe("/hcp/member/?x=1");
    // Pfad-Tricks werden abgewiesen
    expect([403, 404]).toContain((await admin.req("/admin/..%2F..%2Fdata/users.php")).status);
    expect((await admin.req("/admin/..%2Fapi%2F_lib.php")).status).toBe(404);
    expect((await anon.req("/data/users.php")).status).toBe(403);
  });

  it("Registrierung: Rolle aus der Anfrage wird ignoriert, Anmeldung erst nach Bestätigung", async () => {
    const r = await max.req("/api/auth.php?action=register", {
      body: { firstName: "Max", lastName: "Muster", email: "max@example.de", password: "Max-Passwort-1", passwordRepeat: "Max-Passwort-1", handicapIndex: "18,4", acceptTerms: true, role: "SUPER_ADMIN" },
    });
    expect(r.status).toBe(201);
    expect((await max.login("max@example.de", "Max-Passwort-1")).json?.error).toBe("EMAIL_NOT_VERIFIED");
    const token = outboxLink("max@example.de", /verify-email/);
    expect((await max.req("/api/auth.php?action=verify-email", { body: { token } })).status).toBe(200);
    expect((await max.req("/api/auth.php?action=verify-email", { body: { token } })).json?.error).toBe("TOKEN_INVALID");
    const login = await max.login("max@example.de", "Max-Passwort-1");
    expect((login.json?.user as { role: string; permissions: string[] }).role).toBe("USER");
    expect((login.json?.user as { permissions: string[] }).permissions).toEqual([]);
  });

  it("Falsches Passwort und unbekanntes Konto liefern dieselbe Antwort", async () => {
    const a = await new Client().login("max@example.de", "falsch-falsch");
    const b = await new Client().login("niemand@example.de", "falsch-falsch");
    expect(a.json).toEqual(b.json);
    expect(a.json?.error).toBe("INVALID_CREDENTIALS");
  });

  it("Mitglieder-Daten: CSRF-Token Pflicht, Runden werden gespeichert und protokolliert", async () => {
    expect((await max.req("/api/me.php?action=round-save", { body: { round: round("r1") }, csrf: false })).status).toBe(401);
    const saved = await max.req("/api/me.php?action=round-save", { body: { round: round("r1") } });
    expect(saved.status).toBe(200);
    const load = await max.req("/api/me.php?action=load");
    expect((load.json?.doc as { rounds: unknown[] }).rounds).toHaveLength(1);
    expect((await max.req("/api/me.php?action=round-save", { body: { round: { id: "../../x" } } })).json?.error).toBe("ROUND_INVALID");
  });

  it("Datentrennung: ein anderes Mitglied sieht und ändert keine fremden Runden", async () => {
    await admin.req("/api/admin.php?action=user-create", { body: { firstName: "Erika", lastName: "Beispiel", email: "erika@example.de", role: "USER", password: "Start-Passwort-1" } });
    const login = await erika.login("erika@example.de", "Start-Passwort-1");
    expect((login.json?.user as { mustChangePassword: boolean }).mustChangePassword).toBe(true);
    const own = await erika.req("/api/me.php?action=load");
    expect((own.json?.doc as { rounds: unknown[] }).rounds).toHaveLength(0);
    expect((await erika.req("/api/me.php?action=round-delete", { body: { id: "r1" } })).status).toBe(404);
    // Eine Runde mit derselben ID landet im eigenen Dokument – nicht bei Max
    await erika.req("/api/me.php?action=round-save", { body: { round: round("r1", "2026-06-01") } });
    const maxDoc = await max.req("/api/me.php?action=load");
    expect((maxDoc.json?.doc as { rounds: { date: string }[] }).rounds[0].date).toBe("2026-05-01");
  });

  it("Admin-API: Mitglieder erhalten 403, Admins sehen Daten nur mit Audit-Eintrag", async () => {
    expect((await max.req("/api/admin.php?action=users", { body: {} })).status).toBe(403);
    expect((await max.req("/api/admin.php?action=courses-save", { body: {} })).status).toBe(403);
    const list = await admin.req("/api/admin.php?action=users", { body: { q: "max" } });
    const id = (list.json?.items as { id: string }[])[0].id;
    await admin.req("/api/admin.php?action=user", { body: { id } });
    await admin.req("/api/admin.php?action=impersonate", { body: { id } });
    const logs = await admin.req("/api/admin.php?action=logs", { body: { userId: id } });
    const actions = (logs.json?.items as { action: string }[]).map((e) => e.action);
    expect(actions).toContain("USER_DATA_VIEWED");
    expect(actions).toContain("IMPERSONATION_VIEW");
    expect(actions).toContain("ROUND_CREATED");
  });

  it("Rollen: eigene Rolle unveränderbar, letzter Super-Admin geschützt", async () => {
    const me = await admin.req("/api/auth.php?action=me");
    const selfId = (me.json?.user as { id: string }).id;
    expect((await admin.req("/api/admin.php?action=user-update", { body: { id: selfId, role: "USER" } })).status).toBe(403);
    expect((await admin.req("/api/admin.php?action=user-delete", { body: { id: selfId, confirm: "LÖSCHEN" } })).status).toBe(403);
    const self = await admin.req("/api/auth.php?action=delete-account", { body: { password: "Admin-Passwort-1", confirm: "LÖSCHEN" } });
    expect(self.json?.error).toBe("CONFLICT");
  });

  it("Community: nur freigegebene Daten, private Runden verborgen, Moderation vom Mitglied nicht aufhebbar", async () => {
    const summary = { handicapIndex: 18.7, lowHandicapIndex: null, roundsCount: 2, lastRoundDate: "2026-06-02", performance: { rounds: 1, girPercentage: 50, distribution: { eagles: 0, birdies: 1, pars: 3, bogeys: 5, doubleBogeys: 0, triplePlus: 0 } }, computedAt: "2026-06-02T10:00:00Z" };
    expect((await max.req("/api/me.php?action=community-save", { body: { settings: { rankingVisible: true, profileVisible: true, roundsVisible: true, statsVisible: true, displayName: "Max M." }, summary } })).status).toBe(200);
    const holeStats = Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, strokeIndex: null, score: 5, putts: 2, fir: true, gir: false, bunkerVisit: null, bunkerShots: null, sandSave: null, upAndDown: false, penaltyStrokes: 0, note: i === 0 ? "privat" : null }));
    const pub = { ...round("pub1", "2026-06-02"), visibility: "MEMBERS_FULL", holeStats, notes: "private Notiz", computed: { scoreDifferential: 16.1, adjustedGrossScore: 90, handicapIndexBefore: 19, handicapIndexAfter: 18.7, engine: "t", computedAt: "x", stats: { holes: 18, holesScored: 18, totalPutts: 36, girs: 0, girHoles: 18 } }, moderation: { hidden: false, reason: null, at: "x", by: "Max selbst" } };
    expect((await max.req("/api/me.php?action=round-save", { body: { round: pub, summary } })).status).toBe(200);

    const ranking = await erika.req("/api/community.php?action=ranking");
    expect(ranking.status).toBe(200);
    const items = ranking.json?.items as { displayName: string; publicId: string; handicapIndex: number }[];
    expect(items.map((e) => [e.displayName, e.handicapIndex])).toEqual([["Max M.", 18.7]]);
    expect(ranking.text).not.toMatch(/max@example|"userId"/);
    const pid = items[0].publicId;
    const rounds = await erika.req(`/api/community.php?action=member-rounds&id=${pid}`);
    expect((rounds.json?.items as { roundId: string }[]).map((r) => r.roundId)).toEqual(["pub1"]);
    const view = await erika.req(`/api/community.php?action=round&member=${pid}&round=pub1`);
    expect(view.json).toMatchObject({ level: "FULL", notes: null, isMine: false });
    expect((view.json?.holeStats as { putts: number; note: string | null }[])[0]).toMatchObject({ putts: 2, note: null });
    expect((await erika.req(`/api/community.php?action=round&member=${pid}&round=r1`)).status).toBe(404);
    // Moderation: Runde verborgen – ein erneutes Speichern durch das Mitglied hebt das nicht auf
    expect((await erika.req("/api/admin.php?action=community-moderate", { body: {} })).status).toBe(403);
    const maxId = ((await admin.req("/api/admin.php?action=users", { body: { q: "max" } })).json?.items as { id: string }[])[0].id;
    const mod = await admin.req("/api/admin.php?action=community-moderate", { body: { userId: maxId, roundId: "pub1", action: "HIDE", reason: "Test" } });
    expect(mod.json).toEqual({ ok: true });
    expect((await erika.req(`/api/community.php?action=round&member=${pid}&round=pub1`)).status).toBe(404);
    await max.req("/api/me.php?action=round-save", { body: { round: { ...pub, moderation: null }, summary } });
    expect((await erika.req(`/api/community.php?action=round&member=${pid}&round=pub1`)).status).toBe(404);
    const logs = await admin.req("/api/admin.php?action=logs", { body: { action: "PUBLIC_ROUND_HIDDEN" } });
    expect((logs.json?.items as unknown[]).length).toBe(1);
    const overview = await admin.req("/api/admin.php?action=community", { body: {} });
    expect(overview.json).toMatchObject({ rankingOptIn: 1, hiddenRounds: 1 });
    // Profil aus → nicht mehr auffindbar; ungültiger HCPI wird verworfen
    await max.req("/api/me.php?action=community-save", { body: { settings: { profileVisible: false }, summary: { ...summary, handicapIndex: -50 } } });
    expect((await erika.req(`/api/community.php?action=member&id=${pid}`)).json?.error).toBe("MEMBER_NOT_FOUND");
    const again = await erika.req("/api/community.php?action=ranking");
    expect((again.json?.items as { handicapIndex: number; profileVisible: boolean }[])[0]).toMatchObject({ handicapIndex: 18.7, profileVisible: false });
    expect((await erika.req("/api/community.php?action=members")).json?.total).toBe(0);
  });

  it("Deaktivierung beendet die Sitzung und verhindert die Anmeldung; Daten bleiben", async () => {
    const list = await admin.req("/api/admin.php?action=users", { body: { q: "erika" } });
    const id = (list.json?.items as { id: string }[])[0].id;
    expect((await admin.req("/api/admin.php?action=user-update", { body: { id, status: "DISABLED" } })).status).toBe(200);
    expect((await erika.req("/api/me.php?action=load")).json?.error).toBe("ACCOUNT_DISABLED");
    expect((await new Client().login("erika@example.de", "Start-Passwort-1")).json?.error).toBe("ACCOUNT_DISABLED");
    const detail = await admin.req("/api/admin.php?action=user", { body: { id } });
    expect((detail.json?.doc as { rounds: unknown[] }).rounds).toHaveLength(1);
  });

  it("Passwort vergessen: gleiche Antwort für unbekannte Adressen, Reset meldet alle Geräte ab", async () => {
    const unknown = await new Client().req("/api/auth.php?action=forgot-password", { body: { email: "niemand@example.de" } });
    const known = await new Client().req("/api/auth.php?action=forgot-password", { body: { email: "max@example.de" } });
    expect(unknown.json).toEqual(known.json);
    const token = outboxLink("max@example.de", /reset-password/);
    expect((await new Client().req("/api/auth.php?action=reset-password", { body: { token, password: "Neu-Passwort-1", passwordRepeat: "Neu-Passwort-1" } })).status).toBe(200);
    expect((await max.req("/api/me.php?action=load")).json?.error).toBe("SESSION_EXPIRED");
    expect((await new Client().login("max@example.de", "Neu-Passwort-1")).status).toBe(200);
  });
});
