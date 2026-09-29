"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { planCsvImport } from "@/lib/courses/csv";
import {
  actionFailure,
  actionOk,
  csvTextFromForm,
  formToObject,
  parseHolesForm,
  type ActionState,
  type CsvPreviewState,
} from "@/lib/courses/adminForm";
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
} from "@/server/courseRepository";

function revalidate() {
  revalidatePath("/admin", "layout");
  revalidatePath("/golfplaetze", "layout");
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
    const data = formToObject(fd);
    if (id) await updateCourse(id, data, "ADMIN", "admin");
    else newId = (await createCourse(data, "ADMIN", "admin")).id;
    revalidate();
    if (!newId) return actionOk("Anlage gespeichert.");
  } catch (error) {
    return actionFailure(error);
  }
  redirect(`/admin/anlagen/${newId}`);
}

export async function saveLayoutAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const id = fd.get("id") as string | null;
    const data = formToObject(fd);
    if (id) await updateLayout(id, data, "admin");
    else await createLayout(data, "ADMIN", "admin");
    revalidate();
    return actionOk(id ? "Platz gespeichert." : "Platz angelegt.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function saveRatingSetAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const id = fd.get("id") as string | null;
    const data = formToObject(fd);
    if (id) await updateRatingSet(id, data, "ADMIN", "admin");
    else await createRatingSet(data, "ADMIN", "admin");
    revalidate();
    return actionOk(id ? "Rating gespeichert." : "Rating angelegt.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function toggleRatingActiveAction(fd: FormData): Promise<void> {
  await requireAdmin();
  await setRatingSetActive(String(fd.get("id")), fd.get("active") === "true", "admin");
  revalidate();
}

export async function verifyRatingAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const checkedAt = (fd.get("checkedAt") as string) || null;
  await setRatingSetVerified(String(fd.get("id")), fd.get("verified") === "true", checkedAt, "admin");
  revalidate();
}

export async function saveHolesAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const { layoutId, holes } = parseHolesForm(fd);
    await replaceHoles(layoutId, holes, "admin");
    revalidate();
    return actionOk(`${holes.length} Löcher gespeichert.`);
  } catch (error) {
    return actionFailure(error);
  }
}

export async function mergeCoursesAction(fd: FormData): Promise<void> {
  await requireAdmin();
  await mergeCourses(String(fd.get("targetId")), String(fd.get("sourceId")), "admin");
  revalidate();
}

/** Schritt 1: Vorschau (validieren, Duplikate erkennen, Änderungen markieren). */
export async function previewCsvAction(_prev: CsvPreviewState, fd: FormData): Promise<CsvPreviewState> {
  try {
    await requireAdmin();
    const text = await csvTextFromForm(fd);
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
    revalidate();
    return { plan, result, error: null, text: "" };
  } catch (error) {
    return { plan: null, result: null, error: error instanceof Error ? error.message : "Fehler", text: "" };
  }
}
