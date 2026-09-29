import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ROLES, ROLE_PERMISSIONS, can, canAssignRole, canManageUser, type Role } from "@/lib/auth/permissions";
import { safeNext } from "@/lib/auth/redirect";
import { changePasswordSchema, loginSchema, registerSchema } from "@/lib/auth/validation";
import { ApiError, apiError, userMessage } from "@/lib/api/errors";

const u = (id: string, role: Role) => ({ id, role });

describe("Rollen und Rechte", () => {
  it("normale Mitglieder haben keine Admin-Rechte", () => {
    expect(ROLE_PERMISSIONS.USER).toEqual([]);
    expect(can("USER", "admin.access")).toBe(false);
    expect(can(null, "admin.access")).toBe(false);
  });

  it("Support darf nur lesen", () => {
    expect(can("SUPPORT", "users.read")).toBe(true);
    for (const p of ["users.write", "users.roles", "users.delete", "courses.write", "settings.write", "users.impersonate"] as const) {
      expect(can("SUPPORT", p)).toBe(false);
    }
  });

  it("Admin verwaltet Mitglieder, vergibt aber keine Rollen", () => {
    expect(can("ADMIN", "users.write")).toBe(true);
    expect(can("ADMIN", "users.roles")).toBe(false);
    expect(can("ADMIN", "users.delete")).toBe(false);
    expect(can("ADMIN", "settings.write")).toBe(false);
  });

  it("Super-Admin hat alle Rechte", () => {
    const all = new Set(ROLES.flatMap((r) => ROLE_PERMISSIONS[r]));
    for (const p of all) expect(can("SUPER_ADMIN", p)).toBe(true);
  });

  it("niemand ändert die eigene Rolle; Rollen nur bis zur eigenen Stufe", () => {
    const sa = u("a", "SUPER_ADMIN");
    expect(canAssignRole(sa, sa, "USER")).toBe(false);
    expect(canAssignRole(sa, u("b", "USER"), "SUPER_ADMIN")).toBe(true);
    expect(canAssignRole(u("c", "ADMIN"), u("b", "USER"), "ADMIN")).toBe(false);
    expect(canAssignRole(u("c", "ADMIN"), u("b", "USER"), "SUPPORT")).toBe(false);
    expect(canAssignRole(u("d", "USER"), u("b", "USER"), "ADMIN")).toBe(false);
  });

  it("Admins verwalten nur niedrigere Rollen, nie sich selbst", () => {
    const admin = u("a", "ADMIN");
    expect(canManageUser(admin, u("b", "USER"))).toBe(true);
    expect(canManageUser(admin, u("c", "SUPPORT"))).toBe(true);
    expect(canManageUser(admin, u("d", "ADMIN"))).toBe(false);
    expect(canManageUser(admin, u("e", "SUPER_ADMIN"))).toBe(false);
    expect(canManageUser(admin, admin)).toBe(false);
    expect(canManageUser(u("s", "SUPPORT"), u("b", "USER"))).toBe(false);
    expect(canManageUser(u("x", "SUPER_ADMIN"), u("y", "SUPER_ADMIN"))).toBe(true);
  });

  it("PHP-Backend verwendet dieselbe Rechtematrix", () => {
    const php = readFileSync("webspace/php/api/_lib.php", "utf8");
    const list = (name: string) => {
      const m = php.match(new RegExp(`\\$${name} = (?:array_merge\\(\\$\\w+, )?\\[([^\\]]*)\\]`));
      return m ? [...m[1].matchAll(/'([a-z.]+)'/g)].map((x) => x[1]) : [];
    };
    const support = list("support");
    const admin = [...support, ...list("admin")];
    const superAdmin = [...admin, ...list("super")];
    expect(new Set(support)).toEqual(new Set(ROLE_PERMISSIONS.SUPPORT));
    expect(new Set(admin)).toEqual(new Set(ROLE_PERMISSIONS.ADMIN));
    expect(new Set(superAdmin)).toEqual(new Set(ROLE_PERMISSIONS.SUPER_ADMIN));
  });
});

describe("Weiterleitung nach der Anmeldung", () => {
  it("nur interne Ziele im Mitglieder- oder Admin-Bereich", () => {
    expect(safeNext("/member/rounds")).toBe("/member/rounds");
    expect(safeNext("/admin/users/view?id=1")).toBe("/admin/users/view?id=1");
    expect(safeNext("https://evil.example/")).toBe("/member");
    expect(safeNext("//evil.example")).toBe("/member");
    expect(safeNext("/\\evil.example")).toBe("/member");
    expect(safeNext("/login")).toBe("/member");
    expect(safeNext(null)).toBe("/member");
  });
});

describe("Eingabeprüfung Konto", () => {
  const valid = { firstName: "Max", lastName: "Muster", email: " Max@Example.DE ", password: "geheim123", passwordRepeat: "geheim123", handicapIndex: "18,4", acceptTerms: true };

  it("Registrierung normalisiert E-Mail und Handicap, ignoriert eine Rolle", () => {
    const r = registerSchema.parse({ ...valid, role: "SUPER_ADMIN" });
    expect(r.email).toBe("max@example.de");
    expect(r.handicapIndex).toBe(18.4);
    expect("role" in r).toBe(false);
  });

  it("Registrierung prüft Passwortlänge, Wiederholung, Zustimmung und Handicap-Bereich", () => {
    expect(registerSchema.safeParse({ ...valid, password: "kurz", passwordRepeat: "kurz" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, passwordRepeat: "anders123" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, acceptTerms: false }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, handicapIndex: "60" }).success).toBe(false);
    expect(registerSchema.parse({ ...valid, handicapIndex: "" }).handicapIndex).toBeNull();
  });

  it("Passwortwechsel verlangt ein neues, wiederholtes Passwort", () => {
    expect(changePasswordSchema.safeParse({ currentPassword: "alt12345", newPassword: "alt12345", newPasswordRepeat: "alt12345" }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ currentPassword: "alt12345", newPassword: "neu12345", newPasswordRepeat: "neu12346" }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ currentPassword: "alt12345", newPassword: "neu12345", newPasswordRepeat: "neu12345" }).success).toBe(true);
  });

  it("Anmeldung akzeptiert E-Mail oder Benutzername älterer Konten", () => {
    expect(loginSchema.parse({ email: "Max.Muster", password: "x" }).email).toBe("max.muster");
  });
});

describe("Strukturierte Fehler", () => {
  it("liefert Code, Status und verständliche Meldung", () => {
    const e = apiError("FORBIDDEN");
    expect(e).toBeInstanceOf(ApiError);
    expect(e.status).toBe(403);
    expect(e.toJSON()).toEqual({ error: "FORBIDDEN", message: "Dafür fehlt dir die Berechtigung." });
    expect(userMessage(new Error("intern"))).toBe("Da ist etwas schiefgelaufen. Bitte versuche es gleich noch einmal.");
  });
});
