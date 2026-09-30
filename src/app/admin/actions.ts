"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { planCsvImport } from "@/lib/courses/csv";
import { planGreenCsvImport } from "@/lib/courses/greenCsv";
import {
  actionFailure,
  actionOk,
  csvTextFromForm,
  formToObject,
  parseGreensForm,
  parseHolesForm,
  type ActionState,
  type CsvPreviewState,
  type GreenCsvPreviewState,
} from "@/lib/courses/adminForm";
import { adminCoursePath } from "@/lib/courses/paths";
import { actorName, requireAdmin } from "@/server/adminAuth";
import { audit } from "@/server/audit";
import { importSeedIntoDb } from "@/server/seedImport";
import {
  applyCsvPlan,
  applyGreenCsvPlan,
  createCourse,
  createLayout,
  createRatingSet,
  loadAllCourses,
  mergeCourses,
  replaceHoles,
  setGreenCoordinates,
  setRatingSetActive,
  setRatingSetVerified,
  updateCourse,
  updateLayout,
  updateRatingSet,
} from "@/server/courseRepository";

/**
 * Golfplatzpflege der Node-Edition (Server Actions). Jede Aktion prüft die Berechtigung aus der Sitzung
 * (courses.write bzw. import) und schreibt einen Eintrag ins Audit-Log.
 */

function revalidate() {
  revalidatePath("/admin", "layout");
  revalidatePath("/golfplaetze", "layout");
}

export async function saveCourseAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let newId: string | null = null;
  try {
    const user = await requireAdmin("courses.write");
    const id = fd.get("id") as string | null;
    const data = formToObject(fd);
    if (id) {
      await updateCourse(id, data, "ADMIN", actorName(user));
      await audit("COURSE_UPDATED", user, { entityType: "course", entityId: id, newValue: data });
    } else {
      newId = (await createCourse(data, "ADMIN", actorName(user))).id;
      await audit("COURSE_CREATED", user, { entityType: "course", entityId: newId, newValue: data });
    }
    revalidate();
    if (!newId) return actionOk("Anlage gespeichert.");
  } catch (error) {
    return actionFailure(error);
  }
  redirect(adminCoursePath(newId));
}

export async function saveLayoutAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireAdmin("courses.write");
    const id = fd.get("id") as string | null;
    const data = formToObject(fd);
    const layout = id ? (await updateLayout(id, data, actorName(user)), { id }) : await createLayout(data, "ADMIN", actorName(user));
    await audit("LAYOUT_UPDATED", user, { entityType: "layout", entityId: layout.id, newValue: data });
    revalidate();
    return actionOk(id ? "Platz gespeichert." : "Platz angelegt.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function saveRatingSetAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireAdmin("courses.write");
    const id = fd.get("id") as string | null;
    const data = formToObject(fd);
    if (id) {
      await updateRatingSet(id, data, "ADMIN", actorName(user));
      await audit("RATING_UPDATED", user, { entityType: "rating_set", entityId: id, newValue: data });
    } else {
      const created = await createRatingSet(data, "ADMIN", actorName(user));
      await audit("RATING_CREATED", user, { entityType: "rating_set", entityId: created.id, newValue: data });
    }
    revalidate();
    return actionOk(id ? "Rating gespeichert." : "Rating angelegt.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function toggleRatingActiveAction(fd: FormData): Promise<void> {
  const user = await requireAdmin("courses.write");
  const id = String(fd.get("id"));
  const active = fd.get("active") === "true";
  await setRatingSetActive(id, active, actorName(user));
  await audit(active ? "RATING_UPDATED" : "RATING_DEACTIVATED", user, { entityType: "rating_set", entityId: id, newValue: { active } });
  revalidate();
}

export async function verifyRatingAction(fd: FormData): Promise<void> {
  const user = await requireAdmin("courses.write");
  const id = String(fd.get("id"));
  const verified = fd.get("verified") === "true";
  const checkedAt = (fd.get("checkedAt") as string) || null;
  await setRatingSetVerified(id, verified, checkedAt, actorName(user));
  await audit(verified ? "RATING_VERIFIED" : "RATING_UNVERIFIED", user, { entityType: "rating_set", entityId: id, newValue: { verified, checkedAt } });
  revalidate();
}

export async function saveHolesAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireAdmin("courses.write");
    const { layoutId, holes } = parseHolesForm(fd);
    await replaceHoles(layoutId, holes, actorName(user));
    await audit("HOLES_UPDATED", user, { entityType: "layout", entityId: layoutId, newValue: { holes: holes.length } });
    revalidate();
    return actionOk(`${holes.length} Löcher gespeichert.`);
  } catch (error) {
    return actionFailure(error);
  }
}

