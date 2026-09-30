/**
 * Daten eines Mitglieds (ein Dokument je Benutzer): Spielerprofil, Runden, Entwürfe, Vorlieben,
 * Community-Einstellungen und die vom Backend berechnete Zusammenfassung (Grundlage für Ranking/Profil).
 * Beide Backends speichern genau diese Struktur; ältere Stände (Konto-Version 1) werden beim Lesen ergänzt.
 */
import { z } from "zod";
import { DEFAULT_RULESET_REF } from "@/rules/whs/registry";
import { profileSchema, roundSchema } from "@/lib/store/schema";
import { defaultCommunitySettings } from "@/lib/community/policy";
import type { CommunitySettings, MemberSummary } from "@/lib/community/types";
import type { DraftRound, MemberPreferences } from "@/lib/api/types";
import type { PlayerProfile } from "@/lib/whs/types";
import type { MemberRound } from "./round";

export interface MemberDoc {
  profile: PlayerProfile;
  rounds: MemberRound[];
  drafts: DraftRound[];
  preferences: MemberPreferences & { onboardedAt: string | null };
  community: CommunitySettings;
  /** Stand der letzten Änderung (HCPI, Rundenzahl, Statistik) – vom Backend bzw. Adapter berechnet */
  summary: MemberSummary | null;
}

const draftSchema = z.object({
  id: z.string().min(1),
  updatedAt: z.string(),
  label: z.string().default("Entwurf"),
  input: z.record(z.string(), z.unknown()),
});

const visibility = z.enum(["PRIVATE", "MEMBERS_BASIC", "MEMBERS_FULL"]);

const communitySchema = z.object({
  displayName: z.string().max(60).nullable().default(null),
  rankingVisible: z.boolean().default(false),
  profileVisible: z.boolean().default(false),
  roundsVisible: z.boolean().default(false),
  statsVisible: z.boolean().default(false),
  notesVisible: z.boolean().default(false),
  defaultRoundVisibility: visibility.default("PRIVATE"),
  publicId: z.string().max(64).nullable().default(null),
  avatarVersion: z.number().int().nullable().default(null),
  updatedAt: z.string().nullable().default(null),
});

const summarySchema = z.object({
  handicapIndex: z.number(),
  lowHandicapIndex: z.number().nullable(),
  roundsCount: z.number().int(),
  lastRoundDate: z.string().nullable(),
  performance: z.record(z.string(), z.unknown()).nullable(),
  computedAt: z.string(),
});

const docSchema = z.object({
  profile: profileSchema,
  rounds: z.array(roundSchema).default([]),
  drafts: z.array(draftSchema).default([]),
  preferences: z
    .object({
      favorites: z.array(z.string()).default([]),
      homeCourseId: z.string().nullable().default(null),
      onboardedAt: z.string().nullable().default(null),
      roundEntryMode: z.enum(["ASK", "QUICK", "DETAILED"]).default("ASK"),
    })
    .default({ favorites: [], homeCourseId: null, onboardedAt: null, roundEntryMode: "ASK" }),
  community: communitySchema.default(defaultCommunitySettings()),
  summary: summarySchema.nullable().optional(),
});

export function defaultMemberProfile(id: string, startHandicapIndex = 54): PlayerProfile {
  return { id, gender: "M", startHandicapIndex, startDate: null, brake265LiftedAt: null, ruleSet: { ...DEFAULT_RULESET_REF } };
}

export function emptyMemberDoc(userId: string, startHandicapIndex = 54): MemberDoc {
  return {
    profile: defaultMemberProfile(userId, startHandicapIndex),
    rounds: [],
    drafts: [],
    preferences: { favorites: [], homeCourseId: null, onboardedAt: null, roundEntryMode: "ASK" },
    community: defaultCommunitySettings(),
    summary: null,
  };
}

/**
 * Gespeicherte Daten prüfen und ergänzen. `null` (noch nichts gespeichert) → leeres Dokument.
 * Wirft bei beschädigten Daten (die Backends melden das als Serverfehler).
 */
export function normalizeMemberDoc(raw: unknown, userId: string): MemberDoc {
  if (raw === null || raw === undefined) return emptyMemberDoc(userId);
  const parsed = docSchema.parse(raw);
  // Konto-Version 1 speicherte die Vorlieben noch nicht; Heimatplatz stand im Profil
  const home = parsed.preferences.homeCourseId ?? parsed.profile.homeCourseId ?? null;
  return {
    profile: parsed.profile as PlayerProfile,
    rounds: (parsed.rounds as MemberRound[]).map((r) => ({ ...r, status: r.status ?? "COMPLETED" })),
    drafts: parsed.drafts as DraftRound[],
    preferences: { ...parsed.preferences, homeCourseId: home },
    community: parsed.community as CommunitySettings,
    summary: (parsed.summary ?? null) as MemberSummary | null,
  };
}

/** Vorlieben für die Oberfläche (ohne interne Felder). */
export function publicPreferences(doc: Pick<MemberDoc, "preferences">): MemberPreferences {
  return { favorites: doc.preferences.favorites, homeCourseId: doc.preferences.homeCourseId, roundEntryMode: doc.preferences.roundEntryMode ?? "ASK" };
}

/** Runden, die in die Berechnung eingehen (gelöschte bleiben gespeichert, zählen aber nicht). */
export function activeRounds(doc: Pick<MemberDoc, "rounds">): MemberRound[] {
  return doc.rounds.filter((r) => r.status !== "DELETED");
}

export function withRound(doc: MemberDoc, round: MemberRound): MemberDoc {
  const exists = doc.rounds.some((r) => r.id === round.id);
  return { ...doc, rounds: exists ? doc.rounds.map((r) => (r.id === round.id ? round : r)) : [...doc.rounds, round] };
}

/** Soft Delete: Runde bleibt erhalten (Status DELETED), der Scoring Record wird ohne sie neu berechnet. */
export function withoutRound(doc: MemberDoc, roundId: string, now = new Date().toISOString()): MemberDoc {
  return { ...doc, rounds: doc.rounds.map((r) => (r.id === roundId ? { ...r, status: "DELETED" as const, deletedAt: now, updatedAt: now } : r)) };
}
