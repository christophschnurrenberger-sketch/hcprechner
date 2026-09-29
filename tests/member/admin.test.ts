import { describe, expect, it } from "vitest";
import type { AdminUserRow, RoundInput } from "@/lib/api/types";
import { adminRoundDetail, adminUserDetail } from "@/lib/member/admin";
import { emptyMemberDoc, type MemberDoc } from "@/lib/member/doc";
import { rulesInfo } from "@/lib/member/rules";
import { createRound, deleteRound, type MemberContext } from "@/lib/member/service";

let n = 0;
const ctx: MemberContext = { courseLookup: () => null, newId: () => `round-${++n}`, now: new Date("2026-06-30T10:00:00Z") };

// Manuelle Platzangabe (fiktive Werte, wie von einer Scorekarte übernommen)
const input = (date: string, gbe: number): RoundInput => ({
  date,
  category: "RPR",
  holes: 18,
  course: { kind: "MANUAL", courseName: "Testplatz", gender: "M", par: 72, courseRating: 71.8, slopeRating: 135 },
  score: { mode: "GBE", adjustedGrossScore: gbe },
});

const row: AdminUserRow & { mustChangePassword: boolean } = {
  id: "u1",
  email: "max@example.de",
  username: null,
  firstName: "Max",
  lastName: "Muster",
  role: "USER",
  status: "ACTIVE",
  emailVerified: true,
  createdAt: "2026-01-01T00:00:00Z",
  lastLoginAt: null,
  lastActivityAt: null,
  rounds: 0,
  mustChangePassword: false,
};

async function docWithRounds(): Promise<MemberDoc> {
  let doc = emptyMemberDoc("u1", 18.4);
  for (const [d, g] of [["2026-05-01", 90], ["2026-05-10", 88], ["2026-05-20", 94]] as const) doc = (await createRound(doc, input(d, g), ctx)).doc;
  return doc;
}

describe("Admin-Sicht auf Mitgliederdaten", () => {
  it("ohne Runden: Initial Handicap (Start-HCPI)", () => {
    const d = adminUserDetail(row, emptyMemberDoc("u1", 18.4));
    expect(d.hcpState).toBe("INITIAL");
    expect(d.hcp.currentHandicapIndex).toBe(18.4);
    expect(d.rounds).toBe(0);
  });

  it("mit Runden: aktiver Scoring Record, gleiche Berechnung wie im Mitgliederbereich", async () => {
    const d = adminUserDetail(row, await docWithRounds());
    expect(d.hcpState).toBe("ACTIVE");
    // bestes von 3 Score Differentials (13,6) − 2,0
    expect(d.hcp.currentHandicapIndex).toBe(11.6);
    expect(d.rounds).toBe(3);
    expect(d.lastRoundDate).toBe("2026-05-20");
    expect(d.allRounds.map((r) => r.scoreDifferential)).toEqual([18.6, 13.6, 15.2]);
  });

  it("Rundendetail rechnet neu; gelöschte Runden haben kein Ergebnis mehr", async () => {
    let doc = await docWithRounds();
    const id = doc.rounds[0].id;
    const detail = adminRoundDetail({ id: "u1", name: "Max Muster", email: null }, doc, id);
    expect(detail.result?.scoreDifferential?.value).toBe(15.2);
    expect(detail.round.computed?.scoreDifferential).toBe(15.2);
    doc = deleteRound(doc, id);
    const deleted = adminRoundDetail({ id: "u1", name: "Max Muster", email: null }, doc, id);
    expect(deleted.round.status).toBe("DELETED");
    expect(deleted.result).toBeNull();
  });

  it("Regelübersicht zeigt die aktive Regelversion aus der Konfiguration", () => {
    const info = rulesInfo();
    expect(info.active.version).toBe("2026");
    const table = info.parameters.find((g) => g.group === "Berechnungstabelle");
    expect(table?.items).toHaveLength(11);
    expect(table?.items.at(-1)?.value).toBe("beste 8");
  });
});
