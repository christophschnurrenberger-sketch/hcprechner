import Papa from "papaparse";
import { isIsoDate } from "@/lib/whs/dates";
import type { Gender, NineSide } from "@/lib/whs/types";
import { findBestMatch } from "./duplicates";
import { foldText, normalizeCourseName } from "./normalize";
import { parseRegion } from "./regions";
import { normalizeTeeColor, parseGender } from "./tees";
import type { Confidence, CourseDto, FacilityType, LayoutType, RatingSetDto, SourceType } from "./types";
import { FACILITY_TYPES, LAYOUT_TYPES, SOURCE_TYPES } from "./types";

/** Pflichtspalten laut Importschema. */
export const CSV_REQUIRED_COLUMNS = [
  "course_name",
  "official_name",
  "city",
  "region",
  "layout_name",
  "holes",
  "gender",
  "tee_color",
  "tee_name",
  "par",
  "course_rating",
  "slope_rating",
  "yardage",
  "source_type",
  "source_url",
  "valid_from",
  "valid_to",
  "verified",
] as const;

/** Optionale Zusatzspalten. */
export const CSV_OPTIONAL_COLUMNS = [
  "nine",
  "layout_type",
  "postal_code",
  "address",
  "website",
  "facility_type",
  "external_club_id",
  "latitude",
  "longitude",
  "checked_at",
  "confidence",
] as const;

export interface ParsedCsvRow {
  courseName: string;
  officialName: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  address: string | null;
  website: string | null;
  facilityType: FacilityType;
  externalClubId: string | null;
  latitude: number | null;
  longitude: number | null;
  layoutName: string;
  layoutType: LayoutType | null;
  holes: 9 | 18;
  nine: NineSide | null;
  gender: Gender;
  teeColor: string;
  teeName: string | null;
  par: number | null;
  courseRating: number | null;
  slopeRating: number | null;
  yardage: number | null;
  sourceType: SourceType | null;
  sourceUrl: string | null;
  validFrom: string | null;
  validTo: string | null;
  checkedAt: string | null;
  verified: boolean;
  confidence: Confidence | null;
}

export interface FieldChange {
  field: string;
  from: string | number | boolean | null;
  to: string | number | boolean | null;
}

export interface CsvRowPlan {
  rowNumber: number;
  row: ParsedCsvRow | null;
  errors: string[];
  warnings: string[];
  action: "CREATE" | "UPDATE" | "UNCHANGED" | "INVALID";
  course: { action: "CREATE" | "MATCH"; id: string | null; name: string; key: string; score?: number };
  layout: { action: "CREATE" | "MATCH"; id: string | null; name: string };
  rating: { action: "CREATE" | "UPDATE" | "UNCHANGED"; id: string | null };
  changes: FieldChange[];
}

export interface CsvImportPlan {
  headers: string[];
  missingColumns: string[];
  unknownColumns: string[];
  rows: CsvRowPlan[];
  summary: {
    total: number;
    invalid: number;
    create: number;
    update: number;
    unchanged: number;
    newCourses: number;
    newLayouts: number;
  };
}

// ---------------------------------------------------------------------------
// Wertparser
// ---------------------------------------------------------------------------

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());

export function parseDecimal(value: string): number | null {
  const v = clean(value);
  if (v === "") return null;
  const normalized = v.replace(/\s/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return Number.NaN;
  return Number(normalized);
}

export function parseInteger(value: string): number | null {
  const n = parseDecimal(value);
  if (n === null) return null;
  return Number.isInteger(n) ? n : Number.NaN;
}

export function parseDate(value: string): string | null | "INVALID" {
  const v = clean(value);
  if (v === "") return null;
  if (isIsoDate(v)) return v;
  const m = v.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) {
    const iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return isIsoDate(iso) ? iso : "INVALID";
  }
  return "INVALID";
}

export function parseBoolean(value: string): boolean | null {
  const v = clean(value).toLowerCase();
  if (v === "") return null;
  if (["true", "1", "ja", "yes", "y", "x", "wahr"].includes(v)) return true;
  if (["false", "0", "nein", "no", "n", "falsch"].includes(v)) return false;
  return null;
}

