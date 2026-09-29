import { NextResponse, type NextRequest } from "next/server";
import { searchCourses } from "@/lib/courses/search";
import { loadAllCourses } from "@/server/courseRepository";

export const dynamic = "force-dynamic";

/** Golfplatzsuche: Name, Ort, PLZ, Region, Entfernung, 9/18 Loch, Abschlagsfarbe. */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const lat = p.get("lat");
  const lon = p.get("lon");
  try {
    const courses = await loadAllCourses();
    const results = searchCourses(courses, {
      text: p.get("q") ?? undefined,
      region: p.get("region") || null,
      postalCode: p.get("plz") || null,
      has9: p.get("has9") === "1",
      has18: p.get("has18") === "1",
      teeColor: p.get("tee") || null,
      near: lat && lon ? { latitude: Number(lat), longitude: Number(lon) } : null,
      maxDistanceKm: p.get("maxKm") ? Number(p.get("maxKm")) : null,
      onlyWithVerifiedRatings: p.get("verified") === "1",
    });
    const limit = Math.min(Number(p.get("limit") ?? 50), 500);
    return NextResponse.json({
      total: results.length,
      totalCourses: courses.length,
      results: results.slice(0, limit).map((r) => ({
        id: r.course.id,
        slug: r.course.slug,
        name: r.course.name,
        officialName: r.course.officialName,
        city: r.course.city,
        postalCode: r.course.postalCode,
        region: r.course.region,
        facilityType: r.course.facilityType,
        verified: r.course.verified,
        has9: r.has9,
        has18: r.has18,
        teeColors: r.teeColors,
        verifiedRatingCount: r.verifiedRatingCount,
        distanceKm: r.distanceKm,
        layouts: r.course.layouts
          .filter((l) => l.active)
          .map((l) => ({
            id: l.id,
            name: l.name,
            type: l.type,
            holesCount: l.holesCount,
            ratings: l.ratingSets
              .filter((s) => s.active)
              .map((s) => ({
                gender: s.gender,
                teeColor: s.teeColor,
                holes: s.holes,
                nine: s.nine,
                par: s.par,
                courseRating: s.courseRating,
                slopeRating: s.slopeRating,
                verified: s.verified,
                validFrom: s.validFrom,
                validTo: s.validTo,
              })),
          })),
      })),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Golfplatzdatenbank nicht erreichbar" }, { status: 503 });
  }
}
