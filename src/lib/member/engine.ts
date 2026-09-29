/** Kennung der Rechenengine (Regelwerk + Version) für Ergebnisse, Admin-Anzeige und Audit. */
import { defaultRuleSet } from "@/rules/whs/registry";

export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "2.0.0";
export const BUILD_INFO = process.env.NEXT_PUBLIC_BUILD_INFO ?? null;

export function engineLabel(): string {
  return `${defaultRuleSet.label} · Engine ${APP_VERSION}`;
}
