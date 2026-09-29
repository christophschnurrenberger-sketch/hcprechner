"use client";

import { useEffect, useMemo, useState } from "react";
import { defaultRuleSet } from "@/rules/whs/registry";
import { parseDecimal } from "@/lib/courses/csv";
import { todayIso } from "@/lib/whs/dates";
import { evaluateRound } from "@/lib/whs/roundCalculation";
import { blankHoles } from "@/lib/rounds/draft";
import type { HoleInfo, HoleScore, PccValue, Round } from "@/lib/whs/types";
import { HOLE_REASON_TEXTS, issueText } from "@/lib/whs/messages";
import { cn, formatDecimal, formatHcp, formatPcc } from "@/lib/format";
import { useHcp } from "@/components/providers/HcpStoreProvider";
import { Alert, Card, CardBody, CardHeader, Field, Input, PageHeader, Segmented } from "@/components/ui";
import { RatingSelector, type RatingSelection } from "@/components/courses/RatingSelector";
import { ScorecardInput } from "@/components/rounds/ScorecardInput";
import { LoadingState } from "@/components/dashboard/DashboardView";

export function GbeCalculatorView() {
  const { ready, profile, result } = useHcp();
  const [selection, setSelection] = useState<RatingSelection | null>(null);
  const [hcpInput, setHcpInput] = useState<string | null>(null);
  const [pcc, setPcc] = useState<PccValue>(0);
  const holes = selection?.holes ?? 18;
  const [holeData, setHoleData] = useState<HoleInfo[]>(blankHoles(18));
  const [scores, setScores] = useState<HoleScore[]>(Array(18).fill(null));

  // Lochdaten aus der Datenbank übernehmen bzw. Lochzahl anpassen
  useEffect(() => {
    if (selection?.holeData) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHoleData(selection.holeData);
    } else if (holeData.length !== holes) {
      setHoleData(blankHoles(holes));
    }
    if (scores.length !== holes) setScores(Array(holes).fill(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection?.holeData, holes]);

  const hcpValue = hcpInput === null ? result.status.currentHandicapIndex : parseDecimal(hcpInput);
  const hcpValid = hcpValue !== null && !Number.isNaN(hcpValue) && hcpValue >= -10 && hcpValue <= 54;

  const evaluation = useMemo(() => {
    if (!selection?.rating || !hcpValid) return null;
    const now = new Date().toISOString();
    const round: Round = {
      id: "gbe-rechner",
      date: todayIso(),
      sequence: 0,
      title: "GBE-Rechner",
      category: "TOURNAMENT",
      format: "STROKE",
      resultStatus: "NORMAL",
      holes,
      course: { courseName: selection.courseName, country: "DE", teeColor: selection.teeColor, gender: selection.gender },
      rating: selection.rating,
      holeData,
      pcc,
      entry: { mode: "HOLE_BY_HOLE", holeScores: scores },
      createdAt: now,
      updatedAt: now,
    };
    return evaluateRound(round, hcpValue!, defaultRuleSet);
  }, [selection, hcpValid, hcpValue, holes, holeData, scores, pcc]);

  const strokes = useMemo(() => {
    if (!evaluation?.courseHandicap || holeData.some((h) => h.strokeIndex === null)) return null;
    try {
      return defaultRuleSet.allocateStrokes(evaluation.courseHandicap.rounded, holeData);
    } catch {
      return null;
    }
  }, [evaluation, holeData]);

  if (!ready) return <LoadingState />;
  const complete = scores.every((s) => s !== null);

  return (
    <>
      <PageHeader
        title="GBE-Rechner"
        description="Berechnet aus Lochscores das gewertete Bruttoergebnis (Netto-Doppelbogey je Loch) und das Score Differential – ohne die Runde zu speichern."
      />
      <div className="space-y-5">
        <Card>
          <CardHeader title="Platz, Abschlag und HCPI" />
          <CardBody className="space-y-4">
            <RatingSelector date={todayIso()} defaultGender={profile.gender} onChange={setSelection} />
            <div className="flex flex-wrap items-end gap-4">
              <Field label="Handicap Index" htmlFor="g-hcp" hint="Standard: Ihr aktueller HCPI" error={!hcpValid ? "Ungültiger HCPI" : undefined}>
                <Input
                  id="g-hcp"
                  inputMode="decimal"
                  className="w-28"
                  value={hcpInput ?? String(result.status.currentHandicapIndex).replace(".", ",")}
                  onChange={(e) => setHcpInput(e.target.value)}
                />
              </Field>
              <Field label="PCC">
                <Segmented name="PCC" size="sm" value={pcc} onChange={setPcc} options={([-1, 0, 1, 2, 3] as PccValue[]).map((p) => ({ value: p, label: formatPcc(p) }))} />
              </Field>
              {evaluation?.courseHandicap && (
                <p className="text-sm text-ink-2">
                  Course Handicap {holes} Loch: <strong>{evaluation.courseHandicap.rounded}</strong>
                  <span className="text-ink-3"> ({formatDecimal(evaluation.courseHandicap.unrounded, 2)})</span>
                </p>
              )}
            </div>
            {!selection?.rating && <Alert tone="info">Bitte ein Rating wählen oder CR, Slope und Par eingeben.</Alert>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Lochscores" subtitle="Par und HCP (Stroke Index) werden aus der Datenbank geladen oder können eingegeben werden" />
          <CardBody>
            <ScorecardInput
              holes={holeData}
              onHolesChange={setHoleData}
              scores={scores}
              onScoresChange={setScores}
              mode="strokes"
              strokesReceived={strokes}
              editableHoleData={!selection?.holeData}
            />
          </CardBody>
        </Card>

        {evaluation && complete && (
          <Card>
            <CardHeader title="Ergebnis" />
            <CardBody className="space-y-4">
              {evaluation.issues.map((i) => (
                <Alert key={i.code} tone={i.severity === "error" ? "error" : i.severity === "warning" ? "warning" : "info"}>
                  {issueText(i)}
                </Alert>
              ))}
              {evaluation.gbe && (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="tabular w-full text-sm">
                    <thead className="bg-surface-2 text-left text-xs text-ink-3">
                      <tr>
                        <th className="px-3 py-2 font-medium">Loch</th>
                        <th className="px-3 py-2 font-medium">Par</th>
                        <th className="px-3 py-2 font-medium">HCP</th>
                        <th className="px-3 py-2 font-medium">Schläge</th>
                        <th className="px-3 py-2 font-medium">Netto-Doppelbogey</th>
                        <th className="px-3 py-2 font-medium">Gewerteter Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {evaluation.gbe.holes.map((h) => (
                        <tr key={h.number} className="border-t border-border">
                          <td className="px-3 py-1.5">{h.number}</td>
                          <td className="px-3 py-1.5">{h.par}</td>
                          <td className="px-3 py-1.5">{h.strokeIndex}</td>
                          <td className="px-3 py-1.5">{h.raw === "PICKUP" ? "X" : h.raw}</td>
                          <td className="px-3 py-1.5">{h.netDoubleBogey}</td>
                          <td className={cn("px-3 py-1.5 font-semibold", h.reason !== "UNCHANGED" && "text-warning")}>
                            {h.adjusted}
                            {h.reason !== "UNCHANGED" && <span className="ml-2 text-xs font-normal">{HOLE_REASON_TEXTS[h.reason]}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl bg-surface-2 px-4 py-3">
                  <p className="text-xs text-ink-3">Rohscore</p>
                  <p className="tabular text-xl font-semibold">{evaluation.gbe?.rawTotal ?? "–"}</p>
                </div>
                <div className="rounded-xl bg-brand-soft px-4 py-3">
                  <p className="text-xs text-brand">GBE</p>
                  <p className="tabular text-xl font-semibold">{evaluation.gbe?.total ?? "–"}</p>
                </div>
                <div className="rounded-xl bg-surface-2 px-4 py-3">
                  <p className="text-xs text-ink-3">Score Differential</p>
                  <p className="tabular text-xl font-semibold">{formatDecimal(evaluation.scoreDifferential?.value)}</p>
                </div>
                <div className="rounded-xl bg-surface-2 px-4 py-3">
                  <p className="text-xs text-ink-3">mit HCPI</p>
                  <p className="tabular text-xl font-semibold">{formatHcp(hcpValue)}</p>
                </div>
              </div>
              {evaluation.scoreDifferential?.expectedDifferential !== undefined && (
                <p className="tabular text-sm text-ink-2">
                  9 Löcher: gespielt {formatDecimal(evaluation.scoreDifferential.playedDifferential)} + erwartet {formatDecimal(evaluation.scoreDifferential.expectedDifferential)} ={" "}
                  {formatDecimal(evaluation.scoreDifferential.value)}
                </p>
              )}
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
