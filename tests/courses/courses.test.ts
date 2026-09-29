import { describe, expect, it } from "vitest";
import { planCsvImport, parseDate, parseDecimal, coursesToCsv, csvTemplate } from "@/lib/courses/csv";
import { duplicateScore, findDuplicates } from "@/lib/courses/duplicates";
import { coreTokens, normalizeCourseName, slugify, websiteDomain } from "@/lib/courses/normalize";
import { buildQualityReport } from "@/lib/courses/quality";
import { availableTees, holesFor, selectRatingSet } from "@/lib/courses/ratingSelection";
import { parseRegion } from "@/lib/courses/regions";
import { searchCourses } from "@/lib/courses/search";
import { normalizeTeeColor, parseGender } from "@/lib/courses/tees";
import type { CourseDto, LayoutDto, RatingSetDto } from "@/lib/courses/types";

// Fiktive Testdaten – ausschließlich für Tests, nicht Teil der Datenbank.
function rating(overrides: Partial<RatingSetDto>): RatingSetDto {
  return {
    id: overrides.id ?? `rs-${Math.random().toString(36).slice(2, 8)}`,
    layoutId: "l1",
    gender: "M",
    teeColor: "Gelb",
    teeName: null,
    holes: 18,
    nine: null,
    par: 72,
    courseRating: 72.0,
    slopeRating: 130,
    yardage: null,
    validFrom: null,
    validTo: null,
    sourceType: "OFFICIAL_SCORECARD",
    sourceUrl: "https://example.org/scorekarte.pdf",
    checkedAt: "2026-01-10",
    verified: true,
    lastVerifiedAt: "2026-01-10",
    confidence: "HIGH",
    active: true,
    notes: null,
    ...overrides,
  };
}

function layout(overrides: Partial<LayoutDto> = {}): LayoutDto {
  return {
    id: "l1",
    courseId: "c1",
    name: "Meisterschaftsplatz",
    type: "18_HOLE",
    combinationName: null,
    holesCount: 18,
    active: true,
    notes: null,
    ratingSets: [],
    holes: [],
    ...overrides,
  };
}

function course(overrides: Partial<CourseDto> = {}): CourseDto {
  return {
    id: "c1",
    slug: "testclub",
    name: "Testclub Musterstadt",
    officialName: null,
    clubName: null,
    facilityType: "GOLF_COURSE",
    city: "Musterstadt",
    postalCode: "80000",
    address: null,
    federalState: "BY",
    country: "DE",
    region: "OBERBAYERN",
    latitude: null,
    longitude: null,
    website: null,
    officialSourceUrl: null,
    bayernGolfverbandUrl: null,
    externalClubId: null,
    active: true,
    verified: false,
    lastVerifiedAt: null,
    notes: null,
    layouts: [],
    ...overrides,
  };
}

describe("Namensnormalisierung", () => {
  it("„Golfclub XYZ e.V.“ und „Golf Club XYZ“ ergeben denselben Schlüssel", () => {
    expect(normalizeCourseName("Golfclub Musterstadt e.V.")).toBe(normalizeCourseName("Golf Club Musterstadt"));
    expect(normalizeCourseName("GC Musterstadt")).toBe(normalizeCourseName("Golf-Club Musterstadt e. V."));
  });

  it("Umlaute werden gefaltet", () => {
    expect(normalizeCourseName("Golfclub Bad Wörishofen")).toBe("golfclub bad woerishofen");
  });

  it("kennzeichnende Bestandteile ohne generische Wörter", () => {
    expect(coreTokens("Golf- und Landclub Musterstadt e.V.")).toEqual(["musterstadt"]);
  });

  it("Slug und Website-Domain", () => {
    expect(slugify("Golfclub Bad Wörishofen")).toBe("golfclub-bad-woerishofen");
    expect(websiteDomain("https://www.example-golf.de/scorecard")).toBe("example-golf.de");
    expect(websiteDomain("example-golf.de")).toBe("example-golf.de");
  });
});

