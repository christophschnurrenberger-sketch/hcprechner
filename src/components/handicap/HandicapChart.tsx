"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import { formatDate, formatDecimal, formatHcp } from "@/lib/format";
import { parseIsoDate } from "@/lib/whs/dates";
import type { Round, ScoringRecordResult } from "@/lib/whs/types";
import { Checkbox, Segmented } from "@/components/ui";

interface Point {
  t: number;
  date: string;
  roundId: string;
  title: string;
  course: string;
  holes: number;
  gbe: number | null;
  cr: number | null;
  slope: number | null;
  sd: number | null;
  current: number;
  calculated: number | null;
  low: number | null;
}

const SERIES = [
  { key: "current", label: "Aktueller HCPI", color: "var(--series-current)" },
  { key: "calculated", label: "Kalkulierter HCPI", color: "var(--series-calculated)" },
  { key: "low", label: "Low HCPI", color: "var(--series-low)" },
] as const;

function ChartTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as Point;
  return (
    <div className="max-w-xs rounded-lg border border-border bg-surface p-3 text-xs shadow-lg">
      <p className="font-semibold text-ink">{formatDate(p.date)}</p>
      <p className="text-ink-2">{p.title}</p>
      <p className="mb-2 text-ink-3">
        {p.course} · {p.holes} Loch
      </p>
      <dl className="tabular grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5">
        {p.gbe !== null && (
          <>
            <dt className="text-ink-3">GBE</dt>
            <dd className="text-right text-ink">{p.gbe}</dd>
          </>
        )}
        {p.cr !== null && (
          <>
            <dt className="text-ink-3">CR / Slope</dt>
            <dd className="text-right text-ink">
              {formatDecimal(p.cr)} / {p.slope}
            </dd>
          </>
        )}
        <dt className="text-ink-3">Score Differential</dt>
        <dd className="text-right text-ink">{formatDecimal(p.sd)}</dd>
        <dt className="text-ink-3">HCPI nach Runde</dt>
        <dd className="text-right font-semibold text-ink">{formatHcp(p.current)}</dd>
        {p.calculated !== null && p.calculated !== p.current && (
          <>
            <dt className="text-ink-3">kalkuliert</dt>
            <dd className="text-right text-ink">{formatHcp(p.calculated)}</dd>
          </>
        )}
        {p.low !== null && (
          <>
            <dt className="text-ink-3">Low HCPI</dt>
            <dd className="text-right text-ink">{formatHcp(p.low)}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

/** Achsenmarken am Monatsanfang (bei langen Zeiträumen quartalsweise). */
function monthTicks(from: number, to: number): number[] {
  const start = new Date(from);
  const months = (new Date(to).getUTCFullYear() - start.getUTCFullYear()) * 12 + new Date(to).getUTCMonth() - start.getUTCMonth();
  const step = months > 36 ? 6 : months > 18 ? 3 : months > 8 ? 2 : 1;
  const ticks: number[] = [];
  const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  while (d.getTime() <= to) {
    if (d.getUTCMonth() % step === 0) ticks.push(d.getTime());
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return ticks;
}

export function HandicapChart({ result, rounds, height = 300 }: { result: ScoringRecordResult; rounds: Round[]; height?: number }) {
  const [showSd, setShowSd] = useState(true);
  const [view, setView] = useState<"chart" | "table">("chart");
  const byId = useMemo(() => new Map(rounds.map((r) => [r.id, r])), [rounds]);

  const points: Point[] = useMemo(
    () =>
      result.rounds
        .filter((r) => r.inRecord && r.revision)
        .map((r) => {
          const round = byId.get(r.roundId)!;
          const rev = r.revision!;
          return {
            t: parseIsoDate(r.date).getTime(),
            date: r.date,
            roundId: r.roundId,
            title: round.title,
            course: round.course.courseName,
            holes: round.holes,
            gbe: r.scoreDifferential?.adjustedGrossScore ?? null,
            cr: r.scoreDifferential?.courseRating ?? null,
            slope: r.scoreDifferential?.slopeRating ?? null,
            sd: r.scoreDifferential?.value ?? null,
            current: rev.currentHandicapIndex,
            calculated: rev.calculatedHandicapIndex,
            low: rev.lowHandicapIndex?.value ?? null,
          };
        }),
    [result, byId],
  );

  const hasCalc = points.some((p) => p.calculated !== null && p.calculated !== p.current);
  const hasLow = points.some((p) => p.low !== null);
  const visible = SERIES.filter((s) => s.key === "current" || (s.key === "calculated" && hasCalc) || (s.key === "low" && hasLow));

  if (points.length === 0) {
    return <p className="py-10 text-center text-sm text-ink-3">Der Verlauf erscheint, sobald handicap-relevante Runden erfasst sind.</p>;
  }

  const values = points.flatMap((p) => [p.current, p.calculated, p.low, showSd ? p.sd : null]).filter((v): v is number => v !== null);
  const min = Math.floor(Math.min(...values) - 1);
  const max = Math.ceil(Math.max(...values) + 1);
  const last = points[points.length - 1];
  const ticks = monthTicks(points[0].t, last.t);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="Legende">
          {visible.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} aria-hidden />
              {s.label}
            </li>
          ))}
          {showSd && (
            <li className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--series-sd)" }} aria-hidden />
              Score Differential
            </li>
          )}
        </ul>
        <div className="flex items-center gap-3">
          <Checkbox checked={showSd} onChange={setShowSd} label="Score Differentials" />
          <Segmented
            name="Darstellung"
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { value: "chart", label: "Diagramm" },
              { value: "table", label: "Tabelle" },
            ]}
          />
        </div>
      </div>
      {view === "chart" ? (
        <div style={{ height }} className="w-full" role="img" aria-label={`HCPI-Verlauf, aktuell ${formatHcp(last.current)}`}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={{ top: 8, right: 56, bottom: 0, left: -8 }}>
              <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                ticks={ticks.length >= 2 ? ticks : undefined}
                tickFormatter={(t: number) =>
                  ticks.length >= 2
                    ? new Date(t).toLocaleDateString("de-DE", { month: "short", year: "2-digit", timeZone: "UTC" })
                    : new Date(t).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", timeZone: "UTC" })
                }
                tick={{ fontSize: 11, fill: "var(--ink-3)" }}
                stroke="var(--chart-grid)"
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                domain={[min, max]}
                reversed={false}
                tick={{ fontSize: 11, fill: "var(--ink-3)" }}
                tickFormatter={(v: number) => formatDecimal(v, 0)}
                stroke="var(--chart-grid)"
                tickLine={false}
                axisLine={false}
                width={40}
                allowDecimals={false}
              />
              <Tooltip content={ChartTooltip} cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }} />
              {showSd && (
                <Scatter dataKey="sd" fill="var(--series-sd)" stroke="var(--chart-surface)" strokeWidth={2} shape="circle" isAnimationActive={false} legendType="none" />
              )}
              {hasLow && (
                <Line type="stepAfter" dataKey="low" stroke="var(--series-low)" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
              )}
              {hasCalc && (
                <Line type="stepAfter" dataKey="calculated" stroke="var(--series-calculated)" strokeWidth={2} dot={false} isAnimationActive={false} />
              )}
              <Line
                type="stepAfter"
                dataKey="current"
                stroke="var(--series-current)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5, stroke: "var(--chart-surface)", strokeWidth: 2 }}
                isAnimationActive={false}
                label={(props: { x?: number | string; y?: number | string; index?: number }) =>
                  props.index === points.length - 1 ? (
                    <text x={Number(props.x) + 8} y={Number(props.y) + 4} fontSize={12} fontWeight={600} fill="var(--ink)">
                      {formatHcp(last.current)}
                    </text>
                  ) : (
                    <g />
                  )
                }
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="max-h-80 overflow-auto rounded-lg border border-border">
          <table className="tabular w-full text-sm">
            <thead className="sticky top-0 bg-surface-2 text-left text-xs text-ink-3">
              <tr>
                <th className="px-3 py-2 font-medium">Datum</th>
                <th className="px-3 py-2 font-medium">Runde</th>
                <th className="px-3 py-2 text-right font-medium">SD</th>
                <th className="px-3 py-2 text-right font-medium">HCPI</th>
                <th className="px-3 py-2 text-right font-medium">kalk.</th>
                <th className="px-3 py-2 text-right font-medium">Low</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.roundId} className="border-t border-border">
                  <td className="px-3 py-1.5">{formatDate(p.date)}</td>
                  <td className="max-w-[12rem] truncate px-3 py-1.5">{p.title}</td>
                  <td className="px-3 py-1.5 text-right">{formatDecimal(p.sd)}</td>
                  <td className="px-3 py-1.5 text-right font-medium">{formatHcp(p.current)}</td>
                  <td className="px-3 py-1.5 text-right">{formatHcp(p.calculated)}</td>
                  <td className="px-3 py-1.5 text-right">{formatHcp(p.low)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
