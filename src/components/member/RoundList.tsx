"use client";

import Link from "next/link";
import { ChevronRight, FileEdit, Trash2 } from "lucide-react";
import type { DraftRound, RoundListItem } from "@/lib/api/types";
import { cn, formatDate, formatDecimal, formatHcp } from "@/lib/format";
import { Badge } from "@/components/ui";

export function roundHref(id: string): string {
  return `/member/rounds/view?id=${encodeURIComponent(id)}`;
}

function StatusBadge({ item }: { item: RoundListItem }) {
  if (item.counted) return <Badge tone="good">zählt</Badge>;
  if (!item.relevant) return <Badge>nicht relevant</Badge>;
  if (!item.inWindow) return <Badge>außerhalb der letzten 20</Badge>;
  return <Badge tone="neutral">zählt nicht</Badge>;
}

/** Rundenliste: auf dem Smartphone als Karten, auf dem Desktop als Tabelle. */
export function RoundList({ rounds }: { rounds: RoundListItem[] }) {
  return (
    <>
      <ul className="space-y-2 md:hidden">
        {rounds.map((r) => (
          <li key={r.id}>
            <Link href={roundHref(r.id)} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 hover:border-border-strong">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-ink">{r.courseName}</p>
                <p className="mt-0.5 text-xs text-ink-3">
                  {formatDate(r.date)} · {r.holes} Loch{r.teeColor ? ` · ${r.teeColor}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge item={r} />
                  {r.note && !r.counted && <span className="text-xs text-ink-3">{r.note}</span>}
                </div>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-wide text-ink-3">SD</p>
                <p className={cn("tabular text-xl font-semibold", r.counted ? "text-brand" : "text-ink")}>{formatDecimal(r.adjustedScoreDifferential ?? r.scoreDifferential)}</p>
                <p className="tabular text-xs text-ink-3">GBE {r.adjustedGrossScore ?? "–"}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-surface md:block">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-ink-3">
            <tr>
              <th className="px-4 py-3 font-medium">Datum</th>
              <th className="px-4 py-3 font-medium">Golfplatz</th>
              <th className="px-4 py-3 font-medium">Löcher</th>
              <th className="px-4 py-3 text-right font-medium">GBE</th>
              <th className="px-4 py-3 text-right font-medium">Score Differential</th>
              <th className="px-4 py-3 text-right font-medium">HCPI danach</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rounds.map((r) => (
              <tr key={r.id} className="hover:bg-surface-2">
                <td className="tabular whitespace-nowrap px-4 py-3 text-ink-2">{formatDate(r.date)}</td>
                <td className="px-4 py-3">
                  <Link href={roundHref(r.id)} className="font-medium text-ink hover:text-brand">
                    {r.courseName}
                  </Link>
                  {r.teeColor && <span className="ml-1 text-xs text-ink-3">· {r.teeColor}</span>}
                </td>
                <td className="px-4 py-3 text-ink-2">{r.holes}</td>
                <td className="tabular px-4 py-3 text-right text-ink-2">{r.adjustedGrossScore ?? "–"}</td>
                <td className={cn("tabular px-4 py-3 text-right font-semibold", r.counted ? "text-brand" : "text-ink")}>{formatDecimal(r.adjustedScoreDifferential ?? r.scoreDifferential)}</td>
                <td className="tabular px-4 py-3 text-right text-ink-2">{formatHcp(r.handicapIndexAfter)}</td>
                <td className="px-4 py-3">
                  <StatusBadge item={r} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function DraftList({ drafts, onDelete }: { drafts: DraftRound[]; onDelete?: (id: string) => void }) {
  if (drafts.length === 0) return null;
  return (
    <section aria-labelledby="drafts-title" className="rounded-2xl border border-accent/30 bg-accent-soft/50 p-4">
      <h2 id="drafts-title" className="flex items-center gap-2 text-sm font-semibold text-ink">
        <FileEdit className="h-4 w-4 text-accent" aria-hidden /> Nicht abgeschlossene Runden
      </h2>
      <ul className="mt-3 space-y-2">
        {drafts.map((d) => (
          <li key={d.id} className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2">
            <Link href={`/member/rounds/new?draft=${encodeURIComponent(d.id)}`} className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink">{d.label}</span>
              <span className="block text-xs text-ink-3">zuletzt bearbeitet {formatDate(d.updatedAt)}</span>
            </Link>
            <Link href={`/member/rounds/new?draft=${encodeURIComponent(d.id)}`} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-hover dark:text-[#0d1510]">
              Fortsetzen
            </Link>
            {onDelete && (
              <button type="button" onClick={() => onDelete(d.id)} className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-3 hover:text-critical" aria-label={`Entwurf „${d.label}“ verwerfen`}>
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
