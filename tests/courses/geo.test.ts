import { describe, expect, it } from "vitest";
import { applyGreenCsvPlan, emptyDataset, parseDataset, setGreenCoordinates, type CourseDataset } from "@/lib/courses/dataset";
import {
  courseGreenCoverage,
  coverageLabel,
  greenCoverage,
  greenForHole,
  greenWarnings,
  layoutHasGreens,
  mergeGreenUpdates,
  parseCoordinatePair,
} from "@/lib/courses/geo";
import { greensToCsv, planGreenCsvImport } from "@/lib/courses/greenCsv";
import type { CourseDto, HoleGeoDto, LayoutDto } from "@/lib/courses/types";
import { greenInputSchema } from "@/lib/courses/validation";

// Fiktive Testanlage – keine echten Platz- oder Grünkoordinaten.
const C = { latitude: 47.94, longitude: 10.31 };
const pt = (dLat: number, dLng: number) => ({ latitude: +(C.latitude + dLat).toFixed(6), longitude: +(C.longitude + dLng).toFixed(6) });

function geo(holeNumber: number, extra: Partial<HoleGeoDto["green"]> = {}): HoleGeoDto {
  return { layoutId: "l1", holeNumber, green: { front: null, center: pt(holeNumber * 0.001, 0), back: null, polygon: null, pin: null, ...extra }, tees: [], source: "MANUAL", updatedAt: "2026-09-01T10:00:00.000Z" };
}

function layout(overrides: Partial<LayoutDto> = {}): LayoutDto {
  return { id: "l1", courseId: "c1", name: "Meisterschaftsplatz", type: "18_HOLE", combinationName: null, holesCount: 18, active: true, notes: null, ratingSets: [], holes: [], holeGeo: [], ...overrides };
}

function course(overrides: Partial<CourseDto> = {}): CourseDto {
  return {
    id: "c1",
    slug: "testclub",
    name: "Testclub (fiktiv)",
    officialName: null,
    clubName: null,
    facilityType: "GOLF_COURSE",
    city: "Teststadt",
    postalCode: null,
    address: null,
    federalState: "BY",
    country: "DE",
    region: null,
    latitude: C.latitude,
    longitude: C.longitude,
    website: null,
    officialSourceUrl: null,
    bayernGolfverbandUrl: null,
    externalClubId: null,
    active: true,
    verified: false,
    lastVerifiedAt: null,
    notes: null,
    layouts: [layout()],
    ...overrides,
  };
}

describe("Koordinaten lesen und prüfen", () => {
  it("liest „Breite, Länge“ in üblichen Schreibweisen", () => {
    expect(parseCoordinatePair("47.941234, 10.312345")).toEqual({ latitude: 47.941234, longitude: 10.312345 });
    expect(parseCoordinatePair("47,941234; 10,312345")).toEqual({ latitude: 47.941234, longitude: 10.312345 });
    expect(parseCoordinatePair("47,941234, 10,312345")).toEqual({ latitude: 47.941234, longitude: 10.312345 });
    expect(parseCoordinatePair("47.941234 10.312345")).toEqual({ latitude: 47.941234, longitude: 10.312345 });
    expect(parseCoordinatePair("-33.8688,151.2093")).toEqual({ latitude: -33.8688, longitude: 151.2093 });
    expect(parseCoordinatePair("  ")).toBeNull();
  });

  it("lehnt ungültige Koordinaten ab (Breite 999, Länge 200, Text)", () => {
    expect(parseCoordinatePair("999, 10.3")).toBe("INVALID");
    expect(parseCoordinatePair("47.9, 200")).toBe("INVALID");
    expect(parseCoordinatePair("irgendwo")).toBe("INVALID");
    expect(parseCoordinatePair("47.9")).toBe("INVALID");
    expect(greenInputSchema.safeParse({ holeNumber: 7, center: { latitude: 999, longitude: 10 } }).success).toBe(false);
    expect(greenInputSchema.safeParse({ holeNumber: 7, center: { latitude: 47.9, longitude: -181 } }).success).toBe(false);
    expect(greenInputSchema.safeParse({ holeNumber: 7, center: { latitude: 47.9, longitude: 10.3 } }).success).toBe(true);
  });

  it("Hinweise: vertauschte Breite/Länge, weit entfernt, Front weit von der Mitte", () => {
    const anchor = { latitude: C.latitude, longitude: C.longitude };
    expect(greenWarnings({ front: null, center: { latitude: C.longitude, longitude: C.latitude }, back: null }, anchor)[0]).toMatch(/vertauscht/);
    expect(greenWarnings({ front: null, center: { latitude: 48.5, longitude: 11.5 }, back: null }, anchor)[0]).toMatch(/km von der Anlage/);
    expect(greenWarnings({ front: pt(0.002, 0), center: pt(0, 0), back: null }, anchor)[0]).toMatch(/Grünmitte/);
    expect(greenWarnings({ front: pt(-0.0001, 0), center: pt(0, 0), back: pt(0.0001, 0) }, anchor)).toEqual([]);
  });
});

