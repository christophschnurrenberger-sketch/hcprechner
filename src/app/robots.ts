import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const root = (process.env.PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api"] }],
    sitemap: `${root}/sitemap.xml`,
  };
}
