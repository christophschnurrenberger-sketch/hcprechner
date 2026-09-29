/**
 * Build-Variante der Anwendung.
 *
 * - "node":     Next.js-Server (PostgreSQL/PGlite, Server Actions, SEO-Seiten)
 * - "webspace": statische Dateien für klassischen PHP-Webspace (FTP-Upload + install.php);
 *               Golfplatzdaten, Admin und Synchronisation über kleine PHP-Skripte in /api
 *
 * Die Werte werden beim Build eingesetzt (NEXT_PUBLIC_*).
 */
export const BUILD_TARGET: "node" | "webspace" =
  process.env.NEXT_PUBLIC_BUILD_TARGET === "webspace" ? "webspace" : "node";

export const IS_WEBSPACE = BUILD_TARGET === "webspace";

/**
 * Basispfad der Anwendung. In der Webspace-Edition ein Platzhalter, den install.php
 * durch den tatsächlichen Ordner ersetzt ("" für die Domain-Wurzel, "/hcp" für einen Unterordner).
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Pfad für direkte Datei-/API-Zugriffe (next/link und router fügen den Basispfad selbst hinzu). */
export function withBasePath(path: string): string {
  return `${BASE_PATH}${path}`;
}

/** URL eines PHP-Endpunkts der Webspace-Edition. */
export function phpApi(script: string, query: Record<string, string> = {}): string {
  const qs = new URLSearchParams(query).toString();
  return withBasePath(`/api/${script}.php${qs ? `?${qs}` : ""}`);
}
