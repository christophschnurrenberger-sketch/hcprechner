"use client";

import { useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PerformancePoint } from "@/lib/stats/types";
import { formatDate, formatDateShort, formatDecimal } from "@/lib/format";
import { Segmented } from "@/components/ui";

const axisTick = { fontSize: 11, fill: "var(--ink-3)" };
const tooltipStyle = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 };

type Row = PerformancePoint & { i: number };

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl bg-surface-2 px-4 py-8 text-center text-sm text-ink-3">{text}</p>;
}

/** Schlagzahl je Runde – 9- und 18-Loch-Runden getrennt (verschiedene Größenordnung, nie eine gemeinsame Linie). */
export function ScoreChart({ history, height = 200 }: { history: PerformancePoint[]; height?: number }) {
  const n18 = history.filter((p) => p.holes === 18 && p.grossScore !== null).length;
  const n9 = history.filter((p) => p.holes === 9 && p.grossScore !== null).length;
  const [holes, setHoles] = useState<9 | 18>(n18 >= n9 ? 18 : 9);
  const shown = n18 === 0 ? 9 : n9 === 0 ? 18 : holes;
  const data: Row[] = history.filter((p) => p.holes === shown && p.grossScore !== null).map((p, i) => ({ ...p, i }));
  return (
    <div className="space-y-2">
      {n18 > 0 && n9 > 0 && <Segmented name="Löcher" size="sm" value={shown} onChange={setHoles} options={[{ value: 18, label: `18 Loch (${n18})` }, { value: 9, label: `9 Loch (${n9})` }]} />}
      {data.length < 2 ? (
        <Empty text="Der Verlauf erscheint ab zwei Runden mit vollständiger Schlagzahl." />
      ) : (
        <div style={{ height }} role="img" aria-label={`Schläge je ${shown}-Loch-Runde, von ${data[0].grossScore} auf ${data.at(-1)!.grossScore}`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="i" tickFormatter={(i: number) => formatDateShort(data[i]?.date)} tick={axisTick} axisLine={false} tickLine={false} minTickGap={24} />
              <YAxis domain={["dataMin - 2", "dataMax + 2"]} tick={axisTick} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(i) => `${formatDate(data[Number(i)]?.date)} · ${data[Number(i)]?.courseName ?? ""}`} formatter={(v) => [String(v), "Schläge"]} />
              <Line type="monotone" dataKey="grossScore" stroke="var(--series-current)" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "var(--chart-surface)" }} activeDot={{ r: 6 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

/** GIR- und Fairway-Quote je Runde (gleiche Einheit %, eine Achse; zweite Linie gestrichelt). */
export function AccuracyChart({ history, height = 220 }: { history: PerformancePoint[]; height?: number }) {
  const data: Row[] = history.map((p, i) => ({ ...p, i }));
  const has = data.filter((p) => p.girPercentage !== null || p.firPercentage !== null).length;
  if (has < 2) return <Empty text="Der Verlauf erscheint ab zwei Runden mit GIR- oder Fairway-Angaben." />;
  return (
    <div style={{ height }} role="img" aria-label="Verlauf der GIR- und Fairway-Quote je Runde">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="i" tickFormatter={(i: number) => formatDateShort(data[i]?.date)} tick={axisTick} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={axisTick} axisLine={false} tickLine={false} width={40} tickFormatter={(v: number) => `${v} %`} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(i) => `${formatDate(data[Number(i)]?.date)} · ${data[Number(i)]?.courseName ?? ""}`} formatter={(v, name) => [v === null || v === undefined ? "–" : `${formatDecimal(Number(v), 0)} %`, name]} />
          <Legend verticalAlign="top" height={28} iconType="plainline" wrapperStyle={{ fontSize: 12, color: "var(--ink-2)" }} />
          <Line name="GIR" type="monotone" dataKey="girPercentage" stroke="var(--series-current)" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "var(--chart-surface)" }} activeDot={{ r: 6 }} connectNulls isAnimationActive={false} />
          <Line name="Fairways" type="monotone" dataKey="firPercentage" stroke="var(--series-low)" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 4, strokeWidth: 2, stroke: "var(--chart-surface)" }} activeDot={{ r: 6 }} connectNulls isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Putts pro Loch je Runde (vergleichbar zwischen 9 und 18 Loch). */
export function PuttingChart({ history, height = 200 }: { history: PerformancePoint[]; height?: number }) {
  const data: Row[] = history.map((p, i) => ({ ...p, i }));
  if (data.filter((p) => p.puttsPerHole !== null).length < 2) return <Empty text="Der Verlauf erscheint ab zwei Runden mit Putt-Angaben." />;
  return (
    <div style={{ height }} role="img" aria-label="Verlauf der Putts pro Loch je Runde">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="i" tickFormatter={(i: number) => formatDateShort(data[i]?.date)} tick={axisTick} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis domain={[1, 3]} tick={axisTick} axisLine={false} tickLine={false} width={36} tickFormatter={(v: number) => formatDecimal(v, 1)} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(i) => `${formatDate(data[Number(i)]?.date)} · ${data[Number(i)]?.courseName ?? ""}`} formatter={(v, _n, item) => [`${formatDecimal(Number(v), 2)} (${(item.payload as Row).threePutts} Drei-Putts)`, "Putts pro Loch"]} />
          <Line type="monotone" dataKey="puttsPerHole" stroke="var(--series-current)" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "var(--chart-surface)" }} activeDot={{ r: 6 }} connectNulls isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Tabellenansicht des Verlaufs (Barrierefreiheit). */
export function HistoryTable({ history }: { history: PerformancePoint[] }) {
  const pct = (v: number | null) => (v === null ? "–" : `${formatDecimal(v, 0)} %`);
  return (
    <details className="rounded-xl border border-border bg-surface">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">Verlauf als Tabelle</summary>
      <div className="overflow-x-auto px-4 pb-4">
        <table className="w-full min-w-[36rem] text-sm">
          <thead className="text-left text-xs text-ink-3">
            <tr>
              <th className="py-1.5 pr-3 font-medium">Datum</th>
              <th className="py-1.5 pr-3 font-medium">Platz</th>
              <th className="py-1.5 pr-3 text-right font-medium">Löcher</th>
              <th className="py-1.5 pr-3 text-right font-medium">Schläge</th>
              <th className="py-1.5 pr-3 text-right font-medium">GIR</th>
              <th className="py-1.5 pr-3 text-right font-medium">FIR</th>
              <th className="py-1.5 pr-3 text-right font-medium">Putts/Loch</th>
              <th className="py-1.5 text-right font-medium">3-Putts</th>
            </tr>
          </thead>
          <tbody className="tabular divide-y divide-border">
            {[...history].reverse().map((p) => (
              <tr key={p.roundId}>
                <td className="py-1.5 pr-3">{formatDate(p.date)}</td>
                <td className="max-w-[12rem] truncate py-1.5 pr-3">{p.courseName}</td>
                <td className="py-1.5 pr-3 text-right">{p.holes}</td>
                <td className="py-1.5 pr-3 text-right">{p.grossScore ?? "–"}</td>
                <td className="py-1.5 pr-3 text-right">{pct(p.girPercentage)}</td>
                <td className="py-1.5 pr-3 text-right">{pct(p.firPercentage)}</td>
                <td className="py-1.5 pr-3 text-right">{formatDecimal(p.puttsPerHole, 2)}</td>
                <td className="py-1.5 text-right">{p.threePutts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
