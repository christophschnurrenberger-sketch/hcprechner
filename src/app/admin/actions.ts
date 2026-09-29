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
import { loginAdmin, logoutAdmin, requireAdmin, requireOwner } from "@/server/adminAuth";
import { createUser, deleteUser, resetUserPassword, updateUser } from "@/server/userRepository";
import { UserError } from "@/server/userRepository";
import { importSeedIntoDb } from "@/server/seedImport";
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
  const username = String(fd.get("username") ?? "");
  const okLogin = await loginAdmin(String(fd.get("password") ?? ""), username);
  if (!okLogin) return { ok: false, message: username.trim() ? "Benutzername oder Passwort falsch (oder keine Berechtigung für die Golfplatzpflege)." : "Passwort falsch." };
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

// ---------------------------------------------------------------------------
// Benutzerverwaltung
// ---------------------------------------------------------------------------

function userFailure(error: unknown): ActionState {
  if (error instanceof UserError) return { ok: false, message: error.message };
  return actionFailure(error);
}

export async function createUserAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await requireOwner();
    const password = String(fd.get("password") ?? "");
    const user = await createUser({
      username: String(fd.get("username") ?? ""),
      displayName: String(fd.get("displayName") ?? ""),
      role: String(fd.get("role") ?? "player"),
      password,
    });
    revalidatePath("/admin/benutzer");
    return actionOk(`Benutzer „${user.username}“ angelegt.`, { credentials: { username: user.username, password } });
  } catch (error) {
    return userFailure(error);
  }
}

export async function resetUserPasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await requireOwner();
    const password = String(fd.get("password") ?? "");
    await resetUserPassword(String(fd.get("id")), password);
    revalidatePath("/admin/benutzer");
    return actionOk("Neues Passwort gesetzt.", { credentials: { username: String(fd.get("username") ?? ""), password } });
  } catch (error) {
    return userFailure(error);
  }
}

export async function updateUserAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await requireOwner();
    const patch: { displayName?: string; role?: string; active?: boolean } = {};
    if (fd.has("displayName")) patch.displayName = String(fd.get("displayName"));
    if (fd.has("role")) patch.role = String(fd.get("role"));
    if (fd.has("active")) patch.active = fd.get("active") === "true";
    await updateUser(String(fd.get("id")), patch);
    revalidatePath("/admin/benutzer");
    return actionOk("Gespeichert.");
  } catch (error) {
    return userFailure(error);
  }
}

export async function deleteUserAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await requireOwner();
    await deleteUser(String(fd.get("id")));
    revalidatePath("/admin/benutzer");
    return actionOk("Benutzer gelöscht.");
  } catch (error) {
    return userFailure(error);
  }
}

export async function importSeedAction(): Promise<ActionState> {
  try {
    await requireAdmin();
    const added = await importSeedIntoDb("admin");
    revalidate();
    return actionOk(added.length ? `Übernommen: ${added.join(", ")}.` : "Alle mitgelieferten Anlagen sind bereits vorhanden.");
  } catch (error) {
    return actionFailure(error);
  }
}
