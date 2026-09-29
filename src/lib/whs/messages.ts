/**
 * Deutsche Texte zu den Codes der Engine. Die Berechnung selbst kennt keine
 * UI-Texte – sie liefert nur Codes und Parameter.
 */
import type {
  CalcIssue,
  DifferentialMethod,
  ExclusionReason,
  GameFormat,
  HoleAdjustmentReason,
  RelevanceCheck,
  ResultStatus,
  RoundCategory,
  EntryMode,
} from "./types";

type Params = Record<string, string | number> | undefined;

function fmt(value: string | number | undefined): string {
  if (typeof value === "number") return String(value).replace(".", ",");
  return value ?? "";
}

const ISSUE_TEXTS: Record<string, (p: Params) => string> = {
  COURSE_RATING_MISSING: () => "Für diesen Abschlag ist kein gültiges Course Rating hinterlegt.",
  SLOPE_RATING_MISSING: () => "Für diesen Abschlag ist kein gültiges Slope Rating hinterlegt.",
  PAR_MISSING: () => "Das Par fehlt – ohne Par ist keine Berechnung möglich.",
  PAR_MISSING_AGS: () =>
    "Par fehlt: Das Score Differential wird aus GBE, CR und Slope berechnet; Course Handicap und Plausibilitätsprüfung (Netto-Doppelbogey-Summe) entfallen.",
  NINE_HOLE_RATING_REQUIRED: () =>
    "Für eine WHS-konforme 9-Loch-Berechnung wird ein gültiges 9-Loch-Rating benötigt.",
  EIGHTEEN_HOLE_RATING_REQUIRED: () => "Für eine 18-Loch-Runde wird ein gültiges 18-Loch-Rating benötigt.",
  SLOPE_RATING_INVALID: (p) => `Slope Rating ${fmt(p?.value)} liegt außerhalb des zulässigen Bereichs ${fmt(p?.min)}–${fmt(p?.max)}.`,
  COURSE_RATING_IMPLAUSIBLE: (p) => `Course Rating ${fmt(p?.value)} ist für ${fmt(p?.holes)} Löcher unplausibel.`,
  PAR_IMPLAUSIBLE: (p) => `Par ${fmt(p?.value)} ist für ${fmt(p?.holes)} Löcher unplausibel.`,
  PCC_INVALID: (p) => `PCC ${fmt(p?.value)} ist nicht zulässig (erlaubt: −1, 0, +1, +2, +3).`,
  AGS_MISSING: () => "Bitte das gewertete Bruttoergebnis (GBE) eingeben.",
  AGS_IMPLAUSIBLE: (p) => `GBE ${fmt(p?.value)} ist unplausibel.`,
  AGS_ABOVE_NET_DOUBLE_BOGEY_MAXIMUM: (p) =>
    `GBE ${fmt(p?.value)} liegt über der Summe der Netto-Doppelbogeys (${fmt(p?.maximum)}). Bitte GBE prüfen – das GBE kann nie höher sein.`,
  SCORE_IMPLAUSIBLY_LOW: (p) => `Ungewöhnlich niedriges Ergebnis (${fmt(p?.value)} bei Par ${fmt(p?.par)}). Bitte prüfen.`,
  HOLE_SCORE_MISSING: (p) => `Lochscore fehlt für Loch ${fmt(p?.hole)}. Bitte Schläge oder „X“ (nicht beendet) eintragen.`,
  HOLE_SCORE_INVALID: (p) => `Ungültiger Lochscore ${fmt(p?.value)} auf Loch ${fmt(p?.hole)}.`,
  HOLE_SCORES_INCOMPLETE: (p) => `Es fehlen Lochscores (${fmt(p?.actual)} von ${fmt(p?.expected)}).`,
  HOLE_DATA_INCOMPLETE: (p) => `Lochdaten unvollständig (${fmt(p?.actual)} von ${fmt(p?.expected)} Löchern mit Par).`,
  HOLE_PAR_MISSING: (p) => `Par fehlt für Loch ${fmt(p?.hole)}.`,
  STROKE_INDEX_MISSING: (p) => `Stroke Index (HCP-Verteilung) fehlt für Loch ${fmt(p?.hole)}.`,
  STROKE_INDEX_DUPLICATE: (p) => `Stroke Index ${fmt(p?.strokeIndex)} ist doppelt vergeben (Loch ${fmt(p?.hole)}).`,
  STABLEFORD_POINTS_INCOMPLETE: () => "Es fehlen Stablefordpunkte.",
  STABLEFORD_POINTS_MISSING: (p) => `Stablefordpunkte fehlen für Loch ${fmt(p?.hole)}.`,
  STABLEFORD_POINTS_INVALID: (p) => `Ungültige Stablefordpunkte (${fmt(p?.value)}) auf Loch ${fmt(p?.hole)}.`,
  STABLEFORD_ZERO_POINTS_AMBIGUOUS: (p) =>
    `Loch ${fmt(p?.hole)}: 0 Punkte sind hier nicht eindeutig (Playing Handicap < Course Handicap). Bitte die Schläge für dieses Loch eintragen.`,
  STABLEFORD_TOTAL_AMBIGUOUS: () =>
    "Eine exakte WHS-Berechnung ist aus der Gesamt-Stablefordpunktzahl allein nicht möglich. Bitte geben Sie die Lochscores oder das GBE ein.",
  STABLEFORD_TOTAL_MISSING: () => "Bitte die Stableford-Gesamtpunktzahl eingeben.",
  STABLEFORD_TOTAL_INVALID: (p) => `Ungültige Punktzahl ${fmt(p?.value)}.`,
  STABLEFORD_TOTAL_IMPLAUSIBLE: (p) => `Punktzahl ${fmt(p?.value)} ist unplausibel.`,
  SCORE_DIFFERENTIAL_MISSING: () => "Bitte das Score Differential eingeben.",
  SCORE_DIFFERENTIAL_IMPLAUSIBLE: (p) => `Score Differential ${fmt(p?.value)} ist unplausibel.`,
  SCORE_DIFFERENTIAL_ROUNDED: (p) => `Score Differential ${fmt(p?.value)} wurde auf ${fmt(p?.rounded)} gerundet.`,
  NO_SCORE_FOR_STATUS: () => "Für diese Ergebnisart gibt es kein handicap-relevantes Ergebnis.",
  ENTRY_MODE_UNSUPPORTED: () => "Diese Eingabeart wird hier nicht unterstützt.",
  PARTIAL_REQUIRES_HOLE_SCORES: () => "Abgebrochene Runden (10–17 Löcher) können nur mit Lochscores berechnet werden.",
  PARTIAL_REQUIRES_18_HOLE_DATA: () => "Für eine abgebrochene 18-Loch-Runde werden die Daten aller 18 Löcher benötigt.",
  PARTIAL_TOO_FEW_HOLES: (p) =>
    `Nur ${fmt(p?.holesPlayed)} Löcher gespielt – keine Wertung als 18-Loch-Runde (mindestens ${fmt(p?.minHoles)}). Vollständig gespielte 9 Löcher bitte als 9-Loch-Runde erfassen.`,
  PARTIAL_ALL_HOLES_PLAYED: () => "Alle 18 Löcher gespielt – bitte als normale 18-Loch-Runde erfassen.",
  PARTIAL_NO_COMPLETE_NINE: (p) =>
    `${fmt(p?.holesPlayed)} Löcher gespielt, aber keine vollständigen neun Löcher (1–9 oder 10–18) – nicht wertbar.`,
  PARTIAL_NINE_RATING_REQUIRED: (p) =>
    `Für die Hochrechnung wird das offizielle 9-Loch-Rating der ${p?.nine === "BACK" ? "Back Nine" : "Front Nine"} benötigt.`,
  PARTIAL_METHOD_UNDEFINED: () => "Für diese Lochzahl ist im Regelset keine Methode hinterlegt.",
  PARTIAL_METHOD_UNVERIFIED: () =>
    "Die Behandlung abgebrochener Runden (10–13: Hochrechnung über 9-Loch-Rating + erwartetes Differential; 14–17: Netto-Par für nicht gespielte Löcher) ist im Regelset hinterlegt, konnte aber noch nicht gegen die offizielle DGV-Berechnung verifiziert werden.",
  RATING_18_REQUIRED: () => "Für diese Berechnung wird ein vollständiges 18-Loch-Rating benötigt.",
  HOLES_PLAYED_MISMATCH: (p) => `Angegeben: ${fmt(p?.declared)} Löcher, erfasst: ${fmt(p?.counted)} Löcher.`,
  CALCULATION_ERROR: (p) => `Berechnung nicht möglich: ${fmt(p?.message)}`,
  RECORD_BELOW_WINDOW: (p) =>
    `Ihr Scoring Record enthält ${fmt(p?.count)} von ${fmt(p?.windowSize)} Ergebnissen. Für eine exakte Übereinstimmung mit dem offiziellen HCPI sollten alle Ergebnisse Ihres DGV-Scoring-Records erfasst sein (z. B. per „Score Differential übernehmen“).`,
  FUTURE_ROUNDS: (p) => `${fmt(p?.count)} Runde(n) liegen in der Zukunft.`,
  ROUNDS_BEFORE_START_DATE: () => "Es gibt Runden vor dem Gültigkeitsdatum des Start-HCPI.",
};

