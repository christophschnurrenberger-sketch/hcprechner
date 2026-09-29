"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ClipboardList, PlusCircle, Sparkles } from "lucide-react";
import { calculateStatistics } from "@/lib/whs/statistics";
import { formatDate, formatDecimal, formatHcp } from "@/lib/format";
import { issueText } from "@/lib/whs/messages";
import { useHcp } from "@/components/providers/HcpStoreProvider";
import { Alert, Button, ButtonLink, Card, CardBody, CardHeader, Segmented, Stat } from "@/components/ui";
import { HandicapHero } from "@/components/handicap/HandicapHero";
import { HandicapChart } from "@/components/handicap/HandicapChart";
import { WindowChips, usedLabel } from "@/components/handicap/HandicapCalculation";
import { useRoundLookup } from "@/components/handicap/useRoundLookup";

export function LoadingState() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="h-40 animate-pulse rounded-2xl bg-surface-3" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-3" />
        ))}
      </div>
      <span className="sr-only">Daten werden geladen…</span>
    </div>
  );
}

function Onboarding() {
  const { loadExampleData, profile } = useHcp();
  return (
    <Card className="overflow-hidden">
      <div className="grid gap-6 p-6 md:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">Willkommen</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Ihr Handicap Index – nachvollziehbar nach WHS/DGV 2026</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-2">
            Erfassen Sie Ihre handicap-relevanten Runden. Der Rechner bestimmt für jede Runde das Score Differential, rekonstruiert
            den HCPI chronologisch (inklusive 9-Loch-Berechnung, außergewöhnlicher Ergebnisse, Low HCPI, Soft/Hard Cap und
            26,5-Bremse) und zeigt jeden Rechenschritt.
          </p>
          <ol className="mt-4 space-y-2 text-sm text-ink-2">
            <li>
              <strong>1.</strong> Start-HCPI in den <Link className="text-brand underline" href="/einstellungen">Einstellungen</Link> festlegen
              (aktuell {formatHcp(profile.startHandicapIndex)}).
            </li>
            <li>
              <strong>2.</strong> Bisherigen Scoring Record übernehmen: bis zu 20 Score Differentials aus Ihrem DGV-Scoring-Record
              (Eingabeart „Score Differential übernehmen“).
            </li>
            <li>
              <strong>3.</strong> Neue Runden mit Platz, Abschlag und GBE bzw. Scorekarte erfassen.
            </li>
          </ol>
          <div className="mt-5 flex flex-wrap gap-2">
            <ButtonLink href="/runde-erfassen">
              <PlusCircle className="h-4 w-4" /> Erste Runde erfassen
            </ButtonLink>
            <Button variant="secondary" onClick={loadExampleData}>
              <Sparkles className="h-4 w-4" /> Beispieldaten ansehen
            </Button>
          </div>
        </div>
        <div className="rounded-xl bg-brand-soft p-4 text-sm text-ink-2">
          <p className="font-semibold text-ink">Local Mode</p>
          <p className="mt-1">
            Ihre Runden werden nur in diesem Browser gespeichert. Es ist kein Konto nötig. Export (CSV, JSON, PDF) und eine optionale
            Synchronisation finden Sie in den Einstellungen.
          </p>
          <p className="mt-3 font-semibold text-ink">Beispieldaten</p>
          <p className="mt-1">
            Fiktive Score Differentials zum Ausprobieren – ohne echte Platzdaten. Sie können jederzeit wieder entfernt werden.
          </p>
        </div>
      </div>
    </Card>
  );
}

