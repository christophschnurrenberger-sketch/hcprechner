"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";
import { calculateStatistics } from "@/lib/whs/statistics";
import { formatDate, formatDecimal, formatHcp } from "@/lib/format";
import { useHcp } from "@/components/providers/HcpStoreProvider";
import { ButtonLink, Card, CardBody, CardHeader, EmptyState, PageHeader, Select, Stat } from "@/components/ui";
import { useRoundLookup } from "@/components/handicap/useRoundLookup";
import { LoadingState } from "@/components/dashboard/DashboardView";
import { roundPath } from "@/lib/courses/paths";

export function StatisticsView() {
  const { ready, rounds, result } = useHcp();
  const { roundsById } = useRoundLookup();
  const stats = useMemo(() => calculateStatistics(result, rounds), [result, rounds]);
  const [courseKey, setCourseKey] = useState<string>("");
  if (!ready) return <LoadingState />;
  if (stats.relevantRounds === 0) {
    return (
      <>
        <PageHeader title="Statistiken" />
        <EmptyState icon={<BarChart3 className="h-8 w-8" />} title="Noch keine Daten" action={<ButtonLink href="/runde-erfassen">Runde erfassen</ButtonLink>}>
          Statistiken erscheinen, sobald handicap-relevante Runden erfasst sind.
        </EmptyState>
      </>
    );
  }
  const selected = stats.courses.find((c) => c.key === courseKey) ?? stats.courses[0] ?? null;
  const ratingGroups = new Map<string, { cr: number; slope: number; holes: number; count: number; sum: number }>();
  for (const r of stats.ratingDistribution) {
    const key = `${r.holes}|${r.courseRating}|${r.slopeRating}`;
    const g = ratingGroups.get(key) ?? { cr: r.courseRating, slope: r.slopeRating, holes: r.holes, count: 0, sum: 0 };
    g.count += 1;
    g.sum += r.scoreDifferential;
    ratingGroups.set(key, g);
  }

  return (
    <>
      <PageHeader title="Statistiken" description="Kennzahlen aus allen handicap-relevanten Ergebnissen. Die Berechnung stammt aus derselben Engine wie der Scoring Record." />
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="SD-Durchschnitt" value={formatDecimal(stats.differentials.average)} sub={`${stats.differentials.count} Ergebnisse`} />
          <Stat label="SD-Median" value={formatDecimal(stats.differentials.median)} />
          <Stat label={`Beste ${result.status.usedCount ?? 8} (Durchschnitt)`} value={formatDecimal(stats.countedAverage, 2)} />
          <Stat label="Letzte 20 (Durchschnitt)" value={formatDecimal(stats.last20.average)} />
          <Stat label="GBE-Durchschnitt 18 Loch" value={formatDecimal(stats.gross18.average)} sub={`${stats.gross18.count} Runden`} />
          <Stat label="GBE-Durchschnitt 9 Loch" value={formatDecimal(stats.gross9.average)} sub={`${stats.gross9.count} Runden`} />
          <Stat label="Durchschnitt 18 Loch (SD)" value={formatDecimal(stats.eighteenHoleDifferentials.average)} />
          <Stat label="Durchschnitt 9 Loch (SD)" value={formatDecimal(stats.nineHoleDifferentials.average)} sub="18-Loch-Differential aus 9 Löchern" />
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader title="Beste Runden" subtitle="Nach Score Differential (original)" />
            <CardBody className="p-0 sm:p-0">
              <ol className="divide-y divide-border">
                {stats.bestRounds.map((r, i) => {
                  const round = roundsById.get(r.roundId)!;
                  return (
                    <li key={r.roundId}>
                      <Link href={roundPath(r.roundId)} className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-surface-2">
                        <span className="tabular w-5 text-xs text-ink-3">{i + 1}.</span>
                        <span className="tabular w-12 font-semibold">{formatDecimal(r.scoreDifferential?.value)}</span>
                        <span className="min-w-0 flex-1 truncate">
                          {round.title}
                          <span className="text-ink-3"> · {round.course.courseName}</span>
                        </span>
                        <span className="text-xs text-ink-3">{formatDate(r.date)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="CR-/Slope-Verteilung" subtitle="Gespielte Ratings und Ihr durchschnittliches Score Differential" />
            <CardBody>
              {ratingGroups.size === 0 ? (
                <p className="text-sm text-ink-3">Nur übernommene Differentials ohne Ratingangaben.</p>
              ) : (
                <table className="tabular w-full text-sm">
                  <thead className="text-left text-xs text-ink-3">
                    <tr>
                      <th className="py-1.5 font-medium">Löcher</th>
                      <th className="py-1.5 text-right font-medium">CR</th>
                      <th className="py-1.5 text-right font-medium">Slope</th>
                      <th className="py-1.5 text-right font-medium">Runden</th>
                      <th className="py-1.5 text-right font-medium">Ø SD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...ratingGroups.values()]
                      .sort((a, b) => b.count - a.count)
                      .map((g) => (
                        <tr key={`${g.holes}-${g.cr}-${g.slope}`} className="border-t border-border">
                          <td className="py-1.5">{g.holes}</td>
                          <td className="py-1.5 text-right">{formatDecimal(g.cr)}</td>
                          <td className="py-1.5 text-right">{g.slope}</td>
                          <td className="py-1.5 text-right">{g.count}</td>
                          <td className="py-1.5 text-right">{formatDecimal(g.sum / g.count)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader title="GBE und HCPI nach Golfplatz" />
          <CardBody className="overflow-x-auto">
            <table className="tabular w-full whitespace-nowrap text-sm">
              <thead className="text-left text-xs text-ink-3">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">Golfplatz</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Runden</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Ø SD</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Bestes SD</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Ø GBE 18</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Ø GBE 9</th>
                  <th className="py-1.5 text-right font-medium">HCPI nach letzter Runde</th>
                </tr>
              </thead>
              <tbody>
                {stats.courses.map((c) => (
                  <tr key={c.key} className="border-t border-border">
                    <td className="py-1.5 pr-3">
                      <button type="button" className="text-left font-medium text-ink hover:text-brand hover:underline" onClick={() => setCourseKey(c.key)}>
                        {c.courseName}
                      </button>
                    </td>
                    <td className="py-1.5 pr-3 text-right">{c.rounds}</td>
                    <td className="py-1.5 pr-3 text-right">{formatDecimal(c.differentials.average)}</td>
                    <td className="py-1.5 pr-3 text-right">{formatDecimal(c.differentials.best)}</td>
                    <td className="py-1.5 pr-3 text-right">{formatDecimal(c.gross18.average)}</td>
                    <td className="py-1.5 pr-3 text-right">{formatDecimal(c.gross9.average)}</td>
                    <td className="py-1.5 text-right">{formatHcp(c.handicapTrend[c.handicapTrend.length - 1]?.handicapIndexAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {stats.courses.length === 0 && <p className="py-3 text-sm text-ink-3">Keine Runden mit Platzangabe.</p>}
          </CardBody>
        </Card>

        {selected && (
          <Card>
            <CardHeader
              title="Wie spiele ich diesen Platz?"
              action={
                <Select className="h-8 w-auto py-0 text-xs" value={selected.key} onChange={(e) => setCourseKey(e.target.value)} aria-label="Golfplatz">
                  {stats.courses.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.courseName}
                    </option>
                  ))}
                </Select>
              }
            />
            <CardBody className="space-y-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <Stat label="Gespielte Runden" value={selected.rounds} />
                <Stat label="Beste Runde (SD)" value={formatDecimal(selected.differentials.best)} />
                <Stat label="Schlechteste Runde (SD)" value={formatDecimal(selected.differentials.worst)} />
                <Stat label="Ø Score Differential" value={formatDecimal(selected.differentials.average)} />
                <Stat label="Ø GBE (18 Loch)" value={formatDecimal(selected.gross18.average)} sub={selected.gross9.count ? `9 Loch: ${formatDecimal(selected.gross9.average)}` : undefined} />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="mb-2 text-sm font-semibold">Beste Runde je Abschlag</p>
                  <ul className="space-y-1 text-sm">
                    {selected.bestByTee.map((t) => (
                      <li key={t.tee} className="flex justify-between gap-3">
                        <span className="text-ink-2">{t.tee || "–"}</span>
                        <Link className="tabular font-semibold hover:underline" href={roundPath(t.roundId)}>
                          SD {formatDecimal(t.scoreDifferential)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-2 text-sm font-semibold">HCP-Verlauf auf diesem Platz</p>
                  <ul className="space-y-1 text-sm">
                    {selected.handicapTrend.map((t) => (
                      <li key={t.roundId} className="tabular flex justify-between gap-3">
                        <span className="text-ink-3">{formatDate(t.date)}</span>
                        <span>SD {formatDecimal(t.scoreDifferential)}</span>
                        <span className="font-medium">HCPI {formatHcp(t.handicapIndexAfter)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
