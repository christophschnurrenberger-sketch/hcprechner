/**
 * Strukturierte API-Fehler (beide Backends liefern { error: CODE, message, fields? }).
 * Das Frontend zeigt ausschließlich die hier hinterlegten, verständlichen Texte an.
 */
export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "SESSION_EXPIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "NETWORK"
  | "SERVER"
  | "INVALID_CREDENTIALS"
  | "EMAIL_NOT_VERIFIED"
  | "ACCOUNT_DISABLED"
  | "ACCOUNT_LOCKED"
  | "EMAIL_TAKEN"
  | "REGISTRATION_CLOSED"
  | "TOKEN_INVALID"
  | "COURSE_NOT_FOUND"
  | "COURSE_RATING_MISSING"
  | "RATING_NOT_VERIFIED"
  | "RATING_CHANGED"
  | "NINE_HOLE_RATING_MISSING"
  | "HOLE_DATA_MISSING"
  | "ROUND_NOT_FOUND"
  | "ROUND_INVALID";

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message?: string,
    readonly status = 400,
    readonly fields?: Record<string, string>,
  ) {
    super(message ?? USER_MESSAGES[code]);
    this.name = "ApiError";
  }

  toJSON() {
    return { error: this.code, message: this.message, ...(this.fields ? { fields: this.fields } : {}) };
  }
}

/** Verständliche Meldungen für normale Benutzer (keine HTTP-Codes, keine Technik). */
export const USER_MESSAGES: Record<ApiErrorCode, string> = {
  UNAUTHENTICATED: "Bitte melde dich an.",
  SESSION_EXPIRED: "Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.",
  FORBIDDEN: "Dafür fehlt dir die Berechtigung.",
  NOT_FOUND: "Das haben wir nicht gefunden.",
  VALIDATION: "Bitte prüfe deine Eingaben.",
  CONFLICT: "Die Daten wurden zwischenzeitlich geändert. Bitte lade die Seite neu.",
  RATE_LIMITED: "Zu viele Versuche. Bitte warte ein paar Minuten.",
  NETWORK: "Deine Daten konnten gerade nicht geladen werden. Bitte prüfe die Verbindung.",
  SERVER: "Da ist etwas schiefgelaufen. Bitte versuche es gleich noch einmal.",
  INVALID_CREDENTIALS: "E-Mail-Adresse oder Passwort ist falsch.",
  EMAIL_NOT_VERIFIED: "Bitte bestätige zuerst deine E-Mail-Adresse.",
  ACCOUNT_DISABLED: "Dieses Konto ist deaktiviert.",
  ACCOUNT_LOCKED: "Dieses Konto ist gesperrt.",
  EMAIL_TAKEN: "Für diese E-Mail-Adresse gibt es bereits ein Konto.",
  REGISTRATION_CLOSED: "Die Registrierung ist derzeit geschlossen.",
  TOKEN_INVALID: "Der Link ist ungültig oder abgelaufen.",
  COURSE_NOT_FOUND: "Der Golfplatz wurde nicht gefunden.",
  COURSE_RATING_MISSING: "Für diesen Abschlag liegt kein gültiges Course- und Slope-Rating vor.",
  RATING_NOT_VERIFIED: "Das Rating dieses Abschlags ist noch nicht geprüft. Bitte vergleiche die Werte mit deiner Scorekarte und bestätige sie – oder gib sie selbst ein.",
  RATING_CHANGED: "Die Werte dieses Abschlags wurden inzwischen geändert. Bitte vergleiche sie erneut mit deiner Scorekarte.",
  NINE_HOLE_RATING_MISSING: "Für diese neun Löcher liegt kein offizielles 9-Loch-Rating vor.",
  HOLE_DATA_MISSING: "Für diesen Platz fehlen Par und Handicap je Loch. Bitte gib das Gesamtergebnis (GBE) ein.",
  ROUND_NOT_FOUND: "Diese Runde gibt es nicht (mehr).",
  ROUND_INVALID: "Die Runde kann so nicht berechnet werden. Bitte prüfe die Angaben.",
};

export function userMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message || USER_MESSAGES[error.code];
  return USER_MESSAGES.SERVER;
}

/** HTTP-Status je Fehlercode (Backends). */
export const ERROR_STATUS: Partial<Record<ApiErrorCode, number>> = {
  UNAUTHENTICATED: 401,
  SESSION_EXPIRED: 401,
  INVALID_CREDENTIALS: 401,
  FORBIDDEN: 403,
  EMAIL_NOT_VERIFIED: 403,
  ACCOUNT_DISABLED: 403,
  ACCOUNT_LOCKED: 403,
  REGISTRATION_CLOSED: 403,
  NOT_FOUND: 404,
  COURSE_NOT_FOUND: 404,
  ROUND_NOT_FOUND: 404,
  CONFLICT: 409,
  EMAIL_TAKEN: 409,
  RATE_LIMITED: 429,
  SERVER: 500,
};

export function apiError(code: ApiErrorCode, message?: string, fields?: Record<string, string>): ApiError {
  return new ApiError(code, message, ERROR_STATUS[code] ?? 400, fields);
}