describe("Duplikaterkennung", () => {
  it("gleicher normalisierter Name + Ort → Duplikat", () => {
    const pair = duplicateScore(
      { id: "a", name: "Golfclub Musterstadt e.V.", city: "Musterstadt" },
      { id: "b", name: "Golf Club Musterstadt", city: "Musterstadt" },
    );
    expect(pair.score).toBeGreaterThanOrEqual(0.8);
    expect(pair.reasons).toContain("SAME_NORMALIZED_NAME");
  });

  it("gleiche Website → Duplikat trotz anderem Namen", () => {
    const pair = duplicateScore(
      { id: "a", name: "Golfclub Musterstadt", website: "https://www.gc-muster.de", city: "Musterstadt" },
      { id: "b", name: "Golf- und Landclub Muster", website: "gc-muster.de", city: "Musterstadt" },
    );
    expect(pair.score).toBeGreaterThanOrEqual(0.8);
  });

  it("gleiche Club-ID → sicher dieselbe Anlage; verschiedene Club-IDs → verschiedene Anlagen", () => {
    expect(duplicateScore({ id: "a", name: "A", externalClubId: "123" }, { id: "b", name: "B", externalClubId: "123" }).score).toBe(1);
    expect(
      duplicateScore(
        { id: "a", name: "Golfclub Muster", externalClubId: "1" },
        { id: "b", name: "Golfclub Muster", externalClubId: "2" },
      ).score,
    ).toBe(0);
  });

  it("nur gleicher Ort reicht nicht", () => {
    const pair = duplicateScore(
      { id: "a", name: "Golfclub Nord", city: "Musterstadt" },
      { id: "b", name: "Golfpark Süd", city: "Musterstadt" },
    );
    expect(pair.score).toBeLessThan(0.6);
  });

  it("findDuplicates liefert sortierte Paare", () => {
    const pairs = findDuplicates([
      { id: "a", name: "Golfclub Musterstadt", city: "Musterstadt" },
      { id: "b", name: "GC Musterstadt e.V.", city: "Musterstadt" },
      { id: "c", name: "Golfpark Anderswo", city: "Anderswo" },
    ]);
    expect(pairs).toHaveLength(1);
    expect([pairs[0].a, pairs[0].b].sort()).toEqual(["a", "b"]);
  });
});

