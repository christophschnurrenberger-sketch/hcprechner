import type { RelevanceCheck, RelevanceResult, Round } from "@/lib/whs/types";
import type { WhsRuleConfig } from "./config";

/**
 * Handicap-Relevanz einer Runde. Liefert alle Einzelprüfungen, damit die UI
 * den Grund anzeigen kann. Nur relevante Runden gelangen in den Scoring Record.
 */
export function determineHandicapRelevance(round: Round, cfg: WhsRuleConfig): RelevanceResult {
  const checks: RelevanceCheck[] = [];
  const directDifferential = round.entry.mode === "SCORE_DIFFERENTIAL";

  checks.push({
    code: `CATEGORY_${round.category}`,
    ok: cfg.acceptableCategories.includes(round.category),
  });

  checks.push({
    code: `FORMAT_${round.format}`,
    ok: cfg.acceptableFormats.includes(round.format),
  });

  const status = cfg.resultStatus[round.resultStatus];
  checks.push({
    code: `STATUS_${round.resultStatus}`,
    ok: Boolean(status?.acceptable),
  });

  if (directDifferential) {
    checks.push({ code: "IMPORTED_DIFFERENTIAL", ok: true });
  } else {
    const r = round.rating;
    const complete =
      r.courseRating !== null && r.slopeRating !== null && r.par !== null &&
      r.courseRating !== undefined && r.slopeRating !== undefined && r.par !== undefined;
    checks.push({ code: complete ? "RATING_VALID" : "RATING_MISSING", ok: complete });
    if (round.holes === 9) {
      const nineRating = r.holes === 9;
      checks.push({
        code: nineRating ? "NINE_HOLE_RATING_PRESENT" : "NINE_HOLE_RATING_REQUIRED",
        ok: nineRating,
      });
    } else {
      const eighteenRating = r.holes === 18;
      checks.push({
        code: eighteenRating ? "EIGHTEEN_HOLE_RATING_PRESENT" : "EIGHTEEN_HOLE_RATING_REQUIRED",
        ok: eighteenRating,
      });
    }
  }

  const played = round.holesPlayed ?? null;
  if (round.holes === 18 && played !== null && played < 18) {
    const ok = played >= cfg.partialRounds.minHoles;
    checks.push({
      code: ok ? "HOLES_PARTIAL" : "HOLES_INSUFFICIENT",
      ok,
      params: { holesPlayed: played, minHoles: cfg.partialRounds.minHoles },
    });
    if (ok && round.entry.mode !== "HOLE_BY_HOLE") {
      checks.push({ code: "PARTIAL_REQUIRES_HOLE_SCORES", ok: false });
    }
  } else {
    checks.push({ code: round.holes === 9 ? "HOLES_NINE" : "HOLES_EIGHTEEN", ok: true });
  }

  return { relevant: checks.every((c) => c.ok), checks };
}
