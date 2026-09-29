/**
 * Golfplatzdaten im Browser laden – unabhängig von der Build-Variante.
 *
 * - Node-Edition:     /api/courses (PostgreSQL/PGlite auf dem Server)
 * - Webspace-Edition: api/courses.php liefert den veröffentlichten JSON-Datensatz; Suche und
 *                     Filter laufen im Browser mit derselben Logik wie die Node-API.
 *                     Ohne PHP (reiner Static-Host) wird golfplaetze-daten.json gelesen.
 */
import { IS_WEBSPACE, phpApi, withBasePath } from "@/lib/runtime";
import { emptyDataset, findCourse, parseDataset, type CourseDataset } from "./dataset";
import { runCourseSearch, type CourseSearchResponse } from "./summary";
import type { CourseDto } from "./types";

let datasetPromise: Promise<CourseDataset> | null = null;

async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { cache: "no-store", signal, headers: { accept: "application/json" } });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    // z. B. PHP nicht aktiv (Quelltext statt JSON) oder HTML-Fehlerseite des Hosters
    throw new Error(`Ungültige Antwort von ${url} (HTTP ${res.status})`);
  }
  if (!res.ok) throw new Error((json as { error?: string })?.error ?? `HTTP ${res.status}`);
  return json;
}

async function loadDataset(): Promise<CourseDataset> {
  try {
    return parseDataset(await fetchJson(phpApi("courses")));
  } catch (phpError) {
    try {
      return parseDataset(await fetchJson(withBasePath("/golfplaetze-daten.json")));
    } catch {
      console.warn("Golfplatzdaten nicht verfügbar", phpError);
      throw new Error("Golfplatzdatenbank nicht erreichbar");
    }
  }
}

/** Veröffentlichter Golfplatz-Datensatz (Webspace-Edition), einmal pro Seitenaufruf geladen. */
export function getCourseDataset(): Promise<CourseDataset> {
  if (!IS_WEBSPACE) return Promise.resolve(emptyDataset());
  if (!datasetPromise) {
    datasetPromise = loadDataset().catch((error) => {
      datasetPromise = null;
      throw error;
    });
  }
  return datasetPromise;
}

/** Nach dem Veröffentlichen im Admin-Bereich: nächster Zugriff lädt neu. */
export function invalidateCourseDataset(dataset?: CourseDataset) {
  datasetPromise = dataset ? Promise.resolve(dataset) : null;
}

/** Golfplatzsuche (Parameter siehe parseCourseSearchParams). */
export async function searchCoursesRemote(params: URLSearchParams, signal?: AbortSignal): Promise<CourseSearchResponse> {
  if (IS_WEBSPACE) {
    const ds = await getCourseDataset();
    signal?.throwIfAborted();
    return runCourseSearch(ds.courses, params);
  }
  return (await fetchJson(`/api/courses?${params}`, signal)) as CourseSearchResponse;
}

/** Eine Anlage mit allen Plätzen, Ratings und Lochdaten (per ID oder Slug). */
export async function fetchCourse(idOrSlug: string): Promise<CourseDto> {
  if (IS_WEBSPACE) {
    const course = findCourse(await getCourseDataset(), idOrSlug);
    if (!course) throw new Error("Anlage nicht gefunden");
    return course;
  }
  try {
    return (await fetchJson(`/api/courses/${encodeURIComponent(idOrSlug)}`)) as CourseDto;
  } catch (error) {
    throw new Error((error as Error).message || "Anlage konnte nicht geladen werden");
  }
}