describe("Rating-Auswahl", () => {
  const sets = [
    rating({ id: "old", courseRating: 71.8, slopeRating: 129, validFrom: "2023-01-01", validTo: "2026-12-31" }),
    rating({ id: "new", courseRating: 72.1, slopeRating: 131, validFrom: "2027-01-01" }),
    rating({ id: "red", gender: "F", teeColor: "Rot", courseRating: 73.5, slopeRating: 127 }),
    rating({ id: "front", holes: 9, nine: "FRONT", par: 36, courseRating: 36.0, slopeRating: 128 }),
    rating({ id: "unverified", teeColor: "Weiß", verified: false }),
  ];

  it("verwendet das zum Spieldatum gültige Rating (historisch versioniert)", () => {
    expect(selectRatingSet(sets, { date: "2026-09-15", gender: "M", teeColor: "Gelb", holes: 18 }).ratingSet?.id).toBe("old");
    expect(selectRatingSet(sets, { date: "2027-05-01", gender: "M", teeColor: "Gelb", holes: 18 }).ratingSet?.id).toBe("new");
  });

  it("9-Loch-Rating wird nie aus dem 18-Loch-Rating abgeleitet", () => {
    const back = selectRatingSet(sets, { date: "2026-05-01", gender: "M", teeColor: "Gelb", holes: 9, nine: "BACK" });
    expect(back.status).toBe("NINE_HOLE_RATING_MISSING");
    expect(back.ratingSet).toBeNull();
    const front = selectRatingSet(sets, { date: "2026-05-01", gender: "M", teeColor: "Gelb", holes: 9, nine: "FRONT" });
    expect(front.ratingSet?.courseRating).toBe(36.0);
  });

  it("nicht verifizierte Ratings werden nicht automatisch verwendet", () => {
    const r = selectRatingSet(sets, { date: "2026-05-01", gender: "M", teeColor: "Weiß", holes: 18 });
    expect(r.status).toBe("NOT_VERIFIED");
  });

  it("nicht vorhandener Abschlag", () => {
    expect(selectRatingSet(sets, { date: "2026-05-01", gender: "M", teeColor: "Schwarz", holes: 18 }).status).toBe(
      "NO_RATING_FOR_TEE",
    );
  });

  it("unvollständige Werte", () => {
    const r = selectRatingSet([rating({ slopeRating: null, verified: false })], {
      date: "2026-05-01",
      gender: "M",
      teeColor: "Gelb",
      holes: 18,
    });
    expect(r.status).toBe("INCOMPLETE_VALUES");
  });

  it("availableTees listet nur vorhandene Rating-Sets", () => {
    const tees = availableTees(layout({ ratingSets: sets }), { gender: "M", holes: 18, date: "2026-05-01" });
    expect(tees.map((t) => t.teeColor).sort()).toEqual(["Gelb", "Weiß"]);
  });

  it("holesFor liefert die passende Hälfte", () => {
    const holes = Array.from({ length: 18 }, (_, i) => ({
      id: `h${i}`,
      layoutId: "l1",
      holeNumber: i + 1,
      par: 4,
      strokeIndex: i + 1,
      lengthMen: null,
      lengthWomen: null,
      teeColor: null,
      gender: null,
    }));
    const l = layout({ holes });
    expect(holesFor(l, { gender: "M", holes: 18 })).toHaveLength(18);
    expect(holesFor(l, { gender: "M", holes: 9, nine: "BACK" })![0].number).toBe(10);
    expect(holesFor(layout({ holes: holes.slice(0, 5) }), { gender: "M", holes: 18 })).toBeNull();
  });
});

describe("Golfplatzsuche", () => {
  const courses = [
    course({
      id: "a",
      name: "Allgäuer Testclub",
      city: "Ottobeuren",
      region: "SCHWABEN",
      postalCode: "87724",
      layouts: [layout({ ratingSets: [rating({})] })],
    }),
    course({ id: "b", name: "Golfclub Beispiel", city: "München", region: "MUENCHEN", postalCode: "81000" }),
    course({ id: "c", name: "Range Nord", facilityType: "DRIVING_RANGE", city: "Ottobeuren" }),
  ];

  it("Suche nach Ort findet die Anlage", () => {
    const r = searchCourses(courses, { text: "Ottobeuren" });
    expect(r.map((x) => x.course.id)).toEqual(["a"]);
  });

  it("Driving Ranges werden nicht als Golfplatz gelistet", () => {
    expect(searchCourses(courses, { text: "Range" })).toHaveLength(0);
  });

  it("Filter nach Region, PLZ, Lochzahl, Abschlagsfarbe", () => {
    expect(searchCourses(courses, { region: "SCHWABEN" }).map((x) => x.course.id)).toEqual(["a"]);
    expect(searchCourses(courses, { region: "OBERBAYERN" }).map((x) => x.course.id)).toEqual(["b"]);
    expect(searchCourses(courses, { postalCode: "81" }).map((x) => x.course.id)).toEqual(["b"]);
    expect(searchCourses(courses, { has18: true }).map((x) => x.course.id)).toEqual(["a"]);
    expect(searchCourses(courses, { teeColor: "Gelb" }).map((x) => x.course.id)).toEqual(["a"]);
  });

  it("Entfernung", () => {
    const withCoords = [
      course({ id: "near", latitude: 48.14, longitude: 11.58 }),
      course({ id: "far", latitude: 49.45, longitude: 11.08 }),
    ];
    const r = searchCourses(withCoords, { near: { latitude: 48.137, longitude: 11.575 }, maxDistanceKm: 50 });
    expect(r.map((x) => x.course.id)).toEqual(["near"]);
    expect(r[0].distanceKm!).toBeLessThan(1);
  });
});

