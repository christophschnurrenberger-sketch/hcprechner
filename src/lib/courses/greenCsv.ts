/**
 * CSV-Import und -Export der GPS-Grünkoordinaten (je Loch, unabhängig vom Abschlag).
 *
 * Ablauf wie beim Rating-Import: prüfen → Vorschau mit markierten Änderungen → erst nach Bestätigung übernehmen.
 * Es werden ausschließlich Grünkoordinaten geändert – CR/Slope, Abschläge und Lochdaten bleiben unberührt.
 * Leere Zellen lassen vorhandene Werte unverändert.
 */
import Papa from "papaparse";
import { formatCoordinatePair, greenWarnings, holeGeoFor, maxHoleNumber, parseCoordinate, type GreenUpdate } from "./geo";
import { foldText, normalizeCourseName } from "./normalize";
import type { CourseDto, GeoPoint, LayoutDto } from "./types";

export const GREEN_CSV_COLUMNS = [
  "course_id",
  "course_name",
  "layout_id",
  "layout_name",
  "hole_number",
  "green_front_lat",
  "green_front_lng",
  "green_center_lat",
  "green_center_lng",
  "green_back_lat",
  "green_back_lng",
] as const;

const POINTS = [
  ["front", "green_front_lat", "green_front_lng", "Front"],
  ["center", "green_center_lat", "green_center_lng", "Mitte"],
  ["back", "green_back_lat", "green_back_lng", "Back"],
] as const;

type PointKey = (typeof POINTS)[number][0];

export interface GreenCsvChange {
  point: PointKey;
  from: string;
  to: string;
}

export interface GreenCsvRowPlan {
  rowNumber: number;
  action: "CREATE" | "UPDATE" | "UNCHANGED" | "INVALID";
  errors: string[];
  warnings: string[];
  courseId: string | null;
  courseName: string;
  layoutId: string | null;
  layoutName: string;
  holeNumber: number | null;
  /** vollständiger neuer Stand des Lochs (leere Zellen = bisheriger Wert) */
  update: GreenUpdate | null;
  changes: GreenCsvChange[];
}

export interface GreenCsvPlan {
  headers: string[];
  missingColumns: string[];
  unknownColumns: string[];
  rows: GreenCsvRowPlan[];
  summary: { total: number; invalid: number; create: number; update: number; unchanged: number };
}

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());

function findCourse(courses: readonly CourseDto[], id: string, name: string, errors: string[]): CourseDto | null {
  if (id) {
    const byId = courses.find((c) => c.id === id || c.slug === id);
    if (!byId) errors.push(`Anlage „${id}“ nicht gefunden`);
    return byId ?? null;
  }
  if (!name) {
    errors.push("course_id oder course_name angeben");
    return null;
  }
  const matches = courses.filter((c) => normalizeCourseName(c.name) === normalizeCourseName(name) || (c.officialName && normalizeCourseName(c.officialName) === normalizeCourseName(name)));
  if (matches.length === 0) errors.push(`Anlage „${name}“ nicht gefunden`);
  if (matches.length > 1) errors.push(`Anlage „${name}“ ist nicht eindeutig – bitte course_id angeben`);
  return matches.length === 1 ? matches[0] : null;
}

function findLayout(course: CourseDto, id: string, name: string, errors: string[]): LayoutDto | null {
  if (id) {
    const byId = course.layouts.find((l) => l.id === id);
    if (!byId) errors.push(`Platz „${id}“ gehört nicht zu „${course.name}“`);
    return byId ?? null;
  }
  if (name) {
    const byName = course.layouts.find((l) => foldText(l.name) === foldText(name));
    if (!byName) errors.push(`Platz „${name}“ nicht gefunden`);
    return byName ?? null;
  }
  const active = course.layouts.filter((l) => l.active);
  if (active.length === 1) return active[0];
  errors.push(active.length === 0 ? "Anlage hat keinen Platz" : "Anlage hat mehrere Plätze – layout_id oder layout_name angeben");
  return null;
}

