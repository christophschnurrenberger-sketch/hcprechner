import { describe, expect, it } from "vitest";
import { planCsvImport } from "@/lib/courses/csv";
import {
  CHANGE_LOG_LIMIT,
  applyCsvPlan,
  createCourse,
  createLayout,
  createRatingSet,
  datasetFromImport,
  emptyDataset,
  findCourse,
  mergeCourses,
  parseDataset,
  replaceHoles,
  setRatingSetActive,
  setRatingSetVerified,
  updateCourse,
  updateRatingSet,
  type CourseDataset,
  type OperationContext,
} from "@/lib/courses/dataset";
import { runCourseSearch } from "@/lib/courses/summary";
import { actionFailure, formToObject, parseHolesForm } from "@/lib/courses/adminForm";

// Deterministische IDs/Zeit für die Tests; fiktive Testdaten.
function ops(): OperationContext {
  let n = 0;
  return {
    actor: "test",
    now: () => new Date("2026-09-20T10:00:00Z"),
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  };
}

function withCourseAndLayout(o = ops()) {
  const c = createCourse(emptyDataset(), { name: "Testclub Musterstadt e.V.", city: "Musterstadt", region: "OBERBAYERN" }, o);
  const l = createLayout(c.dataset, { courseId: c.course.id, name: "Meisterschaftsplatz", type: "18_HOLE", holesCount: 18 }, o);
  return { o, ds: l.dataset, courseId: c.course.id, layoutId: l.layout.id };
}

const verifiedYellow = (layoutId: string) => ({
  layoutId,
  gender: "M",
  teeColor: "Gelb",
  holes: 18,
  par: 72,
  courseRating: "72,4".replace(",", "."),
  slopeRating: 131,
  sourceType: "OFFICIAL_SCORECARD",
  verified: true,
});

