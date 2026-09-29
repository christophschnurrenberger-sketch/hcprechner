"use client";

import Link from "next/link";
import { ArrowDown } from "lucide-react";
import { defaultRuleSet } from "@/rules/whs/registry";
import { cn, formatDate, formatDecimal, formatHcp, formatSigned } from "@/lib/format";
import type { HandicapRevision, Round, WindowEntry } from "@/lib/whs/types";
import { Badge, InfoTip } from "@/components/ui";
import { roundPath } from "@/lib/courses/paths";

export function tableRowLabel(recordSize: number): string {
  const row = defaultRuleSet.lookupIndexTable(recordSize);
  if (!row) return "Noch kein HCPI (mindestens 3 Ergebnisse)";
  const adj = row.adjustment !== 0 ? `, Anpassung ${formatSigned(row.adjustment)}` : "";
  return `${row.count === 1 ? "Bestes" : `Durchschnitt der besten ${row.count}`} von ${recordSize} Score Differentials${adj}`;
}

export function usedLabel(recordSize: number): string {
  const row = defaultRuleSet.lookupIndexTable(recordSize);
  if (!row) return `${recordSize} von mindestens 3 Ergebnissen`;
  return `beste ${row.count} von ${recordSize}`;
}

/** Warum weichen kalkulierter und aktueller HCPI ab? */
export function deviationReasons(revision: HandicapRevision | null): string[] {
  if (!revision) return [];
  const reasons: string[] = [];
  if (revision.softCap?.applied) reasons.push("Soft Cap");
  if (revision.hardCap?.applied) reasons.push("Hard Cap");
  if (revision.index && revision.calculatedHandicapIndex !== null && revision.index.value > revision.calculatedHandicapIndex) {
    reasons.push("Höchstwert 54,0");
  }
  if (revision.brake265?.applied) reasons.push("26,5-Bremse");
  if (revision.officialOverride !== null) reasons.push("offiziell übernommener HCPI");
  return reasons;
}

function Step({ title, children, active = true, info }: { title: string; children: React.ReactNode; active?: boolean; info?: React.ReactNode }) {
  return (
    <li className={cn("rounded-lg border px-3 py-2.5", active ? "border-border bg-surface" : "border-dashed border-border bg-surface-2 text-ink-3")}>
      <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-ink-3">
        {title}
        {info && <InfoTip>{info}</InfoTip>}
      </div>
      <div className="mt-1 text-sm">{children}</div>
    </li>
  );
}

function Arrow() {
  return (
    <li aria-hidden className="flex justify-center text-ink-3">
      <ArrowDown className="h-4 w-4" />
    </li>
  );
}

