export const dynamic = "force-dynamic";

/** robots.txt (Node-Edition; in der Webspace-Edition schreibt install.php die Datei). */
export function GET() {
  const root = (process.env.APP_URL ?? process.env.PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return new Response(`User-Agent: *\nAllow: /\nDisallow: /member\nDisallow: /admin\nDisallow: /api\n\nSitemap: ${root}/sitemap.xml\n`, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
