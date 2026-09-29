"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { cn, formatDecimal, formatHcp, formatSigned } from "@/lib/format";
import { EXCLUSION_TEXTS, METHOD_LABELS, issueText, relevanceText } from "@/lib/whs/messages";
import type { Round, RoundResult } from "@/lib/whs/types";
import { Alert, Badge, InfoTip } from "@/components/ui";

export function RoundResultSummary({ round, result }: { round: Round; result: RoundResult }) {
  const sd = result.scoreDifferential;
  const after = result.revision?.currentHandicapIndex ?? result.startHandicapIndex;
  const change = after - result.startHandicapIndex;
  const warnings = result.issues.filter((i) => i.severity !== "error");
  const errors = result.issues.filter((i) => i.severity === "error");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface-2 px-4 py-3">
          <p className="text-xs text-ink-3">HCPI vor der Runde</p>
          <p className="tabular text-xl font-semibold">{formatHcp(result.startHandicapIndex)}</p>
        </div>
        <div className="rounded-xl border border-brand-2/40 bg-brand-soft px-4 py-3">
          <p className="flex items-center gap-1 text-xs text-brand">
            Score Differential
            <InfoTip>
              Das Score Differential beschreibt, wie stark ein Ergebnis unter Berücksichtigung von Course Rating und Slope einzuschätzen ist.
              Je kleiner der Wert, desto besser das Ergebnis.
            </InfoTip>
          </p>
          <p className="tabular text-xl font-semibold">{sd ? formatDecimal(sd.value) : "–"}</p>
          {sd && <p className="text-[11px] text-ink-3">{METHOD_LABELS[sd.method]}</p>}
        </div>
        <div className="rounded-xl border border-border bg-surface-2 px-4 py-3">
          <p className="text-xs text-ink-3">Außergewöhnliches Ergebnis</p>
          <p className="tabular text-xl font-semibold">{result.esr && result.esr.reduction !== 0 ? `ESR ${formatSigned(result.esr.reduction, 0)}` : "nein"}</p>
          {result.esr && <p className="text-[11px] text-ink-3">Differenz zum HCPI: {formatSigned(result.esr.difference)}</p>}
        </div>
        <div className="rounded-xl border border-border bg-surface-2 px-4 py-3">
          <p className="text-xs text-ink-3">HCPI nach dem Spieltag</p>
          <p className="tabular text-xl font-semibold">{formatHcp(after)}</p>
          <p className="text-[11px] text-ink-3">{change === 0 ? "unverändert" : `Änderung ${formatSigned(change)}`}</p>
        </div>
      </div>

      {sd && (sd.method === "NINE_EXPECTED" || sd.method === "PARTIAL_NINE_EXPECTED") && (
        <p className="tabular rounded-lg bg-surface-2 px-3 py-2 text-sm">
          9 Löcher gespielt: <strong>{formatDecimal(sd.playedDifferential)}</strong> + erwartet (HCPI {formatHcp(sd.handicapIndexForExpected)}):{" "}
          <strong>{formatDecimal(sd.expectedDifferential)}</strong> = <strong>{formatDecimal(sd.value)}</strong>
        </p>
      )}

      <div className="rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">Handicap-relevant:</span>
          {result.relevance.relevant ? <Badge tone="good">JA</Badge> : <Badge tone="critical">NEIN</Badge>}
          <span className="text-sm font-semibold sm:ml-4">In HCPI-Berechnung verwendet:</span>
          {result.countedAtTime ? <Badge tone="good">JA</Badge> : <Badge>NEIN</Badge>}
          {!result.countedAtTime && result.exclusionReasonAtTime && (
            <span className="text-sm text-ink-3">– {EXCLUSION_TEXTS[result.exclusionReasonAtTime]}</span>
          )}
        </div>
        <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
          {result.relevance.checks.map((c) => (
            <li key={c.code} className={cn("flex items-center gap-2", c.ok ? "text-ink-2" : "text-critical")}>
              {c.ok ? <CheckCircle2 className="h-4 w-4 text-good" aria-hidden /> : <XCircle className="h-4 w-4" aria-hidden />}
              {relevanceText(c)}
            </li>
          ))}
        </ul>
        {round.category === "OTHER" && <p className="mt-2 text-xs text-ink-3">Sonstige Runden werden gespeichert, fließen aber nicht in den Scoring Record ein.</p>}
      </div>

      {errors.map((i) => (
        <Alert key={i.code} tone="error">
          {issueText(i)}
        </Alert>
      ))}
      {warnings.map((i) => (
        <Alert key={i.code} tone={i.severity === "warning" ? "warning" : "info"}>
          {issueText(i)}
        </Alert>
      ))}
    </div>
  );
}