export function planGreenCsvImport(text: string, courses: readonly CourseDto[]): GreenCsvPlan {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    delimitersToGuess: [",", ";", "\t"],
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  const headers = parsed.meta.fields ?? [];
  const missingColumns: string[] = [];
  if (!headers.includes("hole_number")) missingColumns.push("hole_number");
  if (!headers.includes("course_id") && !headers.includes("course_name")) missingColumns.push("course_id");
  if (!POINTS.some(([, lat, lng]) => headers.includes(lat) && headers.includes(lng))) missingColumns.push("green_center_lat", "green_center_lng");
  const known = new Set<string>(GREEN_CSV_COLUMNS);
  const unknownColumns = headers.filter((h) => !known.has(h));
  const seen = new Map<string, number>();

  const rows: GreenCsvRowPlan[] = parsed.data.map((raw, index) => {
    const rowNumber = index + 2;
    const errors: string[] = [];
    const warnings: string[] = [];
    const get = (k: string) => clean(raw[k]);
    const plan: GreenCsvRowPlan = {
      rowNumber,
      action: "INVALID",
      errors,
      warnings,
      courseId: null,
      courseName: get("course_name") || get("course_id"),
      layoutId: null,
      layoutName: get("layout_name"),
      holeNumber: null,
      update: null,
      changes: [],
    };
    if (missingColumns.length > 0) {
      errors.push(`Spalten fehlen: ${missingColumns.join(", ")}`);
      return plan;
    }
    const course = findCourse(courses, get("course_id"), get("course_name"), errors);
    const layout = course ? findLayout(course, get("layout_id"), get("layout_name"), errors) : null;
    if (course) Object.assign(plan, { courseId: course.id, courseName: course.name });
    if (layout) Object.assign(plan, { layoutId: layout.id, layoutName: layout.name });

    const holeText = get("hole_number");
    const hole = /^\d{1,2}$/.test(holeText) ? Number(holeText) : null;
    if (hole === null) errors.push("hole_number muss eine ganze Zahl sein");
    else if (layout && (hole < 1 || hole > maxHoleNumber(layout))) errors.push(`hole_number ${hole} gibt es auf diesem Platz nicht (1–${maxHoleNumber(layout)})`);
    plan.holeNumber = hole;

    const existing = layout && hole !== null ? holeGeoFor(layout, hole)?.green ?? null : null;
    const next: Record<PointKey, GeoPoint | null> = { front: existing?.front ?? null, center: existing?.center ?? null, back: existing?.back ?? null };
    let given = 0;
    for (const [key, latCol, lngCol, label] of POINTS) {
      const lat = parseCoordinate(get(latCol));
      const lng = parseCoordinate(get(lngCol));
      if (lat === null && lng === null) continue;
      if (lat === null || lng === null) {
        errors.push(`${label}: Breite und Länge angeben`);
        continue;
      }
      const latOk = !Number.isNaN(lat) && lat >= -90 && lat <= 90;
      const lngOk = !Number.isNaN(lng) && lng >= -180 && lng <= 180;
      if (!latOk) errors.push(`${latCol} ungültig (Breite −90 bis 90)`);
      if (!lngOk) errors.push(`${lngCol} ungültig (Länge −180 bis 180)`);
      if (latOk && lngOk) {
        next[key] = { latitude: lat, longitude: lng };
        given += 1;
      }
    }
    if (given === 0 && errors.length === 0) errors.push("keine Koordinaten angegeben");

    if (layout && hole !== null) {
      const key = `${layout.id}|${hole}`;
      if (seen.has(key)) errors.push(`doppelter Eintrag (gleich wie Zeile ${seen.get(key)})`);
      else seen.set(key, rowNumber);
    }
    if (errors.length > 0 || !layout || hole === null) return plan;

    for (const [key] of POINTS) {
      const from = formatCoordinatePair(existing?.[key] ?? null);
      const to = formatCoordinatePair(next[key]);
      if (from !== to) plan.changes.push({ point: key, from, to });
    }
    warnings.push(...greenWarnings(next, course));
    plan.update = { holeNumber: hole, ...next, source: "CSV_IMPORT" };
    plan.action = plan.changes.length === 0 ? "UNCHANGED" : existing && (existing.front || existing.center || existing.back) ? "UPDATE" : "CREATE";
    return plan;
  });

  return {
    headers,
    missingColumns,
    unknownColumns,
    rows,
    summary: {
      total: rows.length,
      invalid: rows.filter((r) => r.action === "INVALID").length,
      create: rows.filter((r) => r.action === "CREATE").length,
      update: rows.filter((r) => r.action === "UPDATE").length,
      unchanged: rows.filter((r) => r.action === "UNCHANGED").length,
    },
  };
}

/** Export aller Löcher der aktiven Plätze (auch ohne Koordinaten – dient als Vorlage zum Ausfüllen). */
export function greensToCsv(courses: readonly CourseDto[]): string {
  const rows: Record<string, string | number | null>[] = [];
  for (const c of courses) {
    for (const l of c.layouts.filter((x) => x.active)) {
      for (let n = 1; n <= maxHoleNumber(l); n++) {
        const g = holeGeoFor(l, n)?.green;
        rows.push({
          course_id: c.id,
          course_name: c.name,
          layout_id: l.id,
          layout_name: l.name,
          hole_number: n,
          green_front_lat: g?.front?.latitude ?? null,
          green_front_lng: g?.front?.longitude ?? null,
          green_center_lat: g?.center?.latitude ?? null,
          green_center_lng: g?.center?.longitude ?? null,
          green_back_lat: g?.back?.latitude ?? null,
          green_back_lng: g?.back?.longitude ?? null,
        });
      }
    }
  }
  return Papa.unparse(rows, { columns: [...GREEN_CSV_COLUMNS] });
}

export function greenCsvTemplate(): string {
  return GREEN_CSV_COLUMNS.join(",") + "\n";
}