export async function saveGreensAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireAdmin("courses.write");
    const { layoutId, greens } = parseGreensForm(fd);
    const { changed, removed } = await setGreenCoordinates(layoutId, greens, actorName(user));
    if (changed.length || removed.length) {
      await audit("GREENS_UPDATED", user, { entityType: "layout", entityId: layoutId, newValue: { changed, removed } });
      revalidate();
    }
    const withCenter = greens.filter((g) => g.center).length;
    return actionOk(changed.length || removed.length ? `GPS-Daten gespeichert (${withCenter}/${greens.length} Löcher mit Grünmitte).` : "Keine Änderungen.");
  } catch (error) {
    return actionFailure(error);
  }
}

export async function mergeCoursesAction(fd: FormData): Promise<void> {
  const user = await requireAdmin("courses.write");
  const targetId = String(fd.get("targetId"));
  const sourceId = String(fd.get("sourceId"));
  await mergeCourses(targetId, sourceId, actorName(user));
  await audit("COURSE_MERGED", user, { entityType: "course", entityId: sourceId, newValue: { targetId } });
  revalidate();
}

/** Schritt 1: Vorschau (validieren, Duplikate erkennen, Änderungen markieren). */
export async function previewCsvAction(_prev: CsvPreviewState, fd: FormData): Promise<CsvPreviewState> {
  try {
    await requireAdmin("import");
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
    const user = await requireAdmin("import");
    const text = String(fd.get("text") ?? "");
    const plan = planCsvImport(text, await loadAllCourses({ includeInactive: true }));
    const result = await applyCsvPlan(plan, actorName(user));
    await audit("IMPORT_APPLIED", user, { entityType: "courses", newValue: { source: "CSV_IMPORT", result } });
    revalidate();
    return { plan, result, error: null, text: "" };
  } catch (error) {
    return { plan: null, result: null, error: error instanceof Error ? error.message : "Fehler", text: "" };
  }
}

/** GPS-CSV Schritt 1: Vorschau (Anlage, Platz, Loch, Koordinaten prüfen). */
export async function previewGreenCsvAction(_prev: GreenCsvPreviewState, fd: FormData): Promise<GreenCsvPreviewState> {
  try {
    await requireAdmin("import");
    const text = await csvTextFromForm(fd);
    return { plan: planGreenCsvImport(text, await loadAllCourses({ includeInactive: true })), result: null, error: null, text };
  } catch (error) {
    return { plan: null, result: null, error: error instanceof Error ? error.message : "Fehler", text: "" };
  }
}

/** GPS-CSV Schritt 2: nach Bestätigung übernehmen (nur Grünkoordinaten, Plan mit aktuellem Stand neu berechnet). */
export async function applyGreenCsvAction(_prev: GreenCsvPreviewState, fd: FormData): Promise<GreenCsvPreviewState> {
  try {
    const user = await requireAdmin("import");
    const text = String(fd.get("text") ?? "");
    const plan = planGreenCsvImport(text, await loadAllCourses({ includeInactive: true }));
    const result = await applyGreenCsvPlan(plan, actorName(user));
    await audit("IMPORT_APPLIED", user, { entityType: "courses", newValue: { source: "CSV_GPS", result } });
    revalidate();
    return { plan, result, error: null, text: "" };
  } catch (error) {
    return { plan: null, result: null, error: error instanceof Error ? error.message : "Fehler", text: "" };
  }
}

export async function importSeedAction(): Promise<ActionState> {
  try {
    const user = await requireAdmin("import");
    const added = await importSeedIntoDb(actorName(user));
    if (added.length) await audit("IMPORT_APPLIED", user, { entityType: "courses", newValue: { source: "SEED", courses: added } });
    revalidate();
    return actionOk(added.length ? `Übernommen: ${added.join(", ")}.` : "Alle mitgelieferten Anlagen sind bereits vorhanden.");
  } catch (error) {
    return actionFailure(error);
  }
}
