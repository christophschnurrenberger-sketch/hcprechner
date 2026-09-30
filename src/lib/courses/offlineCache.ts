/**
 * Platzdaten der laufenden Runde auf dem Gerät vorhalten (localStorage).
 *
 * Beim Rundenstart wird der Platz mit Löchern und Grün-Koordinaten gespeichert. Fällt das Netz aus
 * (Funkloch auf dem Platz), kann die Runde mit diesen Daten weiterlaufen bzw. wieder geöffnet werden –
 * die Entfernungsberechnung braucht ohnehin keinen Server. Keine personenbezogenen Daten.
 */
import { fetchCourse } from "./client";
import type { CourseDto } from "./types";

const KEY = "hcp.courseCache.v1";
/** höchstens so viele Plätze (zuletzt gespielt) */
const MAX_COURSES = 3;

interface CacheEntry {
  course: CourseDto;
  savedAt: string;
}

function read(): CacheEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as CacheEntry[]) : [];
    return Array.isArray(list) ? list.filter((e) => e && e.course && typeof e.course.id === "string" && Array.isArray(e.course.layouts)) : [];
  } catch {
    return [];
  }
}

/** Platz für die laufende Runde merken (neuester zuerst). */
export function rememberCourse(course: CourseDto): void {
  try {
    const rest = read().filter((e) => e.course.id !== course.id);
    const next = [{ course, savedAt: new Date().toISOString() }, ...rest].slice(0, MAX_COURSES);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Speicher voll oder privater Modus – die Runde funktioniert trotzdem (Daten sind im Arbeitsspeicher)
  }
}

export function cachedCourse(idOrSlug: string): CourseDto | null {
  const hit = read().find((e) => e.course.id === idOrSlug || e.course.slug === idOrSlug);
  if (!hit) return null;
  // Ältere Einträge ohne Geodaten bleiben lesbar
  return { ...hit.course, layouts: hit.course.layouts.map((l) => ({ ...l, holeGeo: l.holeGeo ?? [] })) };
}

/** Platz laden; ohne Verbindung die zuletzt gespeicherte Fassung verwenden (online immer die aktuelle). */
export async function fetchCourseOfflineFirst(idOrSlug: string): Promise<CourseDto> {
  try {
    const course = await fetchCourse(idOrSlug);
    if (read().some((e) => e.course.id === course.id)) rememberCourse(course); // Cache aktuell halten
    return course;
  } catch (error) {
    const cached = cachedCourse(idOrSlug);
    if (cached) return cached;
    throw error;
  }
}
