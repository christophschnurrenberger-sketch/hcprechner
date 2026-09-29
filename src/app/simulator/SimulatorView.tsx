"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Target } from "lucide-react";
import { parseDecimal } from "@/lib/courses/csv";
import { addDays, todayIso } from "@/lib/whs/dates";
import { analyzeTarget, differentialRound, maxGrossForDifferential, simulateRound, WHAT_IF_ROUND_ID } from "@/lib/whs/simulation";
import { handicapIndexInEffectOn } from "@/lib/whs/scoringRecord";
import type { PccValue, Round } from "@/lib/whs/types";
import { issueText } from "@/lib/whs/messages";
import { cn, formatDate, formatDecimal, formatHcp, formatPcc, formatSigned } from "@/lib/format";
import { useHcp } from "@/components/providers/HcpStoreProvider";
import { Alert, Badge, Card, CardBody, CardHeader, Field, Input, PageHeader, Segmented } from "@/components/ui";
import { RatingSelector, type RatingSelection } from "@/components/courses/RatingSelector";
import { WindowChips } from "@/components/handicap/HandicapCalculation";
import { useRoundLookup } from "@/components/handicap/useRoundLookup";
import { LoadingState } from "@/components/dashboard/DashboardView";

function defaultDate(rounds: Round[]): string {
  const today = todayIso();
  const last = rounds.reduce<string | null>((m, r) => (m === null || r.date > m ? r.date : m), null);
  return last && last >= today ? addDays(last, 1) : today;
}

