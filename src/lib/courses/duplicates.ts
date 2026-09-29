import { coreTokens, distanceKm, foldText, jaccard, normalizeCourseName, websiteDomain } from "./normalize";

export interface DuplicateCandidateInput {
  id: string;
  name: string;
  officialName?: string | null;
  city?: string | null;
  postalCode?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  website?: string | null;
  externalClubId?: string | null;
}

export type DuplicateReason =
  | "SAME_CLUB_ID"
  | "SAME_WEBSITE"
  | "SAME_NORMALIZED_NAME"
  | "SIMILAR_NAME"
  | "SAME_CITY"
  | "SAME_POSTAL_CODE"
  | "SAME_ADDRESS"
  | "NEARBY";

export interface DuplicatePair {
  a: string;
  b: string;
  score: number;
  reasons: DuplicateReason[];
}

function names(c: DuplicateCandidateInput): string[] {
  return [c.name, c.officialName].filter((n): n is string => Boolean(n));
}

/**
 * Bewertet, ob zwei Einträge dieselbe Golfanlage sind (0 … 1).
 * Mehrere echte Plätze einer Anlage werden als Layouts EINER Anlage geführt;
 * die Duplikaterkennung schlägt nur Zusammenführungen vor – sie führt nie
 * automatisch zusammen.
 */
export function duplicateScore(a: DuplicateCandidateInput, b: DuplicateCandidateInput): DuplicatePair {
  const reasons: DuplicateReason[] = [];
  let score = 0;
  if (a.externalClubId && b.externalClubId) {
    if (a.externalClubId === b.externalClubId) {
      return { a: a.id, b: b.id, score: 1, reasons: ["SAME_CLUB_ID"] };
    }
    // unterschiedliche offizielle Club-IDs → verschiedene Anlagen
    return { a: a.id, b: b.id, score: 0, reasons: [] };
  }
  const domainA = websiteDomain(a.website);
  if (domainA && domainA === websiteDomain(b.website)) {
    reasons.push("SAME_WEBSITE");
    score = Math.max(score, 0.85);
  }
  const normA = names(a).map(normalizeCourseName);
  const normB = names(b).map(normalizeCourseName);
  if (normA.some((n) => normB.includes(n))) {
    reasons.push("SAME_NORMALIZED_NAME");
    score = Math.max(score, 0.8);
  } else {
    const sim = Math.max(
      ...names(a).flatMap((x) => names(b).map((y) => jaccard(coreTokens(x), coreTokens(y)))),
      0,
    );
    if (sim >= 0.5) {
      reasons.push("SIMILAR_NAME");
      score = Math.max(score, 0.3 + sim * 0.4);
    }
  }
  const sameCity = a.city && b.city && foldText(a.city).trim() === foldText(b.city).trim();
  if (sameCity) {
    reasons.push("SAME_CITY");
    score += 0.1;
  }
  if (a.postalCode && b.postalCode && a.postalCode.trim() === b.postalCode.trim()) {
    reasons.push("SAME_POSTAL_CODE");
    score += 0.1;
  }
  if (a.address && b.address && normalizeCourseName(a.address) === normalizeCourseName(b.address)) {
    reasons.push("SAME_ADDRESS");
    score += 0.3;
  }
  if (
    a.latitude != null && a.longitude != null && b.latitude != null && b.longitude != null &&
    distanceKm(a.latitude, a.longitude, b.latitude, b.longitude) <= 1.0
  ) {
    reasons.push("NEARBY");
    score += 0.25;
  }
  // Ohne Namens-/Website-Übereinstimmung reicht derselbe Ort allein nicht.
  const identity = reasons.some((r) => ["SAME_WEBSITE", "SAME_NORMALIZED_NAME", "SIMILAR_NAME", "SAME_ADDRESS", "NEARBY"].includes(r));
  if (!identity) score = Math.min(score, 0.2);
  return { a: a.id, b: b.id, score: Math.min(1, Math.round(score * 100) / 100), reasons };
}

export function findDuplicates(items: readonly DuplicateCandidateInput[], threshold = 0.6): DuplicatePair[] {
  const pairs: DuplicatePair[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const pair = duplicateScore(items[i], items[j]);
      if (pair.score >= threshold) pairs.push(pair);
    }
  }
  return pairs.sort((x, y) => y.score - x.score);
}

/** Bester Treffer für einen neuen Eintrag (z. B. aus CSV oder Importer). */
export function findBestMatch<T extends DuplicateCandidateInput>(
  candidate: DuplicateCandidateInput,
  existing: readonly T[],
  threshold = 0.6,
): { item: T; pair: DuplicatePair } | null {
  let best: { item: T; pair: DuplicatePair } | null = null;
  for (const item of existing) {
    const pair = duplicateScore(candidate, item);
    if (pair.score >= threshold && (!best || pair.score > best.pair.score)) best = { item, pair };
  }
  return best;
}
