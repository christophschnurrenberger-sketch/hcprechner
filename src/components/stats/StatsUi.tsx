"use client";

import { Lightbulb } from "lucide-react";
import type { PerformanceSummary, RoundStatistics } from "@/lib/stats/types";
import { STAT_DEFINITIONS } from "@/lib/stats/insights";
import { cn, formatDecimal } from "@/lib/format";
import { Badge, Stat } from "@/components/ui";

/** Prozentwert (0–100, ungerundet vom Backend) für die Anzeige. */
export function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined ? "–" : `${formatDecimal(value, 0)} %`;
}

const ofText = (hits: number, attempts: number, unit: string) => (attempts > 0 ? `${hits} von ${attempts} ${unit}` : "keine Versuche");

type Tiles = {
  puttsPerHole: number | null;
  totalPutts?: number | null;
  puttHoles: number;
  puttsPerGir: number | null;
  girs: number;
  girHoles: number;
  girPercentage: number | null;
  firs: number;
  fairwayOpportunities: number;
  firPercentage: number | null;
  sandAttempts: number;
  sandSaves: number;
  sandSavePercentage: number | null;
  upAndDownAttempts: number;
  upAndDowns: number;
  upAndDownPercentage: number | null;
  threePutts: number;
  penaltyStrokes: number | null;
};

/**
 * Kennzahlen als Kacheln – für eine Runde (`RoundStatistics`) oder mehrere (`PerformanceSummary`).
 * Nenner sind immer die erfassten Löcher; ohne Versuch bleibt eine Quote leer statt 0 %.
 */
export function StatTiles({ stats, perRound, className }: { stats: Tiles; perRound?: { threePutts: number | null; penalties: number | null }; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4", className)}>
      <Stat label="Putts pro Loch" value={formatDecimal(stats.puttsPerHole, 2)} sub={stats.puttHoles > 0 ? `${stats.totalPutts ?? "–"} Putts auf ${stats.puttHoles} Löchern` : "keine Angaben"} />
      <Stat label="GIR" info="Grün in Regulation: Ball nach Par − 2 Schlägen auf dem Grün." value={formatPercent(stats.girPercentage)} sub={ofText(stats.girs, stats.girHoles, "Grüns")} />
      <Stat label="Fairways (FIR)" info="Nur Par-4- und Par-5-Löcher." value={formatPercent(stats.firPercentage)} sub={ofText(stats.firs, stats.fairwayOpportunities, "Fairways")} />
      <Stat label="Putts pro GIR" value={formatDecimal(stats.puttsPerGir, 2)} sub={stats.girs > 0 ? "auf getroffenen Grüns" : "kein Grün getroffen"} />
      <Stat label="Up & Down" info="Grün verfehlt, danach Par oder besser." value={formatPercent(stats.upAndDownPercentage)} sub={ofText(stats.upAndDowns, stats.upAndDownAttempts, "Versuchen")} />
      <Stat label="Sand Save" info="Nach einem Bunkerschlag Par oder besser." value={formatPercent(stats.sandSavePercentage)} sub={ofText(stats.sandSaves, stats.sandAttempts, "Versuchen")} />
      <Stat label="Drei-Putts" value={perRound ? formatDecimal(perRound.threePutts, 1) : stats.threePutts} sub={perRound ? `pro Runde · gesamt ${stats.threePutts}` : "3 oder mehr Putts"} />
      <Stat label="Strafschläge" value={perRound ? formatDecimal(perRound.penalties, 1) : (stats.penaltyStrokes ?? "–")} sub={perRound ? `pro Runde · gesamt ${stats.penaltyStrokes ?? 0}` : "in dieser Runde"} />
    </div>
  );
}

export function SummaryTiles({ summary }: { summary: PerformanceSummary }) {
  return <StatTiles stats={summary} perRound={{ threePutts: summary.threePuttsPerRound, penalties: summary.penaltiesPerRound }} />;
}

