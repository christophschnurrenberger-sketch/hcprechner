import { exportSchema } from "@/lib/store/schema";
import type { PlayerProfile, Round } from "@/lib/whs/types";

export interface SyncPayload {
  profile: PlayerProfile;
  rounds: Round[];
}

/** Prüft Profil + Runden (gleiches Schema wie der JSON-Export). Wirft bei ungültigen Daten. */
export function parsePayload(body: unknown): SyncPayload {
  const parsed = exportSchema.parse({ version: 1, ...(body as object) });
  return { profile: parsed.profile as PlayerProfile, rounds: parsed.rounds as Round[] };
}
