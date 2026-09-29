/**
 * Namensnormalisierung für Suche und Duplikaterkennung.
 * „Golfclub XYZ e.V.“, „Golf Club XYZ“ und „GC XYZ“ ergeben denselben Schlüssel.
 */

const UMLAUTS: [RegExp, string][] = [
  [/ä/g, "ae"],
  [/ö/g, "oe"],
  [/ü/g, "ue"],
  [/ß/g, "ss"],
  [/é|è|ê/g, "e"],
  [/á|à|â/g, "a"],
];

export function foldText(value: string): string {
  let v = value.toLowerCase();
  for (const [re, rep] of UMLAUTS) v = v.replace(re, rep);
  return v.normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

const LEGAL_FORMS = [
  /\be\.\s?v\.?/g,
  /\bev\b/g,
  /\bgmbh\s*&\s*co\.?\s*kg\b/g,
  /\bgmbh\b/g,
  /\bkg\b/g,
  /\bag\b/g,
  /\bmbh\b/g,
  /\bug\b/g,
];

export function normalizeCourseName(name: string): string {
  let v = foldText(name);
  for (const re of LEGAL_FORMS) v = v.replace(re, " ");
  v = v
    .replace(/golf\s*-\s*und\s+land\s*-?\s*club/g, "golf und landclub")
    .replace(/golf[\s-]+club/g, "golfclub")
    .replace(/golf[\s-]+platz/g, "golfplatz")
    .replace(/golf[\s-]+park/g, "golfpark")
    .replace(/golf[\s-]+anlage/g, "golfanlage")
    .replace(/golf[\s-]+resort/g, "golfresort")
    .replace(/\bg\.?\s?c\.?\b/g, "golfclub")
    .replace(/&/g, " und ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return v;
}

const GENERIC_TOKENS = new Set([
  "golfclub",
  "golf",
  "club",
  "und",
  "land",
  "landclub",
  "golfplatz",
  "golfpark",
  "golfanlage",
  "golfresort",
  "resort",
  "anlage",
  "park",
  "platz",
  "verein",
  "der",
  "die",
  "das",
  "am",
  "im",
  "in",
  "an",
  "bei",
  "zu",
  "von",
  "e",
  "v",
]);

/** Kennzeichnende Namensbestandteile ohne generische Wörter. */
export function coreTokens(name: string): string[] {
  return normalizeCourseName(name)
    .split(" ")
    .filter((t) => t.length > 1 && !GENERIC_TOKENS.has(t));
}

export function slugify(value: string): string {
  return foldText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function websiteDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function jaccard(a: readonly string[], b: readonly string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 && sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter += 1;
  return inter / (sa.size + sb.size - inter);
}

/** Entfernung in km (Haversine). */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
