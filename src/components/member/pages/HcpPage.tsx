"use client";

import Link from "next/link";
import { ChevronDown, Info } from "lucide-react";
import { api } from "@/lib/api/client";
import { useApi } from "@/lib/useApi";
import { formatDate, formatDecimal, formatHcp, formatSigned } from "@/lib/format";
import { Alert, Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { ErrorState, PageSkeleton } from "@/components/ui/feedback";
import { HcpHero } from "@/components/member/HcpHero";
import { HcpHistoryChart } from "@/components/member/HcpHistoryChart";
import { RoundList, roundHref } from "@/components/member/RoundList";

export function HcpPage() {
  const { data: hcp, error, loading, reload } = useApi(() => api.member.hcp(), "hcp");
  if (error && !hcp) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !hcp) return <PageSkeleton variant="detail" />;
  if (!hcp) return null;

  return (
    <div className="space-y-5">
      <PageHeader title="Mein Handicap" description="Dein aktueller Handicap Index, wie er entsteht und wie er sich entwickelt hat." />
      <HcpHero hcp={hcp} showCta={false} />

      <Card>
        <CardHeader title="So entsteht dein Handicap Index" subtitle={hcp.calculationLabel} />
        <CardBody className="space-y-4">
          {hcp.status === "INITIAL" ? (
            <Alert tone="info">
              Du hast noch keine handicaprelevanten Ergebnisse. Bis dahin gilt dein Start-Handicap von <strong>{formatHcp(hcp.startHandicapIndex)}</strong>.
            </Alert>
          ) : hcp.countedScoreDifferentials.length > 0 ? (
            <>
              <p className="text-sm text-ink-2">Diese Score Differentials zählen aktuell:</p>
              <ul className="divide-y divide-border rounded-xl border border-border">
                {hcp.countedScoreDifferentials.map((c) => (
                  <li key={c.roundId}>
                    <Link href={roundHref(c.roundId)} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-surface-2">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">{c.courseName || "Runde"}</span>
                        <span className="text-xs text-ink-3">{formatDate(c.date)}</span>
                      </span>
                      <span className="tabular text-base font-semibold text-brand">
                        {formatDecimal(c.value)}
                        {c.esr !== 0 && <span className="ml-1 text-xs font-normal text-ink-3">(inkl. {formatSigned(c.esr)} außergew. Ergebnis)</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <dl className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-surface-2 px-4 py-3">
                  <dt className="text-xs text-ink-3">Durchschnitt</dt>
                  <dd className="tabular text-lg font-semibold">{hcp.averageUnrounded !== null ? formatDecimal(hcp.averageUnrounded, 2) : "–"}</dd>
                </div>
                <div className="rounded-xl bg-surface-2 px-4 py-3">
                  <dt className="text-xs text-ink-3">Anpassung</dt>
                  <dd className="tabular text-lg font-semibold">{hcp.adjustment ? formatSigned(hcp.adjustment) : "keine"}</dd>
                </div>
                <div className="rounded-xl bg-surface-2 px-4 py-3">
                  <dt className="text-xs text-ink-3">Berechnet</dt>
                  <dd className="tabular text-lg font-semibold">{formatHcp(hcp.calculatedHandicapIndex)}</dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="text-sm text-ink-2">{hcp.calculationLabel}</p>
          )}
          {hcp.deviation && (
            <Alert tone="info" title={`Aktueller HCPI ${formatHcp(hcp.currentHandicapIndex)} statt berechnet ${formatHcp(hcp.calculatedHandicapIndex)}`}>
              <p>{hcp.deviation.text}</p>
              {hcp.deviation.reasons.length > 0 && (
                <ul className="mt-1 list-disc pl-5">
                  {hcp.deviation.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}
            </Alert>
          )}
          {hcp.brake265Active && <Alert tone="info">Die 26,5-Bremse ist aktiv: Erhöhungen deines Handicap Index werden begrenzt.</Alert>}
          <details className="group rounded-xl border border-border">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2">
                <Info className="h-4 w-4 text-ink-3" aria-hidden /> Wie funktioniert das genau?
              </span>
              <ChevronDown className="h-4 w-4 text-ink-3 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="space-y-2 px-4 pb-4 text-sm text-ink-2">
              <p>Aus jeder Runde entsteht ein Score Differential: (113 ÷ Slope) × (GBE − Course Rating − PCC).</p>
              <p>Von deinen letzten bis zu 20 Ergebnissen zählen die besten – bei 20 Ergebnissen die besten 8. Der Durchschnitt ergibt deinen Handicap Index.</p>
              <p>Soft Cap und Hard Cap begrenzen einen schnellen Anstieg gegenüber dem niedrigsten Wert der letzten 12 Monate (Low HI).</p>
              <p>
                Mehr im{" "}
                <Link href="/methodik" className="font-medium text-brand hover:underline">
                  Berechnungsweg
                </Link>
                .
              </p>
            </div>
          </details>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Entwicklung" />
        <CardBody>
          <HcpHistoryChart history={hcp.history} height={260} />
        </CardBody>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">Deine letzten {hcp.record.length} Ergebnisse</h2>
        {hcp.record.length > 0 ? <RoundList rounds={hcp.record} /> : <p className="text-sm text-ink-3">Noch keine Ergebnisse im Scoring Record.</p>}
      </section>
    </div>
  );
}