export function parseSourceType(value: string): SourceType | null | "INVALID" {
  const v = clean(value);
  if (v === "") return null;
  const key = v.toUpperCase().replace(/[\s-]+/g, "_");
  const aliases: Record<string, SourceType> = {
    CLUB: "CLUB_OFFICIAL",
    CLUB_OFFIZIELL: "CLUB_OFFICIAL",
    SCORECARD: "OFFICIAL_SCORECARD",
    SCOREKARTE: "OFFICIAL_SCORECARD",
    OFFIZIELLE_SCOREKARTE: "OFFICIAL_SCORECARD",
    SEKUNDAERQUELLE: "SECONDARY_SOURCE",
    MANUELL: "MANUAL_IMPORT",
    MANUAL: "MANUAL_IMPORT",
  };
  if ((SOURCE_TYPES as readonly string[]).includes(key)) return key as SourceType;
  return aliases[key] ?? "INVALID";
}

export function parseNine(value: string): NineSide | null | "INVALID" {
  const v = foldText(clean(value)).replace(/\s+/g, " ");
  if (v === "") return null;
  if (["front", "front nine", "front9", "1-9", "vordere neun", "vorne"].includes(v)) return "FRONT";
  if (["back", "back nine", "back9", "10-18", "hintere neun", "hinten"].includes(v)) return "BACK";
  return "INVALID";
}

