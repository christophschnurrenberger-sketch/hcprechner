import type { MetadataRoute } from "next";

// Statischer Export (Webspace): Datei wird beim Build erzeugt; install.php setzt den Basispfad ein.
export const dynamic = "force-static";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Installierbar als App (PWA): startet direkt im Mitgliederbereich, eigenständiges Fenster ohne Browserleiste. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Golf HCP Rechner – WHS 2026",
    short_name: "HCP Rechner",
    description: "Runden erfassen und Handicap Index nach WHS 2026 berechnen.",
    lang: "de",
    start_url: `${BASE}/member/`,
    scope: `${BASE}/`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f7f4",
    theme_color: "#174d34",
    icons: [
      { src: `${BASE}/icons/icon-192.png`, sizes: "192x192", type: "image/png" },
      { src: `${BASE}/icons/icon-512.png`, sizes: "512x512", type: "image/png" },
      { src: `${BASE}/icons/icon-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [{ name: "Runde starten", url: `${BASE}/member/rounds/new/`, icons: [{ src: `${BASE}/icons/icon-192.png`, sizes: "192x192" }] }],
  };
}
