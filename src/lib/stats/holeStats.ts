/**
 * Lochstatistik: Eingabeprüfung und Konsistenzregeln.
 *
 * Fehler (Speichern nicht möglich) gibt es nur für technisch unmögliche Kombinationen, z. B. mehr Putts als
 * Schläge oder Sand Save ohne Bunkerschlag. Ungewöhnliche, aber mögliche Angaben (z. B. GIR = Ja, obwohl
 * Schläge minus Putts mehr als Par − 2 ergeben – Putt vom Grün gerollt) sind Hinweise. Aus der Schlagzahl
 * wird nichts abgeleitet: Eine 5 auf einem Par 4 bedeutet nicht automatisch „Grün verfehlt“.
 */
import { z } from "zod";
import type { HoleStat } from "./types";

const count = (max: number) => z.number().int().min(0).max(max).nullable();

export const holeStatSchema = z.object({
  number: z.number().int().min(1).max(18),
  par: z.number().int().min(3).max(6).nullable(),
  strokeIndex: z.number().int().min(1).max(18).nullable().optional(),
  score: z.number().int().min(1).max(20).nullable(),
  putts: count(10),
  fir: z.boolean().nullable(),
  gir: z.boolean().nullable(),
  bunkerVisit: z.boolean().nullable(),
  bunkerShots: count(10),
  sandSave: z.boolean().nullable(),
  upAndDown: z.boolean().nullable(),
  penaltyStrokes: count(10),
  note: z.string().trim().max(200).nullable().optional(),
});

export const holeStatsSchema = z.array(holeStatSchema).min(9).max(18);

export interface StatsIssue {
  hole: number;
  field: keyof HoleStat | "hole";
  message: string;
}

export interface StatsValidation {
  errors: StatsIssue[];
  warnings: StatsIssue[];
}

/** Lochnummern einer Runde: 18 Loch 1–18, vordere neun 1–9, hintere neun 10–18. */
export function holeNumbersFor(holes: 9 | 18, nine: "FRONT" | "BACK" | null | undefined): number[] {
  const start = holes === 9 && nine === "BACK" ? 10 : 1;
  return Array.from({ length: holes }, (_, i) => start + i);
}

export function emptyHoleStat(number: number, par: number | null = null, strokeIndex: number | null = null): HoleStat {
  return { number, par, strokeIndex, score: null, putts: null, fir: null, gir: null, bunkerVisit: null, bunkerShots: null, sandSave: null, upAndDown: null, penaltyStrokes: null, note: null };
}

/**
 * Lochliste an die gespielten Löcher anpassen: vorhandene Angaben bleiben je Lochnummer erhalten,
 * Par und Handicap kommen aus den Platzdaten (falls vorhanden).
 */
export function alignToHoles(existing: readonly HoleStat[] | null | undefined, base: readonly { number: number; par: number | null; strokeIndex?: number | null }[]): HoleStat[] {
  const byNumber = new Map((existing ?? []).map((h) => [h.number, h]));
  return base.map((b) => {
    const e = byNumber.get(b.number);
    return e ? { ...e, par: b.par ?? e.par, strokeIndex: b.strokeIndex ?? e.strokeIndex ?? null } : emptyHoleStat(b.number, b.par, b.strokeIndex ?? null);
  });
}

/** Hat das Loch irgendeine Angabe außer Par/Handicap? */
export function hasAnyStat(h: HoleStat): boolean {
  return (
    h.score !== null ||
    h.putts !== null ||
    h.fir !== null ||
    h.gir !== null ||
    h.bunkerVisit !== null ||
    h.bunkerShots !== null ||
    h.sandSave !== null ||
    h.upAndDown !== null ||
    h.penaltyStrokes !== null ||
    Boolean(h.note)
  );
}

/** Loch vollständig erfasst (für „Performance vollständig“): Schläge, Putts, GIR und Strafschläge. */
export function isHoleTracked(h: HoleStat): boolean {
  return h.score !== null && h.putts !== null && h.gir !== null && h.penaltyStrokes !== null;
}

export function validateHoleStats(holes: readonly HoleStat[], expectedNumbers: readonly number[]): StatsValidation {
  const errors: StatsIssue[] = [];
  const warnings: StatsIssue[] = [];
  const err = (hole: number, field: StatsIssue["field"], message: string) => errors.push({ hole, field, message });
  const warn = (hole: number, field: StatsIssue["field"], message: string) => warnings.push({ hole, field, message });

  const numbers = holes.map((h) => h.number);
  if (numbers.length !== expectedNumbers.length || expectedNumbers.some((n) => !numbers.includes(n)) || new Set(numbers).size !== numbers.length) {
    err(0, "hole", `Bitte genau die Löcher ${expectedNumbers[0]}–${expectedNumbers.at(-1)} angeben.`);
    return { errors, warnings };
  }

  for (const h of holes) {
    const n = h.number;
    const score = h.score;
    const putts = h.putts;
    const pen = h.penaltyStrokes ?? 0;

    if (h.par === 3 && h.fir !== null) err(n, "fir", `Loch ${n}: Auf einem Par 3 gibt es kein Fairway.`);
    if (h.bunkerVisit !== true && (h.bunkerShots ?? 0) > 0) err(n, "bunkerShots", `Loch ${n}: Bunkerschläge nur, wenn der Ball im Bunker war.`);
    if (h.bunkerVisit !== true && h.sandSave !== null) err(n, "sandSave", `Loch ${n}: Sand Save nur nach einem Bunkerschlag.`);
    if (h.gir === true && h.upAndDown !== null) err(n, "upAndDown", `Loch ${n}: Up & Down zählt nur, wenn das Grün verfehlt wurde.`);

    if (score !== null) {
      if (putts !== null && putts + pen > score - 1) err(n, "putts", `Loch ${n}: ${putts} Putts${pen ? ` und ${pen} Strafschläge` : ""} passen nicht zu ${score} Schlägen.`);
      else if (putts === null && pen > score - 1) err(n, "penaltyStrokes", `Loch ${n}: ${pen} Strafschläge passen nicht zu ${score} Schlägen.`);
      if (h.bunkerShots !== null && h.bunkerShots > 0 && h.bunkerShots + (putts ?? 0) + pen > score) err(n, "bunkerShots", `Loch ${n}: Zu viele Bunkerschläge für ${score} Schläge.`);
      if (h.par !== null) {
        if (h.sandSave === true && score > h.par) err(n, "sandSave", `Loch ${n}: Sand Save bedeutet Par oder besser.`);
        if (h.upAndDown === true && score > h.par) err(n, "upAndDown", `Loch ${n}: Up & Down bedeutet Par oder besser.`);
        if (h.gir === true && putts !== null && score - putts > h.par - 2) warn(n, "gir", `Loch ${n}: GIR „Ja“, aber ${score - putts} Schläge bis zum Grün – bitte prüfen.`);
      }
    } else if (hasAnyStat({ ...h, note: null })) {
      warn(n, "score", `Loch ${n}: Statistik ohne Schlagzahl erfasst.`);
    }
  }
  return { errors, warnings };
}
