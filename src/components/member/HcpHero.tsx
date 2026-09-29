"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Minus, Plus } from "lucide-react";
import type { HcpResult } from "@/lib/api/types";
import { cn, formatDate, formatHcp, formatSigned } from "@/lib/format";
import { InfoTip } from "@/components/ui";

export function ChangeBadge({ delta, className }: { delta: number | null | undefined; className?: string }) {
  if (delta === null || delta === undefined) return null;
  const Icon = delta < 0 ? ArrowDownRight : delta > 0 ? ArrowUpRight : Minus;
  // Beim Handicap ist ein kleinerer Wert besser
  const tone = delta < 0 ? "text-good bg-good-soft" : delta > 0 ? "text-warning bg-warning-soft" : "text-ink-2 bg-surface-3";
  return (
    <span className={cn("tabular inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm font-semibold", tone, className)}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {delta === 0 ? "±0,0" : formatSigned(delta)}
    </span>
  );
}

/** Große, sofort erfassbare Anzeige des Handicap Index. */
export function HcpHero({ hcp, showCta = true }: { hcp: HcpResult; showCta?: boolean }) {
  const change = hcp.changeSinceLastRound;
  return (
    <section aria-labelledby="hcp-hero-title" className="overflow-hidden rounded-3xl border border-border bg-surface shadow-sm">
      <div className="bg-gradient-to-br from-brand-soft/80 via-surface to-surface p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p id="hcp-hero-title" className="flex items-center gap-1 text-sm font-medium text-ink-2">
              Dein Handicap Index
              <InfoTip label="Was ist der Handicap Index?">
                Der Handicap Index beschreibt deine Spielstärke nach dem World Handicap System. Er wird aus den besten Score Differentials deiner letzten bis zu 20 Ergebnisse berechnet.
              </InfoTip>
            </p>
            <p className="tabular mt-1 text-7xl font-semibold leading-none tracking-tight text-brand sm:text-8xl" aria-live="polite">
              {formatHcp(hcp.currentHandicapIndex)}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-2">
              {hcp.status === "INITIAL" ? (
                <span>Start-Handicap · ab 3 Runden berechnen wir deinen HCPI</span>
              ) : change ? (
                <>
                  <ChangeBadge delta={change.delta} />
                  <span>seit der letzten Runde ({formatDate(change.date)})</span>
                </>
              ) : (
                <span>{hcp.calculationLabel}</span>
              )}
            </div>
          </div>
          {showCta && (
            <Link href="/member/rounds/new" className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand px-5 text-base font-semibold text-white shadow-sm hover:bg-brand-hover dark:text-[#0d1510]">
              <Plus className="h-5 w-5" aria-hidden /> Runde erfassen
            </Link>
          )}
        </div>
      </div>
      <dl className="grid grid-cols-3 divide-x divide-border border-t border-border text-center">
        <div className="px-2 py-3">
          <dt className="text-xs text-ink-3">Ergebnisse</dt>
          <dd className="tabular text-lg font-semibold text-ink">{hcp.scoringRecordCount}</dd>
        </div>
        <div className="px-2 py-3">
          <dt className="text-xs text-ink-3">zählen</dt>
          <dd className="tabular text-lg font-semibold text-ink">{hcp.usedCount ?? "–"}</dd>
        </div>
        <div className="px-2 py-3">
          <dt className="text-xs text-ink-3">Low HI</dt>
          <dd className="tabular text-lg font-semibold text-ink">{formatHcp(hcp.lowHandicapIndex)}</dd>
        </div>
      </dl>
    </section>
  );
}
