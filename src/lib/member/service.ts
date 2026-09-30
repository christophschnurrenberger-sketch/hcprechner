/**
 * Operationen des Mitgliederbereichs auf dem Mitglieder-Dokument (rein funktional, ohne I/O).
 * Node-Edition: in den Route Handlern (Server). Webspace-Edition: im API-Adapter, PHP speichert.
 */
import { z } from "zod";
import { apiError } from "@/lib/api/errors";
import { fieldErrors } from "@/lib/auth/validation";
import type { DraftRound, MemberCourseLists, RoundPreview, RoundSaveResult } from "@/lib/api/types";
import type { CourseSummary } from "@/lib/courses/summary";
import { parseRoundsCsv } from "@/lib/export/roundsCsv";
import { calculateStatistics, type PlayerStatistics } from "@/lib/whs/statistics";
import { analyzeTarget, differentialRound, simulateRound, type TargetAnalysis, type WhatIfResult } from "@/lib/whs/simulation";
import { evaluateRound } from "@/lib/whs/roundCalculation";
import { defaultRuleSet } from "@/rules/whs/registry";
import { todayIso } from "@/lib/whs/dates";
import type { HoleInfo, HoleScore, IsoDate, PccValue, Round, RoundEvaluation } from "@/lib/whs/types";
import type { MemberRound } from "./round";
import { activeRounds, withRound, withoutRound, type MemberDoc } from "./doc";
import { previewRound, saveRound, scoringRecordOf, sequenceFor } from "./hcp";
import { parseRoundInput, resolveRound, type CourseLookup } from "./roundInput";

export interface MemberContext {
  courseLookup: CourseLookup;
  newId: () => string;
  now?: Date;
}

async function buildRound(doc: MemberDoc, rawInput: unknown, ctx: MemberContext, roundId?: string): Promise<MemberRound> {
  const input = parseRoundInput(rawInput);
  const existing = roundId ? doc.rounds.find((r) => r.id === roundId && r.status !== "DELETED") ?? null : null;
  if (roundId && !existing) throw apiError("ROUND_NOT_FOUND");
  const id = existing?.id ?? ctx.newId();
  const round = await resolveRound(input, ctx.courseLookup, { id, existing, sequence: sequenceFor(doc, { id, date: input.date }), now: ctx.now });
  return existing?.clientRef ? { ...round, clientRef: existing.clientRef } : round;
}

const CLIENT_REF = /^[A-Za-z0-9_-]{1,64}$/;

/** Bereits aus diesem Entwurf gespeicherte Runde (idempotentes Speichern). */
export function roundByClientRef(doc: MemberDoc, clientRef: string | null | undefined): MemberRound | null {
  if (!clientRef) return null;
  return doc.rounds.find((r) => r.clientRef === clientRef && r.status !== "DELETED") ?? null;
}

/** Vorschau („Dein Ergebnis“) – noch nicht gespeichert. */
export async function previewRoundInput(doc: MemberDoc, input: unknown, ctx: MemberContext, roundId?: string): Promise<RoundPreview> {
  return previewRound(doc, await buildRound(doc, input, ctx, roundId));
}

/**
 * Neue Runde. Mit `draftId` ist das Speichern idempotent: Wurde aus diesem Entwurf schon eine Runde gespeichert
 * (z. B. Anfrage nach einem Verbindungsabbruch wiederholt), entsteht keine zweite – geliefert wird das Ergebnis der
 * vorhandenen Runde (`duplicate: true`, Dokument unverändert).
 */
export async function createRound(doc: MemberDoc, input: unknown, ctx: MemberContext, draftId?: string | null): Promise<{ doc: MemberDoc; result: RoundSaveResult; duplicate: boolean }> {
  const clientRef = draftId && CLIENT_REF.test(draftId) ? draftId : null;
  const existing = roundByClientRef(doc, clientRef);
  if (existing) {
    const without = { ...doc, rounds: doc.rounds.filter((r) => r.id !== existing.id) };
    return { doc, result: { ...previewRound(without, existing), roundId: existing.id }, duplicate: true };
  }
  const built = await buildRound(doc, input, ctx);
  const round = clientRef ? { ...built, clientRef } : built;
  const saved = saveRound(doc, round);
  const next = draftId ? { ...saved.doc, drafts: saved.doc.drafts.filter((d) => d.id !== draftId) } : saved.doc;
  return { doc: next, result: { ...saved.preview, roundId: round.id }, duplicate: false };
}

/** Änderung einer bestehenden Runde – der gesamte Verlauf wird chronologisch neu berechnet. */
export async function updateRound(doc: MemberDoc, roundId: string, input: unknown, ctx: MemberContext): Promise<{ doc: MemberDoc; result: RoundSaveResult }> {
  const round = await buildRound(doc, input, ctx, roundId);
  const saved = saveRound(doc, round);
  return { doc: saved.doc, result: { ...saved.preview, roundId } };
}

