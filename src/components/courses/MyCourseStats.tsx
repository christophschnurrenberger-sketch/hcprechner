"use client";

import Link from "next/link";
import { useMemo } from "react";
import { calculateStatistics } from "@/lib/whs/statistics";
import { formatDate, formatDecimal, formatHcp } from "@/lib/format";
import { useHcp } from "@/components/providers/HcpStoreProvider";
import { ButtonLink, Card, CardBody, CardHeader, Stat } from "@/components/ui";
import { roundPath } from "@/lib/courses/paths";

/** „Wie spiele ich diesen Platz?“ – aus den lokal gespeicherten Runden. */
export function MyCourseStats({ courseId, courseName }: { courseId: string; courseName: string }) {
  const { ready, rounds, result } = useHcp();
  const stats = useMemo(() => calculateStatistics(result, rounds), [result, rounds]);
  if (!ready) return null;
  const course = stats.courses.find((c) => c.courseId === courseId);
  return (
    <Card>
      <CardHeader title="Wie spiele ich diesen Platz?" subtitle="Aus Ihren lokal gespeicherten Runden" />
      <CardBody>
        {!course ? (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-3">
            Sie haben auf {courseName} noch keine handicap-relevante Runde erfasst.
            <ButtonLink href="/runde-erfassen" size="sm" variant="subtle">
              Runde erfassen
            </ButtonLink>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Runden" value={course.rounds} />
              <Stat label="Beste Runde (SD)" value={formatDecimal(course.differentials.best)} />
              <Stat label="Ø Score Differential" value={formatDecimal(course.differentials.average)} />
              <Stat label="Ø GBE" value={formatDecimal(course.gross18.average ?? course.gross9.average)} />
            </div>
            <ul className="space-y-1 text-sm">
              {course.handicapTrend.map((t) => (
                <li key={t.roundId} className="tabular flex justify-between gap-3">
                  <Link href={roundPath(t.roundId)} className="hover:underline">
                    {formatDate(t.date)}
                  </Link>
                  <span>SD {formatDecimal(t.scoreDifferential)}</span>
                  <span>HCPI danach {formatHcp(t.handicapIndexAfter)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
