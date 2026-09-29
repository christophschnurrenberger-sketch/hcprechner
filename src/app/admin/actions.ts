"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { planCsvImport, type CsvImportPlan } from "@/lib/courses/csv";
import { loginAdmin, logoutAdmin, requireAdmin } from "@/server/adminAuth";
import {
  applyCsvPlan,
  createCourse,
  createLayout,
  createRatingSet,
  loadAllCourses,
  mergeCourses,
  replaceHoles,
  setRatingSetActive,
  setRatingSetVerified,
  updateCourse,
  updateLayout,
  updateRatingSet,
  type CsvApplyResult,
} from "@/server/courseRepository";

export interface ActionState {
  ok: boolean;
  message: string | null;
  fieldErrors?: Record<string, string>;
}

const ok = (message: string): ActionState => ({ ok: true, message });

function failure(error: unknown): ActionState {
  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of error.issues) fieldErrors[issue.path.join(".")] = issue.message;
    return { ok: false, message: "Bitte Eingaben prüfen.", fieldErrors };
  }
  return { ok: false, message: error instanceof Error ? error.message : "Unbekannter Fehler" };
}

const BOOLEAN_FIELDS = new Set(["active", "verified"]);
const DECIMAL_FIELDS = new Set(["courseRating", "latitude", "longitude"]);

function toObject(fd: FormData): Record<string, unknown> {
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

export async function loginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const okLogin = await loginAdmin(String(fd.get("password") ?? ""));
  if (!okLogin) return { ok: false, message: "Passwort falsch." };
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  await logoutAdmin();
  redirect("/admin/login");
}

export async function saveCourseAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let newId: string | null = null;
  try {
    await requireAdmin();
    const id = fd.get("id") as string | null;
    const data = toObject(fd);
    if (id) await updateCourse(id, data, "ADMIN", "admin");
    else newId = (await createCourse(data, "ADMIN", "admin")).id;
    revalidatePath("/admin", "layout");
    revalidatePath("/golfplaetze", "layout");
    if (!newId) return ok("Anlage gespeichert.");
  } catch (error) {
    return failure(error);
  }
  redirect(`/admin/anlagen/${newId}`);
}

export async function saveLayoutAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const id = fd.get("id") as string | null;
    const data = toObject(fd);
    if (id) await updateLayout(id, data, "admin");
    else await createLayout(data, "ADMIN", "admin");
    revalidatePath("/admin", "layout");
    revalidatePath("/golfplaetze", "layout");
    return ok(id ? "Platz gespeichert." : "Platz angelegt.");
  } catch (error) {
    return failure(error);
  }
}

export async function saveRatingSetAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const id = fd.get("id") as string | null;
    const data = toObject(fd);
    if (id) await updateRatingSet(id, data, "ADMIN", "admin");
    else await createRatingSet(data, "ADMIN", "admin");
    revalidatePath("/admin", "layout");
    revalidatePath("/golfplaetze", "layout");
    return ok(id ? "Rating gespeichert." : "Rating angelegt.");
  } catch (error) {
    return failure(error);
  }
}

export async function toggleRatingActiveAction(fd: FormData): Promise<void> {
  await requireAdmin();
  await setRatingSetActive(String(fd.get("id")), fd.get("active") === "true", "admin");
  revalidatePath("/admin", "layout");
  revalidatePath("/golfplaetze", "layout");
}

export async function verifyRatingAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const checkedAt = (fd.get("checkedAt") as string) || null;
  await setRatingSetVerified(String(fd.get("id")), fd.get("verified") === "true", checkedAt, "admin");
  revalidatePath("/admin", "layout");
  revalidatePath("/golfplaetze", "layout");
}

export async function saveHolesAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
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
    if (new Set(sis).size !== sis.length) return { ok: false, message: "Stroke Index doppelt vergeben." };
    await replaceHoles(layoutId, holes, "admin");
    revalidatePath("/admin", "layout");
    revalidatePath("/golfplaetze", "layout");
    return ok(`${holes.length} Löcher gespeichert.`);
  } catch (error) {
    return failure(error);
  }
}

export async function mergeCoursesAction(fd: FormData): Promise<void> {
  await requireAdmin();
  await mergeCourses(String(fd.get("targetId")), String(fd.get("sourceId")), "admin");
  revalidatePath("/admin", "layout");
  revalidatePath("/golfplaetze", "layout");
}

export interface CsvPreviewState {
  plan: CsvImportPlan | null;
  result: CsvApplyResult | null;
  error: string | null;
  text: string;
}

/** Schritt 1: Vorschau (validieren, Duplikate erkennen, Änderungen markieren). */
export async function previewCsvAction(_prev: CsvPreviewState, fd: FormData): Promise<CsvPreviewState> {
  try {
    await requireAdmin();
    const file = fd.get("file");
    const text = file instanceof File && file.size > 0 ? await file.text() : String(fd.get("text") ?? "");
    if (!text.trim()) return { plan: null, result: null, error: "Bitte eine CSV-Datei auswählen.", text: "" };
    if (text.length > 5_000_000) return { plan: null, result: null, error: "Datei zu groß (max. 5 MB).", text: "" };
    const plan = planCsvImport(text, await loadAllCourses({ includeInactive: true }));
    return { plan, result: null, error: null, text };
  } catch (error) {
    return { plan: null, result: null, error: error instanceof Error ? error.message : "Fehler", text: "" };
  }
}

/** Schritt 2: erst nach Bestätigung importieren (Plan wird mit aktuellem Datenstand neu berechnet). */
export async function applyCsvAction(_prev: CsvPreviewState, fd: FormData): Promise<CsvPreviewState> {
  try {
    await requireAdmin();
    const text = String(fd.get("text") ?? "");
    const plan = planCsvImport(text, await loadAllCourses({ includeInactive: true }));
    const result = await applyCsvPlan(plan, "admin");
    revalidatePath("/admin", "layout");
    revalidatePath("/golfplaetze", "layout");
    return { plan, result, error: null, text: "" };
  } catch (error) {
    return { plan: null, result: null, error: error instanceof Error ? error.message : "Fehler", text: "" };
  }
}
