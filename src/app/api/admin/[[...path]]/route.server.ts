/**
 * Admin-API (Node-Edition). Jede Route prüft die Berechtigung serverseitig aus der Rolle der Sitzung.
 *
 * GET    /api/admin/stats                         admin.access
 * GET    /api/admin/users?q&role&status&verified&sort&page&pageSize   users.read
 * POST   /api/admin/users                         users.write (Rolle ≠ USER: users.roles); E-Mail und/oder Benutzername
 * GET    /api/admin/users/:id                     users.read   (Audit: USER_DATA_VIEWED)
 * PATCH  /api/admin/users/:id                     users.write  (Rolle: users.roles)
 * POST   /api/admin/users/:id/password            users.write  { mode: "mail"|"temporary", password? }
 * DELETE /api/admin/users/:id                     users.delete { confirm: "LÖSCHEN" }
 * GET    /api/admin/users/:id/view                users.impersonate (Audit: IMPERSONATION_VIEW)
 * GET    /api/admin/rounds?q&userId&status&from&to&page   rounds.read
 * GET    /api/admin/rounds/:userId/:roundId       rounds.read  (Audit: USER_DATA_VIEWED)
 * GET    /api/admin/logs?action&group&actorId&userId&q&from&to&page   logs.read
 * GET    /api/admin/system                        system.read
 * GET    /api/admin/rules                         rules.read
 * GET    /api/admin/settings | PUT                settings.write
 * POST   /api/admin/settings/mail-test            settings.write
 * GET    /api/admin/search?q                      admin.access
 * GET    /api/admin/community                     community.read     Übersicht, aggregierte Statistik, Datenqualität
 * GET    /api/admin/community/ranking?filter&q&page community.read   Ranking inkl. Nicht-Teilnehmern
 * GET    /api/admin/community/rounds?filter&q&page  community.read   geteilte und verborgene Runden
 * POST   /api/admin/community/moderate            community.moderate { userId, roundId, action, reason }
 * POST   /api/admin/community/refresh             community.moderate Ranking neu berechnen
 * PATCH  /api/admin/users/:id/community           community.moderate { rankingVisible?: false, profileVisible?: false }
 */
import { count, desc, eq, gte } from "drizzle-orm";
import { getDb, getDbHandle } from "@/db/client";
import { errorLog, mailLog, users, type UserRow } from "@/db/schema";
import { apiError } from "@/lib/api/errors";
import type { AdminRoundRow, AdminSettings, AdminStats, AdminUserDetail, SystemStatus } from "@/lib/api/types";
import { canAssignRole, canManageUser, can, isRole, USER_STATUSES, type Permission, type Role } from "@/lib/auth/permissions";
import { emailSchema, passwordSchema, USERNAME_RULE, usernameSchema } from "@/lib/auth/validation";
import type { AuditAction } from "@/lib/audit/actions";
import { adminRoundDetail, adminUserDetail } from "@/lib/member/admin";
import { activeRounds, type MemberDoc } from "@/lib/member/doc";
import { dashboardData, listRounds } from "@/lib/member/hcp";
import { rulesInfo } from "@/lib/member/rules";
import { APP_VERSION, BUILD_INFO } from "@/lib/member/engine";
import { defaultRuleSet } from "@/rules/whs/registry";
import { runCourseSearch } from "@/lib/courses/summary";
import { audit, auditEntries } from "@/server/audit";
import { loadAllCourses, recentChanges } from "@/server/courseRepository";
import { handle, json, pageParams, readJson, searchParams, str } from "@/server/http";
import { sendInviteMail, sendMail, sendResetMail } from "@/server/mail";
import { createMemberDoc, loadMemberDoc } from "@/server/members";
import { hashPassword } from "@/server/security";
import { requirePermission, roleOf } from "@/server/session";
import { getSettings, mailInfo, saveSettings, siteUrl } from "@/server/settings";
import { syncCommunitySafe } from "@/server/community";
import { adminCommunityOverview, adminCommunityRanking, adminPublicRounds, hideUserCommunity, moderateRound, refreshRanking } from "@/server/communityAdmin";
import type { CommunityFlags } from "@/lib/community/types";
import { adminRow, allMemberDocs, countActiveSuperAdmins, createToken, listUsers, updateUser, userByEmail, userById, userByUsername } from "@/server/users";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path?: string[] }> };

