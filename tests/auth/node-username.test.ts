/**
 * Konten ohne E-Mail-Adresse (Node-Edition): Der Admin legt Benutzername + Passwort an, das Mitglied meldet sich
 * mit dem Benutzernamen an. Route Handler gegen PGlite; Cookies über eine Attrappe von next/headers.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => (value ? jar.set(name, value) : jar.delete(name)),
  }),
}));

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
} else {
  process.env.PGLITE_DIR = "memory://";
  delete process.env.DATABASE_URL;
}
delete process.env.ADMIN_EMAIL;
process.env.MAIL_MODE = "off";

const { getDb, closeDb } = await import("@/db/client");
const { users } = await import("@/db/schema");
const { hashPassword } = await import("@/server/security");
const auth = await import("@/app/api/auth/[action]/route.server");
const admin = await import("@/app/api/admin/[[...path]]/route.server");

let csrf = "";

function request(url: string, body?: unknown, method = "POST"): Request {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json", ...(csrf ? { "x-csrf-token": csrf } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function call(res: Promise<Response>) {
  const r = await res;
  return { status: r.status, json: (await r.json()) as Record<string, unknown> & { user?: Record<string, unknown>; fields?: Record<string, string> } };
}

async function login(login: string, password: string) {
  jar.clear();
  csrf = "";
  const r = await call(auth.POST(request("/api/auth/login", { email: login, password }), { params: Promise.resolve({ action: "login" }) }));
  csrf = (r.json.csrf as string) ?? "";
  return r;
}

const createUser = (body: Record<string, unknown>) =>
  call(admin.POST(request("/api/admin/users", { firstName: "Frank", lastName: "Freund", role: "USER", ...body }), { params: Promise.resolve({ path: ["users"] }) }));
const patchUser = (id: string, body: Record<string, unknown>) => call(admin.PATCH(request(`/api/admin/users/${id}`, body, "PATCH"), { params: Promise.resolve({ path: ["users", id] }) }));
const updateProfile = (body: Record<string, unknown>) => call(auth.POST(request("/api/auth/update-profile", body), { params: Promise.resolve({ action: "update-profile" }) }));

describe("Konten ohne E-Mail-Adresse (Node-Edition)", () => {
  beforeAll(async () => {
    const db = await getDb();
    await db.insert(users).values({ email: "chef@example.de", firstName: "Clara", lastName: "Chef", role: "SUPER_ADMIN", emailVerified: true, passwordHash: await hashPassword("Admin-Passwort-1") });
  });

  beforeEach(async () => {
    expect((await login("chef@example.de", "Admin-Passwort-1")).status).toBe(200);
  });

  afterAll(async () => {
    await closeDb();
  });

  it("prüft Benutzername und Passwort beim Anlegen", async () => {
    expect((await createUser({ password: "Freund-Passwort-1" })).json.error).toBe("VALIDATION");
    expect((await createUser({ username: "fr", password: "Freund-Passwort-1" })).json.fields).toHaveProperty("username");
    expect((await createUser({ username: "frank@home", password: "Freund-Passwort-1" })).json.fields).toHaveProperty("username");
    expect((await createUser({ username: "frank", password: "" })).json.fields).toHaveProperty("password");
    expect((await createUser({ username: "frank", password: "kurz" })).json.fields).toHaveProperty("password");
  });

  it("legt ein Konto ohne E-Mail an; Anmeldung mit dem Benutzernamen (Groß-/Kleinschreibung egal)", async () => {
    const created = await createUser({ username: " Frank.Freund ", password: "Freund-Passwort-1", mustChangePassword: false });
    expect(created.status).toBe(201);
    expect(created.json.user).toMatchObject({ email: null, username: "frank.freund", role: "USER" });
    expect(created.json.invite).toBe(false);
    expect((await createUser({ username: "FRANK.FREUND", password: "Freund-Passwort-1" })).json.error).toBe("USERNAME_TAKEN");

    expect((await login("frank.freund", "falsch-falsch")).json.error).toBe("INVALID_CREDENTIALS");
    const ok = await login("Frank.Freund", "Freund-Passwort-1");
    expect(ok.status).toBe(200);
    expect(ok.json.user).toMatchObject({ email: null, username: "frank.freund", mustChangePassword: false });

    // Profil ohne E-Mail speicherbar; eine neue Adresse gilt erst nach Bestätigung, die Anmeldung bleibt möglich
    const saved = await updateProfile({ firstName: "Franky", lastName: "Freund", email: "" });
    expect(saved.status).toBe(200);
    expect(saved.json.user).toMatchObject({ firstName: "Franky", email: null, username: "frank.freund" });
    const withMail = await updateProfile({ firstName: "Franky", lastName: "Freund", email: "frank@example.de", currentPassword: "Freund-Passwort-1" });
    expect(withMail.json.pendingEmail).toBe("frank@example.de");
    expect((await login("frank.freund", "Freund-Passwort-1")).status).toBe(200);

    // Mitglieder dürfen keine Konten anlegen
    expect((await createUser({ username: "hacker", password: "Freund-Passwort-1" })).status).toBe(403);
  });

  it("vorläufiges Passwort ist Standard; Benutzername im Admin-Bereich änderbar und eindeutig", async () => {
    const grete = await createUser({ firstName: "Grete", username: "grete", password: "Grete-Passwort-1" });
    const hans = await createUser({ firstName: "Hans", username: "hans", password: "Hans-Passwort-1" });
    const hansId = hans.json.user!.id as string;
    expect((await patchUser(hansId, { username: "grete" })).json.error).toBe("USERNAME_TAKEN");
    expect((await patchUser(hansId, { username: "Hans.Im.Glueck" })).json.user).toMatchObject({ username: "hans.im.glueck" });
    expect(grete.json.user).toMatchObject({ email: null });
    const first = await login("grete", "Grete-Passwort-1");
    expect(first.json.user).toMatchObject({ mustChangePassword: true });
    expect((await login("hans.im.glueck", "Hans-Passwort-1")).status).toBe(200);
  });
});
