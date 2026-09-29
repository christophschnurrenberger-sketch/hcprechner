import type { Metadata } from "next";
import { defaultRuleSet } from "@/rules/whs/registry";
import { formatDecimal, formatPcc, formatSigned } from "@/lib/format";
import { SOURCE_TYPE_LABELS } from "@/lib/whs/messages";
import { SOURCE_PRIORITY } from "@/lib/courses/types";
import { Alert, Card, CardBody, CardHeader, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Rechenregeln & Methodik" };

function Formula({ children }: { children: React.ReactNode }) {
  return <div className="tabular my-2 overflow-x-auto rounded-lg bg-surface-2 px-3 py-2 font-mono text-[13px]">{children}</div>;
}

export default function MethodPage() {
  const cfg = defaultRuleSet.config;
  return (
    <>
      <PageHeader
        title="Rechenregeln & Methodik"
        description={`${cfg.label}. Alle Werte auf dieser Seite werden direkt aus der Regelkonfiguration gelesen, die auch die Berechnung verwendet.`}
      />
      <div className="space-y-5 text-sm leading-relaxed text-ink-2">
        <Alert tone="info" title="Kein altes EGA-System">
          Es gibt keine Stableford-Pufferzonen, keine Vorgabenklassen und keine Herauf-/Herabsetzung pro Runde. Zentrale Bewertungsgröße ist das Score
          Differential.
        </Alert>

        <Card>
          <CardHeader title="Score Differential" />
          <CardBody>
            <Formula>SD = ({cfg.slope.standard} / Slope) × (GBE − Course Rating − PCC), gerundet auf 0,1</Formula>
            <p>
              PCC ist standardmäßig 0; zulässig sind {cfg.pcc.allowed.map((p) => formatPcc(p)).join(", ")}. Slope Ratings liegen zwischen {cfg.slope.min} und{" "}
              {cfg.slope.max}.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Handicap Index aus dem Scoring Record" />
          <CardBody>
            <p>
              Berücksichtigt werden die jüngsten {cfg.handicapIndex.windowSize} handicap-relevanten Score Differentials. Unter{" "}
              {cfg.handicapIndex.minimumScores} Ergebnissen gibt es keinen kalkulierten HCPI (es gilt der Start-HCPI). Höchstwert:{" "}
              {formatDecimal(cfg.handicapIndex.maximum)}.
            </p>
            <table className="tabular mt-3 w-full max-w-md text-sm">
              <thead className="text-left text-xs text-ink-3">
                <tr>
                  <th className="py-1 font-medium">Ergebnisse</th>
                  <th className="py-1 font-medium">verwendet</th>
                  <th className="py-1 font-medium">Anpassung</th>
                </tr>
              </thead>
              <tbody>
                {cfg.handicapIndex.table.map((row) => (
                  <tr key={row.minScores} className="border-t border-border">
                    <td className="py-1">{row.minScores === row.maxScores ? row.minScores : `${row.minScores}–${row.maxScores}`}</td>
                    <td className="py-1">{row.count === 1 ? "bestes" : `Durchschnitt der besten ${row.count}`}</td>
                    <td className="py-1">{row.adjustment === 0 ? "–" : formatSigned(row.adjustment)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Chronologie und Tageslogik" />
          <CardBody className="space-y-2">
            <p>
              Alle Runden werden nach Datum (und Reihenfolge am Tag) sortiert. Jede Runde erhält als Start-HCPI den Handicap Index, der zu Beginn ihres
              Spieltags galt. Alle Runden desselben Tages erhalten denselben Start-HCPI; erst nach dem Spieltag wird der neue HCPI bestimmt, der ab dem
              Folgetag gilt.
            </p>
            <p>
              Gespeicherte Runden behalten ihr verwendetes Rating (CR, Slope, Par, Abschlag, Layout) dauerhaft. Ändert ein Club später seine Bewertung,
              werden alte Runden nicht mit den neuen Werten gerechnet.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="9-Loch-Runden" />
          <CardBody>
            <Formula>
              SD₉ gespielt = (GBE₉ − CR₉ − PCC₉) × 113 / Slope₉
              <br />
              SD₉ erwartet = ((HCPI × {formatDecimal(cfg.nineHole.expectedFactor, 2)}) + {formatDecimal(cfg.nineHole.expectedConstant)}) / {cfg.nineHole.divisor}
              <br />
              SD₁₈ = SD₉ gespielt + SD₉ erwartet
            </Formula>
            <p>
              Verwendet wird der HCPI vor der Runde (Beginn des Spieltags). Beide Teilwerte werden auf 0,1 gerundet und addiert. Es werden nie zwei
              9-Loch-Runden kombiniert. Es wird immer das offizielle 9-Loch-Rating verwendet – nie CR₁₈/2 oder Slope₁₈.
            </p>
            <p className="mt-2">PCC für 9 Löcher (DGV):</p>
            <table className="tabular mt-1 text-sm">
              <tbody>
                <tr>
                  <th className="pr-3 text-left text-xs font-medium text-ink-3">PCC des Tages</th>
                  {cfg.pcc.allowed.map((p) => (
                    <td key={p} className="px-2 text-center">
                      {formatPcc(p)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th className="pr-3 text-left text-xs font-medium text-ink-3">9 Löcher</th>
                  {cfg.pcc.allowed.map((p) => (
                    <td key={p} className="px-2 text-center">
                      {formatPcc(cfg.pcc.nineHole[String(p)])}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Course Handicap und GBE" />
          <CardBody>
            <Formula>
              Course Handicap₁₈ = HCPI × (Slope / 113) + (CR − Par)
              <br />
              Course Handicap₉ = (HCPI / 2, auf 0,1 gerundet) × (Slope₉ / 113) + (CR₉ − Par₉)
              <br />
              Netto-Doppelbogey = Par + {cfg.netDoubleBogey.strokesOverPar} + Vorgabenschläge des Lochs
            </Formula>
            <p>
              Das Course Handicap wird erst am Ende auf eine ganze Zahl gerundet und mit dem Stroke Index auf die Löcher verteilt. Jeder Lochscore wird
              höchstens mit Netto-Doppelbogey gewertet; ein nicht beendetes Loch zählt als Netto-Doppelbogey. Rohschläge bleiben unverändert gespeichert.
            </p>
            <p className="mt-2">
              Stableford ist nur eine Spielform: Aus lochweisen Punkten wird der gewertete Lochscore bestimmt. Aus der Gesamtpunktzahl ist das GBE nur
              eindeutig, wenn mit 100 % des Course Handicaps gewertet wurde (GBE = Par + CH + 2 × Löcher − Punkte).
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Außergewöhnliche Ergebnisse (ESR)" />
          <CardBody>
            <p>Differenz = HCPI vor der Runde − Score Differential.</p>
            <ul className="mt-1 list-disc pl-5">
              {cfg.esr.thresholds.map((t) => (
                <li key={t.minDifference}>
                  mindestens {formatDecimal(t.minDifference)} → {t.reduction}
                </li>
              ))}
            </ul>
            <p className="mt-2">
              Der Abzug wird am Ende des Spieltags auf die jüngsten {cfg.esr.appliesToMostRecent} Score Differentials angewendet (einschließlich des
              außergewöhnlichen). Original- und angepasstes Differential werden getrennt geführt; spätere Runden erhalten den Abzug nicht. Mehrere
              außergewöhnliche Ergebnisse an einem Tag werden addiert.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Low Handicap Index, Soft Cap, Hard Cap" />
          <CardBody>
            <p>
              Ab {cfg.lowHandicapIndex.minimumScores} Ergebnissen: niedrigster HCPI der letzten {cfg.lowHandicapIndex.windowDays} Tage vor dem jüngsten
              Ergebnis (aus dem historischen HCPI-Verlauf, nicht das Minimum aller Werte).
            </p>
            <Formula>
              Soft Cap: Anstieg über {formatDecimal(cfg.caps.softThreshold)} wird mit Faktor {formatDecimal(cfg.caps.softFactor)} gewertet
              <br />
              Hard Cap: höchstens Low HCPI + {formatDecimal(cfg.caps.hardLimit)}
            </Formula>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="26,5-Bremse (Deutschland)" />
          <CardBody>
            <p>
              Zwischen 54,0 und {formatDecimal(cfg.brake265.threshold)} werden nur Verbesserungen automatisch wirksam. Liegt der HCPI darunter, erfolgt eine
              Heraufsetzung höchstens bis {formatDecimal(cfg.brake265.threshold)}. Wurde die Bremse auf Antrag aufgehoben, gilt der Wert nach Cap-Verfahren.
              Deshalb werden kalkulierter HCPI (rechnerisch aus dem Scoring Record) und aktueller HCPI getrennt angezeigt.
            </p>
            <Formula>Kalkulierter HCPI → Soft Cap → Hard Cap → Höchstwert 54,0 → 26,5-Bremse → Aktueller HCPI</Formula>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Abgebrochene 18-Loch-Runden (10–17 Löcher)" />
          <CardBody className="space-y-2">
            <p>
              Eigene Routine, getrennt von der normalen 9-Loch-Runde. Bis {cfg.partialRounds.maxHolesNineMethod} gespielte Löcher: Hochrechnung über die
              vollständig gespielten neun Löcher mit deren offiziellem 9-Loch-Rating plus erwartetem Differential. Ab {cfg.partialRounds.minHolesNetParMethod}{" "}
              Löchern: nicht gespielte Löcher mit Netto-Par, danach 18-Loch-Formel.
            </p>
            {cfg.partialRounds.verificationStatus === "UNVERIFIED" && (
              <Alert tone="warning">Diese Methode ist im Regelset hinterlegt, wurde aber noch nicht gegen die offizielle DGV-Berechnung verifiziert.</Alert>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Rundung" />
          <CardBody>
            <p>
              Alle Rundungen laufen über eine zentrale Funktion (Modus: {cfg.rounding.mode === "HALF_AWAY_FROM_ZERO" ? "kaufmännisch, .5 vom Nullpunkt weg" : ".5 aufwärts"}).
              Gerundet wird nur dort, wo das Regelwerk es verlangt: Score Differential (0,1), HCPI (0,1), HCPI/2 bei 9 Loch (0,1), Course Handicap (ganze
              Zahl). Gleitkomma-Artefakte (z. B. 13,149999…) werden abgefangen.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Golfplatzdaten und Quellen" />
          <CardBody>
            <p>Datenquellen-Priorität:</p>
            <ol className="mt-1 list-decimal pl-5">
              {Object.entries(SOURCE_PRIORITY)
                .sort((a, b) => a[1] - b[1])
                .map(([k]) => (
                  <li key={k}>{SOURCE_TYPE_LABELS[k]}</li>
                ))}
            </ol>
            <p className="mt-2">
              CR- und Slope-Werte werden nie erfunden oder abgeleitet. Nicht verifizierte Werte bleiben sichtbar, werden aber nicht automatisch für eine
              exakte Berechnung verwendet. Jede Rating-Version hat einen Gültigkeitszeitraum, eine Quelle und ein Prüfdatum.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Offene Verifikationspunkte" subtitle="Transparente Liste von Annahmen, die gegen offizielle DGV-Beispiele zu prüfen sind" />
          <CardBody>
            <ul className="list-disc space-y-1 pl-5">
              <li>Abgebrochene Runden (10–17 Löcher): Methode laut Regelset (s. o.).</li>
              <li>Rundung negativer Werte (Plus-Handicaps): kaufmännisch vom Nullpunkt weg.</li>
              <li>Mehrere außergewöhnliche Ergebnisse an einem Tag: Abzüge werden addiert.</li>
              <li>ESR-Prüfung ab dem ersten Ergebnis gegen den Start-HCPI (z. B. 54,0).</li>
              <li>26,5-Bremse: Heraufsetzung aus dem Bereich unter 26,5 höchstens bis 26,5.</li>
              <li>Low HCPI: Zeitraum schließt den am Tag des jüngsten Ergebnisses geltenden HCPI ein.</li>
            </ul>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