function WhatIf() {
  const { profile, rounds, result } = useHcp();
  const [date, setDate] = useState(() => defaultDate(rounds));
  const [mode, setMode] = useState<"GBE" | "SD">("GBE");
  const [selection, setSelection] = useState<RatingSelection | null>(null);
  const [gross, setGross] = useState("");
  const [sdInput, setSdInput] = useState("");
  const [pcc, setPcc] = useState<PccValue>(0);

  const startHI = handicapIndexInEffectOn(result, date);

  const hypothetical: Round | null = useMemo(() => {
    const now = new Date().toISOString();
    if (mode === "SD") {
      const v = parseDecimal(sdInput);
      return v === null || Number.isNaN(v) ? null : differentialRound(WHAT_IF_ROUND_ID, date, v);
    }
    const g = parseDecimal(gross);
    if (!selection?.rating || g === null || Number.isNaN(g)) return null;
    return {
      id: WHAT_IF_ROUND_ID,
      date,
      sequence: 99,
      title: "Geplante Runde",
      category: "TOURNAMENT",
      format: "STROKE",
      resultStatus: "NORMAL",
      holes: selection.holes,
      course: { courseName: selection.courseName, country: "DE", teeColor: selection.teeColor, gender: selection.gender },
      rating: selection.rating,
      pcc,
      entry: { mode: "AGS", adjustedGrossScore: g },
      createdAt: now,
      updatedAt: now,
    };
  }, [mode, sdInput, gross, selection, date, pcc]);

  const sim = useMemo(() => (hypothetical ? simulateRound(profile, rounds, hypothetical) : null), [hypothetical, profile, rounds]);
  const errors = sim?.round.issues.filter((i) => i.severity === "error") ?? [];

  return (
    <Card>
      <CardHeader title="Was passiert mit meinem HCP?" subtitle="Hypothetische Runde – wird nicht gespeichert" />
      <CardBody className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
          <Field label="Datum der Runde" htmlFor="sim-date">
            <Input id="sim-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
          </Field>
          <Field label="Eingabe">
            <Segmented
              name="Eingabe"
              value={mode}
              onChange={setMode}
              options={[
                { value: "GBE", label: "Platz + GBE" },
                { value: "SD", label: "Score Differential" },
              ]}
            />
          </Field>
        </div>
        {mode === "GBE" ? (
          <>
            <RatingSelector date={date} defaultGender={profile.gender} onChange={setSelection} />
            <div className="flex flex-wrap items-end gap-4">
              <Field label="Geplantes GBE" htmlFor="sim-gbe">
                <Input id="sim-gbe" inputMode="numeric" value={gross} onChange={(e) => setGross(e.target.value)} className="w-32" />
              </Field>
              <Field label="PCC">
                <Segmented name="PCC" size="sm" value={pcc} onChange={setPcc} options={([-1, 0, 1, 2, 3] as PccValue[]).map((p) => ({ value: p, label: formatPcc(p) }))} />
              </Field>
            </div>
          </>
        ) : (
          <Field label="Geplantes Score Differential" htmlFor="sim-sd">
            <Input id="sim-sd" inputMode="decimal" value={sdInput} onChange={(e) => setSdInput(e.target.value)} className="w-32" />
          </Field>
        )}

        {errors.map((i) => (
          <Alert key={i.code} tone="error">
            {issueText(i)}
          </Alert>
        ))}

        {sim && sim.round.scoreDifferential && (
          <div className="space-y-3 rounded-xl border border-brand-2/40 bg-brand-soft/50 p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div>
                <p className="text-xs text-ink-3">Aktueller HCPI</p>
                <p className="tabular text-xl font-semibold">{formatHcp(sim.before.currentHandicapIndex)}</p>
              </div>
              <div>
                <p className="text-xs text-ink-3">Geplantes Score Differential</p>
                <p className="tabular text-xl font-semibold">{formatDecimal(sim.round.scoreDifferential.value)}</p>
                {sim.round.esr && sim.round.esr.reduction !== 0 && <Badge tone="accent">ESR {formatSigned(sim.round.esr.reduction, 0)}</Badge>}
              </div>
              <div>
                <p className="text-xs text-ink-3">Neuer kalkulierter HCPI</p>
                <p className="tabular text-xl font-semibold">{formatHcp(sim.calculatedAfter)}</p>
              </div>
              <div>
                <p className="text-xs text-ink-3">Neuer aktueller HCPI</p>
                <p className="tabular text-xl font-semibold text-brand">{formatHcp(sim.after.currentHandicapIndex)}</p>
              </div>
              <div>
                <p className="text-xs text-ink-3">Änderung</p>
                <p className={cn("tabular text-xl font-semibold", sim.change < 0 ? "text-good" : sim.change > 0 ? "text-critical" : "text-ink")}>
                  {formatSigned(sim.change)}
                </p>
              </div>
            </div>
            <ul className="space-y-1 text-sm text-ink-2">
              <li>
                HCPI am Spieltag (Start-HCPI): <strong>{formatHcp(startHI)}</strong>
                {sim.round.scoreDifferential.expectedDifferential !== undefined && (
                  <> · erwartetes 9-Loch-Differential {formatDecimal(sim.round.scoreDifferential.expectedDifferential)}</>
                )}
              </li>
              <li>
                {sim.counted ? (
                  <>
                    Dieses Ergebnis würde aktuell zu den <strong>besten {sim.usedCount}</strong> von {sim.windowSize} Score Differentials gehören (Rang {sim.rankInWindow}).
                  </>
                ) : sim.usedCount ? (
                  <>
                    Dieses Ergebnis würde <strong>nicht</strong> zu den besten {sim.usedCount} von {sim.windowSize} gehören (Rang {sim.rankInWindow}).
                  </>
                ) : (
                  <>Noch zu wenige Ergebnisse für einen kalkulierten HCPI.</>
                )}
              </li>
              {sim.dropped && (
                <li>
                  Das älteste Ergebnis (SD {formatDecimal(sim.dropped.adjustedSD)} vom {formatDate(sim.dropped.date)}) würde aus den letzten 20 herausfallen
                  {sim.dropped.wasCounted ? " – es zählt derzeit zu den besten Ergebnissen." : " – es zählt derzeit nicht."}
                </li>
              )}
              {sim.after.brake265Applied && <li>Die 26,5-Bremse würde eine Erhöhung verhindern.</li>}
              {sim.after.capStatus !== "NONE" && <li>Cap-Verfahren: {sim.after.capStatus === "SOFT" ? "Soft Cap" : "Hard Cap"} würde greifen.</li>}
            </ul>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function TargetSimulation() {
  const { profile, rounds, result } = useHcp();
  const { roundsById } = useRoundLookup();
  const [targetInput, setTargetInput] = useState("");
  const [scenarioInput, setScenarioInput] = useState("");
  const [selection, setSelection] = useState<RatingSelection | null>(null);
  const target = parseDecimal(targetInput);
  const validTarget = target !== null && !Number.isNaN(target) && target >= -10 && target <= 54;
  const scenarioSd = parseDecimal(scenarioInput);

  const analysis = useMemo(() => {
    if (!validTarget) return null;
    const extra = scenarioSd !== null && !Number.isNaN(scenarioSd) ? [scenarioSd] : undefined;
    return analyzeTarget(profile, rounds, target!, extra ? { scenarioDifferentials: [...extra] } : {});
  }, [validTarget, target, scenarioSd, profile, rounds]);

  const grossHint =
    analysis?.singleRound.maxDifferential != null && selection?.rating?.courseRating != null && selection.rating.slopeRating != null
      ? maxGrossForDifferential({
          targetDifferential: analysis.singleRound.maxDifferential,
          holes: selection.holes,
          courseRating: selection.rating.courseRating,
          slopeRating: selection.rating.slopeRating,
          pcc: 0,
          handicapIndexBeforeRound: handicapIndexInEffectOn(result, analysis.date),
        })
      : null;

  return (
    <Card>
      <CardHeader title="Ziel-HCPI" subtitle="Rein rechnerische Szenarien auf Basis Ihres Scoring Records – keine Erfolgswahrscheinlichkeiten" />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Ziel-HCPI" htmlFor="t-target">
            <Input id="t-target" inputMode="decimal" placeholder="z. B. 45,0" value={targetInput} onChange={(e) => setTargetInput(e.target.value)} className="w-32" />
          </Field>
          <Field label="Eigenes Szenario: Runden mit SD" htmlFor="t-sd" hint="optional">
            <Input id="t-sd" inputMode="decimal" value={scenarioInput} onChange={(e) => setScenarioInput(e.target.value)} className="w-32" />
          </Field>
        </div>
        {analysis && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span>
                Aktuell <strong className="tabular">{formatHcp(analysis.currentHandicapIndex)}</strong>
              </span>
              <ArrowRight className="h-4 w-4 text-ink-3" />
              <span>
                Ziel <strong className="tabular">{formatHcp(analysis.target)}</strong>
              </span>
              {analysis.alreadyReached && <Badge tone="good">bereits erreicht</Badge>}
            </div>
            {!analysis.alreadyReached && (
              <div className="rounded-xl border border-border p-4 text-sm">
                <p className="flex items-center gap-2 font-semibold">
                  <Target className="h-4 w-4 text-brand" /> Mit einer Runde
                </p>
                {analysis.singleRound.anyResult ? (
                  <p className="mt-1 text-ink-2">
                    Mit der nächsten Runde wird das Ziel unabhängig vom Ergebnis rechnerisch erreicht (neuer HCPI höchstens{" "}
                    {formatHcp(analysis.singleRound.resultingHandicapIndex)}) – z. B. durch die Tabellenanpassung bei wenigen Ergebnissen.
                  </p>
                ) : analysis.singleRound.achievable ? (
                  <p className="mt-1 text-ink-2">
                    Nötig wäre ein Score Differential von höchstens <strong className="tabular">{formatDecimal(analysis.singleRound.maxDifferential)}</strong>{" "}
                    (neuer HCPI {formatHcp(analysis.singleRound.resultingHandicapIndex)}).
                    {grossHint !== null && (
                      <>
                        {" "}
                        Auf dem gewählten Rating entspricht das einem GBE von höchstens <strong>{grossHint}</strong> (PCC 0).
                      </>
                    )}
                  </p>
                ) : (
                  <p className="mt-1 text-ink-2">Mit einer einzelnen Runde ist das Ziel rechnerisch nicht erreichbar.</p>
                )}
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-medium text-ink-3">GBE für einen bestimmten Platz umrechnen</summary>
                  <div className="mt-3">
                    <RatingSelector date={analysis.date} defaultGender={profile.gender} onChange={setSelection} />
                  </div>
                </details>
              </div>
            )}
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="tabular w-full text-sm">
                <thead className="bg-surface-2 text-left text-xs text-ink-3">
                  <tr>
                    <th className="px-3 py-2 font-medium">Szenario: jede weitere Runde mit SD</th>
                    <th className="px-3 py-2 text-right font-medium">Runden bis zum Ziel</th>
                    <th className="px-3 py-2 text-right font-medium">HCPI danach</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.scenarios.map((s) => (
                    <tr key={s.scoreDifferential} className="border-t border-border">
                      <td className="px-3 py-2">{formatDecimal(s.scoreDifferential)}</td>
                      <td className="px-3 py-2 text-right">{s.roundsNeeded ?? "nicht innerhalb von 20 Runden"}</td>
                      <td className="px-3 py-2 text-right">{formatHcp(s.resultingHandicapIndex)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {analysis.nextToDrop.length > 0 && (
              <div className="text-sm">
                <p className="font-semibold">Diese alten Ergebnisse würden der Reihe nach ersetzt:</p>
                <ol className="mt-2 flex flex-wrap gap-1.5">
                  {analysis.nextToDrop.map((w) => (
                    <li key={w.roundId} className={cn("tabular rounded-md border px-2 py-1 text-xs", w.counted ? "border-brand-2 bg-brand-soft text-brand" : "border-border text-ink-2")}>
                      {w.order}. {formatDate(w.date)} · SD {formatDecimal(w.adjustedSD)}
                      {w.counted && " (zählt)"}
                    </li>
                  ))}
                </ol>
                <p className="mt-1 text-xs text-ink-3">Fällt ein gezähltes Ergebnis heraus, kann der HCPI trotz guter Runde steigen.</p>
              </div>
            )}
            <div>
              <p className="mb-2 text-sm font-semibold">Aktuelle 20 Score Differentials</p>
              <WindowChips window={result.status.window} roundsById={roundsById} />
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export function SimulatorView() {
  const { ready } = useHcp();
  if (!ready) return <LoadingState />;
  return (
    <>
      <PageHeader title="HCP-Simulator" description="Was-wäre-wenn-Rechnung für zukünftige Runden und Ziel-HCPI-Szenarien – mit derselben Engine wie der Scoring Record." />
      <div className="space-y-5">
        <WhatIf />
        <TargetSimulation />
      </div>
    </>
  );
}
