import { NextResponse, type NextRequest } from "next/server";
import { runCourseSearch } from "@/lib/courses/summary";
import { loadAllCourses } from "@/server/courseRepository";

export const dynamic = "force-dynamic";

/** Golfplatzsuche: Name, Ort, PLZ, Region, Entfernung, 9/18 Loch, Abschlagsfarbe. */
export async function GET(request: NextRequest) {
  try {
    const courses = await loadAllCourses();
    return NextResponse.json(runCourseSearch(courses, request.nextUrl.searchParams));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Golfplatzdatenbank nicht erreichbar" }, { status: 503 });
  }
}
