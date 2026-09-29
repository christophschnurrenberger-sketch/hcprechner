/** Nur interne Ziele nach der Anmeldung zulassen (Schutz vor offenen Weiterleitungen). */
export function safeNext(next: string | null | undefined, fallback = "/member"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  return /^\/(member|admin)(\/|\?|$)/.test(next) ? next : fallback;
}