export function DashboardView() {
  const { ready, rounds, result, hasExampleData, removeExampleData } = useHcp();
  const { roundsById } = useRoundLookup();
  const [sortBy, setSortBy] = useState<"value" | "date">("value");
  const stats = useMemo(() => calculateStatistics(result, rounds), [result, rounds]);

  if (!ready) return <LoadingState />;
  if (rounds.length === 0) return <Onboarding />;

  const status = result.status;
  const window = status.window;
  const bestSd = window.length ? Math.min(...window.map((w) => w.adjustedSD)) : null;
  const worstSd = window.length ? Math.max(...window.map((w) => w.adjustedSD)) : null;
  const last = stats.lastRound;
  const lastRound = last ? roundsById.get(last.roundId) : null;
  const recordInfo = result.issues.find((i) => i.code === "RECORD_BELOW_WINDOW");

  return (
    <div className="space-y-5">
      {hasExampleData && (
        <Alert tone="info" title="Beispieldaten aktiv">
          Einige Runden sind fiktive Beispiele (nur Score Differentials).{" "}
          <button type="button" className="font-medium text-brand underline" onClick={removeExampleData}>
            Beispieldaten entfernen
          </button>
        </Alert>
      )}

      <HandicapHero result={result} roundsById={roundsById} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat
          label="Score Differentials"
          value={`${status.recordSize} / 20`}
          sub={status.recordSize > 0 ? usedLabel(status.recordSize) : "noch keine"}
          info="Anzahl der handicap-relevanten Ergebnisse im aktuellen Scoring Record (maximal die jüngsten 20)."
        />
        <Stat
          label={`Durchschnitt beste ${status.usedCount ?? 8}`}
          value={formatDecimal(stats.countedAverage, 2)}
          sub={status.adjustment ? `zzgl. Anpassung ${formatDecimal(status.adjustment)}` : "ohne Anpassung"}
        />
        <Stat
          label="Low Handicap Index"
          value={status.lowHandicapIndex ? formatHcp(status.lowHandicapIndex.value) : "–"}
          sub={status.lowHandicapIndex ? `seit ${formatDate(status.lowHandicapIndex.effectiveFrom)}` : "ab 20 Ergebnissen"}
          info="Niedrigster HCPI der letzten 365 Tage vor dem jüngsten Ergebnis – Grundlage für Soft Cap und Hard Cap."
        />
        <Stat
          label="26,5-Bremse"
          value={status.brake265Active ? "aktiv" : "nicht aktiv"}
          sub={status.brake265Applied ? "begrenzt aktuell den HCPI" : "ohne Wirkung"}
          info="Zwischen 54,0 und 26,5 werden in Deutschland nur Verbesserungen automatisch wirksam."
        />
        <Stat
          label="Cap"
          value={status.capStatus === "NONE" ? "nicht aktiv" : status.capStatus === "SOFT" ? "Soft Cap" : "Hard Cap"}
          tone={status.capStatus === "NONE" ? undefined : "warning"}
          info="Soft Cap: Anstieg > 3,0 über Low HCPI wird halbiert. Hard Cap: maximal 5,0 über Low HCPI."
        />
        <Stat
          label="Letzte Runde"
          value={last ? formatDecimal(last.scoreDifferential?.value) : "–"}
          sub={last && lastRound ? `${formatDate(last.date)} · ${lastRound.title}` : undefined}
        />
        <Stat label="Bestes Score Differential" value={formatDecimal(bestSd)} sub="in den letzten 20" />
        <Stat label="Schlechtestes Score Differential" value={formatDecimal(worstSd)} sub="in den letzten 20" />
        <Stat label="9-Loch-Runden" value={stats.nineHoleRounds} sub="handicap-relevant" />
        <Stat label="18-Loch-Runden" value={stats.eighteenHoleRounds + stats.partialRounds} sub={stats.partialRounds ? `davon ${stats.partialRounds} abgebrochen` : "handicap-relevant"} />
      </div>

      {recordInfo && <Alert tone="info">{issueText(recordInfo)}</Alert>}

      <Card>
        <CardHeader title="Handicap-Entwicklung" subtitle="HCPI nach jeder Runde, kalkulierter HCPI, Low HCPI und Score Differentials" />
        <CardBody>
          <HandicapChart result={result} rounds={rounds} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Scoring Record"
          subtitle="Die jüngsten 20 Score Differentials – hervorgehoben sind die Ergebnisse, die in den HCPI einfließen"
          action={
            <Segmented
              name="Sortierung"
              size="sm"
              value={sortBy}
              onChange={setSortBy}
              options={[
                { value: "value", label: "Nach Wert" },
                { value: "date", label: "Neueste zuerst" },
              ]}
            />
          }
        />
        <CardBody>
          {window.length > 0 ? <WindowChips window={window} roundsById={roundsById} sortBy={sortBy} /> : <p className="text-sm text-ink-3">Noch keine Ergebnisse.</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <ButtonLink href="/scoring-record" variant="secondary" size="sm">
              <ClipboardList className="h-4 w-4" /> Scoring Record öffnen
            </ButtonLink>
            <ButtonLink href="/runde-erfassen" variant="subtle" size="sm">
              <PlusCircle className="h-4 w-4" /> Runde erfassen
            </ButtonLink>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