export function deleteRound(doc: MemberDoc, roundId: string, now?: string): MemberDoc {
  if (!doc.rounds.some((r) => r.id === roundId && r.status !== "DELETED")) throw apiError("ROUND_NOT_FOUND");
  return withoutRound(doc, roundId, now);
}

// ---------------------------------------------------------------------------
// Entwürfe
// ---------------------------------------------------------------------------

export const MAX_DRAFTS = 10;

export function saveDraft(doc: MemberDoc, draft: Omit<DraftRound, "updatedAt"> & { updatedAt?: string }): MemberDoc {
  const item: DraftRound = { ...draft, label: draft.label.slice(0, 120) || "Entwurf", updatedAt: draft.updatedAt ?? new Date().toISOString() };
  const others = doc.drafts.filter((d) => d.id !== draft.id);
  return { ...doc, drafts: [item, ...others].slice(0, MAX_DRAFTS) };
}

export function deleteDraft(doc: MemberDoc, draftId: string): MemberDoc {
  return { ...doc, drafts: doc.drafts.filter((d) => d.id !== draftId) };
}

// ---------------------------------------------------------------------------
// Profil, Onboarding, Golfplatz-Vorlieben
// ---------------------------------------------------------------------------

function checkHandicap(value: number) {
  if (!Number.isFinite(value) || value < -10 || value > 54) throw apiError("VALIDATION", "Handicap zwischen +10 und 54,0.", { startHandicapIndex: "Handicap zwischen +10 und 54,0." });
}

/**
 * Ausgangshandicap: gilt vor der ersten erfassten Runde. Es ist ausdrücklich kein rekonstruierter
 * Scoring Record – der HCPI aus Runden wird separat berechnet.
 */
export function setStartHandicap(doc: MemberDoc, value: number, gender?: "M" | "F"): MemberDoc {
  checkHandicap(value);
  return { ...doc, profile: { ...doc.profile, startHandicapIndex: Math.round(value * 10) / 10, ...(gender ? { gender } : {}) } };
}

export function completeOnboarding(doc: MemberDoc, input: { startHandicapIndex?: number | null; homeCourseId?: string | null; gender?: "M" | "F" }, now = new Date().toISOString()): MemberDoc {
  let next = doc;
  if (input.startHandicapIndex !== undefined && input.startHandicapIndex !== null) next = setStartHandicap(next, input.startHandicapIndex, input.gender);
  else if (input.gender) next = { ...next, profile: { ...next.profile, gender: input.gender } };
  return { ...next, preferences: { ...next.preferences, homeCourseId: input.homeCourseId ?? next.preferences.homeCourseId, onboardedAt: now } };
}

export function setFavorite(doc: MemberDoc, courseId: string, favorite: boolean): MemberDoc {
  const set = new Set(doc.preferences.favorites);
  if (favorite) set.add(courseId);
  else set.delete(courseId);
  return { ...doc, preferences: { ...doc.preferences, favorites: [...set].slice(0, 100) } };
}

export function setHomeCourse(doc: MemberDoc, courseId: string | null): MemberDoc {
  return { ...doc, preferences: { ...doc.preferences, homeCourseId: courseId } };
}

/** Standard der Rundeneingabe auf dem Smartphone: schnell, detailliert oder bei jeder Runde fragen. */
export function setRoundEntryMode(doc: MemberDoc, mode: unknown): MemberDoc {
  if (mode !== "ASK" && mode !== "QUICK" && mode !== "DETAILED") throw apiError("VALIDATION", "Ungültige Auswahl.", { roundEntryMode: "Bitte eine Option wählen." });
  return { ...doc, preferences: { ...doc.preferences, roundEntryMode: mode } };
}

/** Zuletzt gespielte Plätze aus der Datenbank (neueste zuerst, ohne Doppelte). */
export function recentCourseIds(doc: MemberDoc, limit = 5): string[] {
  const out: string[] = [];
  for (const r of [...activeRounds(doc)].sort((a, b) => b.date.localeCompare(a.date) || b.sequence - a.sequence)) {
    const id = r.course.courseId;
    if (id && !out.includes(id)) out.push(id);
    if (out.length >= limit) break;
  }
  return out;
}

export function memberCourseLists(doc: MemberDoc, summaries: (ids: string[]) => CourseSummary[]): MemberCourseLists {
  const favorites = summaries(doc.preferences.favorites);
  const recent = summaries(recentCourseIds(doc));
  const home = doc.preferences.homeCourseId ? summaries([doc.preferences.homeCourseId])[0] ?? null : null;
  return { favorites, recent, home };
}

