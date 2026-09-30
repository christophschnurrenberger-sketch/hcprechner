/**
 * Ablauf der mobilen Scorecard (reine Funktionen, ohne React): welcher Schritt folgt, welche Fragen für ein
 * Loch relevant sind, Zwischenstand der Runde. Hier wird nichts nach WHS berechnet – Score Differential,
 * Netto-Doppelbogey und Handicap Index kommen ausschließlich vom Backend. Die Summen hier sind die
 * gespielten Schläge, wie sie auf der Scorekarte stehen.
 */
import type { HoleStat } from "@/lib/stats/types";
import type { HoleScore } from "@/lib/whs/types";

/** QUICK = nur Schläge, DETAILED = Schläge + Putts + Statistik, TOTAL = nur Gesamtergebnis (Platz ohne Lochdaten). */
export type EntryMode = "QUICK" | "DETAILED" | "TOTAL";

export type FlowStep = "SETUP" | "SCORE" | "PUTTS" | "STATS" | "FRONT_NINE" | "TOTAL" | "FINAL" | "RESULT";

/** Position im Ablauf; `hole` ist der Index (0-basiert) in der Liste der gespielten Löcher. */
export interface FlowPos {
  hole: number;
  step: FlowStep;
}

export interface FlowContext {
  mode: EntryMode;
  /** Anzahl gespielter Löcher (9 oder 18) */
  holeCount: number;
}

const HOLE_STEPS: Record<EntryMode, FlowStep[]> = {
  QUICK: ["SCORE"],
  DETAILED: ["SCORE", "PUTTS", "STATS"],
  TOTAL: [],
};

export function holeSteps(mode: EntryMode): FlowStep[] {
  return HOLE_STEPS[mode];
}

export function isHoleStep(step: FlowStep): boolean {
  return step === "SCORE" || step === "PUTTS" || step === "STATS";
}

/** Erster Schritt nach dem Start. */
export function firstPos(ctx: FlowContext): FlowPos {
  return ctx.mode === "TOTAL" ? { hole: 0, step: "TOTAL" } : { hole: 0, step: "SCORE" };
}

/** Nächster Schritt: Score → Putts → Statistik → nächstes Loch; nach Loch 9 (von 18) der Zwischenstand, am Ende die Übersicht. */
export function nextPos(pos: FlowPos, ctx: FlowContext): FlowPos {
  if (pos.step === "SETUP") return firstPos(ctx);
  if (pos.step === "TOTAL") return { hole: 0, step: "FINAL" };
  if (pos.step === "FRONT_NINE") return { hole: 9, step: "SCORE" };
  if (pos.step === "FINAL" || pos.step === "RESULT") return { ...pos, step: "RESULT" };
  const steps = holeSteps(ctx.mode);
  const i = steps.indexOf(pos.step);
  if (i >= 0 && i < steps.length - 1) return { hole: pos.hole, step: steps[i + 1] };
  return afterHole(pos.hole, ctx);
}

/** Direkt zum nächsten Loch (Wischen, Lochnavigation) – die Angaben des aktuellen Lochs bleiben erhalten. */
export function afterHole(hole: number, ctx: FlowContext): FlowPos {
  if (hole >= ctx.holeCount - 1) return { hole: ctx.holeCount - 1, step: "FINAL" };
  if (ctx.holeCount === 18 && hole === 8) return { hole: 8, step: "FRONT_NINE" };
  return { hole: hole + 1, step: "SCORE" };
}

/** Vorheriger Schritt (Zurück): Daten bleiben erhalten. `null` = zurück zum Start. */
export function prevPos(pos: FlowPos, ctx: FlowContext): FlowPos | null {
  const steps = holeSteps(ctx.mode);
  const last = steps[steps.length - 1];
  switch (pos.step) {
    case "SETUP":
    case "RESULT":
      return null;
    case "TOTAL":
      return { hole: 0, step: "SETUP" };
    case "FRONT_NINE":
      return { hole: 8, step: last };
    case "FINAL":
      return ctx.mode === "TOTAL" ? { hole: 0, step: "TOTAL" } : { hole: ctx.holeCount - 1, step: last };
    default: {
      const i = steps.indexOf(pos.step);
      if (i > 0) return { hole: pos.hole, step: steps[i - 1] };
      if (pos.hole === 0) return { hole: 0, step: "SETUP" };
      return { hole: pos.hole - 1, step: last };
    }
  }
}