export function WindowChips({
  window,
  roundsById,
  sortBy = "value",
}: {
  window: WindowEntry[];
  roundsById?: Map<string, Round>;
  sortBy?: "value" | "date";
}) {
  const list = sortBy === "value" ? [...window].sort((a, b) => a.rank - b.rank) : [...window].reverse();
  return (
    <ol className="flex flex-wrap gap-1.5">
      {list.map((w) => {
        const round = roundsById?.get(w.roundId);
        return (
          <li key={w.roundId}>
            <Link
              href={roundPath(w.roundId)}
              title={`${formatDate(w.date)}${round ? " · " + round.title : ""}${w.esrTotal ? ` · ESR ${formatSigned(w.esrTotal, 0)} (original ${formatDecimal(w.originalSD)})` : ""}`}
              className={cn(
                "tabular inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold",
                w.counted ? "border-brand-2 bg-brand-soft text-brand" : "border-border bg-surface text-ink-2",
              )}
            >
              {formatDecimal(w.adjustedSD)}
              {w.esrTotal !== 0 && <span className="text-[10px] font-medium text-ink-3">ESR</span>}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Vollständiger Rechenweg eines HCPI-Schritts:
 * Scoring Record → Tabelle → Durchschnitt → Low HCPI → Soft/Hard Cap → Bremse → aktueller HCPI.
 */
export function HandicapCalculation({
  revision,
  roundsById,
  compact = false,
}: {
  revision: HandicapRevision;
  roundsById?: Map<string, Round>;
  compact?: boolean;
}) {
  const idx = revision.index;
  const counted = revision.window.filter((w) => w.counted).sort((a, b) => a.adjustedSD - b.adjustedSD);
  return (
    <ol className="space-y-2">
      <Step
        title={`Scoring Record · ${revision.recordSize} von ${defaultRuleSet.config.handicapIndex.windowSize} Ergebnissen`}
        info="Berücksichtigt werden die jüngsten 20 handicap-relevanten Score Differentials (nach ESR). Hervorgehoben sind die Ergebnisse, die in den HCPI einfließen."
      >
        {revision.window.length > 0 ? (
          <WindowChips window={revision.window} roundsById={roundsById} />
        ) : (
          <span className="text-ink-3">Noch keine Ergebnisse</span>
        )}
      </Step>
      <Arrow />
      <Step title="WHS-Tabelle" info="Bei weniger als 20 Ergebnissen gilt die WHS-Tabelle (z. B. 8 Ergebnisse → Durchschnitt der besten 2).">
        {tableRowLabel(revision.recordSize)}
      </Step>
      {idx && (
        <>
          <Arrow />
          <Step title="Kalkulierter HCPI">
            <p className="tabular">
              ({counted.map((c) => formatDecimal(c.adjustedSD)).join(" + ")}) / {idx.usedCount} = {formatDecimal(idx.averageUnrounded, 3)}
              {idx.adjustment !== 0 && <> {formatSigned(idx.adjustment)}</>}
            </p>
            <p className="mt-1">
              gerundet: <strong className="tabular">{formatHcp(idx.value)}</strong>
              {revision.calculatedHandicapIndex !== null && revision.calculatedHandicapIndex < idx.value && (
                <> → Höchstwert <strong>{formatHcp(revision.calculatedHandicapIndex)}</strong></>
              )}
            </p>
          </Step>
          {!compact && (
            <>
              <Arrow />
              <Step
                title="Low Handicap Index"
                active={Boolean(revision.lowHandicapIndex)}
                info="Niedrigster Handicap Index der letzten 365 Tage vor dem jüngsten Ergebnis. Erst ab 20 Ergebnissen."
              >
                {revision.lowHandicapIndex ? (
                  <>
                    <strong className="tabular">{formatHcp(revision.lowHandicapIndex.value)}</strong>{" "}
                    <span className="text-ink-3">
                      (gültig ab {formatDate(revision.lowHandicapIndex.effectiveFrom)}; Zeitraum {formatDate(revision.lowHandicapIndex.windowStart)} – {formatDate(revision.lowHandicapIndex.windowEnd)})
                    </span>
                  </>
                ) : (
                  <>Noch nicht festgelegt ({revision.totalScores} von 20 Ergebnissen) – kein Cap-Verfahren.</>
                )}
              </Step>
              <Arrow />
              <Step title="Soft Cap" active={Boolean(revision.softCap)} info="Steigt der HCPI um mehr als 3,0 über den Low HCPI, wird der darüber liegende Anstieg halbiert.">
                {revision.softCap && revision.lowHandicapIndex ? (
                  revision.softCap.applied ? (
                    <span className="tabular">
                      {formatHcp(revision.lowHandicapIndex.value)} + 3,0 + ({formatDecimal(revision.softCap.before - revision.lowHandicapIndex.value - 3)} × 0,5) ={" "}
                      <strong>{formatHcp(revision.softCap.after)}</strong>
                    </span>
                  ) : (
                    <>Nicht aktiv (Anstieg ≤ 3,0 über Low HCPI)</>
                  )
                ) : (
                  <>Nicht anwendbar</>
                )}
              </Step>
              <Arrow />
              <Step title="Hard Cap" active={Boolean(revision.hardCap)} info="Nach dem Soft Cap darf der HCPI höchstens 5,0 über dem Low HCPI liegen.">
                {revision.hardCap && revision.lowHandicapIndex ? (
                  revision.hardCap.applied ? (
                    <span className="tabular">
                      begrenzt auf {formatHcp(revision.lowHandicapIndex.value)} + 5,0 = <strong>{formatHcp(revision.hardCap.after)}</strong>
                    </span>
                  ) : (
                    <>Nicht aktiv</>
                  )
                ) : (
                  <>Nicht anwendbar</>
                )}
              </Step>
            </>
          )}
          <Arrow />
          <Step
            title="26,5-Bremse"
            active={Boolean(revision.brake265?.active)}
            info="Deutsche Besonderheit: Zwischen 54,0 und 26,5 werden nur Verbesserungen automatisch wirksam. Unter 26,5 erfolgt eine Heraufsetzung höchstens bis 26,5. Auf Antrag kann die Bremse dauerhaft aufgehoben werden."
          >
            {revision.brake265 ? (
              revision.brake265.active ? (
                revision.brake265.applied ? (
                  <>
                    Aktiv und wirksam: Erhöhung von {formatHcp(revision.startHandicapIndex)} auf {formatHcp(revision.brake265.before)} wird auf{" "}
                    <strong>{formatHcp(revision.brake265.after)}</strong> begrenzt.
                  </>
                ) : (
                  <>Aktiv, aber ohne Wirkung (keine Erhöhung über {formatHcp(revision.brake265.upperBound)}).</>
                )
              ) : (
                <>Aufgehoben – der Wert nach Cap-Verfahren gilt.</>
              )
            ) : (
              <>–</>
            )}
          </Step>
        </>
      )}
      <Arrow />
      <li className="rounded-lg border border-brand-2 bg-brand-soft px-3 py-2.5">
        <div className="text-xs font-semibold uppercase tracking-wide text-brand">Aktueller HCPI (gültig ab {formatDate(revision.effectiveFrom)})</div>
        <div className="mt-1 flex flex-wrap items-baseline gap-2">
          <span className="tabular text-2xl font-semibold text-ink">{formatHcp(revision.currentHandicapIndex)}</span>
          {revision.noChangeReason === "TOO_FEW_SCORES" && <Badge>unverändert – zu wenige Ergebnisse</Badge>}
          {revision.officialOverride !== null && <Badge tone="info">offiziell übernommen</Badge>}
          {revision.esr && <Badge tone="accent">ESR {formatSigned(revision.esr.value, 0)} angewendet</Badge>}
        </div>
      </li>
    </ol>
  );
}
