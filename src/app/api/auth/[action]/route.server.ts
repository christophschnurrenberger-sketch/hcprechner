/**
 * Konto und Anmeldung (Node-Edition) – gleiche Aktionen und Antworten wie api/auth.php der Webspace-Edition.
 *
 * GET  /api/auth/me
 * POST /api/auth/login | logout | register | verify-email | resend-verification | forgot-password |
 *      reset-password | change-password | update-profile | export | delete-account
 *
 * Die Rolle eines neuen Kontos ist immer USER – sie wird nie aus der Anfrage übernommen.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { apiError } from "@/lib/api/errors";
import { changePasswordSchema, emailSchema, loginSchema, profileSchema, registerSchema, resetPasswordSchema } from "@/lib/auth/validation";
import { audit } from "@/server/audit";
import { ensureBootstrapAdmin } from "@/server/bootstrap";
import { clientIp, handle, json, readJson, str } from "@/server/http";
import { sendResetMail, sendVerificationMail } from "@/server/mail";
import { createMemberDoc, loadMemberDoc } from "@/server/members";
import { hashPassword, rateHit, rateLimited, verifyPassword } from "@/server/security";
import { clearSession, csrfToken, issueSession, requireUser, sessionUser, sessionView } from "@/server/session";
import { getSettings, publicSettings } from "@/server/settings";
import { consumeToken, countActiveSuperAdmins, createToken, updateUser, userByEmail, userByLogin } from "@/server/users";
import { APP_VERSION } from "@/lib/member/engine";
import { syncCommunitySafe } from "@/server/community";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ action: string }> };

/** Gleichmäßige Laufzeit für Antworten ohne Auskunft über Konten. */
async function genericOk(started: number): Promise<Response> {
  const elapsed = Date.now() - started;
  if (elapsed < 400) await new Promise((r) => setTimeout(r, 400 - elapsed));
  return json({ ok: true });
}

export async function GET(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { action } = await ctx.params;
    if (action !== "me") throw apiError("NOT_FOUND");
    await ensureBootstrapAdmin();
    const { user } = await sessionUser();
    const settings = publicSettings(await getSettings());
    return json({ installed: true, user: user ? await sessionView(user) : null, csrf: user ? await csrfToken(user) : null, settings, appVersion: APP_VERSION });
  });
}

