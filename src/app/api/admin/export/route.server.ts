import { NextResponse, type NextRequest } from "next/server";
import { coursesToCsv } from "@/lib/courses/csv";
import { buildQualityReport } from "@/lib/courses/quality";
import { isAdmin } from "@/server/adminAuth";
import { loadAllCourses } from "@/server/courseRepository";

export const dynamic = "force-dynamic";

/** Export der Golfplatzdatenbank (CSV im Importschema, JSON vollständig, Qualitätsbericht). */
export async function GET(request: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Nicht berechtigt" }, { status: 401 });
  const format = request.nextUrl.searchParams.get("format") ?? "json";
  const courses = await loadAllCourses({ includeInactive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "csv") {
    return new NextResponse("﻿" + coursesToCsv(courses), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="golfplaetze-${stamp}.csv"`,
      },
    });
  }
  if (format === "quality") {
    return NextResponse.json(buildQualityReport(courses, stamp), {
      headers: { "content-disposition": `attachment; filename="datenqualitaet-${stamp}.json"` },
    });
  }
  return new NextResponse(JSON.stringify({ exportedAt: new Date().toISOString(), courses }, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="golfplaetze-${stamp}.json"`,
    },
  });
}
