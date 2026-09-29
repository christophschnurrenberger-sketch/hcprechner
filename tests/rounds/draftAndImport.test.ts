import { describe, expect, it } from "vitest";
import { buildRound, draftFromRound, emptyDraft } from "@/lib/rounds/draft";
import { parseRoundsCsv, roundsToCsv } from "@/lib/export/roundsCsv";
import { parseImport, toExport, emptyData, exampleRounds } from "@/lib/store/localStore";
import { calculateScoringRecord } from "@/lib/whs/scoringRecord";
import { courseInputSchema, ratingSetInputSchema } from "@/lib/courses/validation";
import { makeProfile } from "../whs/helpers";

describe("Wizard-Draft → gespeicherte Runde", () => {
  const profile = makeProfile({ startHandicapIndex: 36 });

  it("manuelles Rating mit Dezimalkomma wird als unveränderlicher Snapshot gespeichert", () => {
    const d = {
      ...emptyDraft(profile, "r1"),
      date: "2026-09-01",
      courseMode: "MANUAL" as const,
      course: { courseName: "Auslandsplatz", country: "ES", gender: "M" as const },
      manualRating: { courseRating: "71,3", slopeRating: "128", par: "72" },
      ags: "95",
    };
    const round = buildRound(d);
    expect(round.rating).toMatchObject({ holes: 18, courseRating: 71.3, slopeRating: 128, par: 72, manual: true, verified: false });
    expect(round.entry).toMatchObject({ mode: "AGS", adjustedGrossScore: 95 });
    expect(round.course.country).toBe("ES");
    const sd = calculateScoringRecord(profile, [round], { today: "2026-09-29" }).rounds[0].scoreDifferential!;
    // 113/128 × (95 − 71,3) = 20,92 → 20,9
    expect(sd.value).toBe(20.9);
  });

  it("„Nur Score Differential“ speichert eine SD-Übernahme ohne Rating und PCC 0", () => {
    const d = { ...emptyDraft(profile, "r2"), courseMode: "NONE" as const, scoreDifferential: "24,6", officialHandicapIndexAfter: "30,1", pcc: 2 as const };
    const round = buildRound(d);
    expect(round.entry).toMatchObject({ mode: "SCORE_DIFFERENTIAL", scoreDifferential: 24.6, officialHandicapIndexAfter: 30.1 });
    expect(round.pcc).toBe(0);
    expect(round.rating.courseRating).toBeNull();
  });

  it("9-Loch-Runde speichert das 9-Loch-Rating mit Hälfte", () => {
    const d = {
      ...emptyDraft(profile, "r3"),
      courseMode: "MANUAL" as const,
      course: { courseName: "Platz", country: "DE" },
      holesMode: 9 as const,
      nine: "BACK" as const,
      manualRating: { courseRating: "35,9", slopeRating: "124", par: "36" },
      ags: "48",
    };
    const round = buildRound(d);
    expect(round.holes).toBe(9);
    expect(round.rating).toMatchObject({ holes: 9, nine: "BACK", courseRating: 35.9 });
  });

  it("Bearbeiten: Runde → Draft → Runde bleibt inhaltlich gleich", () => {
    const d = {
      ...emptyDraft(profile, "r4"),
      date: "2026-07-07",
      courseMode: "MANUAL" as const,
      course: { courseName: "Platz", country: "DE", teeColor: "Gelb" },
      manualRating: { courseRating: "72,4", slopeRating: "131", par: "72" },
      ags: "101",
      pcc: 1 as const,
    };
    const round = buildRound(d);
    const again = buildRound(draftFromRound(round));
    expect({ ...again, updatedAt: "" }).toEqual({ ...round, updatedAt: "" });
  });

  it("abgebrochene Runde zählt die gespielten Löcher", () => {
    const d = {
      ...emptyDraft(profile, "r5"),
      courseMode: "MANUAL" as const,
      course: { courseName: "Platz", country: "DE" },
      holesMode: "PARTIAL" as const,
      entryMode: "HOLE_BY_HOLE" as const,
      holeScores: [...Array(14).fill(5), null, null, null, null],
      manualRating: { courseRating: "72,0", slopeRating: "113", par: "72" },
    };
    expect(buildRound(d).holesPlayed).toBe(14);
  });
});

