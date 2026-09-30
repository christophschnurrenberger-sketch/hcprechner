"use client";

import Link from "next/link";
import { useState } from "react";
import { BarChart3 } from "lucide-react";
import { api } from "@/lib/api/client";
import type { PerformanceFilter, PerformancePeriod } from "@/lib/stats/types";
import { cn, formatDecimal } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { ButtonLink, Card, CardBody, CardHeader, EmptyState, Field, PageHeader, Segmented, Select } from "@/components/ui";
import { ErrorState, PageSkeleton } from "@/components/ui/feedback";
import { ScoreDistribution, StatDefinitions, SummaryTiles } from "@/components/stats/StatsUi";
import { AccuracyChart, HistoryTable, PuttingChart, ScoreChart } from "@/components/stats/PerformanceCharts";

const LAST = [
  { value: "5", label: "Letzte 5" },
  { value: "10", label: "10" },
  { value: "20", label: "20" },
  { value: "all", label: "Alle" },
] as const;

const PERIODS: { value: PerformancePeriod; label: string }[] = [
  { value: "ALL", label: "Gesamter Zeitraum" },
  { value: "DAYS_30", label: "Letzte 30 Tage" },
  { value: "DAYS_90", label: "Letzte 90 Tage" },
  { value: "YEAR", label: "Letzte 12 Monate" },
];

/** Golfstatistik: Kennzahlen, Verteilung und Verlauf – alle Werte berechnet das Backend. */
export function StatsPage() {
  const [last, setLast] = useState<(typeof LAST)[number]["value"]>("10");
  const [holes, setHoles] = useState<"all" | "9" | "18">("all");
  const [courseId, setCourseId] = useState("");
  const [teeColor, setTeeColor] = useState("");
  const [period, setPeriod] = useState<PerformancePeriod>("ALL");
  const filter: PerformanceFilter = {
    last: last === "all" ? null : Number(last),
    holes: holes === "all" ? null : (Number(holes) as 9 | 18),
    courseId: courseId || null,
    teeColor: teeColor || null,
    period,
  };
  const { data, error, loading, reload } = useApi(() => api.member.performance(filter), JSON.stringify(filter));

  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <PageSkeleton />;
  const s = data.summary;
  const noStatsAtAll = data.options.courses.length === 0 && data.options.tees.length === 0 && s.roundsWithStats === 0 && data.filter.courseId === null && data.filter.teeColor === null && data.filter.holes === null && data.filter.period === "ALL";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Statistik"
        description="Deine Spielleistung aus Runden mit Lochstatistik. Statistiken verändern dein Handicap nicht."
        actions={
          <Link href="/member/tools" className="text-sm font-medium text-brand hover:underline">
            Handicap-Auswertung
          </Link>
        }
      />

      {noStatsAtAll ? (
        <EmptyState
          icon={<BarChart3 className="h-8 w-8" />}
          title="Noch keine Lochstatistik"
          action={
            <ButtonLink href="/member/rounds/new" size="lg">
              Runde detailliert erfassen
            </ButtonLink>
          }
        >
          Wähle beim Erfassen einer Runde „Runde detailliert tracken“ oder ergänze Putts, Grüns und Fairways später in der Rundenansicht.
          {data.roundsWithoutStats > 0 && ` Du hast ${data.roundsWithoutStats} ${data.roundsWithoutStats === 1 ? "Runde" : "Runden"} ohne Lochstatistik.`}
        </EmptyState>
      ) : (
        <>
          <Card>
            <CardBody className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <Segmented name="Anzahl Runden" size="sm" value={last} onChange={setLast} options={LAST.map((o) => ({ value: o.value, label: o.label }))} />
                <Segmented
                  name="Löcher"
                  size="sm"
                  value={holes}
                  onChange={setHoles}
                  options={[
                    { value: "all", label: "9 & 18" },
                    { value: "18", label: "18 Loch" },
                    { value: "9", label: "9 Loch" },
                  ]}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Platz" htmlFor="f-course">
                  <Select id="f-course" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                    <option value="">Alle Plätze</option>
                    {data.options.courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.rounds})
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Zeitraum" htmlFor="f-period">
                  <Select id="f-period" value={period} onChange={(e) => setPeriod(e.target.value as PerformancePeriod)}>
                    {PERIODS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Abschlag" htmlFor="f-tee">
                  <Select id="f-tee" value={teeColor} onChange={(e) => setTeeColor(e.target.value)}>
                    <option value="">Alle Abschläge</option>
                    {data.options.tees.map((t) => (
                      <option key={t.teeColor} value={t.teeColor}>
                        {t.teeColor} ({t.rounds})
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </CardBody>
          </Card>

          <div className={cn("space-y-5", loading && "opacity-70")}>
            {s.roundsWithStats === 0 ? (
              <EmptyState title="Keine Runden für diese Auswahl">Ändere die Filter, um Statistiken zu sehen.</EmptyState>
            ) : (
              <>
                <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm text-ink-2">
                  <span>
                    <strong className="tabular text-ink">{s.roundsWithStats}</strong> {s.roundsWithStats === 1 ? "Runde" : "Runden"} · <strong className="tabular text-ink">{s.holesScored}</strong> Löcher
                  </span>
                  {s.averageScore18 !== null && (
                    <span>
                      Ø 18 Loch <strong className="tabular text-ink">{formatDecimal(s.averageScore18)}</strong> Schläge
                    </span>
                  )}
                  {s.averageScore9 !== null && (
                    <span>
                      Ø 9 Loch <strong className="tabular text-ink">{formatDecimal(s.averageScore9)}</strong> Schläge
                    </span>
                  )}
                </div>
                <SummaryTiles summary={s} />
                <div className="grid gap-5 lg:grid-cols-2">
                  <Card>
                    <CardHeader title="Schläge je Runde" />
                    <CardBody>
                      <ScoreChart history={data.history} />
                    </CardBody>
                  </Card>
                  <Card>
                    <CardHeader title="Grüns und Fairways" subtitle="Quote je Runde" />
                    <CardBody>
                      <AccuracyChart history={data.history} />
                    </CardBody>
                  </Card>
                  <Card>
                    <CardHeader title="Putts pro Loch" />
                    <CardBody>
                      <PuttingChart history={data.history} />
                    </CardBody>
                  </Card>
                  <Card>
                    <CardHeader title="Ergebnisse je Loch" subtitle="im Verhältnis zu Par" />
                    <CardBody>
                      <ScoreDistribution distribution={s.distribution} />
                    </CardBody>
                  </Card>
                </div>
                <HistoryTable history={data.history} />
              </>
            )}
            {data.roundsWithoutStats > 0 && (
              <p className="text-sm text-ink-3">
                {data.roundsWithoutStats} {data.roundsWithoutStats === 1 ? "Runde hat" : "Runden haben"} keine Lochstatistik und {data.roundsWithoutStats === 1 ? "fließt" : "fließen"} hier nicht ein.{" "}
                <Link href="/member/rounds" className="font-medium text-brand hover:underline">
                  Statistik ergänzen
                </Link>
              </p>
            )}
            <StatDefinitions />
          </div>
        </>
      )}
    </div>
  );
}
