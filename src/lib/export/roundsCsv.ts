import Papa from "papaparse";
import { parseDate, parseDecimal } from "@/lib/courses/csv";
import { normalizeTeeColor, parseGender } from "@/lib/courses/tees";
import { CATEGORY_LABELS, ENTRY_MODE_LABELS, FORMAT_LABELS, RESULT_STATUS_LABELS } from "@/lib/whs/messages";
import type { Gender, NineSide, PccValue, Round, RoundCategory, ScoringRecordResult } from "@/lib/whs/types";

const de = (v: number | null | undefined, decimals = 1) =>
  v === null || v === undefined ? "" : v.toFixed(decimals).replace(".", ",");

/** CSV-Export aller Runden inkl. Berechnungsergebnis (Semikolon, Dezimalkomma – Excel-kompatibel). */
export function roundsToCsv(rounds: readonly Round[], result: ScoringRecordResult): string {
  const byId = new Map(rounds.map((r) => [r.id, r]));
  const rows = [...result.rounds].reverse().map((r) => {
    const round = byId.get(r.roundId)!;
    const sd = r.scoreDifferential;
    return {
      Datum: round.date,
      Turnier: round.title,
      Rundentyp: CATEGORY_LABELS[round.category],
      Spielform: FORMAT_LABELS[round.format],
      Ergebnisart: RESULT_STATUS_LABELS[round.resultStatus].label,
      Golfplatz: round.course.courseName,
      Platz: round.course.layoutName ?? "",
      Land: round.course.country,
      Tee: round.course.teeColor ?? "",
      Geschlecht: round.course.gender === "F" ? "Damen" : round.course.gender === "M" ? "Herren" : "",
      "Löcher": round.holes,
      "Gespielte Löcher": round.holesPlayed ?? "",
      Neun: round.rating.nine === "FRONT" ? "Front" : round.rating.nine === "BACK" ? "Back" : "",
      Par: round.rating.par ?? "",
      CR: de(round.rating.courseRating),
      Slope: round.rating.slopeRating ?? "",
      PCC: round.pcc,
      Eingabe: ENTRY_MODE_LABELS[round.entry.mode],
      GBE: sd?.adjustedGrossScore ?? "",
      "Score Differential": de(sd?.value),
      ESR: r.finalEsrTotal || "",
      "Adjusted SD": de(r.finalAdjustedSD),
      "Start-HCPI": de(r.startHandicapIndex),
      "HCPI nach Runde": de(r.revision?.currentHandicapIndex),
      "Handicap-relevant": r.relevance.relevant ? "ja" : "nein",
      "In HCPI": r.currentlyCounted ? "ja" : "nein",
      Notizen: round.notes ?? "",
    };
  });
  return "﻿" + Papa.unparse(rows, { delimiter: ";" });
}

export interface RoundCsvRow {
  rowNumber: number;
  errors: string[];
  warnings: string[];
  round: Round | null;
}

const ALIASES: Record<string, string[]> = {
  date: ["datum", "date"],
  title: ["turnier", "rundentitel", "titel", "title", "turniername"],
  course: ["golfplatz", "golfanlage", "anlage", "course", "platzname"],
  layout: ["platz", "layout"],
  country: ["land", "country"],
  tee: ["tee", "abschlag"],
  gender: ["geschlecht", "gender"],
  holes: ["löcher", "loecher", "holes", "lochzahl"],
  nine: ["neun", "nine", "hälfte"],
  par: ["par"],
  cr: ["cr", "course rating", "courserating"],
  slope: ["slope", "slope rating", "sloperating"],
  pcc: ["pcc", "cr-korrektur"],
  ags: ["gbe", "ags", "gewertetes bruttoergebnis"],
  sd: ["score differential", "sd", "differential"],
  category: ["rundentyp", "typ", "category"],
  official: ["hcpi nach runde", "offizieller hcpi", "hcpi"],
};

function column(headers: string[], key: string): string | null {
  const names = ALIASES[key];
  return headers.find((h) => names.includes(h.trim().toLowerCase())) ?? null;
}

function parseCategory(v: string): RoundCategory {
  const t = v.trim().toLowerCase();
  if (t === "rpr" || t.includes("privat")) return "RPR";
  if (t.startsWith("sonst") || t === "other") return "OTHER";
  return "TOURNAMENT";
}

