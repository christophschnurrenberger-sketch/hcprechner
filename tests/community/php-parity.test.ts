import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { defaultCommunitySettings, sanitizeDisplayName } from "@/lib/community/policy";
import { projectCommunity, type CommunityRound } from "@/lib/community/projection";
import { rankList } from "@/lib/community/ranking";
import type { CommunitySettings, MemberSummary } from "@/lib/community/types";
import { summarize } from "@/lib/stats/aggregate";
import { emptyHoleStat } from "@/lib/stats/holeStats";
import { roundStatistics } from "@/lib/stats/roundStatistics";

/**
 * Datenschutz-kritische Logik existiert zweimal (TypeScript für die Node-Edition, PHP für den Webspace).
 * Dieser Test stellt sicher, dass beide für dieselben Daten exakt dieselben freigegebenen Daten liefern.
 */
const hasPhp = spawnSync("php", ["-v"]).status === 0;
const dir = mkdtempSync(path.join(tmpdir(), "hcp-parity-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function php(script: string, input: unknown): unknown {
  const inFile = path.join(dir, `in-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(inFile, JSON.stringify(input));
  const code = `require ${JSON.stringify(path.resolve("webspace/php/api/_lib.php"))}; $in = json_decode(file_get_contents($argv[1]), true); ${script}`;
  return JSON.parse(execFileSync("php", ["-r", code, inFile], { encoding: "utf8" }));
}

const PUBLIC_ID = "0f3a9c2b7d6e4f10-8a1b2c3d4e5f6a7b";

function holes(): CommunityRound["holeStats"] {
  return [4, 4, 3, 5, 4, 4, 3, 5, 4].map((par, i) => ({
    ...emptyHoleStat(i + 1, par, i + 1),
    score: par + (i % 3),
    putts: i === 4 ? 3 : 2,
    gir: i % 2 === 0,
    fir: par === 3 ? null : i < 5,
    bunkerVisit: i === 1,
    bunkerShots: i === 1 ? 1 : null,
    sandSave: i === 1 ? false : null,
    upAndDown: i % 2 === 0 ? null : i === 3,
    penaltyStrokes: i === 7 ? 1 : 0,
    note: i === 0 ? "Drive rechts ins Wasser" : null,
  }));
}

function round(id: string, patch: Partial<CommunityRound>): CommunityRound {
  const hs = holes();
  return {
    id,
    date: "2026-09-18",
    sequence: 0,
    title: "Runde",
    category: "RPR",
    format: "STROKE",
    resultStatus: "NORMAL",
    holes: 9,
    course: { courseName: "Testplatz Süd", courseId: "c-1", layoutName: "Platz A", country: "DE", teeColor: "Gelb" },
    rating: { holes: 9, par: 36, courseRating: 35.9, slopeRating: 133, nine: "FRONT" },
    pcc: 0,
    entry: { mode: "AGS", adjustedGrossScore: 45 },
    notes: "Wind",
    createdAt: `2026-09-18T18:0${id.length % 10}:00Z`,
    updatedAt: "2026-09-18T19:00:00Z",
    status: "COMPLETED",
    holeStats: hs,
    computed: { scoreDifferential: 20.4, adjustedGrossScore: 45, handicapIndexBefore: 19.1, handicapIndexAfter: 18.7, engine: "test", computedAt: "x", stats: roundStatistics(hs!) },
    ...patch,
  };
}

const rounds: CommunityRound[] = [
  round("r-basic", { visibility: "MEMBERS_BASIC" }),
  round("r-full", { visibility: "MEMBERS_FULL", createdAt: "2026-09-20T08:00:00Z" }),
  round("r-private", { visibility: "PRIVATE" }),
  round("r-deleted", { visibility: "MEMBERS_FULL", status: "DELETED" }),
  round("r-hidden", { visibility: "MEMBERS_FULL", moderation: { hidden: true, reason: "Test", at: "x", by: "Admin" } }),
  round("r-quick", { visibility: "MEMBERS_FULL", holeStats: undefined, computed: { scoreDifferential: 25.1, adjustedGrossScore: 99, handicapIndexBefore: 19, handicapIndexAfter: 19, engine: "test", computedAt: "x", stats: null }, holes: 18, rating: { holes: 18, par: 72, courseRating: 71.8, slopeRating: 135 } }),
];

const summary: MemberSummary = {
  handicapIndex: 18.7,
  lowHandicapIndex: 17.9,
  roundsCount: 5,
  lastRoundDate: "2026-09-20",
  performance: summarize([{ id: "a", date: "2026-09-18", courseName: "x", courseId: null, teeColor: null, holes: 9, stats: roundStatistics(holes()!) }]),
  computedAt: "2026-09-30T10:00:00.000Z",
};

const variants: [string, Partial<CommunitySettings>][] = [
  ["alles aus", {}],
  ["Profil, Runden", { profileVisible: true, roundsVisible: true }],
  ["Profil, Runden, Statistik", { profileVisible: true, roundsVisible: true, statsVisible: true, rankingVisible: true }],
  ["mit Notizen und Anzeigename", { profileVisible: true, roundsVisible: true, statsVisible: true, notesVisible: true, displayName: "Maxi Ü." }],
  ["Runden ohne Profil", { roundsVisible: true, statsVisible: true, notesVisible: true }],
];

describe.skipIf(!hasPhp)("Parität TypeScript ↔ PHP", () => {
  const account = { id: "0123456789abcdef0123456789abcdef", firstName: "Ömer", lastName: "Übel" };
  const home = { id: "c-1", name: "Testplatz Süd", region: "SCHWABEN" };

  for (const [name, patch] of variants) {
    it(`Projektion gleich: ${name}`, () => {
      const settings: CommunitySettings = { ...defaultCommunitySettings(), publicId: PUBLIC_ID, avatarVersion: 2, updatedAt: "2026-09-01T00:00:00Z", ...patch };
      const now = "2026-09-30T12:00:00.000Z";
      const ts = projectCommunity({ userId: account.id, account, settings, summary, rounds, home, now });
      const doc = { community: settings, summary, rounds, preferences: { homeCourseId: "c-1" } };
      const out = php("echo json_encode(hcp_cm_project($in['user'], $in['doc'], $in['home'], $in['now']));", { user: account, doc, home, now });
      expect(out).toEqual(JSON.parse(JSON.stringify(ts)));
    });
  }

  it("Ranking gleich (Wettkampf-Rang, nur aktive Teilnehmer)", () => {
    const profiles = [
      { userId: "u1", publicId: "p1", displayName: "Anna", handicapIndex: 20.1, rankingVisible: true },
      { userId: "u2", publicId: "p2", displayName: "Bert", handicapIndex: 20.1, rankingVisible: true },
      { userId: "u3", publicId: "p3", displayName: "Carl", handicapIndex: 25.3, rankingVisible: true },
      { userId: "u4", publicId: "p4", displayName: "Dora", handicapIndex: 8.7, rankingVisible: false },
      { userId: "u5", publicId: "p5", displayName: "Eva", handicapIndex: 3.2, rankingVisible: true },
    ];
    const status = { u1: "ACTIVE", u2: "ACTIVE", u3: "ACTIVE", u4: "ACTIVE", u5: "DISABLED" };
    const out = php("echo json_encode(array_map(function ($p) { return [$p['publicId'], $p['position']]; }, hcp_cm_ranked($in['profiles'], $in['status'])));", { profiles, status }) as [string, number][];
    const ts = rankList(profiles.filter((p) => p.rankingVisible && status[p.userId as keyof typeof status] === "ACTIVE")).map((p) => [p.publicId, p.position]);
    expect(out).toEqual(ts);
    expect(out.map((x) => x[1])).toEqual([1, 1, 3]);
  });

  it("Zusammenfassung: ungültiger HCPI wird verworfen", () => {
    expect(php("echo json_encode(hcp_cm_clean_summary($in));", { handicapIndex: -50, roundsCount: 1 })).toBeNull();
    expect(php("echo json_encode(hcp_cm_clean_summary($in)['handicapIndex']);", { handicapIndex: 18.74, roundsCount: 1 })).toBe(18.7);
  });

  it("Anzeigename-Prüfung gleich", () => {
    for (const v of ["Max M.", "max@example.de", "www.x.de", "A", "  Ömer   Ü. "]) {
      expect(php("echo json_encode(hcp_cm_sanitize_name($in['v']));", { v })).toBe(sanitizeDisplayName(v));
    }
  });
});
