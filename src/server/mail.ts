/**
 * E-Mail-Versand der Node-Edition.
 * - SMTP_URL gesetzt (z. B. smtps://user:pass@smtp.example.de): Versand über nodemailer
 * - MAIL_MODE=outbox: Ablage als JSON in .data/mail-outbox (Tests)
 * - sonst: nur Protokoll (Konsole) – in Produktion bitte SMTP_URL setzen
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { getDb } from "@/db/client";
import { mailLog } from "@/db/schema";
import { getSettings, mailInfo, siteUrl } from "./settings";

export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  const settings = await getSettings();
  const mode = mailInfo().mode;
  const from = settings.mailFrom ?? process.env.MAIL_FROM ?? `noreply@${new URL(siteUrl()).hostname.replace(/^www\./, "")}`;
  let status = "OK";
  let ok = true;
  try {
    if (mode === "smtp") {
      const nodemailer = await import("nodemailer");
      const transport = nodemailer.createTransport(process.env.SMTP_URL!);
      await transport.sendMail({ from: { name: settings.siteName, address: from }, to, subject, text });
    } else if (mode === "outbox") {
      const dir = process.env.MAIL_OUTBOX_DIR ?? path.join(process.cwd(), ".data", "mail-outbox");
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, `${Date.now()}-${randomBytes(3).toString("hex")}.json`), JSON.stringify({ to, subject, text, timestamp: new Date().toISOString() }));
    } else if (mode === "off") {
      ok = false;
      status = "AUS";
    } else {
      console.info(`[Mail an ${to}] ${subject}\n${text}`);
      status = "PROTOKOLL";
    }
  } catch (error) {
    ok = false;
    status = `FEHLER ${error instanceof Error ? error.message.slice(0, 200) : ""}`;
    console.error("E-Mail-Versand fehlgeschlagen", error);
  }
  try {
    const db = await getDb();
    await db.insert(mailLog).values({ recipient: to, subject, status });
  } catch {
    // Protokoll ist optional
  }
  return ok;
}

export async function sendVerificationMail(user: { firstName: string }, email: string, token: string): Promise<boolean> {
  const s = await getSettings();
  const link = `${siteUrl()}/verify-email/?token=${encodeURIComponent(token)}`;
  return sendMail(
    email,
    "Bitte bestätige deine E-Mail-Adresse",
    `Hallo ${user.firstName},\n\nbitte bestätige deine E-Mail-Adresse für ${s.siteName}:\n\n${link}\n\nDer Link ist 48 Stunden gültig. Wenn du dich nicht registriert hast, kannst du diese E-Mail ignorieren.\n`,
  );
}

export async function sendResetMail(user: { firstName: string }, email: string, token: string, hours = 1): Promise<boolean> {
  const s = await getSettings();
  const link = `${siteUrl()}/reset-password/?token=${encodeURIComponent(token)}`;
  return sendMail(
    email,
    "Passwort zurücksetzen",
    `Hallo ${user.firstName},\n\nüber diesen Link kannst du ein neues Passwort für ${s.siteName} festlegen:\n\n${link}\n\nDer Link ist ${hours === 1 ? "1 Stunde" : `${hours} Stunden`} gültig. Wenn du das nicht angefordert hast, ignoriere diese E-Mail – dein Passwort bleibt unverändert.\n`,
  );
}

export async function sendInviteMail(user: { firstName: string }, email: string, token: string): Promise<boolean> {
  const s = await getSettings();
  const link = `${siteUrl()}/reset-password/?token=${encodeURIComponent(token)}&invite=1`;
  return sendMail(email, `Einladung: ${s.siteName}`, `Hallo ${user.firstName},\n\nfür dich wurde ein Zugang zu ${s.siteName} angelegt.\nÜber diesen Link legst du dein Passwort fest:\n\n${link}\n\nDer Link ist 7 Tage gültig.\n`);
}
