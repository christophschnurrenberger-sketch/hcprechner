"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { cn, formatDate, formatDateShort, formatDecimal, formatHcp, formatPcc, formatSigned } from "@/lib/format";
import { CATEGORY_SHORT, EXCLUSION_TEXTS, RESULT_STATUS_LABELS } from "@/lib/whs/messages";
import type { Round, RoundResult } from "@/lib/whs/types";
import { Badge, Segmented, Select } from "@/components/ui";

export type RoundFilter = "ALL" | "9" | "18" | "TOURNAMENT" | "RPR" | "RELEVANT" | "NOT_RELEVANT";
export type RoundLimit = 5 | 10 | 20 | 0;

interface Row {
  round: Round;
  result: RoundResult;
}

export function useRoundRows(rounds: Round[], results: RoundResult[], options: { recordOnly?: boolean } = {}) {
  return useMemo(() => {
    const byId = new Map(rounds.map((r) => [r.id, r]));
    return results
      .filter((r) => !options.recordOnly || r.inRecord)
      .map((result) => ({ round: byId.get(result.roundId)!, result }))
      .filter((r) => r.round)
      .reverse();
  }, [rounds, results, options.recordOnly]);
}

function applyFilter(rows: Row[], filter: RoundFilter, limit: RoundLimit): Row[] {
  const filtered = rows.filter(({ round, result }) => {
    switch (filter) {
      case "9":
        return round.holes === 9;
      case "18":
        return round.holes === 18;
      case "TOURNAMENT":
        return round.category === "TOURNAMENT";
      case "RPR":
        return round.category === "RPR";
      case "RELEVANT":
        return result.inRecord;
      case "NOT_RELEVANT":
        return !result.inRecord;
      default:
        return true;
    }
  });
  return limit > 0 ? filtered.slice(0, limit) : filtered;
}

export function RoundFilters({
  filter,
  onFilter,
  limit,
  onLimit,
  showRelevance = false,
}: {
  filter: RoundFilter;
  onFilter: (f: RoundFilter) => void;
  limit: RoundLimit;
  onLimit: (l: RoundLimit) => void;
  showRelevance?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented
        name="Anzahl"
        size="sm"
        value={limit}
        onChange={onLimit}
        options={[
          { value: 5, label: "Letzte 5" },
          { value: 10, label: "10" },
          { value: 20, label: "20" },
          { value: 0, label: "Alle" },
        ]}
      />
      <Select aria-label="Filter" className="h-8 w-auto py-0 text-xs" value={filter} onChange={(e) => onFilter(e.target.value as RoundFilter)}>
        <option value="ALL">Alle Runden</option>
        <option value="9">9 Loch</option>
        <option value="18">18 Loch</option>
        <option value="TOURNAMENT">Turnier</option>
        <option value="RPR">RPR</option>
        {showRelevance && <option value="RELEVANT">Handicap-relevant</option>}
        {showRelevance && <option value="NOT_RELEVANT">Nicht relevant</option>}
      </Select>
    </div>
  );
}