// ---------------------------------------------------------------------------
// Relevanz der Fragen je Loch
// ---------------------------------------------------------------------------

/** Fairway nur auf Par 4 und Par 5 (Par unbekannt: fragen). */
export function asksFairway(par: number | null): boolean {
  return par === null || par >= 4;
}

/**
 * Up & Down ist nur nach verfehltem Grün relevant. Liegt die Schlagzahl über Par, ist es sicher nicht geschafft
 * (Definition: danach Par oder besser) – die Frage entfällt, der Wert wird als „Nein“ gespeichert.
 */
export function asksUpAndDown(h: Pick<HoleStat, "gir" | "score" | "par">): boolean {
  if (h.gir !== false) return false;
  return !(h.score !== null && h.par !== null && h.score > h.par);
}

/** Sand Save nur nach Bunker; über Par ist er sicher nicht geschafft. */
export function asksSandSave(h: Pick<HoleStat, "bunkerVisit" | "score" | "par">): boolean {
  if (h.bunkerVisit !== true) return false;
  return !(h.score !== null && h.par !== null && h.score > h.par);
}

export type StatQuestion = "fir" | "gir" | "upAndDown";

/** Hauptfragen der Statistik in der Reihenfolge des Spiels; jede erscheint erst, wenn die vorige beantwortet ist. */
export function visibleQuestions(h: HoleStat): StatQuestion[] {
  const out: StatQuestion[] = [];
  if (asksFairway(h.par)) {
    out.push("fir");
    if (h.fir === null) return out;
  }
  out.push("gir");
  if (h.gir === null) return out;
  if (asksUpAndDown(h)) out.push("upAndDown");
  return out;
}

/** Alle relevanten Hauptfragen beantwortet? */
export function questionsAnswered(h: HoleStat): boolean {
  if (asksFairway(h.par) && h.fir === null) return false;
  if (h.gir === null) return false;
  if (asksUpAndDown(h) && h.upAndDown === null) return false;
  return true;
}

/**
 * Abhängige Angaben bereinigen und sichere Folgerungen setzen (keine Ableitung von GIR oder Fairway aus der
 * Schlagzahl): Par 3 → kein Fairway; GIR → kein Up & Down; kein Bunker → kein Sand Save; über Par → Up & Down bzw.
 * Sand Save „Nein“.
 */
export function normalizeHole(h: HoleStat): HoleStat {
  const n = { ...h };
  if (n.par === 3) n.fir = null;
  if (n.gir !== false) n.upAndDown = n.gir === true ? null : n.upAndDown;
  else if (!asksUpAndDown(n)) n.upAndDown = false;
  if (n.bunkerVisit !== true) {
    n.bunkerShots = null;
    n.sandSave = null;
  } else if (!asksSandSave(n)) n.sandSave = false;
  return n;
}

/** Loch im detaillierten Modus abschließen: Strafschläge und Bunker gelten ohne Angabe als 0 bzw. „Nein“. */
export function completeHole(h: HoleStat): HoleStat {
  return normalizeHole({ ...h, penaltyStrokes: h.penaltyStrokes ?? 0, bunkerVisit: h.bunkerVisit ?? false });
}

// ---------------------------------------------------------------------------
// Schlagzahl
// ---------------------------------------------------------------------------

/** Schnellauswahl für ein Loch: Par −1 bis Par +3, dazu „Par +4 und mehr“ (z. B. Par 4: 3 4 5 6 7 8+). */
export function scoreOptions(par: number | null): { value: number; more: boolean }[] {
  const p = par ?? 4;
  const out: { value: number; more: boolean }[] = [];
  for (let v = Math.max(1, p - 1); v <= p + 3; v++) out.push({ value: v, more: false });
  out.push({ value: p + 4, more: true });
  return out;
}

export interface RelativeScore {
  /** z. B. „Birdie“, „Par“, „Bogey“ */
  label: string;
  /** z. B. „−1“, „E“, „+1“ */
  short: string;
  tone: "under" | "par" | "bogey" | "double" | "triple";
}