function parseRow(raw: Record<string, string>, errors: string[], warnings: string[]): ParsedCsvRow | null {
  const get = (k: string) => clean(raw[k]);
  const courseName = get("course_name");
  if (!courseName) errors.push("course_name fehlt");
  const layoutName = get("layout_name");
  if (!layoutName) errors.push("layout_name fehlt");

  const holesN = parseInteger(get("holes"));
  if (holesN !== 9 && holesN !== 18) errors.push("holes muss 9 oder 18 sein");
  const gender = parseGender(get("gender"));
  if (!gender) errors.push("gender ungültig (M/F bzw. Herren/Damen)");
  const teeColor = normalizeTeeColor(get("tee_color"));
  if (!teeColor) errors.push("tee_color fehlt");

  const par = parseInteger(get("par"));
  const cr = parseDecimal(get("course_rating"));
  const slope = parseInteger(get("slope_rating"));
  const yardage = parseInteger(get("yardage"));
  const lat = parseDecimal(get("latitude"));
  const lon = parseDecimal(get("longitude"));
  if (Number.isNaN(par)) errors.push("par ist keine ganze Zahl");
  if (Number.isNaN(cr)) errors.push("course_rating ist keine Zahl");
  if (Number.isNaN(slope)) errors.push("slope_rating ist keine ganze Zahl");
  if (Number.isNaN(yardage)) errors.push("yardage ist keine ganze Zahl");
  if (Number.isNaN(lat) || Number.isNaN(lon)) errors.push("Koordinaten ungültig");

  const holes = holesN === 9 || holesN === 18 ? holesN : null;
  if (holes && par !== null && !Number.isNaN(par) && (par < holes * 3 || par > holes * 6)) {
    errors.push(`par ${par} ist für ${holes} Löcher unplausibel`);
  }
  if (holes && cr !== null && !Number.isNaN(cr) && (cr / holes < 2.5 || cr / holes > 6.5)) {
    errors.push(`course_rating ${cr} ist für ${holes} Löcher unplausibel`);
  }
  if (slope !== null && !Number.isNaN(slope) && (slope < 55 || slope > 155)) {
    errors.push("slope_rating muss zwischen 55 und 155 liegen");
  }

  const sourceType = parseSourceType(get("source_type"));
  if (sourceType === "INVALID") errors.push(`source_type „${get("source_type")}“ unbekannt`);
  const validFrom = parseDate(get("valid_from"));
  const validTo = parseDate(get("valid_to"));
  const checkedAt = parseDate(get("checked_at"));
  if (validFrom === "INVALID") errors.push("valid_from ist kein Datum");
  if (validTo === "INVALID") errors.push("valid_to ist kein Datum");
  if (checkedAt === "INVALID") errors.push("checked_at ist kein Datum");
  if (validFrom && validTo && validFrom !== "INVALID" && validTo !== "INVALID" && validFrom > validTo) {
    errors.push("valid_from liegt nach valid_to");
  }
  const verifiedRaw = get("verified");
  const verified = parseBoolean(verifiedRaw);
  if (verifiedRaw !== "" && verified === null) errors.push("verified ungültig (true/false)");

  const nine = parseNine(get("nine"));
  if (nine === "INVALID") errors.push("nine ungültig (FRONT/BACK)");
  if (holes === 18 && nine && nine !== "INVALID") errors.push("nine darf nur bei 9-Loch-Ratings gesetzt sein");

  const layoutTypeRaw = get("layout_type").toUpperCase();
  const layoutType = layoutTypeRaw
    ? ((LAYOUT_TYPES as readonly string[]).includes(layoutTypeRaw) ? (layoutTypeRaw as LayoutType) : null)
    : null;
  if (layoutTypeRaw && !layoutType) errors.push(`layout_type „${layoutTypeRaw}“ unbekannt`);

  const facilityRaw = get("facility_type").toUpperCase();
  const facilityType = facilityRaw
    ? (FACILITY_TYPES as readonly string[]).includes(facilityRaw)
      ? (facilityRaw as FacilityType)
      : null
    : "GOLF_COURSE";
  if (!facilityType) errors.push(`facility_type „${facilityRaw}“ unbekannt`);
  if (facilityType === "DRIVING_RANGE") errors.push("Eine Driving Range kann keine handicap-relevanten Ratings haben");

  const confidenceRaw = get("confidence").toUpperCase();
  const confidence = (["HIGH", "MEDIUM", "LOW"] as const).find((c) => c === confidenceRaw) ?? null;
  if (confidenceRaw && !confidence) errors.push("confidence ungültig (HIGH/MEDIUM/LOW)");

  const regionRaw = get("region");
  const region = parseRegion(regionRaw);
  if (regionRaw && !region) warnings.push(`Region „${regionRaw}“ unbekannt – wird leer gelassen`);

  const isVerified = verified === true;
  if (isVerified) {
    if (cr === null || slope === null || par === null) {
      errors.push("verified=true nur mit Course Rating, Slope und Par");
    }
    if (!sourceType || sourceType === "INVALID") errors.push("verified=true nur mit source_type");
    if (!get("source_url")) warnings.push("verifiziert ohne source_url – Quelle bitte dokumentieren");
  }
  if (!isVerified && cr !== null && slope !== null) {
    warnings.push("nicht verifiziert – wird nicht automatisch für exakte Berechnungen verwendet");
  }
  if (cr === null || slope === null) warnings.push("Rating unvollständig (CR/Slope fehlt) – Wert bleibt leer");

  if (errors.length > 0) return null;
  return {
    courseName,
    officialName: get("official_name") || null,
    city: get("city") || null,
    region,
    postalCode: get("postal_code") || null,
    address: get("address") || null,
    website: get("website") || null,
    facilityType: facilityType as FacilityType,
    externalClubId: get("external_club_id") || null,
    latitude: lat,
    longitude: lon,
    layoutName,
    layoutType,
    holes: holes!,
    nine: nine === "INVALID" ? null : nine,
    gender: gender!,
    teeColor: teeColor!,
    teeName: get("tee_name") || null,
    par,
    courseRating: cr,
    slopeRating: slope,
    yardage,
    sourceType: sourceType === "INVALID" ? null : sourceType,
    sourceUrl: get("source_url") || null,
    validFrom: validFrom === "INVALID" ? null : validFrom,
    validTo: validTo === "INVALID" ? null : validTo,
    checkedAt: checkedAt === "INVALID" ? null : checkedAt,
    verified: isVerified,
    confidence,
  };
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

const RATING_FIELDS: (keyof ParsedCsvRow & keyof RatingSetDto)[] = [
  "teeName",
  "par",
  "courseRating",
  "slopeRating",
  "yardage",
  "validTo",
  "sourceType",
  "sourceUrl",
  "checkedAt",
  "verified",
  "confidence",
];

export function courseKeyFor(name: string, city: string | null): string {
  return `${normalizeCourseName(name)}|${foldText(city ?? "").trim()}`;
}

function ratingKey(r: { gender: string; teeColor: string; holes: number; nine: string | null; validFrom: string | null }) {
  return `${r.gender}|${r.teeColor}|${r.holes}|${r.nine ?? ""}|${r.validFrom ?? ""}`;
}

export function planCsvImport(text: string, existing: readonly CourseDto[]): CsvImportPlan {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    delimitersToGuess: [",", ";", "\t"],
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  const headers = parsed.meta.fields ?? [];
  const missingColumns = CSV_REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
  const known = new Set<string>([...CSV_REQUIRED_COLUMNS, ...CSV_OPTIONAL_COLUMNS]);
  const unknownColumns = headers.filter((h) => !known.has(h));

  const plans: CsvRowPlan[] = [];
  const newCourseKeys = new Set<string>();
  const newLayoutKeys = new Set<string>();
  const seenRatingKeys = new Map<string, number>();

  parsed.data.forEach((raw, index) => {
    const rowNumber = index + 2; // Kopfzeile = 1
    const errors: string[] = [];
    const warnings: string[] = [];
    if (missingColumns.length > 0) errors.push(`Spalten fehlen: ${missingColumns.join(", ")}`);
    const row = missingColumns.length > 0 ? null : parseRow(raw, errors, warnings);
    const base: CsvRowPlan = {
      rowNumber,
      row,
      errors,
      warnings,
      action: "INVALID",
      course: { action: "CREATE", id: null, name: clean(raw.course_name), key: "" },
      layout: { action: "CREATE", id: null, name: clean(raw.layout_name) },
      rating: { action: "CREATE", id: null },
      changes: [],
    };
    if (!row) {
      plans.push(base);
      return;
    }

    // Anlage zuordnen
    const key = courseKeyFor(row.courseName, row.city);
    base.course.key = key;
    let course: CourseDto | undefined = existing.find(
      (c) =>
        (row.externalClubId && c.externalClubId === row.externalClubId) ||
        courseKeyFor(c.name, c.city) === key ||
        (c.officialName && courseKeyFor(c.officialName, c.city) === key),
    );
    if (!course) {
      const match = findBestMatch(
        {
          id: "__new__",
          name: row.courseName,
          officialName: row.officialName,
          city: row.city,
          postalCode: row.postalCode,
          address: row.address,
          latitude: row.latitude,
          longitude: row.longitude,
          website: row.website,
          externalClubId: row.externalClubId,
        },
        existing,
      );
      if (match && match.pair.score >= 0.8) {
        course = match.item;
        warnings.push(`zugeordnet zu vorhandener Anlage „${match.item.name}“ (Übereinstimmung ${Math.round(match.pair.score * 100)} %)`);
      } else if (match) {
        warnings.push(`mögliches Duplikat von „${match.item.name}“ – bitte prüfen`);
      }
    }
    if (course) {
      base.course = { action: "MATCH", id: course.id, name: course.name, key };
      if (course.facilityType === "DRIVING_RANGE") {
        errors.push("Die zugeordnete Anlage ist eine Driving Range – keine Ratings zulässig");
        plans.push(base);
        return;
      }
    } else {
      newCourseKeys.add(key);
    }

    // Layout zuordnen
    const layout = course?.layouts.find((l) => foldText(l.name) === foldText(row.layoutName));
    if (layout) {
      base.layout = { action: "MATCH", id: layout.id, name: layout.name };
      if (row.holes === 9 && layout.holesCount >= 18 && !row.nine) {
        errors.push("9-Loch-Rating auf einem 18-Loch-Platz: Spalte nine (FRONT/BACK) angeben");
      }
      if (row.holes === 18 && layout.holesCount === 9) {
        warnings.push("18-Loch-Rating auf 9-Loch-Platz (2 × 9) – nur mit offiziellem 18-Loch-Rating zulässig");
      }
    } else {
      newLayoutKeys.add(`${key}|${foldText(row.layoutName)}`);
    }

    // Rating zuordnen
    const rk = `${key}|${foldText(row.layoutName)}|${ratingKey(row)}`;
    if (seenRatingKeys.has(rk)) {
      errors.push(`doppelter Eintrag (gleich wie Zeile ${seenRatingKeys.get(rk)})`);
    } else {
      seenRatingKeys.set(rk, rowNumber);
    }
    const existingRating = layout?.ratingSets.find((s) => ratingKey(s) === ratingKey(row));
    if (existingRating) {
      const changes: FieldChange[] = [];
      for (const field of RATING_FIELDS) {
        const from = (existingRating[field] ?? null) as FieldChange["from"];
        const to = (row[field] ?? null) as FieldChange["to"];
        if (from !== to) changes.push({ field, from, to });
      }
      base.changes = changes;
      base.rating = { action: changes.length > 0 ? "UPDATE" : "UNCHANGED", id: existingRating.id };
      if (existingRating.verified && changes.some((c) => ["courseRating", "slopeRating", "par"].includes(c.field))) {
        warnings.push("ändert Werte eines bereits verifizierten Ratings – neue Version (valid_from) erwägen");
      }
    } else if (layout) {
      const overlapping = layout.ratingSets.find(
        (s) =>
          s.active &&
          s.gender === row.gender &&
          s.teeColor === row.teeColor &&
          s.holes === row.holes &&
          (s.nine ?? null) === (row.nine ?? null) &&
          (!s.validTo || !row.validFrom || s.validTo >= row.validFrom) &&
          (!row.validTo || !s.validFrom || row.validTo >= s.validFrom),
      );
      if (overlapping) {
        warnings.push("überschneidet sich zeitlich mit einem vorhandenen Rating desselben Abschlags");
      }
    }

    base.action = errors.length > 0 ? "INVALID" : base.rating.action === "CREATE" ? "CREATE" : base.rating.action;
    plans.push(base);
  });

  return {
    headers,
    missingColumns: [...missingColumns],
    unknownColumns,
    rows: plans,
    summary: {
      total: plans.length,
      invalid: plans.filter((p) => p.action === "INVALID").length,
      create: plans.filter((p) => p.action === "CREATE").length,
      update: plans.filter((p) => p.action === "UPDATE").length,
      unchanged: plans.filter((p) => p.action === "UNCHANGED").length,
      newCourses: newCourseKeys.size,
      newLayouts: newLayoutKeys.size,
    },
  };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export function coursesToCsv(courses: readonly CourseDto[]): string {
  const rows: Record<string, string | number | boolean | null>[] = [];
  for (const c of courses) {
    for (const l of c.layouts) {
      for (const s of l.ratingSets) {
        rows.push({
          course_name: c.name,
          official_name: c.officialName,
          city: c.city,
          region: c.region,
          layout_name: l.name,
          holes: s.holes,
          gender: s.gender,
          tee_color: s.teeColor,
          tee_name: s.teeName,
          par: s.par,
          course_rating: s.courseRating,
          slope_rating: s.slopeRating,
          yardage: s.yardage,
          source_type: s.sourceType,
          source_url: s.sourceUrl,
          valid_from: s.validFrom,
          valid_to: s.validTo,
          verified: s.verified,
          nine: s.nine,
          layout_type: l.type,
          postal_code: c.postalCode,
          address: c.address,
          website: c.website,
          facility_type: c.facilityType,
          external_club_id: c.externalClubId,
          latitude: c.latitude,
          longitude: c.longitude,
          checked_at: s.checkedAt,
          confidence: s.confidence,
        });
      }
    }
  }
  return Papa.unparse(rows, { columns: [...CSV_REQUIRED_COLUMNS, ...CSV_OPTIONAL_COLUMNS] });
}

export function csvTemplate(): string {
  return [...CSV_REQUIRED_COLUMNS, ...CSV_OPTIONAL_COLUMNS].join(",") + "\n";
}