export function RoundTable({ rows: allRows, initialLimit = 0, showRelevance = false }: { rows: Row[]; initialLimit?: RoundLimit; showRelevance?: boolean }) {
  const [filter, setFilter] = useState<RoundFilter>("ALL");
  const [limit, setLimit] = useState<RoundLimit>(initialLimit);
  const rows = applyFilter(allRows, filter, limit);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <RoundFilters filter={filter} onFilter={setFilter} limit={limit} onLimit={setLimit} showRelevance={showRelevance} />
        <p className="text-xs text-ink-3">
          {rows.length} von {allRows.length} Runden · neueste zuerst
        </p>
      </div>

      {/* Mobil: Karten */}
      <ul className="space-y-2 md:hidden">
        {rows.map(({ round, result }) => (
          <li key={round.id}>
            <Link href={`/runden/${encodeURIComponent(round.id)}`} className="block rounded-xl border border-border bg-surface p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{round.title}</p>
                  <p className="truncate text-xs text-ink-3">
                    {formatDate(round.date)} · {round.course.courseName} · {round.holes} L.
                  </p>
                </div>
                <div className="text-right">
                  <p className="tabular text-lg font-semibold">{formatDecimal(result.finalAdjustedSD ?? result.scoreDifferential?.value)}</p>
                  <p className="text-[11px] text-ink-3">SD</p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {result.currentlyCounted && <Badge tone="brand">zählt</Badge>}
                {!result.inRecord && <Badge tone={result.relevance.relevant ? "warning" : "neutral"}>{result.relevance.relevant ? "nicht berechenbar" : "nicht relevant"}</Badge>}
                {result.finalEsrTotal !== 0 && <Badge tone="accent">ESR {formatSigned(result.finalEsrTotal, 0)}</Badge>}
                <span className="tabular ml-auto text-xs text-ink-3">
                  HCPI {formatHcp(result.startHandicapIndex)} → {formatHcp(result.revision?.currentHandicapIndex ?? result.startHandicapIndex)}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {/* Desktop: Tabelle */}
      <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface md:block">
        <table className="tabular w-full whitespace-nowrap text-sm">
          <thead className="bg-surface-2 text-left text-xs text-ink-3">
            <tr>
              <th className="px-3 py-2 font-medium">Datum</th>
              <th className="px-3 py-2 font-medium">Turnier</th>
              <th className="px-3 py-2 font-medium">Golfplatz</th>
              <th className="px-3 py-2 text-right font-medium">Löcher</th>
              <th className="px-3 py-2 font-medium">Abschlag</th>
              <th className="px-3 py-2 text-right font-medium">GBE</th>
              <th className="px-3 py-2 text-right font-medium">CR</th>
              <th className="px-3 py-2 text-right font-medium">Slope</th>
              <th className="px-3 py-2 text-right font-medium">PCC</th>
              <th className="px-3 py-2 text-right font-medium">Start-HCPI</th>
              <th className="px-3 py-2 text-right font-medium">SD</th>
              <th className="px-3 py-2 text-right font-medium">ESR</th>
              <th className="px-3 py-2 text-right font-medium">Adj. SD</th>
              <th className="px-3 py-2 text-center font-medium">Top 8?</th>
              <th className="px-3 py-2 text-right font-medium">HCPI nach</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ round, result }) => {
              const sd = result.scoreDifferential;
              return (
                <tr key={round.id} className={cn("border-t border-border hover:bg-surface-2", result.currentlyCounted && "bg-brand-soft/60")}>
                  <td className="px-3 py-2">{formatDateShort(round.date)}</td>
                  <td className="max-w-[14rem] truncate px-3 py-2">
                    <Link href={`/runden/${encodeURIComponent(round.id)}`} className="font-medium text-ink hover:text-brand hover:underline">
                      {round.title}
                    </Link>
                    <span className="ml-1.5 text-xs text-ink-3">{CATEGORY_SHORT[round.category]}</span>
                    {round.resultStatus !== "NORMAL" && <span className="ml-1 text-xs text-warning">{RESULT_STATUS_LABELS[round.resultStatus].short}</span>}
                  </td>
                  <td className="max-w-[12rem] truncate px-3 py-2 text-ink-2">{round.course.courseName}</td>
                  <td className="px-3 py-2 text-right">{round.holes === 18 && round.holesPlayed != null && round.holesPlayed < 18 ? `${round.holesPlayed}/18` : round.holes}</td>
                  <td className="px-3 py-2 text-ink-2">{round.course.teeColor ?? "–"}</td>
                  <td className="px-3 py-2 text-right">{sd?.adjustedGrossScore ?? "–"}</td>
                  <td className="px-3 py-2 text-right">{formatDecimal(sd?.courseRating ?? round.rating.courseRating)}</td>
                  <td className="px-3 py-2 text-right">{sd?.slopeRating ?? round.rating.slopeRating ?? "–"}</td>
                  <td className="px-3 py-2 text-right">{formatPcc(sd?.pccApplied ?? round.pcc)}</td>
                  <td className="px-3 py-2 text-right">{formatHcp(result.startHandicapIndex)}</td>
                  <td className="px-3 py-2 text-right">{formatDecimal(sd?.value)}</td>
                  <td className="px-3 py-2 text-right">{result.finalEsrTotal ? formatSigned(result.finalEsrTotal, 0) : "–"}</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatDecimal(result.finalAdjustedSD)}</td>
                  <td className="px-3 py-2 text-center">
                    {result.currentlyCounted ? (
                      <Badge tone="brand">ja</Badge>
                    ) : result.currentExclusionReason ? (
                      <span className="text-xs text-ink-3" title={EXCLUSION_TEXTS[result.currentExclusionReason]}>
                        nein
                      </span>
                    ) : (
                      "–"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">{result.revision ? formatHcp(result.revision.currentHandicapIndex) : "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-3">Keine Runden für diesen Filter.</p>}
      </div>
    </div>
  );
}