export async function POST(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { action } = await ctx.params;
    const ip = clientIp(req);
    const settings = await getSettings();

    switch (action) {
      case "login": {
        await ensureBootstrapAdmin();
        if (rateLimited("login", ip, 10, 900)) throw apiError("RATE_LIMITED", "Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen.");
        const input = loginSchema.parse(await readJson(req, 10_000));
        const accountKey = input.email;
        if (rateLimited("login-account", accountKey, 8, 900)) throw apiError("RATE_LIMITED", "Zu viele Anmeldeversuche für dieses Konto. Bitte in 15 Minuten erneut versuchen.");
        const user = await userByLogin(input.email);
        const ok = await verifyPassword(input.password, user?.passwordHash ?? null);
        if (!user || !ok) {
          rateHit("login", ip, 900);
          rateHit("login-account", accountKey, 900);
          if (user) await audit("USER_LOGIN_FAILED", null, { userId: user.id, entityType: "user", entityId: user.id });
          await new Promise((r) => setTimeout(r, 400));
          throw apiError("INVALID_CREDENTIALS");
        }
        if (user.status === "DISABLED") throw apiError("ACCOUNT_DISABLED");
        if (user.status === "LOCKED") throw apiError("ACCOUNT_LOCKED");
        if (!user.emailVerified && settings.emailVerificationRequired) throw apiError("EMAIL_NOT_VERIFIED");
        const now = new Date();
        const updated = await updateUser(user.id, { lastLoginAt: now, lastActivityAt: now });
        const csrf = await issueSession(updated);
        return json({ user: await sessionView(updated), csrf });
      }

      case "logout":
        await clearSession();
        return json({ ok: true });

      case "register": {
        if (!settings.registrationOpen) throw apiError("REGISTRATION_CLOSED");
        if (rateLimited("register", ip, 5, 3600)) throw apiError("RATE_LIMITED", "Zu viele Registrierungen von diesem Anschluss. Bitte später erneut versuchen.");
        const input = registerSchema.parse(await readJson(req, 10_000));
        rateHit("register", ip, 3600);
        if (await userByEmail(input.email)) throw apiError("EMAIL_TAKEN", undefined, { email: "Für diese E-Mail-Adresse gibt es bereits ein Konto." });
        const verify = settings.emailVerificationRequired;
        const db = await getDb();
        const now = new Date();
        const [user] = await db
          .insert(users)
          .values({
            email: input.email,
            firstName: input.firstName,
            lastName: input.lastName,
            role: "USER",
            status: "ACTIVE",
            emailVerified: !verify,
            emailVerifiedAt: verify ? null : now,
            passwordHash: await hashPassword(input.password),
            passwordChangedAt: now,
          })
          .onConflictDoNothing()
          .returning();
        if (!user) throw apiError("EMAIL_TAKEN", undefined, { email: "Für diese E-Mail-Adresse gibt es bereits ein Konto." });
        const startHcp = input.handicapIndex === null ? 54 : Math.round(input.handicapIndex * 10) / 10;
        await createMemberDoc(user.id, startHcp);
        await audit("USER_REGISTERED", user, { userId: user.id, entityType: "user", entityId: user.id, newValue: { email: input.email, startHandicapIndex: startHcp } });
        if (verify) {
          const token = await createToken(user.id, "VERIFY_EMAIL", 48);
          const mailSent = await sendVerificationMail(user, input.email, token);
          return json({ verificationRequired: true, mailSent, email: input.email }, 201);
        }
        const csrf = await issueSession(user);
        return json({ verificationRequired: false, user: await sessionView(user), csrf }, 201);
      }

      case "verify-email": {
        if (rateLimited("verify", ip, 20, 900)) throw apiError("RATE_LIMITED");
        const token = str(await readJson(req, 2000), "token", 200);
        const user = await consumeToken(token, "VERIFY_EMAIL");
        if (!user) {
          rateHit("verify", ip, 900);
          throw apiError("TOKEN_INVALID");
        }
        const old = user.email;
        let email = user.email;
        if (user.pendingEmail) {
          const taken = await userByEmail(user.pendingEmail);
          if (taken && taken.id !== user.id) throw apiError("EMAIL_TAKEN");
          email = user.pendingEmail;
        }
        const updated = await updateUser(user.id, { email, pendingEmail: null, emailVerified: true, emailVerifiedAt: new Date() });
        await audit("USER_EMAIL_VERIFIED", updated, { userId: user.id, entityType: "user", entityId: user.id, oldValue: old !== email ? { email: old } : null, newValue: { email } });
        return json({ ok: true, email });
      }

      case "resend-verification": {
        const started = Date.now();
        const email = str(await readJson(req, 2000), "email", 200).toLowerCase();
        if (!rateLimited("resend", ip, 5, 3600) && !rateLimited("resend-account", email, 3, 3600) && emailSchema.safeParse(email).success) {
          rateHit("resend", ip, 3600);
          rateHit("resend-account", email, 3600);
          const user = await userByEmail(email);
          if (user && !user.emailVerified && user.status === "ACTIVE") {
            const token = await createToken(user.id, "VERIFY_EMAIL", 48);
            await sendVerificationMail(user, email, token);
          }
        }
        return genericOk(started);
      }

      case "forgot-password": {
        const started = Date.now();
        const parsed = emailSchema.safeParse(str(await readJson(req, 2000), "email", 200));
        if (!parsed.success) throw apiError("VALIDATION", "Bitte eine gültige E-Mail-Adresse eingeben.", { email: "Bitte eine gültige E-Mail-Adresse eingeben." });
        const email = parsed.data;
        if (!rateLimited("forgot", ip, 5, 3600) && !rateLimited("forgot-account", email, 3, 3600)) {
          rateHit("forgot", ip, 3600);
          rateHit("forgot-account", email, 3600);
          const user = await userByEmail(email);
          if (user && user.status === "ACTIVE") {
            const token = await createToken(user.id, "RESET_PASSWORD", 1);
            await sendResetMail(user, email, token);
            await audit("USER_PASSWORD_RESET_REQUESTED", null, { userId: user.id, entityType: "user", entityId: user.id });
          }
        }
        return genericOk(started);
      }

      case "reset-password": {
        if (rateLimited("reset", ip, 20, 900)) throw apiError("RATE_LIMITED");
        const input = resetPasswordSchema.safeParse(await readJson(req, 2000));
        if (!input.success) {
          const tokenIssue = input.error.issues.some((i) => i.path[0] === "token");
          if (tokenIssue) throw apiError("TOKEN_INVALID");
          throw input.error;
        }
        const user = await consumeToken(input.data.token, "RESET_PASSWORD");
        if (!user) {
          rateHit("reset", ip, 900);
          throw apiError("TOKEN_INVALID");
        }
        const now = new Date();
        const updated = await updateUser(user.id, {
          passwordHash: await hashPassword(input.data.password),
          passwordChangedAt: now,
          mustChangePassword: false,
          // Der Link kam per E-Mail – damit ist die Adresse bestätigt
          ...(user.emailVerified ? {} : { emailVerified: true, emailVerifiedAt: now }),
        });
        await audit("USER_PASSWORD_RESET", updated, { userId: user.id, entityType: "user", entityId: user.id });
        return json({ ok: true });
      }

      case "change-password": {
        const user = await requireUser(req);
        if (rateLimited("change-password", user.id, 10, 900)) throw apiError("RATE_LIMITED");
        const body = await readJson(req, 2000);
        if (!(await verifyPassword(String(body.currentPassword ?? ""), user.passwordHash))) {
          rateHit("change-password", user.id, 900);
          throw apiError("VALIDATION", "Das aktuelle Passwort ist falsch.", { currentPassword: "Das aktuelle Passwort ist falsch." });
        }
        const input = changePasswordSchema.parse(body);
        const updated = await updateUser(user.id, { passwordHash: await hashPassword(input.newPassword), passwordChangedAt: new Date(), mustChangePassword: false });
        await audit("USER_PASSWORD_CHANGED", updated, { userId: user.id, entityType: "user", entityId: user.id });
        const csrf = await issueSession(updated);
        return json({ user: await sessionView(updated), csrf });
      }

      case "update-profile": {
        const user = await requireUser(req);
        const body = await readJson(req, 4000);
        // Leeres Feld: bestehende Adresse bleibt; Konten mit Benutzername dürfen ohne E-Mail-Adresse bleiben.
        const input = profileSchema.parse({ ...body, email: body.email || user.email || "" });
        if (!input.email && !user.username) throw apiError("VALIDATION", "Bitte eine gültige E-Mail-Adresse eingeben.", { email: "Bitte eine gültige E-Mail-Adresse eingeben." });
        const emailChanged = input.email !== "" && input.email !== user.email;
        if (emailChanged) {
          if (!(await verifyPassword(input.currentPassword ?? "", user.passwordHash))) {
            throw apiError("VALIDATION", "Zum Ändern der E-Mail-Adresse bitte das aktuelle Passwort eingeben.", { currentPassword: "Bitte das aktuelle Passwort eingeben." });
          }
          if (await userByEmail(input.email)) throw apiError("EMAIL_TAKEN", undefined, { email: "Diese E-Mail-Adresse wird bereits verwendet." });
        }
        const old = { firstName: user.firstName, lastName: user.lastName, email: user.email };
        const patch: Partial<typeof users.$inferInsert> = { firstName: input.firstName, lastName: input.lastName };
        // Neue Adresse gilt erst nach Bestätigung – auch bei Konten ohne E-Mail bleibt die Anmeldung bis dahin möglich.
        if (emailChanged) patch.pendingEmail = input.email;
        const updated = await updateUser(user.id, patch);
        if (emailChanged) {
          const token = await createToken(user.id, "VERIFY_EMAIL", 48);
          await sendVerificationMail(updated, input.email, token);
        }
        await audit("USER_PROFILE_UPDATED", updated, { userId: user.id, entityType: "user", entityId: user.id, oldValue: old, newValue: { firstName: input.firstName, lastName: input.lastName, email: emailChanged ? input.email : user.email } });
        await syncCommunitySafe(updated.id);
        return json({ user: await sessionView(updated), pendingEmail: updated.pendingEmail });
      }

      case "export": {
        const user = await requireUser(req);
        const { doc } = await loadMemberDoc(user.id);
        const { passwordHash: _hash, ...account } = user;
        void _hash;
        return json({ format: "golf-hcp-rechner/datenauskunft", exportedAt: new Date().toISOString(), account, data: doc });
      }

      case "delete-account": {
        const user = await requireUser(req);
        const body = await readJson(req, 2000);
        if (!(await verifyPassword(String(body.password ?? ""), user.passwordHash))) throw apiError("VALIDATION", "Das Passwort ist falsch.", { password: "Das Passwort ist falsch." });
        if (body.confirm !== "LÖSCHEN") throw apiError("VALIDATION", "Bitte zur Bestätigung LÖSCHEN eingeben.", { confirm: "Bitte LÖSCHEN eingeben." });
        if (user.role === "SUPER_ADMIN" && (await countActiveSuperAdmins()) <= 1) throw apiError("CONFLICT", "Das letzte Super-Admin-Konto kann nicht gelöscht werden.");
        const { doc } = await loadMemberDoc(user.id);
        const db = await getDb();
        await db.delete(users).where(eq(users.id, user.id));
        await audit("USER_DELETED", user, {
          userId: user.id,
          entityType: "user",
          entityId: user.id,
          oldValue: { email: user.email, username: user.username, name: `${user.firstName} ${user.lastName}`.trim(), rounds: doc.rounds.filter((r) => r.status !== "DELETED").length, selfService: true },
        });
        await clearSession();
        return json({ ok: true });
      }

      default:
        throw apiError("NOT_FOUND", "Unbekannte Aktion");
    }
  });
}
