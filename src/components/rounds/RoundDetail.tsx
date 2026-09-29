"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Pencil, Trash2, ArrowLeft } from "lucide-react";
import { defaultRuleSet } from "@/rules/whs/registry";
import { cn, formatDate, formatDecimal, formatHcp, formatPcc, formatSigned } from "@/lib/format";
import {
  CATEGORY_LABELS,
  ENTRY_MODE_LABELS,
  EXCLUSION_TEXTS,
  FORMAT_LABELS,
  HOLE_REASON_TEXTS,
  METHOD_LABELS,
  RESULT_STATUS_LABELS,
  SOURCE_TYPE_LABELS,
} from "@/lib/whs/messages";
import { genderLabel } from "@/lib/courses/tees";
import type { Round, RoundResult } from "@/lib/whs/types";
import { useHcp } from "@/components/providers/HcpStoreProvider";
import { Alert, Badge, Button, ButtonLink, Card, CardBody, CardHeader, Dialog, InfoTip, KeyValue } from "@/components/ui";
import { HandicapCalculation } from "@/components/handicap/HandicapCalculation";
import { useRoundLookup } from "@/components/handicap/useRoundLookup";
import { RoundResultSummary } from "./RoundResultSummary";
import { LoadingState } from "@/components/dashboard/DashboardView";

function Formula({ children }: { children: React.ReactNode }) {
  return <div className="tabular overflow-x-auto rounded-lg bg-surface-2 px-3 py-2 font-mono text-[13px] leading-relaxed">{children}</div>;
}

function DifferentialPath({ round, result }: { round: Round; result: RoundResult }) {
  const sd = result.scoreDifferential;
  if (!sd) return <p className="text-sm text-ink-3">Kein Score Differential berechenbar.</p>;
  const f = (v: number | null | undefined) => formatDecimal(v ?? null);
  if (sd.method === "DIRECT") {
    return (
      <div className="space-y-2 text-sm">
        <p>Das Score Differential wurde aus einem offiziellen Scoring Record übernommen:</p>
        <Formula>SD = {f(sd.value)}</Formula>
        {round.entry.officialHandicapIndexAfter != null && <p>Offizieller HCPI nach dieser Runde: {formatHcp(round.entry.officialHandicapIndexAfter)} (überschreibt die Rekonstruktion).</p>}
      </div>
    );
  }
  if (sd.method === "EIGHTEEN" || sd.method === "PARTIAL_NET_PAR") {
    return (
      <div className="space-y-2 text-sm">
        <Formula>
          SD = (113 / Slope) × (GBE − CR − PCC)
          <br />= (113 / {sd.slopeRating}) × ({sd.adjustedGrossScore} − {f(sd.courseRating)} − {formatPcc(sd.pccApplied)})
          <br />= {formatDecimal(113 / (sd.slopeRating ?? 113), 4)} × {formatDecimal((sd.adjustedGrossScore ?? 0) - (sd.courseRating ?? 0) - sd.pccApplied, 1)}
          <br />= {formatDecimal(sd.unrounded, 4)}
          <br />
          gerundet: <strong>{f(sd.value)}</strong>
        </Formula>
      </div>
    );
  }
  return (
    <div className="space-y-2 text-sm">
      <p className="font-medium">Schritt 1 – gespielte neun Löcher{sd.nineUsed ? ` (${sd.nineUsed === "FRONT" ? "Löcher 1–9" : "Löcher 10–18"})` : ""}</p>
      <Formula>
        SD₉ = (GBE₉ − CR₉ − PCC₉) × 113 / Slope₉
        <br />= ({sd.adjustedGrossScore} − {f(sd.courseRating)} − {formatPcc(sd.pccApplied)}) × 113 / {sd.slopeRating}
        <br />= {formatDecimal(sd.playedDifferentialUnrounded ?? null, 4)} → <strong>{f(sd.playedDifferential)}</strong>
      </Formula>
      {sd.pcc !== 0 && (
        <p className="text-xs text-ink-3">
          PCC des Tages {formatPcc(sd.pcc)} → für 9 Löcher nach DGV-Tabelle {formatPcc(sd.pccApplied)}.
        </p>
      )}
      <p className="font-medium">Schritt 2 – erwartetes Differential für die nicht gespielten neun Löcher</p>
      <Formula>
        SD₉ erwartet = ((HCPI × 1,04) + 2,4) / 2
        <br />= (({formatHcp(sd.handicapIndexForExpected)} × 1,04) + 2,4) / 2 = {formatDecimal(sd.expectedDifferentialUnrounded ?? null, 3)} → <strong>{f(sd.expectedDifferential)}</strong>
      </Formula>
      <p className="text-xs text-ink-3">Verwendet wird der HCPI zu Beginn des Spieltags ({formatDate(round.date)}), nicht der heutige.</p>
      <p className="font-medium">Schritt 3 – 18-Loch-Score-Differential</p>
      <Formula>
        SD₁₈ = {f(sd.playedDifferential)} + {f(sd.expectedDifferential)} = <strong>{f(sd.value)}</strong>
      </Formula>
    </div>
  );
}

