"use client";

import Link from "next/link";
import { useState } from "react";
import { adminCoursePath } from "@/lib/courses/paths";
import type { QualityIssueCode, QualityReport } from "@/lib/courses/quality";
import { Badge, Card, CardBody, CardHeader, PageHeader, Stat } from "@/components/ui";

const LABELS: Record<QualityIssueCode, string> = {
  NO_LAYOUT: "Keine Plätze angelegt",
  NO_RATING: "Keine Rating-Sets",
  NO_VERIFIED_RATING: "Kein verifiziertes Rating",
  NO_18_HOLE_RATING: "18-Loch-Rating fehlt",
  NO_9_HOLE_RATING: "9-Loch-Rating fehlt",
  MISSING_COURSE_RATING: "Course Rating fehlt",
  MISSING_SLOPE: "Slope fehlt",
  MISSING_PAR: "Par fehlt",
  MISSING_SOURCE: "Quelle fehlt",
  MISSING_CHECK_DATE: "Prüfdatum fehlt",
  STALE_CHECK: "Prüfung älter als 2 Jahre",
  CONTRADICTORY_VALUES: "Widersprüchliche Werte",
  MISSING_TEE: "Abschlag fehlt",
  MISSING_HOLES: "Lochdaten fehlen",
  DRIVING_RANGE_WITH_LAYOUT: "Driving Range mit Platz",
  NINE_SIDE_MISSING: "9-Loch-Rating ohne Front/Back",
  POSSIBLE_DUPLICATE: "Mögliches Duplikat",
};

export function QualityView({ report }: { report: QualityReport }) {
  const [code, setCode] = useState<string>("");
  const counts = new Map<string, number>();
  for (const i of report.issues) counts.set(i.code, (counts.get(i.code) ?? 0) + 1);
  const issues = code ? report.issues.filter((i) => i.code === code) : report.issues;

  return (
    <>
      <PageHeader title="Datenqualität" description="Prüft Course Rating, Slope, Par, 9-/18-Loch-Ratings, Quellen, Prüfdaten, Widersprüche, Duplikate, Abschläge und Geschlecht." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Bayern Golfanlagen" value={report.golfFacilities} />
        <Stat label="Verifizierte Anlagen" value={report.verifiedFacilities} />
        <Stat label="Nicht verifizierte Anlagen" value={report.unverifiedFacilities} />
        <Stat label="Anlagen mit 18-Loch-Rating" value={report.facilitiesWith18HoleRating} />
        <Stat label="Anlagen mit 9-Loch-Rating" value={report.facilitiesWith9HoleRating} />
        <Stat label="Anlagen mit mehreren Tee-Ratings" value={report.facilitiesWithMultipleTees} />
        <Stat label="Fehlende CR / Slope / Par" value={`${report.missingCourseRating} / ${report.missingSlope} / ${report.missingPar}`} />
        <Stat label="Doppelte Anlagen (Verdacht)" value={report.duplicates.length} />
      </div>
      <Card className="mt-5">
        <CardHeader title="Befunde" subtitle={`${issues.length} von ${report.issues.length}`} />
        <CardBody className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setCode("")} className="text-xs">
              <Badge tone={code ? "neutral" : "brand"}>alle ({report.issues.length})</Badge>
            </button>
            {[...counts.entries()].map(([c, n]) => (
              <button type="button" key={c} onClick={() => setCode(c)} className="text-xs">
                <Badge tone={code === c ? "brand" : "neutral"}>
                  {LABELS[c as QualityIssueCode]} ({n})
                </Badge>
              </button>
            ))}
          </div>
          <div className="max-h-[36rem] overflow-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-2 text-left text-xs text-ink-3">
                <tr>
                  <th className="px-3 py-2 font-medium">Schwere</th>
                  <th className="px-3 py-2 font-medium">Befund</th>
                  <th className="px-3 py-2 font-medium">Anlage</th>
                  <th className="px-3 py-2 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((i, idx) => (
                  <tr key={idx} className="border-t border-border">
                    <td className="px-3 py-1.5">
                      <Badge tone={i.severity === "error" ? "critical" : i.severity === "warning" ? "warning" : "neutral"}>{i.severity}</Badge>
                    </td>
                    <td className="px-3 py-1.5">{LABELS[i.code]}</td>
                    <td className="px-3 py-1.5">
                      <Link href={adminCoursePath(i.courseId)} className="text-brand hover:underline">
                        {i.courseName}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5 text-xs text-ink-3">{i.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {issues.length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-3">Keine Befunde.</p>}
          </div>
        </CardBody>
      </Card>
    </>
  );
}
