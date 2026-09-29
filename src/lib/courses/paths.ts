import { IS_WEBSPACE } from "@/lib/runtime";
import { regionByKey } from "./regions";

/**
 * Öffentliche URL einer Anlage.
 * Node-Edition: /golfplaetze/<region>/<slug> (serverseitig gerendert, SEO).
 * Webspace-Edition: /golfplaetze/anlage?slug=<slug> (statische Seite, Daten per API).
 */
export function coursePath(c: { slug: string; region: string | null }): string {
  if (IS_WEBSPACE) return `/golfplaetze/anlage?slug=${encodeURIComponent(c.slug)}`;
  return `/golfplaetze/${regionByKey(c.region)?.slug ?? "bayern"}/${c.slug}`;
}

/** Übersicht einer Region. */
export function regionPath(regionKey: string | null): string {
  if (IS_WEBSPACE) return regionKey ? `/golfplaetze?region=${regionKey}` : "/golfplaetze";
  return `/golfplaetze/${regionByKey(regionKey)?.slug ?? "bayern"}`;
}

/** Bearbeitungsseite einer Anlage im Admin-Bereich. */
export function adminCoursePath(id: string): string {
  return IS_WEBSPACE ? `/admin/anlage?id=${encodeURIComponent(id)}` : `/admin/anlagen/${id}`;
}

/** Detailseite einer Runde (Runden liegen im Browser – daher Query-Parameter statt Pfadsegment). */
export function roundPath(id: string, extra: Record<string, string> = {}): string {
  const qs = new URLSearchParams({ id, ...extra }).toString();
  return `/runde?${qs}`;
}