export function issueText(issue: CalcIssue): string {
  return ISSUE_TEXTS[issue.code]?.(issue.params) ?? issue.code;
}

const RELEVANCE_TEXTS: Record<string, string> = {
  CATEGORY_TOURNAMENT: "Turnier (handicap-relevant ausgeschrieben)",
  CATEGORY_RPR: "Registrierte Privatrunde",
  CATEGORY_OTHER: "Sonstige Runde – nicht handicap-relevant",
  FORMAT_STROKE: "Einzelzählspiel",
  FORMAT_STABLEFORD: "Stableford",
  FORMAT_MAX_SCORE: "Maximum Score",
  FORMAT_PAR_BOGEY: "Gegen Par/Bogey",
  FORMAT_MATCHPLAY: "Lochspiel – nicht handicap-relevant",
  FORMAT_TEAM: "Mannschafts-/Paarform – nicht handicap-relevant",
  STATUS_NORMAL: "Ergebnis regulär",
  STATUS_NA: "Nicht angetreten – kein Ergebnis",
  STATUS_TA: "Turnier abgebrochen/annulliert – keine Wertung",
  STATUS_NR_A: "No Return – Ergebnis anrechenbar",
  STATUS_NR_O: "No Return – ohne Wertung",
  STATUS_DQ_A: "Disqualifikation – Ergebnis anrechenbar",
  STATUS_DQ_O: "Disqualifikation – ohne Wertung",
  STATUS_PENALTY: "Penalty Score (Handicapausschuss)",
  IMPORTED_DIFFERENTIAL: "Score Differential aus offiziellem Scoring Record übernommen",
  RATING_VALID: "Gültiges Course Rating und Slope Rating",
  RATING_MISSING: "Kein vollständiges Course/Slope Rating",
  NINE_HOLE_RATING_PRESENT: "Gültiges 9-Loch-Rating",
  NINE_HOLE_RATING_REQUIRED: "9-Loch-Rating fehlt",
  EIGHTEEN_HOLE_RATING_PRESENT: "Gültiges 18-Loch-Rating",
  EIGHTEEN_HOLE_RATING_REQUIRED: "18-Loch-Rating fehlt",
  HOLES_NINE: "Ausreichende Lochzahl (9 Löcher)",
  HOLES_EIGHTEEN: "Ausreichende Lochzahl (18 Löcher)",
  HOLES_PARTIAL: "Abgebrochene 18-Loch-Runde mit ausreichender Lochzahl",
  HOLES_INSUFFICIENT: "Zu wenige Löcher gespielt",
  PARTIAL_REQUIRES_HOLE_SCORES: "Lochscores erforderlich",
};

