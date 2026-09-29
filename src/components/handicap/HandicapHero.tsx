"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { formatHcp } from "@/lib/format";
import type { Round, ScoringRecordResult } from "@/lib/whs/types";
import { Badge, Button, InfoTip } from "@/components/ui";
import { HandicapCalculation, deviationReasons, usedLabel } from "./HandicapCalculation";

export function HandicapHero({ result, roundsById }: { result: ScoringRecordResult; roundsById: Map<string, Round> }) {
  const [open, setOpen] = useState(false);
  const status = result.status;
  const revision = result.revisions[result.revisions.length - 1] ?? null;
  const calc = status.calculatedHandicapIndex;
  const differs = calc !== null && calc !== status.currentHandicapIndex;
  const reasons = deviationReasons(revision);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="grid gap-5 p-5 sm:grid-cols-[1fr_auto] sm:p-6">
        <div>
          <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-brand">
            Aktueller Handicap Index
            <InfoTip>
              Der Handicap Index, der jetzt gilt. Er entsteht aus dem kalkulierten HCPI nach Anwendung von Soft/Hard Cap und – in
              Deutschland – der 26,5-Bremse.
            </InfoTip>
          </p>
          <p className="tabular mt-2 text-6xl font-semibold tracking-tight text-ink">{formatHcp(status.currentHandicapIndex)}</p>
          <div className="mt-3 space-y-1 text-sm text-ink-2">
            {calc !== null ? (
              <p>
                kalkuliert: <strong className="tabular">{formatHcp(calc)}</strong>{" "}
                {differs ? (
                  <span className="text-ink-3">· Abweichung durch: {reasons.join(", ") || "–"}</span>
                ) : (
                  <span className="text-ink-3">· kein Unterschied</span>
                )}
              </p>
            ) : (
              <p className="text-ink-3">
                Noch kein kalkulierter HCPI – es werden mindestens 3 Ergebnisse benötigt. Es gilt der Start-HCPI.
              </p>
            )}
            <p>
              {status.recordSize > 0 ? (
                <>
                  Berechnet aus den <strong>{usedLabel(status.recordSize)}</strong> Score Differentials
                </>
              ) : (
                <>Noch keine handicap-relevanten Ergebnisse erfasst</>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap content-start gap-1.5 sm:max-w-[16rem] sm:justify-end">
          <Badge tone={status.brake265Active ? "brand" : "neutral"}>
            26,5-Bremse {status.brake265Active ? "aktiv" : "nicht aktiv"}
          </Badge>
          <Badge tone={status.capStatus === "NONE" ? "neutral" : "warning"}>
            Cap: {status.capStatus === "NONE" ? "nicht aktiv" : status.capStatus === "SOFT" ? "Soft Cap" : "Hard Cap"}
          </Badge>
          {status.lowHandicapIndex && <Badge tone="info">Low HCPI {formatHcp(status.lowHandicapIndex.value)}</Badge>}
        </div>
      </div>
      {revision && (
        <div className="border-t border-border bg-surface-2">
          <Button variant="ghost" className="w-full justify-between rounded-none px-5" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            <span>Berechnung anzeigen</span>
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          {open && (
            <div className="px-4 pb-5 sm:px-5">
              <HandicapCalculation revision={revision} roundsById={roundsById} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
