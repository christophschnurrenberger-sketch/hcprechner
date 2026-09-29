import type { Gender, HoleInfo, IsoDate, NineSide, RatingSnapshot } from "@/lib/whs/types";
import type { CourseDto, HoleDto, LayoutDto, RatingSetDto } from "./types";

export type RatingSelectionStatus =
  | "OK"
  | "NO_RATING_FOR_TEE"
  | "NO_VALID_RATING_FOR_DATE"
  | "NOT_VERIFIED"
  | "INCOMPLETE_VALUES"
  | "NINE_HOLE_RATING_MISSING";

export interface RatingQuery {
  date: IsoDate;
  gender: Gender;
  teeColor: string;
  holes: 9 | 18;
  nine?: NineSide | null;
  requireVerified?: boolean;
}

export interface RatingSelection {
  status: RatingSelectionStatus;
  ratingSet: RatingSetDto | null;
}

export function isValidOn(set: Pick<RatingSetDto, "validFrom" | "validTo">, date: IsoDate): boolean {
  return (!set.validFrom || set.validFrom <= date) && (!set.validTo || set.validTo >= date);
}

export function hasCompleteValues(set: RatingSetDto): boolean {
  return set.courseRating !== null && set.slopeRating !== null && set.par !== null;
}

/**
 * Wählt das zum Spieldatum gültige Rating-Set. Historische Versionen bleiben
 * erhalten: Für eine Runde vom 15.09.2026 wird das 2026 gültige Rating
 * verwendet, nicht das heute aktuellste. Es wird nie ein 9-Loch-Rating aus
 * einem 18-Loch-Rating abgeleitet.
 */
export function selectRatingSet(sets: readonly RatingSetDto[], query: RatingQuery): RatingSelection {
  const requireVerified = query.requireVerified ?? true;
  const matching = sets.filter(
    (s) =>
      s.active &&
      s.gender === query.gender &&
      s.teeColor === query.teeColor &&
      s.holes === query.holes &&
      (query.holes === 18 || (query.nine ?? null) === (s.nine ?? null)),
  );
  if (matching.length === 0) {
    const anyForTee = sets.some((s) => s.active && s.gender === query.gender && s.teeColor === query.teeColor);
    return {
      status: query.holes === 9 && anyForTee ? "NINE_HOLE_RATING_MISSING" : "NO_RATING_FOR_TEE",
      ratingSet: null,
    };
  }
  const valid = matching
    .filter((s) => isValidOn(s, query.date))
    .sort((a, b) => (b.validFrom ?? "").localeCompare(a.validFrom ?? ""));
  if (valid.length === 0) return { status: "NO_VALID_RATING_FOR_DATE", ratingSet: null };
  const preferred = valid.find((s) => s.verified) ?? valid[0];
  if (!hasCompleteValues(preferred)) return { status: "INCOMPLETE_VALUES", ratingSet: preferred };
  if (requireVerified && !preferred.verified) return { status: "NOT_VERIFIED", ratingSet: preferred };
  return { status: "OK", ratingSet: preferred };
}

export interface TeeOption {
  teeColor: string;
  teeName: string | null;
  gender: Gender;
  holes: 9 | 18;
  nine: NineSide | null;
  verified: boolean;
  ratingSet: RatingSetDto;
}

/** Verfügbare Abschläge eines Layouts (nur vorhandene Rating-Sets). */
export function availableTees(
  layout: LayoutDto,
  filter: { gender?: Gender; holes?: 9 | 18; date?: IsoDate; onlyVerified?: boolean } = {},
): TeeOption[] {
  const seen = new Map<string, TeeOption>();
  for (const set of layout.ratingSets) {
    if (!set.active) continue;
    if (filter.gender && set.gender !== filter.gender) continue;
    if (filter.holes && set.holes !== filter.holes) continue;
    if (filter.date && !isValidOn(set, filter.date)) continue;
    if (filter.onlyVerified && !set.verified) continue;
    const key = `${set.gender}|${set.teeColor}|${set.holes}|${set.nine ?? ""}`;
    const prev = seen.get(key);
    if (!prev || (!prev.verified && set.verified) || (set.validFrom ?? "") > (prev.ratingSet.validFrom ?? "")) {
      seen.set(key, {
        teeColor: set.teeColor,
        teeName: set.teeName,
        gender: set.gender,
        holes: set.holes,
        nine: set.nine,
        verified: set.verified,
        ratingSet: set,
      });
    }
  }
  return [...seen.values()];
}

/** Lochdaten (Par, Stroke Index) für Geschlecht/Abschlag, bei 9 Loch für die gewählte Hälfte. */
export function holesFor(
  layout: LayoutDto,
  query: { gender: Gender; teeColor?: string | null; holes: 9 | 18; nine?: NineSide | null },
): HoleInfo[] | null {
  const pick = (h: HoleDto) =>
    (h.gender === null || h.gender === query.gender) && (h.teeColor === null || !query.teeColor || h.teeColor === query.teeColor);
  const byNumber = new Map<number, HoleDto>();
  for (const h of layout.holes.filter(pick)) {
    const prev = byNumber.get(h.holeNumber);
    // spezifische Einträge (Geschlecht/Abschlag) haben Vorrang vor allgemeinen
    const specificity = (x: HoleDto) => (x.gender ? 2 : 0) + (x.teeColor ? 1 : 0);
    if (!prev || specificity(h) > specificity(prev)) byNumber.set(h.holeNumber, h);
  }
  const all = [...byNumber.values()].sort((a, b) => a.holeNumber - b.holeNumber);
  let selected: HoleDto[];
  if (query.holes === 18) {
    selected = all.filter((h) => h.holeNumber >= 1 && h.holeNumber <= 18);
  } else if (layout.holesCount === 9 || !query.nine) {
    selected = all.filter((h) => h.holeNumber >= 1 && h.holeNumber <= 9);
  } else {
    selected = all.filter((h) => (query.nine === "FRONT" ? h.holeNumber <= 9 : h.holeNumber >= 10 && h.holeNumber <= 18));
  }
  if (selected.length !== query.holes) return null;
  return selected.map((h) => ({ number: h.holeNumber, par: h.par, strokeIndex: h.strokeIndex }));
}

/** Unveränderlicher Rating-Snapshot für eine Runde. */
export function toRatingSnapshot(set: RatingSetDto): RatingSnapshot {
  return {
    holes: set.holes,
    par: set.par,
    courseRating: set.courseRating,
    slopeRating: set.slopeRating,
    nine: set.nine,
    ratingSetId: set.id,
    verified: set.verified,
    sourceType: set.sourceType,
    sourceUrl: set.sourceUrl,
    checkedAt: set.checkedAt,
    validFrom: set.validFrom,
    validTo: set.validTo,
    manual: false,
  };
}

export function courseHasVerifiedRating(course: CourseDto, holes?: 9 | 18): boolean {
  return course.layouts.some((l) =>
    l.ratingSets.some((s) => s.active && s.verified && hasCompleteValues(s) && (!holes || s.holes === holes)),
  );
}
