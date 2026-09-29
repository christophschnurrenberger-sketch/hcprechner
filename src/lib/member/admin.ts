/**
 * Admin-Sicht auf Mitgliederdaten (gleiche Berechnung wie im Mitgliederbereich).
 * Node-Edition: auf dem Server; Webspace-Edition: im API-Adapter mit dem Dokument aus api/admin.php.
 */
import { apiError } from "@/lib/api/errors";
import type { AdminRoundDetail, AdminUserDetail, AdminUserRow } from "@/lib/api/types";
import { activeRounds, type MemberDoc } from "./doc";
import { computeHcp, listRounds, scoringRecordOf, toListItem } from "./hcp";
import { engineLabel } from "./engine";

export function adminUserDetail(row: AdminUserRow & { mustChangePassword: boolean }, doc: MemberDoc): AdminUserDetail {
  const hcp = computeHcp(doc);
  const rounds = activeRounds(doc);
  const lastRoundDate = rounds.map((r) => r.date).sort().at(-1) ?? null;
  return {
    ...row,
    rounds: rounds.length,
    hcpState: hcp.status,
    hcp,
    lastRoundDate,
    profile: doc.profile,
    allRounds: listRounds(doc),
  };
}

export function adminRoundDetail(user: AdminRoundDetail["user"], doc: MemberDoc, roundId: string): AdminRoundDetail {
  const round = doc.rounds.find((r) => r.id === roundId);
  if (!round) throw apiError("ROUND_NOT_FOUND");
  const deleted = round.status === "DELETED";
  const result = deleted ? null : (scoringRecordOf(doc).rounds.find((r) => r.roundId === roundId) ?? null);
  return {
    user,
    round,
    result,
    item: result ? toListItem(round, result) : null,
    engine: engineLabel(),
    computedAt: new Date().toISOString(),
  };
}
