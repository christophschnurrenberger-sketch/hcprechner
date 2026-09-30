/**
 * Rollen und Berechtigungen. Die Rolle stammt immer aus dem Backend (Sitzung) – nie aus dem Client.
 * Beide Backends prüfen serverseitig mit dieser Matrix (PHP: identische Tabelle in api/_lib.php).
 */
export type Role = "USER" | "SUPPORT" | "ADMIN" | "SUPER_ADMIN";
export const ROLES: readonly Role[] = ["USER", "SUPPORT", "ADMIN", "SUPER_ADMIN"];

export type UserStatus = "ACTIVE" | "DISABLED" | "LOCKED";
export const USER_STATUSES: readonly UserStatus[] = ["ACTIVE", "DISABLED", "LOCKED"];

export type Permission =
  | "admin.access"
  | "users.read"
  | "users.write"
  | "users.roles"
  | "users.delete"
  | "users.impersonate"
  | "rounds.read"
  | "courses.read"
  | "courses.write"
  | "import"
  | "logs.read"
  | "system.read"
  | "rules.read"
  | "settings.write"
  | "community.read"
  | "community.moderate";

const SUPPORT: Permission[] = ["admin.access", "users.read", "rounds.read", "courses.read", "logs.read", "system.read", "rules.read", "community.read"];
const ADMIN: Permission[] = [...SUPPORT, "users.write", "users.impersonate", "courses.write", "import", "community.moderate"];
const SUPER_ADMIN: Permission[] = [...ADMIN, "users.roles", "users.delete", "settings.write"];

export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  USER: [],
  SUPPORT,
  ADMIN,
  SUPER_ADMIN,
};

export const ROLE_LABELS: Readonly<Record<Role, string>> = {
  USER: "Mitglied",
  SUPPORT: "Support",
  ADMIN: "Administrator",
  SUPER_ADMIN: "Super-Admin",
};

export const STATUS_LABELS: Readonly<Record<UserStatus, string>> = {
  ACTIVE: "Aktiv",
  DISABLED: "Deaktiviert",
  LOCKED: "Gesperrt",
};

export const PERMISSION_LABELS: Readonly<Record<Permission, string>> = {
  "admin.access": "Admin-Bereich öffnen",
  "users.read": "Benutzer ansehen",
  "users.write": "Benutzer verwalten (Status, E-Mail bestätigen, Passwort zurücksetzen)",
  "users.roles": "Rollen vergeben",
  "users.delete": "Benutzer endgültig löschen",
  "users.impersonate": "Benutzeransicht öffnen (protokolliert)",
  "rounds.read": "Runden und Scoring Records ansehen",
  "courses.read": "Golfplätze und Ratings ansehen",
  "courses.write": "Golfplätze, Ratings und Quellen bearbeiten",
  import: "Daten importieren (CSV/JSON)",
  "logs.read": "Audit-Log ansehen",
  "system.read": "Systemstatus ansehen",
  "rules.read": "Regelwerk ansehen",
  "settings.write": "Einstellungen ändern",
  "community.read": "Community ansehen (Ranking, öffentliche Runden, aggregierte Statistik)",
  "community.moderate": "Community moderieren (Runden verbergen, Sichtbarkeit korrigieren)",
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function can(role: Role | null | undefined, permission: Permission): boolean {
  return Boolean(role && ROLE_PERMISSIONS[role].includes(permission));
}

export function permissionsOf(role: Role): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

const RANK: Record<Role, number> = { USER: 0, SUPPORT: 1, ADMIN: 2, SUPER_ADMIN: 3 };

/**
 * Darf `actor` bei `target` die Rolle auf `next` setzen?
 * Nur Super-Admins vergeben Rollen; niemand ändert die eigene Rolle (kein Aussperren/Selbst-Hochstufen).
 */
export function canAssignRole(actor: { id: string; role: Role }, target: { id: string; role: Role }, next: Role): boolean {
  if (!can(actor.role, "users.roles")) return false;
  if (actor.id === target.id) return false;
  return RANK[next] <= RANK[actor.role];
}

/** Darf `actor` Status/Passwort/E-Mail von `target` ändern? Nie an höher- oder gleichrangigen Admins (außer Super-Admin). */
export function canManageUser(actor: { id: string; role: Role }, target: { id: string; role: Role }): boolean {
  if (!can(actor.role, "users.write")) return false;
  if (actor.id === target.id) return false;
  if (actor.role === "SUPER_ADMIN") return true;
  return RANK[target.role] < RANK[actor.role];
}
