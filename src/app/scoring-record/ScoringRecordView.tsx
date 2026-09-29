"use client";

import Link from "next/link";
import { ListOrdered } from "lucide-react";
import { cn, formatDate, formatDecimal, formatHcp, formatSigned } from "@/lib/format";
import { useHcp } from "@/components/providers/HcpStoreProvider";
import { ButtonLink, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { HandicapCalculation, deviationReasons, tableRowLabel } from "@/components/handicap/HandicapCalculation";
import { RoundTable, useRoundRows } from "@/components/rounds/RoundTable";
import { useRoundLookup } from "@/components/handicap/useRoundLookup";
import { LoadingState } from "@/components/dashboard/DashboardView";

export function ScoringRecordView() {
  const { ready, rounds, result } = useHcp();
  const { roundsById } = useRoundLookup();
  const rows = useRoundRows(rounds, result.rounds, { recordOnly: true });
  if (!ready) return <LoadingState />;

  const status = result.status;
  const revision = result.revisions[result.revisions.length - 1] ?? null;
  const ranked = [...status.window].sort((a, b) => a.rank - b.rank);
  const calc = status.calculatedHandicapIndex;
  const reasons = deviationReasons(revision);

  return (
    <>
      <PageHeader
        title="Scoring Record"
        description="Die jüngsten 20 handicap-relevanten Ergebnisse bilden den Handicap Index. Darunter die vollständige Historie aller Score Differentials."
      />
      {result.record.length === 0 ? (
        <EmptyState icon={<ListOrdered className="h-8 w-8" />} title="Noch keine handicap-relevanten Ergebnisse" action={<ButtonLink href="/runde-erfassen">Runde erfassen</ButtonLink>} />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_1fr]">
            <Card>
              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">Aktueller Handicap Index</p>
                <p className="tabular mt-2 text-5xl font-semibold">{formatHcp(status.currentHandicapIndex)}</p>
                <p className="mt-2 text-sm text-ink-2">
                  Kalkulierter HCPI: <strong className="tabular">{formatHcp(calc)}</strong>
                  <br />
                  {calc === null ? (
                    <span className="text-ink-3">Noch zu wenige Ergebnisse – es gilt der Start-HCPI.</span>
                  ) : calc === status.currentHandicapIndex ? (
                    <span className="text-ink-3">Kein Unterschied</span>
                  ) : (
                    <span className="text-ink-3">Abweichung durch: {reasons.join(", ")}</span>
                  )}
                </p>
                <p className="mt-3 text-sm">{tableRowLabel(status.recordSize)}</p>
              </div>
              <div className="border-t border-border">
                <ol className="divide-y divide-border">
                  {ranked.map((w, i) => {
                    const round = roundsById.get(w.roundId);
                    return (
                      <li key={w.roundId}>
                        <Link
                          href={`/runden/${encodeURIComponent(w.roundId)}`}
                          className={cn("flex items-center gap-3 px-5 py-2 text-sm hover:bg-surface-2", w.counted && "bg-brand-soft/70")}
                        >
                          <span className="tabular w-6 text-right text-xs text-ink-3">{i + 1}.</span>
                          <span className={cn("tabular w-14 font-semibold", w.counted ? "text-brand" : "text-ink")}>SD {formatDecimal(w.adjustedSD)}</span>
                          <span className="min-w-0 flex-1 truncate text-xs text-ink-3">
                            {formatDate(w.date)} · {round?.title}
                          </span>
                          {w.esrTotal !== 0 && <span className="text-[11px] text-accent">ESR {formatSigned(w.esrTotal, 0)}</span>}
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </Card>

            <Card id="berechnung">
              <CardHeader title="So entsteht der aktuelle HCPI" subtitle={revision ? `Stand nach dem Spieltag ${formatDate(revision.date)}` : undefined} />
              <CardBody>{revision && <HandicapCalculation revision={revision} roundsById={roundsById} />}</CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader title="Alle Score Differentials" subtitle="Unbegrenzte Historie; hervorgehoben: aktuell in die Berechnung einfließende Ergebnisse" />
            <CardBody>
              <RoundTable rows={rows} initialLimit={20} />
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}
