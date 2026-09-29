/**
 * Mitgelieferte Golfplatz-Startdaten (data/seed/golfplaetze-bayern.json) in die Datenbank der
 * Node-Edition übernehmen. Vorhandene Anlagen (gleicher Slug, Club-ID oder Name + Ort) bleiben unverändert.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { missingSeedCourses, parseDataset, type CourseDataset } from "@/lib/courses/dataset";
import type { CourseDto } from "@/lib/courses/types";
import { createCourse, createLayout, createRatingSet, loadAllCourses, replaceHoles } from "./courseRepository";

export const SEED_FILE = path.join("data", "seed", "golfplaetze-bayern.json");

export async function loadSeed(): Promise<CourseDataset | null> {
  try {
    return parseDataset(JSON.parse(await readFile(path.join(process.cwd(), SEED_FILE), "utf8")));
  } catch {
    return null;
  }
}

export async function missingSeedInDb(): Promise<CourseDto[]> {
  const seed = await loadSeed();
  if (!seed) return [];
  const courses = await loadAllCourses({ includeInactive: true });
  return missingSeedCourses({ ...seed, courses }, seed);
}

export async function importSeedIntoDb(actor = "seed"): Promise<string[]> {
  const added: string[] = [];
  for (const course of await missingSeedInDb()) {
    const { layouts, id: _id, slug: _slug, ...courseInput } = course;
    void _id;
    void _slug;
    const created = await createCourse(courseInput, "SEED", actor);
    for (const layout of layouts) {
      const { ratingSets, holes, id: _lid, courseId: _cid, ...layoutInput } = layout;
      void _lid;
      void _cid;
      const l = await createLayout({ ...layoutInput, courseId: created.id }, "SEED", actor);
      for (const s of ratingSets) {
        const { id: _sid, layoutId: _slid, lastVerifiedAt: _lva, ...ratingInput } = s;
        void _sid;
        void _slid;
        void _lva;
        await createRatingSet({ ...ratingInput, layoutId: l.id }, "SEED", actor);
      }
      if (holes.length > 0) {
        await replaceHoles(
          l.id,
          holes.map(({ id: _hid, layoutId: _hlid, ...h }) => {
            void _hid;
            void _hlid;
            return h;
          }),
          actor,
        );
      }
    }
    added.push(course.name);
  }
  return added;
}
