"use client";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { defaultRuleSet } from "@/rules/whs/registry";
import { calculateStatistics } from "@/lib/whs/statistics";
import type { PlayerProfile, Round, ScoringRecordResult } from "@/lib/whs/types";
import { CATEGORY_SHORT } from "@/lib/whs/messages";

/** PDF-Standardschriften kennen nur WinAnsi – Sonderzeichen ersetzen. */
function pdfText(s: string): string {
  return s.replace(/−/g, "-").replace(/→/g, "->").replace(/[“”„]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, "...").replace(/–/g, "-");
}

const n1 = (v: number | null | undefined) => (v === null || v === undefined ? "-" : v.toFixed(1).replace(".", ","));
const d = (iso: string) => iso.split("-").reverse().join(".");

/** PDF: Scoring Record, Runden, aktuelle HCP-Berechnung, Statistik. */
export function exportPdf(profile: PlayerProfile, rounds: Round[], result: ScoringRecordResult): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const byId = new Map(rounds.map((r) => [r.id, r]));
  const status = result.status;
  const revision = result.revisions[result.revisions.length - 1];
  const stats = calculateStatistics(result, rounds);
  const green: [number, number, number] = [23, 77, 52];

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Golf HCP Rechner - Scoring Record", 14, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(pdfText(`Erstellt am ${d(new Date().toISOString().slice(0, 10))} · Regelwerk: ${defaultRuleSet.label}`), 14, 24);
  if (profile.displayName) doc.text(pdfText(`Spieler: ${profile.displayName}`), 14, 29);

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(pdfText(`Aktueller Handicap Index: ${n1(status.currentHandicapIndex)}`), 14, 38);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const lines = [
    `Kalkulierter HCPI: ${n1(status.calculatedHandicapIndex)}`,
    `Scoring Record: ${status.recordSize} von 20 Ergebnissen${status.usedCount ? `, Durchschnitt der besten ${status.usedCount}${status.adjustment ? ` (Anpassung ${n1(status.adjustment)})` : ""}` : ""}`,
    `Low Handicap Index: ${status.lowHandicapIndex ? n1(status.lowHandicapIndex.value) : "noch nicht festgelegt"}`,
    `Cap: ${status.capStatus === "NONE" ? "nicht aktiv" : status.capStatus === "SOFT" ? "Soft Cap" : "Hard Cap"} · 26,5-Bremse: ${status.brake265Active ? "aktiv" : "nicht aktiv"}${status.brake265Applied ? " (begrenzt den HCPI)" : ""}`,
  ];
  if (revision?.index) {
    const counted = revision.window.filter((w) => w.counted).map((w) => n1(w.adjustedSD));
    lines.push(`Berechnung: (${counted.join(" + ")}) / ${revision.index.usedCount} = ${revision.index.averageUnrounded.toFixed(3).replace(".", ",")}${revision.index.adjustment ? ` ${n1(revision.index.adjustment)}` : ""} -> ${n1(revision.index.value)}`);
  }
  lines.forEach((l, i) => doc.text(pdfText(l), 14, 44 + i * 5));

  autoTable(doc, {
    startY: 44 + lines.length * 5 + 4,
    head: [["#", "Datum", "Runde", "Golfplatz", "SD", "ESR", "Adj. SD", "zählt"]],
    body: [...status.window]
      .sort((a, b) => a.rank - b.rank)
      .map((w, i) => {
        const r = byId.get(w.roundId);
        return [String(i + 1), d(w.date), pdfText(r?.title ?? ""), pdfText(r?.course.courseName ?? ""), n1(w.originalSD), w.esrTotal ? String(w.esrTotal) : "", n1(w.adjustedSD), w.counted ? "ja" : ""];
      }),
    headStyles: { fillColor: green },
    styles: { fontSize: 8 },
    didDrawPage: () => undefined,
  });

  doc.addPage();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Alle Runden", 14, 16);
  autoTable(doc, {
    startY: 20,
    head: [["Datum", "Runde", "Typ", "Golfplatz", "L.", "Tee", "GBE", "CR", "Slope", "PCC", "Start", "SD", "Adj.", "HCPI"]],
    body: [...result.rounds].reverse().map((r) => {
      const round = byId.get(r.roundId)!;
      const sd = r.scoreDifferential;
      return [
        d(round.date),
        pdfText(round.title),
        CATEGORY_SHORT[round.category],
        pdfText(round.course.courseName),
        String(round.holes),
        pdfText(round.course.teeColor ?? ""),
        sd?.adjustedGrossScore != null ? String(sd.adjustedGrossScore) : "",
        n1(sd?.courseRating ?? round.rating.courseRating),
        String(sd?.slopeRating ?? round.rating.slopeRating ?? ""),
        String(round.pcc),
        n1(r.startHandicapIndex),
        n1(sd?.value),
        n1(r.finalAdjustedSD),
        r.revision ? n1(r.revision.currentHandicapIndex) : "",
      ];
    }),
    headStyles: { fillColor: green },
    styles: { fontSize: 7 },
  });

  doc.addPage();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Statistik", 14, 16);
  autoTable(doc, {
    startY: 20,
    head: [["Kennzahl", "Wert"]],
    body: [
      ["Runden gesamt", String(stats.totalRounds)],
      ["Handicap-relevante Ergebnisse", String(stats.relevantRounds)],
      ["Score Differential Durchschnitt", n1(stats.differentials.average)],
      ["Score Differential Median", n1(stats.differentials.median)],
      ["Bestes / schlechtestes SD", `${n1(stats.differentials.best)} / ${n1(stats.differentials.worst)}`],
      ["Durchschnitt der gezählten Ergebnisse", n1(stats.countedAverage)],
      ["Durchschnitt letzte 20", n1(stats.last20.average)],
      ["GBE-Durchschnitt 18 Loch", n1(stats.gross18.average)],
      ["GBE-Durchschnitt 9 Loch", n1(stats.gross9.average)],
      ["9-Loch- / 18-Loch-Runden", `${stats.nineHoleRounds} / ${stats.eighteenHoleRounds}`],
    ].map((row) => row.map(pdfText)),
    headStyles: { fillColor: green },
    styles: { fontSize: 9 },
  });

  doc.save(`hcp-scoring-record-${new Date().toISOString().slice(0, 10)}.pdf`);
}
