/**
 * Formular-Hilfen des Admin-Bereichs – gemeinsam für Server Actions (Node-Edition)
 * und den Browser-Admin der Webspace-Edition.
 */
import { ZodError } from "zod";
import type { CsvImportPlan } from "./csv";
import { parseCoordinatePair } from "./geo";
import type { GreenCsvPlan } from "./greenCsv";
import { GEO_SOURCES, type GeoPoint, type GeoSource } from "./types";

export interface ActionState {
  ok: boolean;
  message: string | null;
  fieldErrors?: Record<string, string>;
  /** Webspace-Edition: nach dem Anlegen zur Bearbeitungsseite wechseln. */
  redirectTo?: string;
  /** Benutzerverwaltung: einmalig anzuzeigende Zugangsdaten (Startpasswort). */
  credentials?: { username: string; password: string };
}

export interface CsvApplySummary {
  createdCourses: number;
  createdLayouts: number;
  createdRatings: number;
  updatedRatings: number;
  skipped: number;
}

export interface CsvPreviewState {
  plan: CsvImportPlan | null;
  result: CsvApplySummary | null;
  error: string | null;
  text: string;
}

export interface GreenCsvApplySummary {
  updatedHoles: number;
  layouts: number;
  skipped: number;
}

export interface GreenCsvPreviewState {
  plan: GreenCsvPlan | null;
  result: GreenCsvApplySummary | null;
  error: string | null;
  text: string;
}

export const initialActionState: ActionState = { ok: false, message: null };
export const initialCsvState: CsvPreviewState = { plan: null, result: null, error: null, text: "" };
export const initialGreenCsvState: GreenCsvPreviewState = { plan: null, result: null, error: null, text: "" };

/** Validierungsfehler mit Zuordnung zu Formularfeldern (Anzeige direkt am Feld). */
export class FormFieldError extends Error {
  constructor(
    message: string,
    readonly fieldErrors: Record<string, string>,
  ) {
    super(message);
    this.name = "FormFieldError";
  }
}

/** Maximale CSV-Größe (Zeichen). */
export const CSV_MAX_LENGTH = 5_000_000;

export const actionOk = (message: string, extra: Partial<ActionState> = {}): ActionState => ({ ok: true, message, ...extra });

export function actionFailure(error: unknown): ActionState {
  if (error instanceof FormFieldError) return { ok: false, message: error.message, fieldErrors: error.fieldErrors };
  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of error.issues) fieldErrors[issue.path.join(".")] = issue.message;
    return { ok: false, message: "Bitte Eingaben prüfen.", fieldErrors };
  }
  return { ok: false, message: error instanceof Error ? error.message : "Unbekannter Fehler" };
}

const BOOLEAN_FIELDS = new Set(["active", "verified"]);
const DECIMAL_FIELDS = new Set(["courseRating", "latitude", "longitude"]);

/** FormData → Objekt für die Zod-Schemas (Dezimalkomma, Checkboxen, Steuerfelder entfernt). */
export function formToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of fd.entries()) {
    if (key.startsWith("$") || key === "id") continue;
    const text = typeof value === "string" ? value.trim() : null;
    out[key] = text !== null && DECIMAL_FIELDS.has(key) ? text.replace(",", ".") : text;
  }
  for (const b of BOOLEAN_FIELDS) {
    if (fd.has(`${b}__present`)) out[b] = fd.get(b) === "on";
  }
  for (const k of Object.keys(out)) if (k.endsWith("__present")) delete out[k];
  return out;
}

/** Lochdaten-Formular → Liste für replaceHoles. Wirft bei doppeltem Stroke Index. */
export function parseHolesForm(fd: FormData): { layoutId: string; holes: Record<string, unknown>[] } {
  const layoutId = String(fd.get("layoutId"));
  const count = Number(fd.get("count"));
  const holes: Record<string, unknown>[] = [];
  for (let i = 1; i <= count; i++) {
    const par = String(fd.get(`par_${i}`) ?? "").trim();
    if (!par) continue;
    holes.push({
      holeNumber: i,
      par,
      strokeIndex: String(fd.get(`si_${i}`) ?? ""),
      lengthMen: String(fd.get(`lm_${i}`) ?? ""),
      lengthWomen: String(fd.get(`lw_${i}`) ?? ""),
      teeColor: "",
      gender: "",
    });
  }
  const sis = holes.map((h) => h.strokeIndex).filter((v) => v !== "");
  if (new Set(sis).size !== sis.length) throw new Error("Stroke Index doppelt vergeben.");
  return { layoutId, holes };
}

export interface GreenFormRow {
  holeNumber: number;
  front: GeoPoint | null;
  center: GeoPoint | null;
  back: GeoPoint | null;
  source: GeoSource;
}

const COORDINATE_HINT = "Ungültig – Breite −90 bis 90, Länge −180 bis 180 (z. B. 47.941234, 10.312345)";

/**
 * GPS-Formular (je Loch Front/Mitte/Back als „Breite, Länge“) → Grünkoordinaten. Ungültige Werte werden
 * nicht gespeichert, sondern am Feld gemeldet (Felder gf_n, gc_n, gb_n; Erfassungsart src_n).
 */
export function parseGreensForm(fd: FormData): { layoutId: string; greens: GreenFormRow[] } {
  const layoutId = String(fd.get("layoutId") ?? "");
  const count = Math.min(36, Math.max(0, Number(fd.get("count")) || 0));
  const fieldErrors: Record<string, string> = {};
  const greens: GreenFormRow[] = [];
  const read = (key: string): GeoPoint | null => {
    const parsed = parseCoordinatePair(String(fd.get(key) ?? ""));
    if (parsed === "INVALID") {
      fieldErrors[key] = COORDINATE_HINT;
      return null;
    }
    return parsed;
  };
  for (let n = 1; n <= count; n++) {
    const front = read(`gf_${n}`);
    const center = read(`gc_${n}`);
    const back = read(`gb_${n}`);
    const src = String(fd.get(`src_${n}`) ?? "");
    greens.push({ holeNumber: n, front, center, back, source: (GEO_SOURCES as readonly string[]).includes(src) ? (src as GeoSource) : "MANUAL" });
  }
  const invalid = Object.keys(fieldErrors).length;
  if (invalid > 0) throw new FormFieldError(invalid === 1 ? "Eine Koordinate ist ungültig." : `${invalid} Koordinaten sind ungültig.`, fieldErrors);
  return { layoutId, greens };
}

/** CSV-Text aus dem Upload-Formular (Datei oder Textfeld). */
export async function csvTextFromForm(fd: FormData): Promise<string> {
  const file = fd.get("file");
  const text = file instanceof File && file.size > 0 ? await file.text() : String(fd.get("text") ?? "");
  if (!text.trim()) throw new Error("Bitte eine CSV-Datei auswählen.");
  if (text.length > CSV_MAX_LENGTH) throw new Error("Datei zu groß (max. 5 MB).");
  return text;
}
