import { loadAllCourses } from "@/server/courseRepository";
import { coursePath } from "@/lib/courses/paths";
import { BAVARIAN_REGIONS } from "@/lib/courses/regions";

export const dynamic = "force-dynamic";

function base(): string {
  return (process.env.PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Sitemap (Node-Edition; die Webspace-Edition liefert sitemap.php). */
export async function GET() {
  const root = base();
  const entries: { url: string; lastModified?: string | null }[] = [
    ...["", "/golfplaetze", "/methodik", "/gbe-rechner", "/simulator"].map((p) => ({ url: `${root}${p}` })),
    ...BAVARIAN_REGIONS.map((r) => ({ url: `${root}/golfplaetze/${r.slug}` })),
  ];
  try {
    const courses = await loadAllCourses();
    for (const c of courses) {
      if (c.facilityType !== "DRIVING_RANGE") entries.push({ url: `${root}${coursePath(c)}`, lastModified: c.lastVerifiedAt });
    }
  } catch {
    // Datenbank nicht erreichbar: nur statische Seiten
  }
  const body = entries
    .map((e) => `  <url><loc>${escapeXml(e.url)}</loc>${e.lastModified ? `<lastmod>${e.lastModified}</lastmod>` : ""}</url>`)
    .join("\n");
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`, {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
}