describe("Golfplatz-Datensatz (Webspace-Edition)", () => {
  it("legt Anlage mit eindeutigem Slug an und protokolliert die Änderung", () => {
    const { ds, courseId } = withCourseAndLayout();
    const course = findCourse(ds, courseId)!;
    expect(course.slug).toBe("testclub-musterstadt-e-v");
    expect(findCourse(ds, "testclub-musterstadt-e-v")?.id).toBe(courseId);
    const again = createCourse(ds, { name: "Testclub Musterstadt e.V.", city: "Musterstadt" }, ops());
    expect(again.course.slug).toBe("testclub-musterstadt-e-v-2");
    expect(ds.changes.map((c) => c.action)).toEqual(["CREATE", "CREATE"]);
    expect(ds.changes[0]).toMatchObject({ entityType: "layout", actor: "test", source: "ADMIN" });
  });

  it("ist unveränderlich: der Ausgangsdatensatz bleibt unverändert", () => {
    const base = emptyDataset();
    createCourse(base, { name: "Golfclub A", city: "Adorf" }, ops());
    expect(base.courses).toHaveLength(0);
    expect(base.changes).toHaveLength(0);
  });

  it("verifiziertes Rating nur mit CR, Slope, Par und Quelle", () => {
    const { ds, layoutId, o } = withCourseAndLayout();
    expect(() => createRatingSet(ds, { ...verifiedYellow(layoutId), slopeRating: "" }, o)).toThrow();
    expect(() => createRatingSet(ds, { ...verifiedYellow(layoutId), sourceType: "" }, o)).toThrow();
    const ok = createRatingSet(ds, verifiedYellow(layoutId), o);
    expect(ok.rating.courseRating).toBe(72.4);
    expect(ok.rating.checkedAt).toBe("2026-09-20");
    expect(ok.rating.lastVerifiedAt).toBe("2026-09-20");
  });

  it("fehlende Werte bleiben null – leere Eingaben werden nie zu 0", () => {
    const { ds, layoutId, o } = withCourseAndLayout();
    const r = createRatingSet(ds, { layoutId, gender: "F", teeColor: "Rot", holes: 18, par: 72, courseRating: "", slopeRating: "" }, o);
    expect(r.rating.courseRating).toBeNull();
    expect(r.rating.slopeRating).toBeNull();
    expect(r.rating.verified).toBe(false);
  });

  it("9-Loch-Rating auf 18-Loch-Platz verlangt Front/Back Nine", () => {
    const { ds, layoutId, o } = withCourseAndLayout();
    expect(() => createRatingSet(ds, { layoutId, gender: "M", teeColor: "Gelb", holes: 9, par: 36, courseRating: 36.1, slopeRating: 129 }, o)).toThrow(/Hälfte/);
    const front = createRatingSet(ds, { layoutId, gender: "M", teeColor: "Gelb", holes: 9, nine: "FRONT", par: 36, courseRating: 36.1, slopeRating: 129 }, o);
    expect(front.rating.nine).toBe("FRONT");
  });

  it("Driving Range: keine Plätze; Anlage mit Plätzen nicht zur Range umwandelbar", () => {
    const o = ops();
    const range = createCourse(emptyDataset(), { name: "Übungsanlage Nord", city: "Musterstadt", facilityType: "DRIVING_RANGE" }, o);
    expect(() => createLayout(range.dataset, { courseId: range.course.id, name: "Range", type: "9_HOLE", holesCount: 9 }, o)).toThrow(/Driving Range/);
    const { ds, courseId } = withCourseAndLayout();
    expect(() => updateCourse(ds, courseId, { name: "Testclub Musterstadt e.V.", city: "Musterstadt", facilityType: "DRIVING_RANGE" }, o)).toThrow(/Driving Range/);
  });

  it("Rating verifizieren / deaktivieren wird protokolliert", () => {
    const { ds, layoutId, o } = withCourseAndLayout();
    const created = createRatingSet(ds, { layoutId, gender: "M", teeColor: "Weiß", holes: 18, par: 72, courseRating: 73.9, slopeRating: 136, sourceType: "CLUB_OFFICIAL" }, o);
    let next = setRatingSetVerified(created.dataset, created.rating.id, true, "2026-09-21", o);
    next = setRatingSetActive(next, created.rating.id, false, o);
    const rating = next.courses[0].layouts[0].ratingSets.find((s) => s.id === created.rating.id)!;
    expect(rating).toMatchObject({ verified: true, checkedAt: "2026-09-21", lastVerifiedAt: "2026-09-21", active: false });
    const actions = next.changes.filter((c) => c.entityId === created.rating.id).map((c) => c.action);
    expect(actions).toEqual(["DEACTIVATE", "VERIFY", "CREATE"]);
  });

  it("verifizieren ohne vollständige Werte wird abgelehnt", () => {
    const { ds, layoutId, o } = withCourseAndLayout();
    const r = createRatingSet(ds, { layoutId, gender: "F", teeColor: "Rot", holes: 18, par: 72 }, o);
    expect(() => setRatingSetVerified(r.dataset, r.rating.id, true, null, o)).toThrow(/Verifiziert/);
  });

  it("Aktualisieren eines verifizierten Ratings behält das erste Verifizierungsdatum", () => {
    const { ds, layoutId } = withCourseAndLayout();
    const created = createRatingSet(ds, { ...verifiedYellow(layoutId), checkedAt: "2026-01-10" }, ops());
    const later: OperationContext = { ...ops(), now: () => new Date("2026-09-25T10:00:00Z") };
    const next = updateRatingSet(created.dataset, created.rating.id, { ...verifiedYellow(layoutId), checkedAt: "2026-09-25", yardage: 5900 }, later);
    const r = next.courses[0].layouts[0].ratingSets[0];
    expect(r.checkedAt).toBe("2026-09-25");
    expect(r.lastVerifiedAt).toBe("2026-01-10");
    expect(next.changes[0].changes).toMatchObject({ yardage: { from: null, to: 5900 } });
  });

  it("Lochdaten werden ersetzt und nach Lochnummer sortiert", () => {
    const { ds, layoutId, o } = withCourseAndLayout();
    const next = replaceHoles(ds, layoutId, [
      { holeNumber: 2, par: 3, strokeIndex: 17 },
      { holeNumber: 1, par: 4, strokeIndex: "" },
    ], o);
    const holes = next.courses[0].layouts[0].holes;
    expect(holes.map((h) => h.holeNumber)).toEqual([1, 2]);
    expect(holes[0].strokeIndex).toBeNull();
  });

  it("CSV-Import legt Anlage, Plätze und Ratings an; zweiter Import ändert nichts", () => {
    const csv =
      "course_name,official_name,city,region,layout_name,holes,gender,tee_color,tee_name,par,course_rating,slope_rating,yardage,source_type,source_url,valid_from,valid_to,verified,nine\n" +
      "Beispiel Golfpark,,Beispielort,Schwaben,Platz A,18,M,Gelb,,72,71.2,127,,Official Scorecard,https://example.org/a.pdf,2026-01-01,,true,\n" +
      "Beispiel Golfpark,,Beispielort,Schwaben,Platz A,9,M,Gelb,,36,35.6,126,,Official Scorecard,https://example.org/a.pdf,2026-01-01,,true,FRONT\n" +
      "Beispiel Golfpark,,Beispielort,Schwaben,Platz B,9,F,Rot,,34,33.9,120,,,,,,false,";
    const base = emptyDataset();
    const plan = planCsvImport(csv, base.courses);
    expect(plan.summary.invalid).toBe(0);
    const { dataset, result } = applyCsvPlan(base, plan, ops());
    expect(result).toMatchObject({ createdCourses: 1, createdLayouts: 2, createdRatings: 3, updatedRatings: 0, skipped: 0 });
    const park = dataset.courses.find((c) => c.name === "Beispiel Golfpark")!;
    expect(park.layouts.map((l) => [l.name, l.type])).toEqual([
      ["Platz A", "18_HOLE"],
      ["Platz B", "9_HOLE"],
    ]);
    expect(dataset.importRuns[0]).toMatchObject({ kind: "CSV", status: "APPLIED" });
    expect(dataset.changes.every((c) => c.source === "CSV_IMPORT")).toBe(true);
    expect(planCsvImport(csv, dataset.courses).summary.unchanged).toBe(3);
  });

  it("CSV-Import ist alles-oder-nichts: Fehler lässt den Datensatz unverändert", () => {
    const { ds } = withCourseAndLayout();
    const plan = planCsvImport(
      "course_name,official_name,city,region,layout_name,holes,gender,tee_color,tee_name,par,course_rating,slope_rating,yardage,source_type,source_url,valid_from,valid_to,verified\n" +
        "Neuer Club,,Neustadt,,Platz,18,M,Gelb,,72,71.2,127,,,,,,false\n",
      ds.courses,
    );
    // Plan auf einen Datensatz anwenden, in dem die Zielanlage des Plans fehlt → Fehler, Original unverändert
    const broken = { ...plan, rows: plan.rows.map((r) => ({ ...r, layout: { ...r.layout, id: "fehlt" } })) };
    expect(() => applyCsvPlan(ds, broken, ops())).toThrow();
    expect(ds.courses).toHaveLength(1);
  });

  it("Anlagen zusammenführen verschiebt die Plätze und deaktiviert die Quelle", () => {
    const { ds, courseId, o } = withCourseAndLayout();
    const dup = createCourse(ds, { name: "GC Musterstadt", city: "Musterstadt" }, o);
    const withLayout = createLayout(dup.dataset, { courseId: dup.course.id, name: "Kurzplatz", type: "SHORT_COURSE", holesCount: 9 }, o);
    const merged = mergeCourses(withLayout.dataset, courseId, dup.course.id, o);
    const target = findCourse(merged, courseId)!;
    expect(target.layouts.map((l) => l.name)).toEqual(["Kurzplatz", "Meisterschaftsplatz"]);
    expect(target.layouts.every((l) => l.courseId === courseId)).toBe(true);
    const source = findCourse(merged, dup.course.id)!;
    expect(source.active).toBe(false);
    expect(source.layouts).toHaveLength(0);
    expect(() => mergeCourses(merged, courseId, courseId, o)).toThrow(/identisch/);
  });

  it("Änderungsprotokoll ist begrenzt", () => {
    let ds: CourseDataset = emptyDataset();
    const o = ops();
    ds = { ...ds, changes: Array.from({ length: CHANGE_LOG_LIMIT }, (_, i) => ({ id: `x${i}`, entityType: "course" as const, entityId: null, action: "X", source: "ADMIN" as const, changes: null, actor: null, createdAt: "2026-01-01T00:00:00Z" })) };
    ds = createCourse(ds, { name: "Golfclub B", city: "Bdorf" }, o).dataset;
    expect(ds.changes).toHaveLength(CHANGE_LOG_LIMIT);
    expect(ds.changes[0].action).toBe("CREATE");
  });

  it("Datensatz wird beim Laden geprüft; Export der Node-Edition kann eingespielt werden", () => {
    const { ds } = withCourseAndLayout();
    const roundTrip = parseDataset(JSON.parse(JSON.stringify(ds)));
    expect(roundTrip.courses[0].name).toBe("Testclub Musterstadt e.V.");
    expect(() => parseDataset({ format: "anders", courses: [] })).toThrow();
    const base = { ...emptyDataset(), revision: 7 };
    const fromNode = datasetFromImport({ exportedAt: "2026-09-20T00:00:00Z", courses: ds.courses }, base);
    expect(fromNode.courses).toHaveLength(1);
    expect(fromNode.revision).toBe(7);
    const restored = datasetFromImport({ ...ds, revision: 99 }, base);
    expect(restored.revision).toBe(7);
  });

  it("Suche im Browser liefert dieselbe Zusammenfassung wie die Node-API", () => {
    const { ds, layoutId, o } = withCourseAndLayout();
    const withRating = createRatingSet(ds, verifiedYellow(layoutId), o).dataset;
    const res = runCourseSearch(withRating.courses, new URLSearchParams({ q: "muster", has18: "1" }));
    expect(res.totalCourses).toBe(1);
    expect(res.results[0]).toMatchObject({ slug: "testclub-musterstadt-e-v", has18: true, verifiedRatingCount: 1, teeColors: ["Gelb"] });
    expect(res.results[0].layouts[0].ratings[0]).toMatchObject({ courseRating: 72.4, slopeRating: 131, par: 72 });
    expect(runCourseSearch(withRating.courses, new URLSearchParams({ region: "SCHWABEN" })).total).toBe(0);
    expect(runCourseSearch(withRating.courses, new URLSearchParams({ limit: "abc" })).results).toHaveLength(1);
  });
});

