/**
 * Einstellungen der Node-Edition (Tabelle app_settings). E-Mail-Versand und öffentliche Adresse kommen aus
 * Umgebungsvariablen (SMTP_URL, MAIL_FROM, APP_URL) – Zugangsdaten werden nie im Browser angezeigt.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { appSettings } from "@/db/schema";
import type { AdminSettings, PublicSettings } from "@/lib/api/types";

export interface SiteSettings extends PublicSettings {
  mailFrom: string | null;
}

export const DEFAULT_SETTINGS: SiteSettings = {
  siteName: "Golf HCP Rechner",
  registrationOpen: true,
  emailVerificationRequired: true,
  imprintText: null,
  privacyText: null,
  contactEmail: null,
  mailFrom: null,
};

export async function getSettings(): Promise<SiteSettings> {
  const db = await getDb();
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, "site"));
  const stored = (row?.value ?? {}) as Partial<SiteSettings>;
  const out = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof SiteSettings)[]) {
    if (stored[key] !== undefined) (out as Record<string, unknown>)[key] = stored[key];
  }
  return out;
}

export async function saveSettings(next: SiteSettings): Promise<void> {
  const db = await getDb();
  await db
    .insert(appSettings)
    .values({ key: "site", value: next })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: next, updatedAt: new Date() } });
}

export function publicSettings(s: SiteSettings): PublicSettings {
  const { mailFrom: _mailFrom, ...rest } = s;
  void _mailFrom;
  return rest;
}

/** Öffentliche Adresse für Links in E-Mails (nie aus dem Host-Header der Anfrage). */
export function siteUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export function mailInfo(): AdminSettings["mail"] {
  const url = process.env.SMTP_URL;
  if (url) {
    try {
      const u = new URL(url);
      return { mode: "smtp", host: u.hostname, port: Number(u.port) || (u.protocol === "smtps:" ? 465 : 587), secure: u.protocol === "smtps:" ? "ssl" : "tls", user: decodeURIComponent(u.username), hasPassword: Boolean(u.password), editable: false };
    } catch {
      return { mode: "smtp", host: "", port: 587, secure: "tls", user: "", hasPassword: false, editable: false };
    }
  }
  const mode = process.env.MAIL_MODE === "outbox" ? "outbox" : process.env.MAIL_MODE === "off" ? "off" : "log";
  return { mode, host: "", port: 0, secure: "none", user: "", hasPassword: false, editable: false };
}
