/**
 * Runde im Mitgliederbereich: WHS-Runde (unverändert, Grundlage des Handicaps) plus getrennt davon
 * Golfstatistik (Lochdaten) und Community-Angaben (Sichtbarkeit, Moderation).
 */
import type { RoundModeration, RoundVisibility } from "@/lib/community/types";
import type { HoleStat, RoundStatistics } from "@/lib/stats/types";
import type { Round, RoundComputedSnapshot } from "@/lib/whs/types";

export type MemberComputed = RoundComputedSnapshot & { stats?: RoundStatistics | null };

export type MemberRound = Round & {
  /** Entwurfs-Kennung beim Anlegen (idempotentes Speichern, z. B. nach einem Verbindungsabbruch) */
  clientRef?: string;
  /** Sichtbarkeit für andere Mitglieder (Standard: privat) */
  visibility?: RoundVisibility;
  /** Lochstatistik – Spielleistung, fließt nie ins Handicap ein */
  holeStats?: HoleStat[];
  moderation?: RoundModeration | null;
  computed?: MemberComputed | null;
};
