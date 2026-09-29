import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Eingebettete In-Memory-Datenbank (oder TEST_DATABASE_URL für echtes PostgreSQL); fiktive Testdaten.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
} else {
  process.env.PGLITE_DIR = "memory://";
  delete process.env.DATABASE_URL;
}

const repo = await import("@/server/courseRepository");
const { closeDb } = await import("@/db/client");
const { planCsvImport } = await import("@/lib/courses/csv");

describe("Golfplatz-Repository (PGlite)", () => {
  let courseId = "";
  let layoutId = "";

  beforeAll(async () => {
    const c = await repo.createCourse({ name: "Testclub Musterstadt e.V.", city: "Musterstadt", region: "OBERBAYERN" });
    courseId = c.id;
    const l = await repo.createLayout({ courseId, name: "Meisterschaftsplatz", type: "18_HOLE", holesCount: 18 });
    layoutId = l.id;
  });

  afterAll(async () => {
    await closeDb();
  });

  it("legt Anlage mit eindeutigem Slug und normalisiertem Namen an", async () => {
    const course = await repo.getCourse(courseId);
    expect(course?.slug).toBe("testclub-musterstadt-e-v");
    expect(course?.layouts).toHaveLength(1);
    const again = await repo.createCourse({ name: "Testclub Musterstadt e.V.", city: "Musterstadt" });
    expect(again.slug).not.toBe(course?.slug);
  });

  it("verifiziertes Rating nur mit vollständigen Werten und Quelle", async () => {
    await expect(
      repo.createRatingSet({ layoutId, gender: "M", teeColor: "Gelb", holes: 18, par: 72, courseRating: 72.4, verified: true }),
    ).rejects.toThrow();
    const ok = await repo.createRatingSet({
      layoutId,
      gender: "M",
      teeColor: "Gelb",
      holes: 18,
      par: 72,
      courseRating: 72.4,
      slopeRating: 131,
      sourceType: "OFFICIAL_SCORECARD",
      verified: true,
      checkedAt: "2026-09-20",
    });
    expect(Number(ok.courseRating)).toBe(72.4);
    expect(ok.lastVerifiedAt).toBe("2026-09-20");
  });

  it("nicht verifizierte Ratings dürfen fehlende Werte haben (NULL, nie geschätzt)", async () => {
    const r = await repo.createRatingSet({ layoutId, gender: "F", teeColor: "Rot", holes: 18, par: 72 });
    expect(r.courseRating).toBeNull();
    expect(r.slopeRating).toBeNull();
    expect(r.verified).toBe(false);
  });

  it("9-Loch-Rating auf 18-Loch-Platz verlangt Front/Back", async () => {
    await expect(
      repo.createRatingSet({ layoutId, gender: "M", teeColor: "Gelb", holes: 9, par: 36, courseRating: 36.1, slopeRating: 129 }),
    ).rejects.toThrow(/Hälfte/);
  });

  it("Driving Range: keine Layouts möglich", async () => {
    const range = await repo.createCourse({ name: "Übungsanlage Nord", city: "Musterstadt", facilityType: "DRIVING_RANGE" });
    await expect(repo.createLayout({ courseId: range.id, name: "Range", type: "9_HOLE", holesCount: 9 })).rejects.toThrow(
      /Driving Range/,
    );
  });

  it("Rating verifizieren / deaktivieren wird protokolliert", async () => {
    const r = await repo.createRatingSet({
      layoutId,
      gender: "M",
      teeColor: "Weiß",
      holes: 18,
      par: 72,
      courseRating: 73.9,
      slopeRating: 136,
      sourceType: "CLUB_OFFICIAL",
    });
    await repo.setRatingSetVerified(r.id, true, "2026-09-21");
    await repo.setRatingSetActive(r.id, false);
    const changes = await repo.recentChanges(100);
    const actions = changes.filter((c) => c.entityId === r.id).map((c) => c.action);
    expect(actions).toEqual(expect.arrayContaining(["CREATE", "VERIFY", "DEACTIVATE"]));
  });

  it("CSV-Import erst nach Plan, mit Anlage/Layout/Rating", async () => {
    const existing = await repo.loadAllCourses();
    const csv =
      "course_name,official_name,city,region,layout_name,holes,gender,tee_color,tee_name,par,course_rating,slope_rating,yardage,source_type,source_url,valid_from,valid_to,verified,nine\n" +
      "Beispiel Golfpark,,Beispielort,Schwaben,Platz A,18,M,Gelb,,72,71.2,127,,Official Scorecard,https://example.org/a.pdf,2026-01-01,,true,\n" +
      "Beispiel Golfpark,,Beispielort,Schwaben,Platz A,9,M,Gelb,,36,35.6,126,,Official Scorecard,https://example.org/a.pdf,2026-01-01,,true,FRONT\n" +
      "Beispiel Golfpark,,Beispielort,Schwaben,Platz B,9,F,Rot,,34,33.9,120,,,,,,false,";
    const plan = planCsvImport(csv, existing);
    expect(plan.summary.invalid).toBe(0);
    expect(plan.summary.newCourses).toBe(1);
    const result = await repo.applyCsvPlan(plan);
    expect(result).toMatchObject({ createdCourses: 1, createdLayouts: 2, createdRatings: 3 });
    const after = await repo.loadAllCourses();
    const park = after.find((c) => c.name === "Beispiel Golfpark")!;
    expect(park.layouts.map((l) => l.name)).toEqual(["Platz A", "Platz B"]);
    expect(park.layouts[0].type).toBe("18_HOLE");
    expect(park.layouts[1].type).toBe("9_HOLE");
    // zweiter Import derselben Datei: keine Änderungen
    const replan = planCsvImport(csv, after);
    expect(replan.summary.unchanged).toBe(3);
  });

  it("Anlagen zusammenführen verschiebt die Plätze", async () => {
    const dup = await repo.createCourse({ name: "GC Musterstadt", city: "Musterstadt" });
    await repo.createLayout({ courseId: dup.id, name: "Kurzplatz", type: "SHORT_COURSE", holesCount: 9 });
    await repo.mergeCourses(courseId, dup.id);
    const target = await repo.getCourse(courseId);
    expect(target?.layouts.map((l) => l.name)).toContain("Kurzplatz");
    const source = await repo.getCourse(dup.id);
    expect(source?.active).toBe(false);
  });
});