export function RoundDetail({ id }: { id: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const { ready, settings, deleteRound } = useHcp();
  const { roundsById, resultsById } = useRoundLookup();
  const [confirm, setConfirm] = useState(false);

  if (!ready) return <LoadingState />;
  const round = roundsById.get(id);
  const result = resultsById.get(id);
  if (!round || !result) {
    return (
      <Alert tone="error" title="Runde nicht gefunden">
        <Link href="/runden" className="underline">
          Zu meinen Runden
        </Link>
      </Alert>
    );
  }
  const gbe = result.gbe;
  const ch = result.courseHandicap;
  const showDebug = settings.debugMode || process.env.NODE_ENV === "development";

  return (
    <div className="space-y-5">
      {params.get("gespeichert") && <Alert tone="success" title="Runde gespeichert">Der Scoring Record wurde chronologisch neu berechnet.</Alert>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/runden" className="mb-1 inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
            <ArrowLeft className="h-4 w-4" /> Meine Runden
          </Link>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{round.title}</h1>
          <p className="text-sm text-ink-3">
            {formatDate(round.date)} · {round.course.courseName}
            {round.course.layoutName ? ` · ${round.course.layoutName}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <ButtonLink href={`/runde-erfassen?edit=${encodeURIComponent(round.id)}`} variant="secondary" size="sm">
            <Pencil className="h-4 w-4" /> Bearbeiten
          </ButtonLink>
          <Button variant="ghost" size="sm" onClick={() => setConfirm(true)}>
            <Trash2 className="h-4 w-4" /> Löschen
          </Button>
        </div>
      </div>

      <RoundResultSummary round={round} result={result} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Gespielte Runde" subtitle="Unveränderlich gespeicherte Daten dieser Runde" />
          <CardBody>
            <KeyValue
              items={[
                { label: "Golfanlage", value: round.course.courseName },
                ...(round.course.layoutName ? [{ label: "Platz", value: round.course.layoutName }] : []),
                { label: "Abschlag", value: [round.course.teeColor, round.course.teeName].filter(Boolean).join(" · ") || "–" },
                { label: "Geschlecht", value: genderLabel(round.course.gender) },
                {
                  label: "Löcher",
                  value: `${round.holes === 9 ? "9" : "18"}${round.holesPlayed != null && round.holes === 18 && round.holesPlayed < 18 ? ` (abgebrochen nach ${round.holesPlayed})` : ""}${round.rating.nine ? ` · ${round.rating.nine === "FRONT" ? "Front Nine" : "Back Nine"}` : ""}`,
                },
                { label: "Par", value: round.rating.par ?? "–" },
                { label: "Course Rating", value: formatDecimal(round.rating.courseRating) },
                { label: "Slope Rating", value: round.rating.slopeRating ?? "–" },
                { label: "PCC", value: formatPcc(round.pcc) },
                { label: "Rundentyp", value: `${CATEGORY_LABELS[round.category]} · ${FORMAT_LABELS[round.format]}` },
                { label: "Ergebnisart", value: RESULT_STATUS_LABELS[round.resultStatus].label },
                { label: "Eingabe", value: ENTRY_MODE_LABELS[round.entry.mode] },
                { label: "Start-HCPI", value: formatHcp(result.startHandicapIndex), info: "HCPI zu Beginn des Spieltags. Alle Runden eines Tages erhalten denselben Start-HCPI." },
              ]}
            />
            <div className="mt-4 rounded-lg bg-surface-2 p-3 text-xs text-ink-2">
              <p className="font-semibold text-ink">Quelle der Platzdaten</p>
              {round.rating.manual ? (
                <p>Manuell eingegeben (z. B. offizielle Scorekarte / Auslandsrunde).</p>
              ) : round.entry.mode === "SCORE_DIFFERENTIAL" && round.rating.courseRating == null ? (
                <p>Keine – Score Differential übernommen.</p>
              ) : (
                <p>
                  {round.rating.sourceType ? SOURCE_TYPE_LABELS[round.rating.sourceType] ?? round.rating.sourceType : "–"}
                  {round.rating.sourceUrl && (
                    <>
                      {" "}
                      ·{" "}
                      <a href={round.rating.sourceUrl} target="_blank" rel="noreferrer" className="underline">
                        Quelle öffnen
                      </a>
                    </>
                  )}
                  {" · "}Datum der Überprüfung: {formatDate(round.rating.checkedAt)}
                  {round.rating.verified === false && <Badge tone="warning" className="ml-2">nicht verifiziert</Badge>}
                </p>
              )}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Score Differential"
            subtitle={result.scoreDifferential ? METHOD_LABELS[result.scoreDifferential.method] : undefined}
            action={
              <InfoTip>
                Für 9 Löcher wird das tatsächliche 9-Loch-Score-Differential mit einem statistisch erwarteten Differential für die nicht gespielten
                neun Löcher ergänzt.
              </InfoTip>
            }
          />
          <CardBody className="space-y-4">
            <DifferentialPath round={round} result={result} />
            {result.esr && (
              <div className="text-sm">
                <p className="font-medium">Außergewöhnliches Ergebnis</p>
                <Formula>
                  HCPI vor Runde − SD = {formatHcp(result.startHandicapIndex)} − {formatDecimal(result.scoreDifferential?.value)} = {formatDecimal(result.esr.difference)}
                  <br />→ {result.esr.reduction === 0 ? "kein ESR (unter 7,0)" : `ESR ${formatSigned(result.esr.reduction, 0)} (${result.esr.reduction === -1 ? "≥ 7,0" : "≥ 10,0"})`}
                </Formula>
                {result.esr.reduction !== 0 && (
                  <p className="mt-1 text-xs text-ink-3">
                    Der Abzug wird auf dieses und die vorhergehenden Score Differentials unter den jüngsten 20 angewendet (originalSD bleibt gespeichert).
                  </p>
                )}
              </div>
            )}
            {result.inRecord && (
              <p className="text-sm">
                Im Scoring Record: original <strong className="tabular">{formatDecimal(result.scoreDifferential?.value)}</strong>
                {result.finalEsrTotal !== 0 && (
                  <>
                    {" "}
                    · ESR gesamt {formatSigned(result.finalEsrTotal, 0)} · angepasst <strong className="tabular">{formatDecimal(result.finalAdjustedSD)}</strong>
                  </>
                )}{" "}
                · aktuell{" "}
                {result.currentlyCounted ? (
                  <Badge tone="good">fließt in den HCPI ein</Badge>
                ) : (
                  <Badge>{result.currentExclusionReason ? EXCLUSION_TEXTS[result.currentExclusionReason] : "–"}</Badge>
                )}
              </p>
            )}
          </CardBody>
        </Card>
      </div>

      {gbe && ch && (
        <Card>
          <CardHeader
            title="GBE-Berechnung"
            subtitle={`Course Handicap ${ch.kind === 9 ? "9 Loch" : "18 Loch"}: ${ch.rounded} · Netto-Doppelbogey = Par + 2 + Vorgabenschläge`}
          />
          <CardBody className="space-y-3">
            <Formula>
              {ch.kind === 9 ? (
                <>
                  Course Handicap₉ = (HCPI / 2) × (Slope₉ / 113) + (CR₉ − Par₉)
                  <br />= {formatDecimal(ch.halvedHandicapIndex ?? null)} × ({ch.slopeRating} / 113) + ({formatDecimal(ch.courseRating)} − {ch.par}) = {formatDecimal(ch.unrounded, 3)} →{" "}
                  <strong>{ch.rounded}</strong>
                </>
              ) : (
                <>
                  Course Handicap = HCPI × (Slope / 113) + (CR − Par)
                  <br />= {formatHcp(ch.handicapIndex)} × ({ch.slopeRating} / 113) + ({formatDecimal(ch.courseRating)} − {ch.par}) = {formatDecimal(ch.unrounded, 3)} → <strong>{ch.rounded}</strong>
                </>
              )}
            </Formula>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="tabular w-full text-sm">
                <thead className="bg-surface-2 text-left text-xs text-ink-3">
                  <tr>
                    <th className="px-3 py-2 font-medium">Loch</th>
                    <th className="px-3 py-2 font-medium">Par</th>
                    <th className="px-3 py-2 font-medium">HCP</th>
                    <th className="px-3 py-2 font-medium">Vorgabe</th>
                    <th className="px-3 py-2 font-medium">Rohscore</th>
                    <th className="px-3 py-2 font-medium">NDB</th>
                    <th className="px-3 py-2 font-medium">WHS-Wertung</th>
                    <th className="px-3 py-2 font-medium">Grund</th>
                  </tr>
                </thead>
                <tbody>
                  {gbe.holes.map((h) => (
                    <tr key={h.number} className={cn("border-t border-border", h.reason === "NOT_COUNTED" && "text-ink-3")}>
                      <td className="px-3 py-1.5 font-medium">{h.number}</td>
                      <td className="px-3 py-1.5">{h.par}</td>
                      <td className="px-3 py-1.5">{h.strokeIndex ?? "–"}</td>
                      <td className="px-3 py-1.5">{h.strokesReceived}</td>
                      <td className="px-3 py-1.5">{h.raw === "PICKUP" ? "X" : h.raw ?? "–"}{h.stablefordPoints != null && <span className="ml-1 text-xs text-ink-3">({h.stablefordPoints} P.)</span>}</td>
                      <td className="px-3 py-1.5">{h.netDoubleBogey}</td>
                      <td className="px-3 py-1.5 font-semibold">{h.adjusted ?? "–"}</td>
                      <td className={cn("px-3 py-1.5 text-xs", h.reason === "UNCHANGED" ? "text-ink-3" : "text-warning")}>{HOLE_REASON_TEXTS[h.reason]}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-border-strong bg-surface-2 font-semibold">
                  <tr>
                    <td className="px-3 py-2">Gesamt</td>
                    <td className="px-3 py-2">{gbe.holes.reduce((a, h) => a + h.par, 0)}</td>
                    <td />
                    <td className="px-3 py-2">{gbe.holes.reduce((a, h) => a + h.strokesReceived, 0)}</td>
                    <td className="px-3 py-2">{gbe.rawTotal ?? "–"}</td>
                    <td />
                    <td className="px-3 py-2">GBE {gbe.total}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      {result.revision && (
        <Card>
          <CardHeader
            title={`HCPI-Berechnung nach dem Spieltag ${formatDate(round.date)}`}
            subtitle={`HCPI vor Runde ${formatHcp(result.startHandicapIndex)} → kalkuliert ${formatHcp(result.revision.calculatedHandicapIndex)} → aktuell ${formatHcp(result.revision.currentHandicapIndex)}`}
          />
          <CardBody>
            <HandicapCalculation revision={result.revision} roundsById={roundsById} />
          </CardBody>
        </Card>
      )}

      {showDebug && (
        <Card>
          <CardHeader title="Debug-Objekt" subtitle="Technischer Rechenweg (Entwicklungsmodus / Einstellung „Debug-Modus“)" />
          <CardBody>
            <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 text-xs">{JSON.stringify(result.debug, null, 2)}</pre>
            <p className="mt-2 text-xs text-ink-3">Regelset: {defaultRuleSet.label}</p>
          </CardBody>
        </Card>
      )}

      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Runde löschen?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(false)}>
              Abbrechen
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                deleteRound(round.id);
                router.push("/runden");
              }}
            >
              Löschen
            </Button>
          </>
        }
      >
        „{round.title}“ vom {formatDate(round.date)} wird gelöscht. Der HCPI-Verlauf wird anschließend ohne diese Runde neu berechnet.
      </Dialog>
    </div>
  );
}
