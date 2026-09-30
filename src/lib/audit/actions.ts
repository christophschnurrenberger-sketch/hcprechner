/**
 * Protokollierte Aktionen (Audit-Log). Kritische Admin-Aktionen und Änderungen an Runden werden
 * serverseitig mit Zeitpunkt, Akteur, betroffenem Benutzer, Objekt sowie altem und neuem Wert gespeichert.
 */
export const AUDIT_ACTIONS = {
  USER_REGISTERED: "Registrierung",
  USER_EMAIL_VERIFIED: "E-Mail bestätigt",
  USER_LOGIN_FAILED: "Anmeldung fehlgeschlagen",
  USER_PASSWORD_CHANGED: "Passwort geändert",
  USER_PASSWORD_RESET_REQUESTED: "Passwort-Zurücksetzen angefordert",
  USER_PASSWORD_RESET: "Passwort zurückgesetzt",
  USER_PROFILE_UPDATED: "Profil geändert",
  USER_CREATED: "Benutzer angelegt (Admin)",
  USER_ROLE_CHANGED: "Rolle geändert",
  USER_STATUS_CHANGED: "Status geändert",
  USER_DISABLED: "Benutzer deaktiviert",
  USER_LOCKED: "Benutzer gesperrt",
  USER_ENABLED: "Benutzer aktiviert",
  USER_VERIFIED_BY_ADMIN: "E-Mail durch Admin bestätigt",
  USER_DELETED: "Benutzer gelöscht",
  USER_DATA_VIEWED: "Benutzerdaten angesehen",
  IMPERSONATION_VIEW: "Benutzeransicht geöffnet",
  ROUND_CREATED: "Runde gespeichert",
  ROUND_MODIFIED: "Runde geändert",
  ROUND_DELETED: "Runde gelöscht",
  ROUNDS_IMPORTED: "Runden importiert",
  COURSE_CREATED: "Golfplatz angelegt",
  COURSE_UPDATED: "Golfplatz geändert",
  COURSE_MERGED: "Golfplätze zusammengeführt",
  LAYOUT_UPDATED: "Platz/Layout geändert",
  RATING_CREATED: "Rating angelegt",
  RATING_UPDATED: "Rating geändert",
  RATING_VERIFIED: "Rating verifiziert",
  RATING_UNVERIFIED: "Verifizierung entfernt",
  RATING_DEACTIVATED: "Rating deaktiviert",
  HOLES_UPDATED: "Lochdaten geändert",
  IMPORT_APPLIED: "Import übernommen",
  SETTINGS_CHANGED: "Einstellungen geändert",
  RULE_VERSION_CHANGED: "Regelversion geändert",
  ROUND_VISIBILITY_CHANGED: "Sichtbarkeit einer Runde geändert",
  ROUND_STATS_UPDATED: "Lochstatistik ergänzt",
  COMMUNITY_SETTINGS_CHANGED: "Community-Einstellungen geändert",
  PUBLIC_ROUND_MODIFIED: "Öffentliche Runde moderiert",
  PUBLIC_ROUND_HIDDEN: "Öffentliche Runde verborgen",
  PUBLIC_ROUND_UNHIDDEN: "Öffentliche Runde wieder sichtbar",
  USER_RANKING_VISIBILITY_CHANGED: "Ranking-Sichtbarkeit geändert (Admin)",
  USER_PROFILE_VISIBILITY_CHANGED: "Profil-Sichtbarkeit geändert (Admin)",
  RANKING_REFRESHED: "Ranking aktualisiert",
} as const;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

export function auditLabel(action: string): string {
  return (AUDIT_ACTIONS as Record<string, string>)[action] ?? action;
}

/** Aktionen, die auf dem Admin-Dashboard als „Letzte Admin-Aktionen“ erscheinen. */
export const ADMIN_ACTIONS: readonly string[] = [
  "USER_CREATED",
  "USER_ROLE_CHANGED",
  "USER_STATUS_CHANGED",
  "USER_DISABLED",
  "USER_LOCKED",
  "USER_ENABLED",
  "USER_VERIFIED_BY_ADMIN",
  "USER_DELETED",
  "USER_DATA_VIEWED",
  "IMPERSONATION_VIEW",
  "COURSE_CREATED",
  "COURSE_UPDATED",
  "COURSE_MERGED",
  "LAYOUT_UPDATED",
  "RATING_CREATED",
  "RATING_UPDATED",
  "RATING_VERIFIED",
  "RATING_UNVERIFIED",
  "RATING_DEACTIVATED",
  "HOLES_UPDATED",
  "IMPORT_APPLIED",
  "SETTINGS_CHANGED",
  "RULE_VERSION_CHANGED",
  "PUBLIC_ROUND_MODIFIED",
  "PUBLIC_ROUND_HIDDEN",
  "PUBLIC_ROUND_UNHIDDEN",
  "USER_RANKING_VISIBILITY_CHANGED",
  "USER_PROFILE_VISIBILITY_CHANGED",
  "RANKING_REFRESHED",
];

/** Aktivitäten der Mitglieder (Dashboard „Letzte Aktivitäten“). */
export const MEMBER_ACTIVITY: readonly string[] = [
  "USER_REGISTERED",
  "USER_EMAIL_VERIFIED",
  "ROUND_CREATED",
  "ROUND_MODIFIED",
  "ROUND_DELETED",
  "ROUNDS_IMPORTED",
  "ROUND_VISIBILITY_CHANGED",
  "ROUND_STATS_UPDATED",
  "COMMUNITY_SETTINGS_CHANGED",
];

/** Kurs-Änderungsprotokoll (Datensatz) → Audit-Aktion. */
export function courseChangeToAudit(entityType: string, action: string): AuditAction {
  if (entityType === "course") return action === "CREATE" ? "COURSE_CREATED" : action === "MERGE" ? "COURSE_MERGED" : "COURSE_UPDATED";
  if (entityType === "layout") return action === "REPLACE_HOLES" ? "HOLES_UPDATED" : "LAYOUT_UPDATED";
  if (action === "CREATE") return "RATING_CREATED";
  if (action === "VERIFY") return "RATING_VERIFIED";
  if (action === "UNVERIFY") return "RATING_UNVERIFIED";
  if (action === "DEACTIVATE") return "RATING_DEACTIVATED";
  return "RATING_UPDATED";
}
