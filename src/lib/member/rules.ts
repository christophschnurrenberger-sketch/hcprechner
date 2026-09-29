/**
 * Übersicht der aktiven Regelversion für den Admin-Bereich (nur Anzeige der Werte aus config.ts).
 */
import type { RulesInfo } from "@/lib/api/types";
import { defaultRuleSet, listRuleSets } from "@/rules/whs/registry";
import { APP_VERSION, BUILD_INFO } from "./engine";

const de = (v: number, digits = 1) => v.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function rulesInfo(): RulesInfo {
  const c = defaultRuleSet.config;
  const table = c.handicapIndex.table.map((row) => ({
    label: row.minScores === row.maxScores ? `${row.minScores} Ergebnisse` : `${row.minScores}–${row.maxScores} Ergebnisse`,
    value: `beste ${row.count}${row.adjustment !== 0 ? `, Anpassung ${de(row.adjustment)}` : ""}`,
  }));
  return {
    active: { country: defaultRuleSet.country, version: defaultRuleSet.version, label: defaultRuleSet.label },
    available: listRuleSets().map((r) => ({ country: r.country, version: r.version, label: r.label })),
    engineVersion: APP_VERSION,
    build: BUILD_INFO,
    parameters: [
      {
        group: "Handicap Index",
        items: [
          { label: "Höchstwert", value: de(c.handicapIndex.maximum) },
          { label: "Scoring Record", value: `letzte ${c.handicapIndex.windowSize} Ergebnisse` },
          { label: "Mindestanzahl", value: `${c.handicapIndex.minimumScores} Ergebnisse` },
          { label: "Rundung", value: `${c.rounding.handicapIndexDecimals} Nachkommastelle (kaufmännisch)` },
        ],
      },
      { group: "Berechnungstabelle", items: table },
      {
        group: "Score Differential",
        items: [
          { label: "Formel", value: `(113 ÷ Slope) × (GBE − Course Rating − PCC)` },
          { label: "Standard-Slope", value: String(c.slope.standard) },
          { label: "Slope-Bereich", value: `${c.slope.min}–${c.slope.max}` },
          { label: "PCC", value: c.pcc.allowed.join(", ") },
          { label: "Netto-Doppelbogey", value: `Par + ${c.netDoubleBogey.strokesOverPar} + Vorgabeschläge` },
        ],
      },
      {
        group: "9-Loch-Runden",
        items: [
          { label: "Erwartetes Differential", value: `${de(c.nineHole.expectedFactor, 2)} × HCPI ÷ 2 + ${de(c.nineHole.expectedConstant)} ÷ 2` },
          { label: "Ratings", value: "nur eigene 9-Loch-Ratings (keine Ableitung aus 18 Loch)" },
        ],
      },
      {
        group: "Begrenzungen",
        items: [
          { label: "Soft Cap", value: `ab +${de(c.caps.softThreshold)} über Low HI, Faktor ${de(c.caps.softFactor)}` },
          { label: "Hard Cap", value: `höchstens +${de(c.caps.hardLimit)} über Low HI` },
          { label: "Low Handicap Index", value: `${c.lowHandicapIndex.windowDays} Tage, ab ${c.lowHandicapIndex.minimumScores} Ergebnissen` },
          { label: "26,5-Bremse", value: `ab ${de(c.brake265.threshold)}` },
          { label: "Außergewöhnliche Ergebnisse", value: c.esr.thresholds.map((t) => `≥ ${de(t.minDifference)} → ${t.reduction}`).join(", ") },
        ],
      },
    ],
  };
}
