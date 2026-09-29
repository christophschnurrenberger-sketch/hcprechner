export interface Region {
  key: string;
  label: string;
  slug: string;
}

/** Filterbare Regionen in Bayern (Regierungsbezirke + München). */
export const BAVARIAN_REGIONS: readonly Region[] = [
  { key: "OBERBAYERN", label: "Oberbayern", slug: "oberbayern" },
  { key: "MUENCHEN", label: "München", slug: "muenchen" },
  { key: "NIEDERBAYERN", label: "Niederbayern", slug: "niederbayern" },
  { key: "OBERPFALZ", label: "Oberpfalz", slug: "oberpfalz" },
  { key: "OBERFRANKEN", label: "Oberfranken", slug: "oberfranken" },
  { key: "MITTELFRANKEN", label: "Mittelfranken", slug: "mittelfranken" },
  { key: "UNTERFRANKEN", label: "Unterfranken", slug: "unterfranken" },
  { key: "SCHWABEN", label: "Schwaben", slug: "schwaben" },
];

export function regionByKey(key: string | null | undefined): Region | undefined {
  if (!key) return undefined;
  return BAVARIAN_REGIONS.find((r) => r.key === key);
}

export function regionBySlug(slug: string): Region | undefined {
  return BAVARIAN_REGIONS.find((r) => r.slug === slug);
}

/** Akzeptiert Schlüssel oder Bezeichnung („Oberbayern“, „OBERBAYERN“, „muenchen“). */
export function parseRegion(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim().toLowerCase().replace(/ü/g, "ue").replace(/ä/g, "ae").replace(/ö/g, "oe");
  const found = BAVARIAN_REGIONS.find(
    (r) => r.key.toLowerCase() === v || r.slug === v || r.label.toLowerCase().replace(/ü/g, "ue") === v,
  );
  return found?.key ?? null;
}