const actorOf = (u: UserRow) => ({ id: u.id, role: roleOf(u) });

async function target(id: string): Promise<UserRow> {
  const u = await userById(id);
  if (!u) throw apiError("NOT_FOUND", "Benutzer nicht gefunden");
  return u;
}

function roundRow(u: UserRow, r: MemberDoc["rounds"][number], fallback: Date): AdminRoundRow {
  return {
    userId: u.id,
    userName: `${u.firstName} ${u.lastName}`.trim(),
    roundId: r.id,
    date: r.date,
    courseName: r.course.courseName,
    holes: r.holes,
    status: r.status === "DELETED" ? "DELETED" : "COMPLETED",
    scoreDifferential: r.computed?.scoreDifferential ?? null,
    adjustedGrossScore: r.computed?.adjustedGrossScore ?? null,
    handicapIndexAfter: r.computed?.handicapIndexAfter ?? null,
    engine: r.computed?.engine ?? null,
    updatedAt: r.updatedAt ?? fallback.toISOString(),
  };
}

function contains(haystack: string, needle: string): boolean {
  return !needle || haystack.toLocaleLowerCase("de").includes(needle.toLocaleLowerCase("de"));
}

async function userDetail(actor: UserRow, u: UserRow): Promise<AdminUserDetail> {
  const { doc } = await loadMemberDoc(u.id);
  const row = await adminRow(u);
  return {
    ...adminUserDetail({ ...row, mustChangePassword: u.mustChangePassword }, doc),
    pendingEmail: u.pendingEmail,
    canManage: canManageUser(actorOf(actor), actorOf(u)),
    canAssignRole: can(roleOf(actor), "users.roles") && actor.id !== u.id,
  };
}

async function settingsView(): Promise<AdminSettings> {
  return { ...(await getSettings()), siteUrl: siteUrl(), mail: mailInfo() };
}