describe("Grün je Loch und Abdeckung", () => {
  it("Abdeckung: 18/18 ✓, 11/18 ⚠, ohne Daten –", () => {
    const full = layout({ holeGeo: Array.from({ length: 18 }, (_, i) => geo(i + 1)) });
    expect(coverageLabel(greenCoverage(full))).toBe("18/18 ✓");
    const partial = layout({ holeGeo: Array.from({ length: 11 }, (_, i) => geo(i + 1)) });
    const c = greenCoverage(partial);
    expect(coverageLabel(c)).toBe("11/18 ⚠");
    expect(c.missing).toEqual([12, 13, 14, 15, 16, 17, 18]);
    expect(coverageLabel(greenCoverage(layout()))).toBe("–");
    expect(layoutHasGreens(layout())).toBe(false);
    expect(courseGreenCoverage(course({ layouts: [full] })).level).toBe("COMPLETE");
  });

  it("9-Loch-Platz zweimal gespielt: Loch 10 nutzt das Grün von Loch 1 (nur ohne eigenen Eintrag)", () => {
    const nine = layout({ holesCount: 9, type: "9_HOLE", holeGeo: [geo(1), geo(2)] });
    expect(greenForHole(nine, 10)?.center).toEqual(geo(1).green.center);
    expect(greenForHole(nine, 12)).toBeNull();
    const eighteen = layout({ holeGeo: [geo(1)] });
    expect(greenForHole(eighteen, 10)).toBeNull();
  });

  it("Übernahme setzt Front/Mitte/Back und lässt Fläche, Fahne, Abschläge und andere Löcher unverändert", () => {
    const pin = { ...pt(0.0071, 0), setAt: "2026-09-01T08:00:00.000Z" };
    const base = layout({ holeGeo: [geo(7, { pin }), { ...geo(8), tees: [{ teeColor: "Gelb", ...pt(-0.003, 0) }] }] });
    const r = mergeGreenUpdates(base, [{ holeNumber: 7, front: pt(0.0069, 0), center: pt(0.007, 0), back: pt(0.0072, 0), source: "DEVICE_GPS" }], "2026-09-30T12:00:00.000Z");
    const seven = r.holeGeo.find((g) => g.holeNumber === 7)!;
    expect(seven.green.pin).toEqual(pin);
    expect(seven.source).toBe("DEVICE_GPS");
    expect(seven.updatedAt).toBe("2026-09-30T12:00:00.000Z");
    expect(r.holeGeo.find((g) => g.holeNumber === 8)).toEqual(base.holeGeo[1]);
    expect(r.changed).toEqual([7]);
    // leeren: Loch 8 behält seine Abschlagposition, Loch 7 hat noch die Fahne
    const cleared = mergeGreenUpdates({ ...base, holeGeo: r.holeGeo }, [7, 8].map((n) => ({ holeNumber: n, front: null, center: null, back: null, source: null })), "2026-09-30T12:05:00.000Z");
    expect(cleared.holeGeo.map((g) => g.holeNumber)).toEqual([7, 8]);
    expect(cleared.holeGeo[0].green.center).toBeNull();
    // ohne sonstige Daten entfällt der Eintrag
    const gone = mergeGreenUpdates(layout({ holeGeo: [geo(3)] }), [{ holeNumber: 3, front: null, center: null, back: null, source: null }], "x");
    expect(gone.holeGeo).toEqual([]);
    expect(gone.removed).toEqual([3]);
  });

  it("lehnt Löcher außerhalb des Platzes und doppelte Löcher ab", () => {
    expect(() => mergeGreenUpdates(layout(), [{ holeNumber: 19, front: null, center: pt(0, 0), back: null, source: null }], "x")).toThrow(/1–18/);
    expect(() =>
      mergeGreenUpdates(layout(), [1, 1].map((n) => ({ holeNumber: n, front: null, center: pt(0, 0), back: null, source: null })), "x"),
    ).toThrow(/doppelt/);
  });
});