export function relevanceText(check: RelevanceCheck): string {
  const base = RELEVANCE_TEXTS[check.code] ?? check.code;
  if (check.params?.holesPlayed !== undefined) return `${base} (${check.params.holesPlayed} Löcher)`;
  return base;
}

export const CATEGORY_LABELS: Record<RoundCategory, string> = {
  TOURNAMENT: "Turnier",
  RPR: "Registrierte Privatrunde",
  OTHER: "Sonstige",
};

export const CATEGORY_SHORT: Record<RoundCategory, string> = {
  TOURNAMENT: "Turnier",
  RPR: "RPR",
  OTHER: "Sonstige",
};

export const FORMAT_LABELS: Record<GameFormat, string> = {
  STROKE: "Zählspiel",
  STABLEFORD: "Stableford",
  MAX_SCORE: "Maximum Score",
  PAR_BOGEY: "Gegen Par/Bogey",
  MATCHPLAY: "Lochspiel",
  TEAM: "Mannschaft/Vierer",
};

export const RESULT_STATUS_LABELS: Record<ResultStatus, { short: string; label: string; description: string }> = {
  NORMAL: { short: "–", label: "Reguläres Ergebnis", description: "Runde vollständig gespielt und eingereicht." },
  NA: { short: "NA", label: "Nicht angetreten", description: "Nicht gestartet – kein Ergebnis, nicht handicap-relevant." },
  TA: { short: "TA", label: "Turnier abgebrochen", description: "Wettspiel abgebrochen/annulliert – keine Wertung." },
  NR_A: { short: "NRa", label: "No Return (anrechenbar)", description: "Nicht zu Ende gespielt, Ergebnis wird mit den gespielten Löchern gewertet (ggf. als abgebrochene Runde 10–17)." },
  NR_O: { short: "NRo", label: "No Return (ohne Wertung)", description: "Kein anrechenbares Ergebnis." },
  DQ_A: { short: "DQa", label: "Disqualifikation (anrechenbar)", description: "DQ ohne Einfluss auf die Lochscores – Ergebnis zählt für das Handicap." },
  DQ_O: { short: "DQo", label: "Disqualifikation (ohne Wertung)", description: "Kein anrechenbares Ergebnis." },
  PENALTY: { short: "Penalty", label: "Penalty Score", description: "Vom Handicapausschuss festgesetztes Ergebnis." },
};