describe("CSV-Import", () => {
  const header =
    "course_name,official_name,city,region,layout_name,holes,gender,tee_color,tee_name,par,course_rating,slope_rating,yardage,source_type,source_url,valid_from,valid_to,verified";

  it("validiert Pflichtspalten", () => {
    const plan = planCsvImport("course_name,city\nX,Y", []);
    expect(plan.missingColumns.length).toBeGreaterThan(0);
    expect(plan.rows[0].action).toBe("INVALID");
  });

  it("neue Anlage, neues Layout, neues Rating", () => {
    const csv = `${header}\nTestclub,,Musterstadt,Oberbayern,Hauptplatz,18,Herren,Gelb,,72,"72,4",131,5900,Official Scorecard,https://example.org/sc.pdf,2026-01-01,,true`;
    const plan = planCsvImport(csv, []);
    expect(plan.summary.create).toBe(1);
    expect(plan.summary.newCourses).toBe(1);
    const row = plan.rows[0].row!;
    expect(row.courseRating).toBe(72.4);
    expect(row.gender).toBe("M");
    expect(row.sourceType).toBe("OFFICIAL_SCORECARD");
    expect(row.region).toBe("OBERBAYERN");
  });

  it("verifiziert ohne Werte ist ein Fehler", () => {
    const csv = `${header}\nTestclub,,Musterstadt,,Hauptplatz,18,M,Gelb,,72,,131,,DGV,,,,true`;
    const plan = planCsvImport(csv, []);
    expect(plan.rows[0].action).toBe("INVALID");
    expect(plan.rows[0].errors.join(" ")).toMatch(/verified=true nur mit/);
  });

  it("fehlende Werte bleiben leer (keine Schätzung)", () => {
    const csv = `${header}\nTestclub,,Musterstadt,,Hauptplatz,18,M,Gelb,,72,,,,,,,,false`;
    const row = planCsvImport(csv, []).rows[0];
    expect(row.row?.courseRating).toBeNull();
    expect(row.row?.slopeRating).toBeNull();
    expect(row.warnings.join(" ")).toMatch(/unvollständig/);
  });

  it("erkennt Änderungen an bestehenden Ratings und markiert sie", () => {
    const existing = [
      course({
        name: "Testclub",
        city: "Musterstadt",
        layouts: [layout({ name: "Hauptplatz", ratingSets: [rating({ id: "x", courseRating: 72.0, slopeRating: 130, validFrom: "2026-01-01" })] })],
      }),
    ];
    const csv = `${header}\nTestclub,,Musterstadt,,Hauptplatz,18,M,Gelb,,72,72.4,131,,Official Scorecard,https://example.org/sc.pdf,2026-01-01,,true`;
    const plan = planCsvImport(csv, existing);
    expect(plan.rows[0].action).toBe("UPDATE");
    expect(plan.rows[0].rating.id).toBe("x");
    expect(plan.rows[0].changes.map((c) => c.field)).toEqual(expect.arrayContaining(["courseRating", "slopeRating"]));
  });

  it("erkennt mögliche Duplikate und doppelte Zeilen", () => {
    const existing = [course({ name: "Golfclub Musterstadt e.V.", city: "Musterstadt" })];
    const row = "GC Musterstadt,,Musterstadt,,Hauptplatz,18,M,Gelb,,72,72.4,131,,,,,,false";
    const plan = planCsvImport(`${header}\n${row}\n${row}`, existing);
    expect(plan.rows[0].course.action).toBe("MATCH");
    expect(plan.rows[1].errors.join(" ")).toMatch(/doppelter Eintrag/);
  });

  it("9-Loch-Rating auf 18-Loch-Platz verlangt die Hälfte", () => {
    const existing = [course({ name: "Testclub", city: "Musterstadt", layouts: [layout({ name: "Hauptplatz" })] })];
    const csv = `${header}\nTestclub,,Musterstadt,,Hauptplatz,9,M,Gelb,,36,36.1,128,,,,,,false`;
    expect(planCsvImport(csv, existing).rows[0].errors.join(" ")).toMatch(/nine/);
  });

  it("Semikolon-getrennte Datei (Excel) wird erkannt", () => {
    const csv = `${header.replace(/,/g, ";")}\nTestclub;;Musterstadt;;Hauptplatz;18;M;Gelb;;72;72,4;131;;;;;;false`;
    const plan = planCsvImport(csv, []);
    expect(plan.rows[0].row?.courseRating).toBe(72.4);
  });

  it("Werteparser", () => {
    expect(parseDecimal("72,4")).toBe(72.4);
    expect(Number.isNaN(parseDecimal("abc"))).toBe(true);
    expect(parseDate("15.09.2026")).toBe("2026-09-15");
    expect(parseDate("31.02.2026")).toBe("INVALID");
    expect(parseRegion("München")).toBe("MUENCHEN");
    expect(normalizeTeeColor("weiss")).toBe("Weiß");
    expect(parseGender("Damen")).toBe("F");
  });

  it("Export enthält alle Pflichtspalten und ist wieder importierbar", () => {
    const data = [course({ name: "Testclub", layouts: [layout({ name: "Hauptplatz", ratingSets: [rating({})] })] })];
    const csv = coursesToCsv(data);
    expect(csv.split("\n")[0]).toContain("course_name");
    expect(csvTemplate()).toContain("slope_rating");
    const plan = planCsvImport(csv, data);
    expect(plan.rows[0].action).toBe("UNCHANGED");
  });
});