describe("Webspace-Datensatz", () => {
  const fixed = { now: () => new Date("2026-09-30T12:00:00Z"), newId: (() => { let i = 0; return () => `id-${++i}`; })(), actor: "Admin" };

  function dataset(): CourseDataset {
    return {
      ...emptyDataset(),
      courses: [
        course({
          layouts: [
            layout({
              holes: [{ id: "h1", layoutId: "l1", holeNumber: 1, par: 4, strokeIndex: 7, lengthMen: null, lengthWomen: null, teeColor: null, gender: null }],
              ratingSets: [],
            }),
          ],
        }),
      ],
    };
  }

  it("liest ältere Datensätze (Version 1) ohne GPS-Daten weiterhin", () => {
    const v1 = JSON.parse(JSON.stringify({ ...dataset(), schemaVersion: 1 }));
    delete v1.courses[0].layouts[0].holeGeo;
    const parsed = parseDataset(v1);
    expect(parsed.courses[0].layouts[0].holeGeo).toEqual([]);
    expect(parsed.courses[0].layouts[0].holes).toHaveLength(1);
  });

  it("setzt Grünkoordinaten, protokolliert die Änderung und lässt Lochdaten/Ratings unverändert", () => {
    const ds = dataset();
    const next = setGreenCoordinates(ds, "l1", [{ holeNumber: 1, center: pt(0.001, 0) }], fixed);
    const l = next.courses[0].layouts[0];
    expect(l.holeGeo[0].green.center).toEqual(pt(0.001, 0));
    expect(l.holes).toEqual(ds.courses[0].layouts[0].holes);
    expect(next.changes[0]).toMatchObject({ entityType: "layout", entityId: "l1", action: "SET_GREENS", actor: "Admin" });
    // Rundreise über JSON (Veröffentlichung)
    expect(parseDataset(JSON.parse(JSON.stringify(next))).courses[0].layouts[0].holeGeo[0].green.center).toEqual(pt(0.001, 0));
    // ungültige Werte werden nicht gespeichert
    expect(() => setGreenCoordinates(ds, "l1", [{ holeNumber: 1, center: { latitude: 999, longitude: 10 } }], fixed)).toThrow();
    // ohne Änderung bleibt der Datensatz unverändert (kein Protokolleintrag)
    expect(setGreenCoordinates(next, "l1", [{ holeNumber: 1, center: pt(0.001, 0) }], fixed)).toBe(next);
  });

  it("CSV-Import: prüfen → Vorschau → übernehmen; leere Zellen behalten vorhandene Werte", () => {
    const ds = setGreenCoordinates(dataset(), "l1", [{ holeNumber: 1, center: pt(0.001, 0) }], fixed);
    const csv = [
      "course_id,hole_number,green_front_lat,green_front_lng,green_center_lat,green_center_lng,green_back_lat,green_back_lng",
      `c1,1,${pt(0.0009, 0).latitude},${C.longitude},,,,`,
      `testclub,2,,,${pt(0.002, 0).latitude},${C.longitude},,`,
      `c1,3,,,999,${C.longitude},,`,
      `c1,19,,,${C.latitude},${C.longitude},,`,
      `unbekannt,4,,,${C.latitude},${C.longitude},,`,
      `c1,5,,,${C.latitude},,,`,
    ].join("\n");
    const plan = planGreenCsvImport(csv, ds.courses);
    expect(plan.rows.map((r) => r.action)).toEqual(["UPDATE", "CREATE", "INVALID", "INVALID", "INVALID", "INVALID"]);
    expect(plan.rows[0].update?.center).toEqual(pt(0.001, 0)); // leere Mitte = bisheriger Wert
    expect(plan.rows[2].errors.join()).toMatch(/green_center_lat ungültig/);
    expect(plan.rows[3].errors.join()).toMatch(/gibt es auf diesem Platz nicht/);
    expect(plan.rows[4].errors.join()).toMatch(/nicht gefunden/);
    expect(plan.rows[5].errors.join()).toMatch(/Breite und Länge/);
    const { dataset: applied, result } = applyGreenCsvPlan(ds, plan, fixed);
    expect(result).toEqual({ updatedHoles: 2, layouts: 1, skipped: 4 });
    const l = applied.courses[0].layouts[0];
    expect(l.holeGeo.map((g) => g.holeNumber)).toEqual([1, 2]);
    expect(l.holeGeo[0].green.front).toEqual({ latitude: pt(0.0009, 0).latitude, longitude: C.longitude });
    expect(l.holeGeo[1].source).toBe("CSV_IMPORT");
    expect(l.holes).toEqual(ds.courses[0].layouts[0].holes);
    expect(applied.importRuns[0]).toMatchObject({ kind: "CSV_GPS", status: "APPLIED" });
    // Export enthält alle Löcher (Vorlage) inkl. vorhandener Koordinaten
    const exported = greensToCsv(applied.courses);
    expect(exported.split("\n")).toHaveLength(19);
    expect(planGreenCsvImport(exported, applied.courses).rows.filter((r) => r.action === "UNCHANGED")).toHaveLength(2);
  });

  it("CSV-Import: bei mehreren Plätzen muss der Platz angegeben werden", () => {
    const two = course({ layouts: [layout(), layout({ id: "l2", name: "Kurzplatz", holesCount: 9, type: "9_HOLE" })] });
    const plan = planGreenCsvImport(`course_id,hole_number,green_center_lat,green_center_lng\nc1,1,${C.latitude},${C.longitude}`, [two]);
    expect(plan.rows[0].errors.join()).toMatch(/mehrere Plätze/);
    const named = planGreenCsvImport(`course_id,layout_name,hole_number,green_center_lat,green_center_lng\nc1,kurzplatz,1,${C.latitude},${C.longitude}`, [two]);
    expect(named.rows[0]).toMatchObject({ action: "CREATE", layoutId: "l2" });
  });
});