describe("Admin-Formulare (gemeinsam für beide Editionen)", () => {
  it("wandelt Formulardaten um (Dezimalkomma, Checkboxen, Steuerfelder)", () => {
    const fd = new FormData();
    fd.set("id", "abc");
    fd.set("$ACTION_ID", "x");
    fd.set("courseRating", "71,8");
    fd.set("active__present", "1");
    fd.set("verified__present", "1");
    fd.set("verified", "on");
    fd.set("teeColor", " Gelb ");
    expect(formToObject(fd)).toEqual({ courseRating: "71.8", active: false, verified: true, teeColor: "Gelb" });
  });

  it("Lochdaten: doppelter Stroke Index wird abgelehnt, leere Löcher übersprungen", () => {
    const fd = new FormData();
    fd.set("layoutId", "L1");
    fd.set("count", "3");
    fd.set("par_1", "4");
    fd.set("si_1", "5");
    fd.set("par_2", "");
    fd.set("par_3", "3");
    fd.set("si_3", "7");
    expect(parseHolesForm(fd).holes.map((h) => h.holeNumber)).toEqual([1, 3]);
    fd.set("si_3", "5");
    expect(() => parseHolesForm(fd)).toThrow(/doppelt/);
  });

  it("Fehlermeldungen enthalten Feldhinweise aus der Validierung", () => {
    const { ds, layoutId, o } = withCourseAndLayout();
    try {
      createRatingSet(ds, { layoutId, gender: "M", teeColor: "Gelb", holes: 18, par: 50, courseRating: 72, slopeRating: 130 }, o);
      expect.unreachable();
    } catch (error) {
      const state = actionFailure(error);
      expect(state.ok).toBe(false);
      expect(state.fieldErrors?.par).toMatch(/Par/);
    }
  });
});