describe("Runden-CSV-Import und -Export", () => {
  let n = 0;
  const id = () => `csv-${++n}`;

  it("liest Datum, Turnier, Golfplatz, Tee, Löcher, GBE, CR, Slope, PCC", () => {
    const csv = "Datum;Turnier;Golfplatz;Tee;Löcher;GBE;CR;Slope;PCC\n15.08.2026;Monatspreis;Irgendwo;gelb;18;94;71,8;135;0";
    const { rows, missing } = parseRoundsCsv(csv, id, "M");
    expect(missing).toEqual([]);
    expect(rows[0].errors).toEqual([]);
    const round = rows[0].round!;
    expect(round).toMatchObject({ date: "2026-08-15", title: "Monatspreis", holes: 18 });
    expect(round.course.teeColor).toBe("Gelb");
    const sd = calculateScoringRecord(makeProfile(), [round], { today: "2026-09-29" }).rounds[0].scoreDifferential!;
    expect(sd.value).toBe(18.6);
  });

  it("meldet fehlende Werte zeilenweise", () => {
    const csv = "Datum,GBE,CR,Slope\n2026-08-01,,71.8,135\n2026-08-02,95,,135";
    const { rows } = parseRoundsCsv(csv, id, "M");
    expect(rows[0].errors.join(" ")).toMatch(/GBE oder Score Differential fehlt/);
    expect(rows[1].errors.join(" ")).toMatch(/CR und Slope/);
  });

  it("übernimmt Score Differentials ohne Platzdaten", () => {
    const { rows } = parseRoundsCsv("Datum;Score Differential\n2026-05-01;22,4", id, "F");
    expect(rows[0].round?.entry).toMatchObject({ mode: "SCORE_DIFFERENTIAL", scoreDifferential: 22.4 });
  });

  it("Export enthält Berechnungsergebnisse", () => {
    const rounds = exampleRounds("2026-09-29");
    const result = calculateScoringRecord(makeProfile(), rounds, { today: "2026-09-29" });
    const csv = roundsToCsv(rounds, result);
    expect(csv.split("\n")).toHaveLength(rounds.length + 1);
    expect(csv).toContain("Adjusted SD");
  });
});

describe("Local Mode: JSON-Export/-Import", () => {
  it("Export → Import ist verlustfrei", () => {
    const data = { ...emptyData(), rounds: exampleRounds("2026-09-29") };
    const parsed = parseImport(JSON.stringify(toExport(data)));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.rounds).toEqual(data.rounds);
      expect(parsed.data.profile).toEqual(data.profile);
    }
  });

  it("ungültige Dateien werden abgelehnt", () => {
    expect(parseImport("{").ok).toBe(false);
    expect(parseImport(JSON.stringify({ version: 1, profile: {}, rounds: [] })).ok).toBe(false);
  });
});

describe("Admin-Formularvalidierung", () => {
  it("leere Zahlenfelder werden null, nicht 0", () => {
    const c = courseInputSchema.parse({ name: "Test", latitude: "", longitude: "" });
    expect(c.latitude).toBeNull();
    expect(c.longitude).toBeNull();
  });

  it("verifiziertes Rating ohne Werte oder Quelle wird abgelehnt", () => {
    const base = { layoutId: "0b700a01-589b-4e91-a8aa-49e4d2777998", gender: "M", teeColor: "Gelb", holes: "18", verified: true };
    expect(ratingSetInputSchema.safeParse({ ...base, par: "72", courseRating: "72.4" }).success).toBe(false);
    expect(ratingSetInputSchema.safeParse({ ...base, par: "72", courseRating: "72.4", slopeRating: "131" }).success).toBe(false);
    expect(ratingSetInputSchema.safeParse({ ...base, par: "72", courseRating: "72.4", slopeRating: "131", sourceType: "DGV" }).success).toBe(true);
  });

  it("unplausibles 9-Loch-Rating (18-Loch-Wert eingetragen) wird abgelehnt", () => {
    const r = ratingSetInputSchema.safeParse({
      layoutId: "0b700a01-589b-4e91-a8aa-49e4d2777998",
      gender: "M",
      teeColor: "Gelb",
      holes: "9",
      nine: "FRONT",
      par: "36",
      courseRating: "72.4",
      slopeRating: "131",
    });
    expect(r.success).toBe(false);
  });
});