describe("Datenqualitätsbericht", () => {
  it("zählt aus den tatsächlichen Daten", () => {
    const data = [
      course({ id: "a", layouts: [layout({ ratingSets: [rating({}), rating({ holes: 9, nine: "FRONT", par: 36, courseRating: 36, gender: "F", teeColor: "Rot" })] })] }),
      course({ id: "b", name: "Ohne Rating", city: "Irgendwo", layouts: [layout({ id: "l2", courseId: "b" })] }),
      course({ id: "c", name: "Range", facilityType: "DRIVING_RANGE", city: "Nirgendwo" }),
    ];
    const r = buildQualityReport(data, "2026-09-29");
    expect(r.facilities).toBe(3);
    expect(r.golfFacilities).toBe(2);
    expect(r.drivingRanges).toBe(1);
    expect(r.facilitiesWithVerifiedRating).toBe(1);
    expect(r.facilitiesWithoutCompleteRating).toBe(1);
    expect(r.ratingSets).toBe(2);
    expect(r.nineHoleRatingSets).toBe(1);
    expect(r.facilitiesWithMultipleTees).toBe(1);
    expect(r.issues.map((i) => i.code)).toContain("NO_RATING");
  });

  it("erkennt widersprüchliche Werte und fehlende Angaben", () => {
    const data = [
      course({
        layouts: [
          layout({
            ratingSets: [
              rating({ id: "1", courseRating: 72.0 }),
              rating({ id: "2", courseRating: 72.6 }),
              rating({ id: "3", teeColor: "Blau", slopeRating: null, sourceType: null, verified: false }),
            ],
          }),
        ],
      }),
    ];
    const r = buildQualityReport(data, "2026-09-29");
    expect(r.contradictory).toBe(1);
    expect(r.missingSlope).toBe(1);
    expect(r.missingSource).toBe(1);
  });
});