const DIST: { key: keyof PerformanceSummary["distribution"]; label: string; color: string }[] = [
  { key: "eagles", label: "Eagle oder besser", color: "var(--series-low)" },
  { key: "birdies", label: "Birdie", color: "var(--series-low)" },
  { key: "pars", label: "Par", color: "var(--series-current)" },
  { key: "bogeys", label: "Bogey", color: "var(--series-sd)" },
  { key: "doubleBogeys", label: "Doppelbogey", color: "var(--series-calculated)" },
  { key: "triplePlus", label: "Triple oder schlechter", color: "var(--series-calculated)" },
];

/** Verteilung der Lochergebnisse relativ zu Par (Anzahl Löcher). */
export function ScoreDistribution({ distribution }: { distribution: PerformanceSummary["distribution"] }) {
  const total = DIST.reduce((a, d) => a + distribution[d.key], 0);
  if (total === 0) return <p className="text-sm text-ink-3">Noch keine Löcher mit Schlagzahl und Par erfasst.</p>;
  const max = Math.max(...DIST.map((d) => distribution[d.key]));
  return (
    <ul className="space-y-2" aria-label="Verteilung der Lochergebnisse">
      {DIST.map((d) => {
        const n = distribution[d.key];
        return (
          <li key={d.key} className="grid grid-cols-[8.5rem_1fr_4.5rem] items-center gap-3 text-sm">
            <span className="truncate text-ink-2">{d.label}</span>
            <span className="h-3 overflow-hidden rounded-full bg-surface-3">
              <span className="block h-full rounded-full" style={{ width: `${max ? (n / max) * 100 : 0}%`, background: d.color }} />
            </span>
            <span className="tabular text-right text-ink">
              {n} <span className="text-xs text-ink-3">({formatDecimal((n / total) * 100, 0)} %)</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Vollständigkeit der Lochstatistik einer Runde. */
export function CompletenessBadge({ stats }: { stats: Pick<RoundStatistics, "holes" | "holesTracked" | "scorecardComplete"> }) {
  if (stats.holesTracked >= stats.holes) return <Badge tone="good">vollständig erfasst</Badge>;
  return (
    <Badge tone="warning" title="Vollständig = Schläge, Putts, GIR und Strafschläge je Loch">
      {stats.holesTracked} von {stats.holes} Löchern vollständig
    </Badge>
  );
}

export function InsightList({ insights }: { insights: string[] }) {
  if (insights.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {insights.map((t) => (
        <li key={t} className="flex items-start gap-2 text-sm text-ink-2">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
          {t}
        </li>
      ))}
    </ul>
  );
}

/** Statistik einer Runde: Vollständigkeit, Kennzahlen, Verteilung und Fakten. */
export function RoundStatsSummary({ stats, insights }: { stats: RoundStatistics; insights: string[] }) {
  const distribution = { eagles: stats.eagles, birdies: stats.birdies, pars: stats.pars, bogeys: stats.bogeys, doubleBogeys: stats.doubleBogeys, triplePlus: stats.triplePlus };
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-sm text-ink-3">
        <CompletenessBadge stats={stats} />
        {stats.grossScore !== null && (
          <span className="tabular">
            {stats.grossScore} Schläge{stats.parPlayed !== null ? ` auf Par ${stats.parPlayed}` : ""} ({stats.holesScored} {stats.holesScored === 1 ? "Loch" : "Löcher"})
          </span>
        )}
      </div>
      <StatTiles stats={stats} />
      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-medium text-ink">Ergebnisse je Loch</p>
          <ScoreDistribution distribution={distribution} />
        </div>
        {insights.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium text-ink">Auf einen Blick</p>
            <InsightList insights={insights} />
          </div>
        )}
      </div>
    </div>
  );
}

export function StatDefinitions() {
  return (
    <details className="group rounded-xl border border-border bg-surface">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">So zählen wir</summary>
      <dl className="space-y-2 px-4 pb-4 text-sm">
        {STAT_DEFINITIONS.map((d) => (
          <div key={d.term}>
            <dt className="font-medium text-ink">{d.term}</dt>
            <dd className="text-ink-2">{d.text}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
