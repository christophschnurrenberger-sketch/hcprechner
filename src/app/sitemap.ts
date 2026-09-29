import type { MetadataRoute } from "next";
import { loadAllCourses } from "@/server/courseRepository";
import { coursePath } from "@/lib/courses/paths";
import { BAVARIAN_REGIONS } from "@/lib/courses/regions";

export const dynamic = "force-dynamic";

function base(): string {
  return (process.env.PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const root = base();
  const staticPages = ["", "/golfplaetze", "/methodik", "/gbe-rechner", "/simulator"].map((p) => ({ url: `${root}${p}` }));
  const regions = BAVARIAN_REGIONS.map((r) => ({ url: `${root}/golfplaetze/${r.slug}` }));
  try {
    const courses = await loadAllCourses();
    return [
      ...staticPages,
      ...regions,
      ...courses
        .filter((c) => c.facilityType !== "DRIVING_RANGE")
        .map((c) => ({ url: `${root}${coursePath(c)}`, lastModified: c.lastVerifiedAt ?? undefined })),
    ];
  } catch {
    return [...staticPages, ...regions];
  }
}