/**
 * CSV-Import bestehender Runden (Datum, Turnier, Golfplatz, Tee, Löcher, GBE, CR, Slope, PCC …).
 * Das Score Differential und der HCPI werden anschließend berechnet; fehlende Angaben werden gemeldet.
 */
export function parseRoundsCsv(text: string, createId: () => string, defaultGender: Gender): { rows: RoundCsvRow[]; missing: string[] } {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    delimitersToGuess: [";", ",", "\t"],
  });
  const headers = parsed.meta.fields ?? [];
  const col = Object.fromEntries(Object.keys(ALIASES).map((k) => [k, column(headers, k)])) as Record<string, string | null>;
  const missing: string[] = [];
  if (!col.date) missing.push("Datum");
  if (!col.ags && !col.sd) missing.push("GBE oder Score Differential");
  if (col.ags && (!col.cr || !col.slope)) missing.push("CR und Slope");

  const now = new Date().toISOString();
  const rows: RoundCsvRow[] = parsed.data.map((raw, i) => {
    const get = (k: string) => (col[k] ? (raw[col[k]!] ?? "").trim() : "");
    const errors: string[] = [];
    const warnings: string[] = [];
    const date = parseDate(get("date"));
    if (!date || date === "INVALID") errors.push("Datum fehlt/ungültig");
    const holesRaw = parseDecimal(get("holes"));
    const holes: 9 | 18 = holesRaw === 9 ? 9 : 18;
    if (holesRaw !== null && holesRaw !== 9 && holesRaw !== 18) errors.push("Löcher muss 9 oder 18 sein");
    if (holesRaw === null) warnings.push("Löcher fehlt – 18 angenommen");
    const ags = parseDecimal(get("ags"));
    const sd = parseDecimal(get("sd"));
    const cr = parseDecimal(get("cr"));
    const slope = parseDecimal(get("slope"));
    const par = parseDecimal(get("par"));
    const pccRaw = parseDecimal(get("pcc"));
    const official = parseDecimal(get("official"));
    if ([ags, sd, cr, slope, par, pccRaw, official].some((v) => v !== null && Number.isNaN(v))) errors.push("Ungültige Zahl");
    const pcc = pccRaw ?? 0;
    if (![-1, 0, 1, 2, 3].includes(pcc)) errors.push("PCC außerhalb −1 … +3");
    const useAgs = ags !== null && !Number.isNaN(ags);
    if (!useAgs && (sd === null || Number.isNaN(sd))) errors.push("GBE oder Score Differential fehlt");
    if (useAgs && (cr === null || slope === null)) errors.push("Für die Berechnung aus dem GBE werden CR und Slope benötigt");
    if (useAgs && par === null) warnings.push("Par fehlt – Plausibilitätsprüfung eingeschränkt");
    const nineRaw = get("nine").toLowerCase();
    const nine: NineSide | null = nineRaw.startsWith("f") ? "FRONT" : nineRaw.startsWith("b") ? "BACK" : null;
    if (errors.length > 0) return { rowNumber: i + 2, errors, warnings, round: null };
    const round: Round = {
      id: createId(),
      date: date as string,
      sequence: i,
      title: get("title") || "Importierte Runde",
      category: col.category ? parseCategory(get("category")) : "TOURNAMENT",
      format: "STROKE",
      resultStatus: "NORMAL",
      holes,
      course: {
        courseName: get("course") || "Unbekannter Platz",
        layoutName: get("layout") || null,
        country: (get("country") || "DE").toUpperCase().slice(0, 2),
        teeColor: normalizeTeeColor(get("tee")),
        gender: parseGender(get("gender")) ?? defaultGender,
      },
      rating: useAgs
        ? { holes, courseRating: cr, slopeRating: slope, par, nine, manual: true, verified: false, sourceType: "MANUAL_IMPORT" }
        : { holes, courseRating: cr, slopeRating: slope, par, nine },
      pcc: pcc as PccValue,
      entry: useAgs
        ? { mode: "AGS", adjustedGrossScore: ags }
        : { mode: "SCORE_DIFFERENTIAL", scoreDifferential: sd, officialHandicapIndexAfter: official },
      notes: "CSV-Import",
      createdAt: now,
      updatedAt: now,
    };
    return { rowNumber: i + 2, errors, warnings, round };
  });
  return { rows, missing };
}

export function roundsCsvTemplate(): string {
  return "Datum;Turnier;Golfplatz;Tee;Löcher;GBE;CR;Slope;PCC;Par;Geschlecht;Rundentyp;Score Differential\n";
}
