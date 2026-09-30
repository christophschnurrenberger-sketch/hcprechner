/**
 * Webspace-Edition: Golfplatz-Datensatz über api/admin.php laden und speichern (courses-load/courses-save).
 * Anmeldung, Rolle und CSRF-Token stammen aus der Sitzung (siehe src/lib/api/transport.ts).
 */
import { phpApi } from "@/lib/runtime";
import { request } from "@/lib/api/transport";
import { DATASET_SCHEMA_VERSION, parseDataset, type CourseDataset } from "./dataset";

export const courseAdminApi = {
  async load(): Promise<CourseDataset> {
    return parseDataset(await request<unknown>(phpApi("admin", { action: "courses-load" }), { body: {} }));
  },
  // Gespeichert wird immer im aktuellen Format (ältere Oberflächen lehnen es ab, statt GPS-Daten zu verwerfen).
  save: (baseRevision: number, dataset: CourseDataset) =>
    request<{ ok: true; revision: number; updatedAt: string }>(phpApi("admin", { action: "courses-save" }), {
      body: { baseRevision, dataset: { ...dataset, schemaVersion: DATASET_SCHEMA_VERSION } },
    }),
};