/** Ergebnis relativ zu Par – immer mit Text (nie nur Farbe). */
export function relativeScore(score: number | null, par: number | null): RelativeScore | null {
  if (score === null || par === null) return null;
  const d = score - par;
  const short = formatToPar(d);
  if (score === 1) return { label: "Hole in One", short, tone: "under" };
  if (d <= -3) return { label: "Albatros", short, tone: "under" };
  if (d === -2) return { label: "Eagle", short, tone: "under" };
  if (d === -1) return { label: "Birdie", short, tone: "under" };
  if (d === 0) return { label: "Par", short, tone: "par" };
  if (d === 1) return { label: "Bogey", short, tone: "bogey" };
  if (d === 2) return { label: "Doppelbogey", short, tone: "double" };
  if (d === 3) return { label: "Triple-Bogey", short, tone: "triple" };
  return { label: `${d} über Par`, short, tone: "triple" };
}

/** „+7“, „E“ oder „−2“. */
export function formatToPar(value: number | null): string {
  if (value === null) return "–";
  if (value === 0) return "E";
  return value > 0 ? `+${value}` : `−${-value}`;
}

// ---------------------------------------------------------------------------
// Zwischenstand
// ---------------------------------------------------------------------------

export interface HoleView {
  number: number;
  par: number | null;
  strokeIndex: number | null;
  /** Schläge (Zahl), „PICKUP“ (Strich) oder null (noch offen) */
  raw: HoleScore;
  stats: HoleStat;
}

export interface Totals {
  holes: number;
  /** Löcher mit Schlagzahl */
  played: number;
  pickups: number;
  strokes: number;
  /** Schläge − Par über die gespielten Löcher mit bekanntem Par */
  toPar: number | null;
  putts: number;
  puttHoles: number;
  girs: number;
  girHoles: number;
  firs: number;
  firHoles: number;
}

export function totals(holes: readonly HoleView[]): Totals {
  const t: Totals = { holes: holes.length, played: 0, pickups: 0, strokes: 0, toPar: null, putts: 0, puttHoles: 0, girs: 0, girHoles: 0, firs: 0, firHoles: 0 };
  let toPar = 0;
  let parKnown = false;
  for (const h of holes) {
    if (h.raw === "PICKUP") t.pickups++;
    if (typeof h.raw === "number") {
      t.played++;
      t.strokes += h.raw;
      if (h.par !== null) {
        toPar += h.raw - h.par;
        parKnown = true;
      }
    }
    if (h.stats.putts !== null) {
      t.putts += h.stats.putts;
      t.puttHoles++;
    }
    if (h.stats.gir !== null) {
      t.girHoles++;
      if (h.stats.gir) t.girs++;
    }
    if (asksFairway(h.par) && h.par !== null && h.stats.fir !== null) {
      t.firHoles++;
      if (h.stats.fir) t.firs++;
    }
  }
  t.toPar = parKnown ? toPar : null;
  return t;
}

export type HoleStatus = "done" | "partial" | "empty";

/** Stand eines Lochs für die Lochnavigation (✓ vollständig, ● begonnen, ○ offen). */
export function holeStatus(h: HoleView, mode: EntryMode): HoleStatus {
  if (h.raw === null) return h.stats.putts !== null || h.stats.gir !== null ? "partial" : "empty";
  if (mode !== "DETAILED") return "done";
  return h.stats.putts !== null && questionsAnswered(h.stats) ? "done" : "partial";
}

/** Wo eine unterbrochene Runde weitergeht: erstes Loch ohne Schlagzahl (bzw. unvollständig im Detailmodus). */
export function resumePos(holes: readonly HoleView[], mode: EntryMode): FlowPos {
  if (mode === "TOTAL") return { hole: 0, step: "TOTAL" };
  const i = holes.findIndex((h) => holeStatus(h, mode) !== "done");
  if (i < 0) return { hole: Math.max(0, holes.length - 1), step: "FINAL" };
  const h = holes[i];
  if (mode === "DETAILED" && h.raw !== null) return { hole: i, step: h.stats.putts === null ? "PUTTS" : "STATS" };
  return { hole: i, step: "SCORE" };
}