export const ENTRY_MODE_LABELS: Record<EntryMode, string> = {
  AGS: "GBE direkt",
  HOLE_BY_HOLE: "Scorekarte (Loch für Loch)",
  STABLEFORD_HOLES: "Stablefordpunkte je Loch",
  STABLEFORD_TOTAL: "Stableford-Gesamtpunkte",
  SCORE_DIFFERENTIAL: "Score Differential übernehmen",
};

export const METHOD_LABELS: Record<DifferentialMethod, string> = {
  EIGHTEEN: "18-Loch-Runde",
  NINE_EXPECTED: "9-Loch-Runde (gespielt + erwartet)",
  PARTIAL_NINE_EXPECTED: "Abgebrochene Runde – Hochrechnung über 9 Löcher",
  PARTIAL_NET_PAR: "Abgebrochene Runde – Netto-Par für nicht gespielte Löcher",
  DIRECT: "Übernommenes Score Differential",
};

export const EXCLUSION_TEXTS: Record<ExclusionReason, string> = {
  NOT_RELEVANT: "Nicht handicap-relevant",
  NO_DIFFERENTIAL: "Kein Score Differential berechenbar",
  NOT_IN_BEST: "Nicht unter den besten Ergebnissen der letzten 20",
  OUTSIDE_WINDOW: "Nicht mehr unter den letzten 20 Ergebnissen",
  TOO_FEW_SCORES: "Noch zu wenige Ergebnisse für einen HCPI (mindestens 3)",
};

export const HOLE_REASON_TEXTS: Record<HoleAdjustmentReason, string> = {
  UNCHANGED: "unverändert",
  NET_DOUBLE_BOGEY_LIMIT: "Netto-Doppelbogey-Limit",
  NOT_COMPLETED: "nicht beendet → Netto-Doppelbogey",
  NOT_PLAYED_NET_PAR: "nicht gespielt → Netto-Par",
  FROM_STABLEFORD: "aus Stablefordpunkten",
  FROM_STABLEFORD_ZERO_POINTS: "0 Punkte → Netto-Doppelbogey",
  NOT_COUNTED: "nicht gewertet",
};

export const RATING_STATUS_TEXTS: Record<string, string> = {
  OK: "Verifiziertes Rating geladen.",
  NO_RATING_FOR_TEE: "Für diesen Abschlag liegen keine WHS-Ratingdaten vor.",
  NO_VALID_RATING_FOR_DATE: "Für das Spieldatum ist kein gültiges Rating hinterlegt.",
  NOT_VERIFIED: "Für diesen Abschlag liegen keine verifizierten WHS-Ratingdaten vor.",
  INCOMPLETE_VALUES: "Das Rating ist unvollständig (Course Rating, Slope oder Par fehlt).",
  NINE_HOLE_RATING_MISSING: "Für eine WHS-konforme 9-Loch-Berechnung wird ein gültiges 9-Loch-Rating benötigt.",
};

export const SOURCE_TYPE_LABELS: Record<string, string> = {
  DGV: "DGV / DGV-Serviceportal",
  BGV: "Bayerischer Golfverband",
  CLUB_OFFICIAL: "Offizielle Club-Website",
  OFFICIAL_SCORECARD: "Offizielle Scorekarte",
  SECONDARY_SOURCE: "Sekundärquelle (nur Gegencheck)",
  MANUAL_IMPORT: "Manueller Import",
};
