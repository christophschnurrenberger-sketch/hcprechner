/**
 * Webspace-Edition: Golfplatz-Datensatz über api/admin.php laden und speichern (courses-load/courses-save).
 * Anmeldung, Rolle und CSRF-Token stammen aus der Sitzung (siehe src/lib/api/transport.ts).
 */
import { phpApi } from "@/lib/runtime";
import { request } from "@/lib/api/transport";
import { parseDataset, type CourseDataset } from "./dataset";

export const courseAdminApi = {
  async load(): Promise<CourseDataset> {
    return parseDataset(await request<unknown>(phpApi("admin", { action: "courses-load" }), { body: {} }));
  },
  save: (baseRevision: number, dataset: CourseDataset) =>
    request<{ ok: true; revision: number; updatedAt: string }>(phpApi("admin", { action: "courses-save" }), { body: { baseRevision, dataset } }),
};
