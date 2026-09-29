import { regionByKey } from "./regions";

/** Öffentliche URL einer Anlage: /golfplaetze/<region>/<slug> (ohne Region: „bayern“). */
export function coursePath(c: { slug: string; region: string | null }): string {
  return `/golfplaetze/${regionByKey(c.region)?.slug ?? "bayern"}/${c.slug}`;
}
