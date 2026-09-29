/**
 * Formular-Hilfen des Admin-Bereichs – gemeinsam für Server Actions (Node-Edition)
 * und den Browser-Admin der Webspace-Edition.
 */
import { ZodError } from "zod";
import type { CsvImportPlan } from "./csv";

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

export const initialActionState: ActionState = { ok: false, message: null };
export const initialCsvState: CsvPreviewState = { plan: null, result: null, error: null, text: "" };

/** Maximale CSV-Größe (Zeichen). */
export const CSV_MAX_LENGTH = 5_000_000;

export const actionOk = (message: string, extra: Partial<ActionState> = {}): ActionState => ({ ok: true, message, ...extra });

export function actionFailure(error: unknown): ActionState {
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

/** CSV-Text aus dem Upload-Formular (Datei oder Textfeld). */
export async function csvTextFromForm(fd: FormData): Promise<string> {
  const file = fd.get("file");
  const text = file instanceof File && file.size > 0 ? await file.text() : String(fd.get("text") ?? "");
  if (!text.trim()) throw new Error("Bitte eine CSV-Datei auswählen.");
  if (text.length > CSV_MAX_LENGTH) throw new Error("Datei zu groß (max. 5 MB).");
  return text;
}