// ---------------------------------------------------------------------------
// Import bisheriger Runden (CSV)
// ---------------------------------------------------------------------------

export interface ImportPreviewRow {
  rowNumber: number;
  date: string | null;
  courseName: string | null;
  holes: number | null;
  errors: string[];
  warnings: string[];
}

export function previewRoundsImport(doc: MemberDoc, csv: string, newId: () => string): { rows: ImportPreviewRow[]; missing: string[]; valid: number } {
  const parsed = parseRoundsCsv(csv, newId, doc.profile.gender);
  return {
    missing: parsed.missing,
    valid: parsed.rows.filter((r) => r.round && r.errors.length === 0).length,
    rows: parsed.rows.map((r) => ({ rowNumber: r.rowNumber, date: r.round?.date ?? null, courseName: r.round?.course.courseName ?? null, holes: r.round?.holes ?? null, errors: r.errors, warnings: r.warnings })),
  };
}

/** Übernimmt alle fehlerfreien Zeilen; der Scoring Record wird danach vollständig neu berechnet. */
export function importRounds(doc: MemberDoc, csv: string, newId: () => string): { doc: MemberDoc; imported: number; skipped: number } {
  const parsed = parseRoundsCsv(csv, newId, doc.profile.gender);
  let next = doc;
  let imported = 0;
  for (const row of parsed.rows) {
    if (!row.round || row.errors.length > 0) continue;
    const round: Round = { ...row.round, sequence: sequenceFor(next, row.round), status: "COMPLETED" };
    next = withRound(next, round);
    imported++;
  }
  return { doc: next, imported, skipped: parsed.rows.length - imported };
}

// ---------------------------------------------------------------------------
// Werkzeuge (Simulator, GBE-Rechner, Statistik) – alle Berechnungen hier, nicht in der UI
// ---------------------------------------------------------------------------

export function statistics(doc: MemberDoc): PlayerStatistics {
  return calculateStatistics(scoringRecordOf(doc), activeRounds(doc));
}

export function simulateDifferential(doc: MemberDoc, scoreDifferential: number, date: IsoDate = todayIso()): WhatIfResult {
  const rounds = activeRounds(doc);
  return simulateRound(doc.profile, rounds, differentialRound("__what_if__", date, scoreDifferential));
}

export function targetAnalysis(doc: MemberDoc, target: number): TargetAnalysis {
  return analyzeTarget(doc.profile, activeRounds(doc), target);
}

export interface GbeToolInput {
  handicapIndex: number;
  holes: 9 | 18;
  par: number | null;
  courseRating: number;
  slopeRating: number;
  pcc?: PccValue;
  holeData: HoleInfo[];
  strokes: HoleScore[];
}

const gbeToolSchema = z.object({
  handicapIndex: z.number().min(-10).max(54),
  holes: z.union([z.literal(9), z.literal(18)]),
  par: z.number().int().min(27).max(80).nullable(),
  courseRating: z.number().min(20).max(90),
  slopeRating: z.number().int().min(55).max(155),
  pcc: z.union([z.literal(-1), z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional(),
  holeData: z.array(z.object({ number: z.number().int().min(1).max(18), par: z.number().int().min(3).max(6), strokeIndex: z.number().int().min(1).max(18).nullable() })).min(9).max(18),
  strokes: z.array(z.union([z.number().int().min(1).max(20), z.literal("PICKUP"), z.null()])).min(9).max(18),
});

/** GBE-Rechner: Netto-Doppelbogey je Loch, GBE und Score Differential für eine Scorekarte (ohne Speichern). */
export function gbeTool(raw: unknown): RoundEvaluation {
  const parsed = gbeToolSchema.safeParse(raw);
  if (!parsed.success) throw apiError("VALIDATION", "Bitte die Eingaben prüfen.", fieldErrors(parsed.error));
  const input: GbeToolInput = parsed.data;
  const now = new Date().toISOString();
  const round: Round = {
    id: "__gbe_tool__",
    date: todayIso(),
    sequence: 0,
    title: "GBE-Rechner",
    category: "OTHER",
    format: "STROKE",
    resultStatus: "NORMAL",
    holes: input.holes,
    course: { courseName: "GBE-Rechner", country: "DE" },
    rating: { holes: input.holes, par: input.par, courseRating: input.courseRating, slopeRating: input.slopeRating },
    holeData: input.holeData,
    pcc: input.pcc ?? 0,
    entry: { mode: "HOLE_BY_HOLE", holeScores: input.strokes },
    createdAt: now,
    updatedAt: now,
  };
  return evaluateRound(round, input.handicapIndex, defaultRuleSet);
}