async function dispatch(req: Request, path: string[]): Promise<Response> {
  const [head, a, b, c] = path;
  const method = req.method;
  const q = searchParams(req);
  const need = (p: Permission) => requirePermission(req, p);
  if (c !== undefined) throw apiError("NOT_FOUND");

  // ------------------------------------------------------------------ Kennzahlen
  if (head === "stats" && !a && method === "GET") {
    await need("admin.access");
    const db = await getDb();
    const [all, docs, courses, recentActions, recentActivity, lastChange] = await Promise.all([
      db.select().from(users),
      allMemberDocs(),
      loadAllCourses(),
      auditEntries({ group: "admin" }, 1, 8),
      auditEntries({ group: "member" }, 1, 8),
      recentChanges(1),
    ]);
    const sets = courses.flatMap((co) => co.layouts.filter((l) => l.active).flatMap((l) => l.ratingSets.filter((s) => s.active)));
    const verified = sets.filter((s) => s.verified).length;
    const monthAgo = Date.now() - 30 * 86400_000;
    const stats: AdminStats = {
      users: all.length,
      activeUsers: all.filter((u) => u.status === "ACTIVE" && u.lastActivityAt && u.lastActivityAt.getTime() > monthAgo).length,
      unverifiedUsers: all.filter((u) => !u.emailVerified).length,
      admins: all.filter((u) => u.role !== "USER").length,
      rounds: docs.reduce((n, d) => n + (d.doc ? activeRounds(d.doc).length : 0), 0),
      courses: courses.filter((co) => co.active).length,
      ratings: sets.length,
      verifiedRatings: verified,
      dataQualityPercent: sets.length ? Math.round((verified * 100) / sets.length) : 0,
      lastCourseUpdate: lastChange[0]?.createdAt.toISOString() ?? null,
      recentActions: recentActions.items,
      recentActivity: recentActivity.items,
    };
    return json(stats);
  }

  // ------------------------------------------------------------------ Benutzer
  if (head === "users") {
    if (!a && method === "GET") {
      await need("users.read");
      const { page, pageSize } = pageParams(q);
      return json(await listUsers({ q: q.get("q")?.slice(0, 100), role: q.get("role") ?? "", status: q.get("status") ?? "", verified: q.get("verified") ?? "", sort: q.get("sort") ?? "" }, page, pageSize));
    }
    if (!a && method === "POST") {
      const actor = await need("users.write");
      const body = await readJson(req, 8000);
      const firstName = str(body, "firstName", 60);
      const lastName = str(body, "lastName", 60);
      if (!firstName || !lastName) throw apiError("VALIDATION", "Bitte Vor- und Nachnamen angeben.", { ...(firstName ? {} : { firstName: "Bitte ausfüllen." }), ...(lastName ? {} : { lastName: "Bitte ausfüllen." }) });
      // Anmeldung per E-Mail-Adresse und/oder Benutzername – ohne E-Mail (z. B. für Freunde) mit Benutzername + Passwort
      const emailRaw = str(body, "email", 200);
      const usernameRaw = str(body, "username", 64);
      if (!emailRaw && !usernameRaw) throw apiError("VALIDATION", "Bitte eine E-Mail-Adresse oder einen Benutzernamen angeben.", { email: "Bitte ausfüllen.", username: "Bitte ausfüllen." });
      const email = emailRaw ? emailSchema.safeParse(emailRaw) : null;
      if (email && !email.success) throw apiError("VALIDATION", "Bitte eine gültige E-Mail-Adresse eingeben.", { email: "Bitte eine gültige E-Mail-Adresse eingeben." });
      const username = usernameRaw ? usernameSchema.safeParse(usernameRaw) : null;
      if (username && !username.success) throw apiError("VALIDATION", USERNAME_RULE, { username: USERNAME_RULE });
      const role = (str(body, "role", 20) || "USER") as Role;
      if (!isRole(role)) throw apiError("VALIDATION", "Unbekannte Rolle", { role: "Unbekannte Rolle" });
      if (role !== "USER" && !canAssignRole(actorOf(actor), { id: "", role: "USER" }, role)) throw apiError("FORBIDDEN", "Diese Rolle darfst du nicht vergeben.");
      const password = typeof body.password === "string" ? body.password : "";
      const invite = password === "";
      if (invite && !email) throw apiError("VALIDATION", "Ohne E-Mail-Adresse bitte ein Passwort festlegen.", { password: "Bitte ein Passwort festlegen." });
      if (!invite) {
        const pw = passwordSchema.safeParse(password);
        if (!pw.success) throw apiError("VALIDATION", pw.error.issues[0].message, { password: pw.error.issues[0].message });
      }
      // Standard: bei der ersten Anmeldung ein eigenes Passwort wählen (der Admin kennt das vergebene)
      const mustChangePassword = !invite && body.mustChangePassword !== false;
      if (email && (await userByEmail(email.data))) throw apiError("EMAIL_TAKEN", undefined, { email: "Für diese E-Mail-Adresse gibt es bereits ein Konto." });
      if (username && (await userByUsername(username.data))) throw apiError("USERNAME_TAKEN", undefined, { username: "Diesen Benutzernamen gibt es bereits." });
      const db = await getDb();
      const now = new Date();
      const [created] = await db
        .insert(users)
        .values({
          email: email?.data ?? null,
          username: username?.data ?? null,
          firstName,
          lastName,
          role,
          status: "ACTIVE",
          emailVerified: true,
          emailVerifiedAt: now,
          mustChangePassword,
          passwordHash: await hashPassword(invite ? crypto.randomUUID() + crypto.randomUUID() : password),
          passwordChangedAt: now,
        })
        .returning();
      await createMemberDoc(created.id);
      let mailSent: boolean | null = null;
      if (invite && email) mailSent = await sendInviteMail(created, email.data, await createToken(created.id, "RESET_PASSWORD", 7 * 24));
      await audit("USER_CREATED", actor, { userId: created.id, entityType: "user", entityId: created.id, newValue: { email: email?.data ?? null, username: username?.data ?? null, role, invite } });
      return json({ user: await adminRow(created), invite, mailSent }, 201);
    }
    if (a && !b && method === "GET") {
      const actor = await need("users.read");
      const u = await target(a);
      await audit("USER_DATA_VIEWED", actor, { userId: u.id, entityType: "user", entityId: u.id });
      return json(await userDetail(actor, u));
    }
    if (a && b === "view" && method === "GET") {
      const actor = await need("users.impersonate");
      const u = await target(a);
      const { doc } = await loadMemberDoc(u.id);
      await audit("IMPERSONATION_VIEW", actor, { userId: u.id, entityType: "user", entityId: u.id });
      return json({ user: await adminRow(u), dashboard: dashboardData(doc, u.firstName), rounds: listRounds(doc) });
    }
    if (a && !b && method === "PATCH") {
      const actor = await need("users.write");
      const u = await target(a);
      if (!canManageUser(actorOf(actor), actorOf(u))) throw apiError("FORBIDDEN", actor.id === u.id ? "Das eigene Konto wird unter „Profil“ bearbeitet." : "Keine Berechtigung für dieses Konto.");
      const body = await readJson(req, 8000);
      const patch: Partial<typeof users.$inferInsert> = {};
      const audits: [AuditAction, unknown, unknown][] = [];
      const profileOld = { firstName: u.firstName, lastName: u.lastName, email: u.email, username: u.username };
      const profileNew = { ...profileOld };
      if ("firstName" in body) profileNew.firstName = patch.firstName = str(body, "firstName", 60) || u.firstName;
      if ("lastName" in body) profileNew.lastName = patch.lastName = str(body, "lastName", 60) || u.lastName;
      if (typeof body.email === "string" && body.email.trim() && body.email.trim().toLowerCase() !== u.email) {
        const email = emailSchema.safeParse(body.email);
        if (!email.success) throw apiError("VALIDATION", "Bitte eine gültige E-Mail-Adresse eingeben.", { email: "Bitte eine gültige E-Mail-Adresse eingeben." });
        const taken = await userByEmail(email.data);
        if (taken && taken.id !== u.id) throw apiError("EMAIL_TAKEN", undefined, { email: "Diese E-Mail-Adresse wird bereits verwendet." });
        profileNew.email = patch.email = email.data;
      }
      if (typeof body.username === "string" && body.username.trim() && body.username.trim().toLowerCase() !== u.username) {
        const username = usernameSchema.safeParse(body.username);
        if (!username.success) throw apiError("VALIDATION", USERNAME_RULE, { username: USERNAME_RULE });
        const taken = await userByUsername(username.data);
        if (taken && taken.id !== u.id) throw apiError("USERNAME_TAKEN", undefined, { username: "Diesen Benutzernamen gibt es bereits." });
        profileNew.username = patch.username = username.data;
      }
      if (JSON.stringify(profileNew) !== JSON.stringify(profileOld)) audits.push(["USER_PROFILE_UPDATED", profileOld, profileNew]);
      if (typeof body.role === "string" && body.role !== u.role) {
        const role = body.role;
        if (!isRole(role) || !canAssignRole(actorOf(actor), actorOf(u), role)) throw apiError("FORBIDDEN", "Diese Rolle darfst du nicht vergeben.");
        if (u.role === "SUPER_ADMIN" && (await countActiveSuperAdmins()) <= 1) throw apiError("CONFLICT", "Es muss mindestens ein aktives Super-Admin-Konto geben.");
        patch.role = role;
        audits.push(["USER_ROLE_CHANGED", { role: u.role }, { role }]);
      }
      if (typeof body.status === "string" && body.status !== u.status) {
        const status = body.status;
        if (!(USER_STATUSES as readonly string[]).includes(status)) throw apiError("VALIDATION", "Unbekannter Status", { status: "Unbekannter Status" });
        if (u.role === "SUPER_ADMIN" && status !== "ACTIVE" && (await countActiveSuperAdmins()) <= 1) throw apiError("CONFLICT", "Es muss mindestens ein aktives Super-Admin-Konto geben.");
        patch.status = status;
        const action: AuditAction = status === "ACTIVE" ? "USER_ENABLED" : status === "LOCKED" ? "USER_LOCKED" : "USER_DISABLED";
        audits.push([action, { status: u.status }, { status }]);
      }
      if (body.emailVerified === true && !u.emailVerified) {
        patch.emailVerified = true;
        patch.emailVerifiedAt = new Date();
        audits.push(["USER_VERIFIED_BY_ADMIN", { emailVerified: false }, { emailVerified: true }]);
      }
      const updated = Object.keys(patch).length ? await updateUser(u.id, patch) : u;
      for (const [action, oldValue, newValue] of audits) await audit(action, actor, { userId: u.id, entityType: "user", entityId: u.id, oldValue, newValue });
      if (patch.firstName !== undefined || patch.lastName !== undefined) await syncCommunitySafe(u.id);
      return json({ user: await adminRow(updated) });
    }
    if (a && b === "community" && method === "PATCH") {
      const actor = await need("community.moderate");
      const u = await target(a);
      await hideUserCommunity(actor, u.id, await readJson(req, 2000));
      return json(await userDetail(actor, await target(a)));
    }
    if (a && b === "password" && method === "POST") {
      const actor = await need("users.write");
      const u = await target(a);
      if (!canManageUser(actorOf(actor), actorOf(u))) throw apiError("FORBIDDEN", "Keine Berechtigung für dieses Konto.");
      const body = await readJson(req, 2000);
      if (body.mode === "mail") {
        if (!u.email) throw apiError("VALIDATION", "Für dieses Konto ist keine E-Mail-Adresse hinterlegt.");
        const mailSent = await sendResetMail(u, u.email, await createToken(u.id, "RESET_PASSWORD", 24), 24);
        await audit("USER_PASSWORD_RESET_REQUESTED", actor, { userId: u.id, entityType: "user", entityId: u.id, newValue: { byAdmin: true } });
        return json({ ok: true, mailSent });
      }
      const password = passwordSchema.parse(typeof body.password === "string" ? body.password : "");
      await updateUser(u.id, { passwordHash: await hashPassword(password), mustChangePassword: true, passwordChangedAt: new Date() });
      await audit("USER_PASSWORD_RESET", actor, { userId: u.id, entityType: "user", entityId: u.id, newValue: { temporary: true } });
      return json({ ok: true });
    }
    if (a && !b && method === "DELETE") {
      const actor = await need("users.delete");
      const u = await target(a);
      if (u.id === actor.id) throw apiError("FORBIDDEN", "Das eigene Konto kann hier nicht gelöscht werden.");
      const body = await readJson(req, 2000);
      if (body.confirm !== "LÖSCHEN") throw apiError("VALIDATION", "Bitte zur Bestätigung LÖSCHEN eingeben.", { confirm: "Bitte LÖSCHEN eingeben." });
      if (u.role === "SUPER_ADMIN" && u.status === "ACTIVE" && (await countActiveSuperAdmins()) <= 1) throw apiError("CONFLICT", "Es muss mindestens ein aktives Super-Admin-Konto geben.");
      const { doc } = await loadMemberDoc(u.id);
      const db = await getDb();
      await db.delete(users).where(eq(users.id, u.id));
      await audit("USER_DELETED", actor, { userId: u.id, entityType: "user", entityId: u.id, oldValue: { email: u.email, username: u.username, name: `${u.firstName} ${u.lastName}`.trim(), role: u.role, rounds: activeRounds(doc).length } });
      return json({ ok: true });
    }
  }

  // ------------------------------------------------------------------ Runden
  if (head === "rounds" && method === "GET") {
    const actor = await need("rounds.read");
    if (a && b) {
      const u = await target(a);
      const { doc } = await loadMemberDoc(u.id);
      const detail = adminRoundDetail({ id: u.id, name: `${u.firstName} ${u.lastName}`.trim(), email: u.email }, doc, b);
      await audit("USER_DATA_VIEWED", actor, { userId: u.id, entityType: "round", entityId: b });
      return json(detail);
    }
    if (!a) {
      const { page, pageSize } = pageParams(q);
      const text = q.get("q")?.slice(0, 100) ?? "";
      const status = q.get("status") ?? "";
      const from = q.get("from") ?? "";
      const to = q.get("to") ?? "";
      const rows: AdminRoundRow[] = [];
      for (const { user, doc, updatedAt } of await allMemberDocs(q.get("userId") ?? undefined)) {
        if (!doc) continue;
        for (const r of doc.rounds) {
          const row = roundRow(user, r, updatedAt);
          if (status && row.status !== status) continue;
          if ((from && row.date < from) || (to && row.date > to)) continue;
          if (!contains(`${row.courseName} ${row.userName} ${row.roundId}`, text)) continue;
          rows.push(row);
        }
      }
      rows.sort((x, y) => y.date.localeCompare(x.date) || y.updatedAt.localeCompare(x.updatedAt));
      return json({ items: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize });
    }
  }

  // ------------------------------------------------------------------ Audit-Log
  if (head === "logs" && !a && method === "GET") {
    await need("logs.read");
    const { page, pageSize } = pageParams(q);
    const group = q.get("group");
    return json(
      await auditEntries(
        { action: q.get("action") ?? "", group: group === "admin" || group === "member" ? group : "", actorId: q.get("actorId") ?? "", userId: q.get("userId") ?? "", q: q.get("q")?.slice(0, 100) ?? "", from: q.get("from") ?? "", to: q.get("to") ?? "" },
        page,
        pageSize,
      ),
    );
  }

  // ------------------------------------------------------------------ System
  if (head === "system" && !a && method === "GET") {
    await need("system.read");
    const db = await getDb();
    const handle = await getDbHandle();
    const since = new Date(Date.now() - 86400_000);
    const [[{ n: errors24 }], recentErrors, mails, courses, supers] = await Promise.all([
      db.select({ n: count() }).from(errorLog).where(gte(errorLog.createdAt, since)),
      db.select().from(errorLog).orderBy(desc(errorLog.createdAt)).limit(20),
      db.select().from(mailLog).orderBy(desc(mailLog.createdAt)).limit(20),
      loadAllCourses(),
      countActiveSuperAdmins(),
    ]);
    const mail = mailInfo();
    const sets = courses.flatMap((co) => co.layouts.flatMap((l) => l.ratingSets));
    const https = siteUrl().startsWith("https://");
    const status: SystemStatus = {
      checks: [
        { key: "db", label: "Datenbank", state: "OK", detail: handle.kind === "postgres" ? "PostgreSQL" : "PGlite (eingebettet)" },
        { key: "secret", label: "Sitzungsschlüssel", state: process.env.SESSION_SECRET ? "OK" : "WARNING", detail: process.env.SESSION_SECRET ? "SESSION_SECRET gesetzt" : "automatisch erzeugt (in der Datenbank gespeichert)" },
        { key: "https", label: "HTTPS", state: https ? "OK" : "WARNING", detail: https ? siteUrl() : "APP_URL ohne https – Cookies nur in Produktion als „Secure“" },
        { key: "mail", label: "E-Mail-Versand", state: mail.mode === "smtp" ? "OK" : "WARNING", detail: mail.mode === "smtp" ? `SMTP ${mail.host}` : mail.mode === "outbox" ? "Testmodus (Ablage in .data/mail-outbox)" : mail.mode === "off" ? "ausgeschaltet" : "nur Protokoll – SMTP_URL setzen" },
        { key: "siteUrl", label: "Adresse für E-Mail-Links", state: process.env.APP_URL ? "OK" : "WARNING", detail: process.env.APP_URL ? siteUrl() : "APP_URL nicht gesetzt" },
        { key: "courses", label: "Golfplatzdatenbank", state: courses.length > 0 ? "OK" : "WARNING", detail: `${courses.length} Anlagen, ${sets.length} Ratings (${sets.filter((s) => s.verified).length} verifiziert)` },
        { key: "superadmin", label: "Super-Admin vorhanden", state: supers > 0 ? "OK" : "ERROR", detail: `${supers} aktiv` },
      ],
      engine: { ruleSet: defaultRuleSet.label, version: APP_VERSION, build: BUILD_INFO },
      errorsLast24h: Number(errors24),
      recentErrors: recentErrors.map((e) => ({ timestamp: e.createdAt.toISOString(), message: e.message })),
      storage: handle.kind === "postgres" ? "PostgreSQL" : "PGlite (Ordner .data/pglite)",
      mail: { mode: mail.mode, recent: mails.map((m) => ({ timestamp: m.createdAt.toISOString(), to: m.recipient, subject: m.subject, status: m.status })) },
    };
    return json(status);
  }

  if (head === "rules" && !a && method === "GET") {
    await need("rules.read");
    return json(rulesInfo());
  }

  // ------------------------------------------------------------------ Einstellungen
  if (head === "settings") {
    if (!a && method === "GET") {
      await need("settings.write");
      return json(await settingsView());
    }
    if (!a && method === "PUT") {
      const actor = await need("settings.write");
      const body = await readJson(req, 64 * 1024);
      const old = await getSettings();
      const next = { ...old };
      for (const [key, max] of [["siteName", 80], ["contactEmail", 200], ["mailFrom", 200]] as const) {
        if (key in body) {
          const v = str(body, key, max);
          (next as Record<string, unknown>)[key] = v === "" ? (key === "siteName" ? "Golf HCP Rechner" : null) : v;
        }
      }
      for (const key of ["contactEmail", "mailFrom"] as const) {
        if (next[key] && !emailSchema.safeParse(next[key]).success) throw apiError("VALIDATION", "Bitte eine gültige E-Mail-Adresse eingeben.", { [key]: "Bitte eine gültige E-Mail-Adresse eingeben." });
      }
      for (const key of ["imprintText", "privacyText"] as const) {
        if (key in body) {
          const v = typeof body[key] === "string" ? (body[key] as string).trim().slice(0, 20000) : "";
          next[key] = v || null;
        }
      }
      for (const key of ["registrationOpen", "emailVerificationRequired"] as const) if (key in body) next[key] = Boolean(body[key]);
      const communityChanges: Record<string, [boolean, boolean]> = {};
      if (body.community && typeof body.community === "object") {
        const incoming = body.community as Record<string, unknown>;
        const flags: CommunityFlags = { ...old.community };
        for (const key of Object.keys(flags) as (keyof CommunityFlags)[]) {
          if (key in incoming && Boolean(incoming[key]) !== flags[key]) {
            communityChanges[`community.${key}`] = [flags[key], Boolean(incoming[key])];
            flags[key] = Boolean(incoming[key]);
          }
        }
        next.community = flags;
      }
      await saveSettings(next);
      const oldValue: Record<string, unknown> = {};
      const newValue: Record<string, unknown> = {};
      for (const [key, [from, to]] of Object.entries(communityChanges)) {
        oldValue[key] = from;
        newValue[key] = to;
      }
      for (const key of Object.keys(next) as (keyof typeof next)[]) {
        if (key === "community") continue;
        if (old[key] !== next[key]) {
          const text = key === "imprintText" || key === "privacyText";
          oldValue[key] = text ? "(Text)" : old[key];
          newValue[key] = text ? "(Text geändert)" : next[key];
        }
      }
      if (Object.keys(newValue).length) await audit("SETTINGS_CHANGED", actor, { entityType: "settings", oldValue, newValue });
      return json(await settingsView());
    }
    if (a === "mail-test" && method === "POST") {
      await need("settings.write");
      const email = emailSchema.safeParse(str(await readJson(req, 2000), "to", 200));
      if (!email.success) throw apiError("VALIDATION", "Bitte eine gültige E-Mail-Adresse eingeben.", { to: "Bitte eine gültige E-Mail-Adresse eingeben." });
      const s = await getSettings();
      const ok = await sendMail(email.data, `Testnachricht von ${s.siteName}`, `Diese Testnachricht bestätigt, dass der E-Mail-Versand funktioniert.\n\n${siteUrl()}\n`);
      return json({ ok, mode: mailInfo().mode });
    }
  }

  // ------------------------------------------------------------------ Community
  if (head === "community") {
    if (!a && method === "GET") {
      await need("community.read");
      return json(await adminCommunityOverview());
    }
    if (a === "ranking" && !b && method === "GET") {
      await need("community.read");
      const { page, pageSize } = pageParams(q);
      return json(await adminCommunityRanking({ filter: q.get("filter"), q: q.get("q"), page, pageSize }));
    }
    if (a === "rounds" && !b && method === "GET") {
      await need("community.read");
      const { page, pageSize } = pageParams(q);
      return json(await adminPublicRounds({ filter: q.get("filter"), q: q.get("q"), page, pageSize }));
    }
    if (a === "moderate" && !b && method === "POST") {
      const actor = await need("community.moderate");
      const body = await readJson(req, 4000);
      const userId = str(body, "userId", 64);
      if (!(await userById(userId))) throw apiError("NOT_FOUND", "Benutzer nicht gefunden");
      await moderateRound(actor, userId, str(body, "roundId", 64), body.action, body.reason);
      return json({ ok: true });
    }
    if (a === "refresh" && !b && method === "POST") {
      const actor = await need("community.moderate");
      return json(await refreshRanking(actor));
    }
  }

  // ------------------------------------------------------------------ Globale Suche
  if (head === "search" && !a && method === "GET") {
    const actor = await need("admin.access");
    const text = (q.get("q") ?? "").trim().slice(0, 100);
    if (text.length < 2) return json({ users: [], courses: [], rounds: [] });
    const role = roleOf(actor);
    const found = can(role, "users.read") ? (await listUsers({ q: text }, 1, 10)).items : [];
    const courses = can(role, "courses.read") ? runCourseSearch(await loadAllCourses({ includeInactive: true }), new URLSearchParams({ q: text, limit: "10" })).results : [];
    const rounds: AdminRoundRow[] = [];
    if (can(role, "rounds.read")) {
      for (const { user, doc, updatedAt } of await allMemberDocs()) {
        if (!doc) continue;
        const userMatch = contains(`${user.firstName} ${user.lastName} ${user.email ?? ""}`, text);
        for (const r of doc.rounds) {
          if (rounds.length >= 10) break;
          if (userMatch || contains(`${r.course.courseName} ${r.id}`, text)) rounds.push(roundRow(user, r, updatedAt));
        }
      }
    }
    return json({ users: found, courses, rounds });
  }

  throw apiError("NOT_FOUND");
}

async function route(req: Request, ctx: Ctx) {
  return handle(async () => dispatch(req, (await ctx.params).path ?? []));
}

export const GET = route;
export const POST = route;
export const PUT = route;
export const PATCH = route;
export const DELETE = route;
