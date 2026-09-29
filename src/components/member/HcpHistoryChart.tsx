"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { HistoryPointDto } from "@/lib/api/types";
import { formatDate, formatDateShort, formatHcp } from "@/lib/format";

/** Verlauf des Handicap Index (Werte vom Backend, keine Berechnung im Browser). */
export function HcpHistoryChart({ history, height = 220 }: { history: HistoryPointDto[]; height?: number }) {
  if (history.length < 2) {
    return <p className="rounded-xl bg-surface-2 px-4 py-8 text-center text-sm text-ink-3">Der Verlauf erscheint, sobald du Runden erfasst hast.</p>;
  }
  const data = history.map((p, i) => ({ i, date: p.date, value: p.value, course: p.courseName, sd: p.scoreDifferential }));
  const values = data.map((d) => d.value);
  const min = Math.floor(Math.min(...values) - 1);
  const max = Math.ceil(Math.max(...values) + 1);
  return (
    <figure>
      <div style={{ height }} role="img" aria-label={`Handicap-Verlauf von ${formatHcp(values[0])} auf ${formatHcp(values.at(-1))}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            <XAxis dataKey="i" tickFormatter={(i: number) => formatDateShort(data[i]?.date)} tick={{ fontSize: 11, fill: "var(--ink-3)" }} axisLine={false} tickLine={false} minTickGap={24} />
            <YAxis domain={[min, max]} reversed tick={{ fontSize: 11, fill: "var(--ink-3)" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatHcp(v)} width={40} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
              labelFormatter={(i) => formatDate(data[Number(i)]?.date)}
              formatter={(v) => [formatHcp(Number(v)), "HCPI"]}
            />
            <Line type="stepAfter" dataKey="value" stroke="var(--series-current)" strokeWidth={2.5} dot={{ r: 2.5 }} activeDot={{ r: 5 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">Niedrigere Werte stehen oben (besseres Handicap).</figcaption>
    </figure>
  );
}
