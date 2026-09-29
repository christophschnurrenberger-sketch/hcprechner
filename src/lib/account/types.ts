/**
 * Benutzerkonten: vom Admin angelegte Zugänge. Angemeldete Spieler speichern Profil und
 * Runden auf dem Server (statt nur im Browser); die Rolle „editor“ darf zusätzlich die
 * Golfplatzdaten im Admin-Bereich pflegen (ohne Benutzerverwaltung).
 *
 * Die Regeln hier gelten für beide Editionen; api/_lib.php der Webspace-Edition prüft identisch.
 */
export type UserRole = "player" | "editor";

export const USER_ROLES: readonly UserRole[] = ["player", "editor"];

export const ROLE_LABELS: Readonly<Record<UserRole, string>> = {
  player: "Spieler",
  editor: "Spieler + Golfplatzpflege",
};

/** Angemeldeter Benutzer (öffentliche Sicht, ohne Passwort-Hash). */
export interface AccountUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  mustChangePassword: boolean;
}

/** Zeile der Benutzerverwaltung im Admin-Bereich. */
export interface AdminUserView {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  dataUpdatedAt: string | null;
  rounds: number;
}

/** 3–40 Zeichen: Kleinbuchstaben, Ziffern, Punkt, Bindestrich, Unterstrich; beginnt mit Buchstabe/Ziffer. */
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,39}$/;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 200;
export const DISPLAY_NAME_MAX_LENGTH = 80;

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function validateUsername(value: string): string | null {
  const v = normalizeUsername(value);
  if (!USERNAME_PATTERN.test(v)) {
    return "Benutzername: 3–40 Zeichen, nur Kleinbuchstaben, Ziffern, Punkt, Bindestrich oder Unterstrich (z. B. max.muster).";
  }
  return null;
}

export function validatePassword(value: string): string | null {
  if (value.length < PASSWORD_MIN_LENGTH) return `Das Passwort muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen lang sein.`;
  if (value.length > PASSWORD_MAX_LENGTH) return "Das Passwort ist zu lang.";
  return null;
}

export function validateDisplayName(value: string): string | null {
  const v = value.trim();
  if (v.length === 0) return "Bitte einen Namen angeben.";
  if (v.length > DISPLAY_NAME_MAX_LENGTH) return `Der Name darf höchstens ${DISPLAY_NAME_MAX_LENGTH} Zeichen haben.`;
  return null;
}

export function isUserRole(value: unknown): value is UserRole {
  return value === "player" || value === "editor";
}

/** Gut lesbares Startpasswort (ohne 0/O, 1/l/I) aus dem Zufallsgenerator des Browsers bzw. von Node. */
export function generatePassword(length = 12): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}
