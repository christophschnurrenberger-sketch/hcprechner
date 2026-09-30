/**
 * Relationales Datenmodell.
 *
 * Golfanlage (courses) → Layout/Platz (layouts) → Rating-Set je Abschlag,
 * Geschlecht, 9/18 Loch und Gültigkeitszeitraum (rating_sets) → Löcher (holes)
 * und GPS-Geodaten je Loch (hole_geo, Grün unabhängig vom Abschlag).
 *
 * Ratingwerte werden nie abgeleitet: Fehlt ein Wert, bleibt er NULL.
 */
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const courses = pgTable(
  "courses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    officialName: text("official_name"),
    clubName: text("club_name"),
    normalizedName: text("normalized_name").notNull(),
    facilityType: text("facility_type").notNull().default("GOLF_COURSE"),
    city: text("city"),
    postalCode: text("postal_code"),
    address: text("address"),
    federalState: text("federal_state").notNull().default("BY"),
    country: text("country").notNull().default("DE"),
    region: text("region"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    website: text("website"),
    officialSourceUrl: text("official_source_url"),
    bayernGolfverbandUrl: text("bayern_golfverband_url"),
    externalClubId: text("external_club_id"),
    active: boolean("active").notNull().default(true),
    verified: boolean("verified").notNull().default(false),
    lastVerifiedAt: date("last_verified_at"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("courses_slug_idx").on(t.slug),
    index("courses_normalized_name_idx").on(t.normalizedName),
    index("courses_region_idx").on(t.region),
    check(
      "courses_facility_type_check",
      sql`${t.facilityType} in ('GOLF_COURSE','SHORT_COURSE','PAR3','DRIVING_RANGE')`,
    ),
  ],
);

export const layouts = pgTable(
  "layouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").notNull(),
    combinationName: text("combination_name"),
    holesCount: smallint("holes_count").notNull(),
    active: boolean("active").notNull().default(true),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("layouts_course_idx").on(t.courseId),
    check("layouts_type_check", sql`${t.type} in ('9_HOLE','18_HOLE','27_HOLE','36_HOLE','SHORT_COURSE')`),
  ],
);

export const ratingSets = pgTable(
  "rating_sets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    layoutId: uuid("layout_id")
      .notNull()
      .references(() => layouts.id, { onDelete: "cascade" }),
    gender: text("gender").notNull(),
    teeColor: text("tee_color").notNull(),
    teeName: text("tee_name"),
    holes: smallint("holes").notNull(),
    nine: text("nine"),
    par: smallint("par"),
    courseRating: numeric("course_rating", { precision: 4, scale: 1, mode: "number" }),
    slopeRating: smallint("slope_rating"),
    yardage: integer("yardage"),
    validFrom: date("valid_from"),
    validTo: date("valid_to"),
    sourceType: text("source_type"),
    sourceUrl: text("source_url"),
    checkedAt: date("checked_at"),
    verified: boolean("verified").notNull().default(false),
    lastVerifiedAt: date("last_verified_at"),
    confidence: text("confidence"),
    active: boolean("active").notNull().default(true),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("rating_sets_layout_idx").on(t.layoutId),
    check("rating_sets_gender_check", sql`${t.gender} in ('M','F')`),
    check("rating_sets_holes_check", sql`${t.holes} in (9,18)`),
    check("rating_sets_nine_check", sql`${t.nine} is null or ${t.nine} in ('FRONT','BACK')`),
    check(
      "rating_sets_slope_check",
      sql`${t.slopeRating} is null or (${t.slopeRating} between 55 and 155)`,
    ),
    check(
      "rating_sets_confidence_check",
      sql`${t.confidence} is null or ${t.confidence} in ('HIGH','MEDIUM','LOW')`,
    ),
    check(
      "rating_sets_verified_requires_values",
      sql`not ${t.verified} or (${t.courseRating} is not null and ${t.slopeRating} is not null and ${t.par} is not null and ${t.sourceType} is not null)`,
    ),
  ],
);

export const holes = pgTable(
  "holes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    layoutId: uuid("layout_id")
      .notNull()
      .references(() => layouts.id, { onDelete: "cascade" }),
    holeNumber: smallint("hole_number").notNull(),
    par: smallint("par").notNull(),
    strokeIndex: smallint("stroke_index"),
    lengthMen: integer("length_men"),
    lengthWomen: integer("length_women"),
    teeColor: text("tee_color"),
    gender: text("gender"),
    ...timestamps,
  },
  (t) => [
    index("holes_layout_idx").on(t.layoutId),
    check("holes_par_check", sql`${t.par} between 3 and 6`),
    check("holes_gender_check", sql`${t.gender} is null or ${t.gender} in ('M','F')`),
  ],
);

/**
 * GPS-Geodaten je Loch eines Platzes (Platz + Lochnummer, nicht je Abschlag): Grün vorne/Mitte/hinten,
 * vorbereitet Grünfläche (GeoJSON), Fahnenposition und Abschlagpositionen. Alle Werte optional –
 * Plätze ohne GPS-Daten funktionieren unverändert. Unabhängig von `holes` (dort ersetzt das Speichern alle Zeilen).
 */
export const holeGeo = pgTable(
  "hole_geo",
  {
    layoutId: uuid("layout_id")
      .notNull()
      .references(() => layouts.id, { onDelete: "cascade" }),
    holeNumber: smallint("hole_number").notNull(),
    greenFrontLat: doublePrecision("green_front_lat"),
    greenFrontLng: doublePrecision("green_front_lng"),
    greenCenterLat: doublePrecision("green_center_lat"),
    greenCenterLng: doublePrecision("green_center_lng"),
    greenBackLat: doublePrecision("green_back_lat"),
    greenBackLng: doublePrecision("green_back_lng"),
    /** GeoJSON-Polygon der Grünfläche (vorbereitet) */
    greenPolygon: jsonb("green_polygon"),
    /** Fahnenposition (vorbereitet) */
    pinLat: doublePrecision("pin_lat"),
    pinLng: doublePrecision("pin_lng"),
    pinSetAt: timestamp("pin_set_at", { withTimezone: true }),
    /** Abschlagpositionen je Farbe (vorbereitet): [{ teeColor, latitude, longitude }] */
    teePositions: jsonb("tee_positions"),
    /** Erfassungsart: MANUAL, DEVICE_GPS, CSV_IMPORT, MAP */
    source: text("source"),
    ...timestamps,
  },
  (t) => [
    primaryKey({ name: "hole_geo_pk", columns: [t.layoutId, t.holeNumber] }),
    check("hole_geo_hole_number_check", sql`${t.holeNumber} between 1 and 36`),
    check(
      "hole_geo_latitude_check",
      sql`(${t.greenFrontLat} is null or ${t.greenFrontLat} between -90 and 90) and (${t.greenCenterLat} is null or ${t.greenCenterLat} between -90 and 90) and (${t.greenBackLat} is null or ${t.greenBackLat} between -90 and 90) and (${t.pinLat} is null or ${t.pinLat} between -90 and 90)`,
    ),
    check(
      "hole_geo_longitude_check",
      sql`(${t.greenFrontLng} is null or ${t.greenFrontLng} between -180 and 180) and (${t.greenCenterLng} is null or ${t.greenCenterLng} between -180 and 180) and (${t.greenBackLng} is null or ${t.greenBackLng} between -180 and 180) and (${t.pinLng} is null or ${t.pinLng} between -180 and 180)`,
    ),
    check(
      "hole_geo_pairs_check",
      sql`(${t.greenFrontLat} is null) = (${t.greenFrontLng} is null) and (${t.greenCenterLat} is null) = (${t.greenCenterLng} is null) and (${t.greenBackLat} is null) = (${t.greenBackLng} is null) and (${t.pinLat} is null) = (${t.pinLng} is null)`,
    ),
    check("hole_geo_source_check", sql`${t.source} is null or ${t.source} in ('MANUAL','DEVICE_GPS','CSV_IMPORT','MAP')`),
  ],
);

/** Protokoll aller Änderungen an Platzdaten (Admin, CSV-Import, Importer). */
export const changeLog = pgTable(
  "change_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    action: text("action").notNull(),
    source: text("source").notNull(),
    changes: jsonb("changes"),
    actor: text("actor"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("change_log_entity_idx").on(t.entityType, t.entityId)],
);

export const importRuns = pgTable("import_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(),
  status: text("status").notNull(),
  summary: jsonb("summary"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

/** Optionale Synchronisation: anonymes Profil, nur über einen geheimen Schlüssel erreichbar. */
export const playerProfiles = pgTable("player_profiles", {
  id: uuid("id").primaryKey(),
  keyHash: text("key_hash").notNull(),
  profile: jsonb("profile").notNull(),
  ...timestamps,
});

export const rounds = pgTable(
  "rounds",
  {
    id: text("id").primaryKey(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => playerProfiles.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    sequence: smallint("sequence").notNull().default(0),
    title: text("title").notNull(),
    category: text("category").notNull(),
    format: text("format").notNull(),
    resultStatus: text("result_status").notNull(),
    holes: smallint("holes").notNull(),
    holesPlayed: smallint("holes_played"),
    courseId: uuid("course_id").references(() => courses.id, { onDelete: "set null" }),
    layoutId: uuid("layout_id").references(() => layouts.id, { onDelete: "set null" }),
    ratingSetId: uuid("rating_set_id").references(() => ratingSets.id, { onDelete: "set null" }),
    pcc: smallint("pcc").notNull().default(0),
    courseSnapshot: jsonb("course_snapshot").notNull(),
    ratingSnapshot: jsonb("rating_snapshot").notNull(),
    nineHoleRatings: jsonb("nine_hole_ratings"),
    holeData: jsonb("hole_data"),
    entry: jsonb("entry").notNull(),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("rounds_profile_date_idx").on(t.profileId, t.date)],
);

export const coursesRelations = relations(courses, ({ many }) => ({
  layouts: many(layouts),
}));

export const layoutsRelations = relations(layouts, ({ one, many }) => ({
  course: one(courses, { fields: [layouts.courseId], references: [courses.id] }),
  ratingSets: many(ratingSets),
  holes: many(holes),
  holeGeo: many(holeGeo),
}));

export const ratingSetsRelations = relations(ratingSets, ({ one }) => ({
  layout: one(layouts, { fields: [ratingSets.layoutId], references: [layouts.id] }),
}));

export const holesRelations = relations(holes, ({ one }) => ({
  layout: one(layouts, { fields: [holes.layoutId], references: [layouts.id] }),
}));

export const holeGeoRelations = relations(holeGeo, ({ one }) => ({
  layout: one(layouts, { fields: [holeGeo.layoutId], references: [layouts.id] }),
}));

export const playerProfilesRelations = relations(playerProfiles, ({ many }) => ({
  rounds: many(rounds),
}));

export const roundsRelations = relations(rounds, ({ one }) => ({
  profile: one(playerProfiles, { fields: [rounds.profileId], references: [playerProfiles.id] }),
}));

export type CourseRow = typeof courses.$inferSelect;
export type NewCourseRow = typeof courses.$inferInsert;
export type LayoutRow = typeof layouts.$inferSelect;
export type NewLayoutRow = typeof layouts.$inferInsert;
export type RatingSetRow = typeof ratingSets.$inferSelect;
export type NewRatingSetRow = typeof ratingSets.$inferInsert;
export type HoleRow = typeof holes.$inferSelect;
export type NewHoleRow = typeof holes.$inferInsert;
export type HoleGeoRow = typeof holeGeo.$inferSelect;
export type NewHoleGeoRow = typeof holeGeo.$inferInsert;

/** Vom Admin angelegte Benutzerkonten (Rolle „player“ oder „editor“ = zusätzlich Golfplatzpflege). */
export const appUsers = pgTable(
  "app_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    role: text("role").notNull().default("player"),
    active: boolean("active").notNull().default(true),
    mustChangePassword: boolean("must_change_password").notNull().default(true),
    passwordHash: text("password_hash").notNull(),
    /** Ändert sich bei jedem Passwortwechsel – meldet bestehende Sitzungen ab. */
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("app_users_username_idx").on(t.username), check("app_users_role_check", sql`${t.role} in ('player', 'editor')`)],
);

/** Daten eines Benutzerkontos (Profil, Runden, Einstellungen) als ein Dokument mit Revision. */
export const appUserData = pgTable("app_user_data", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => appUsers.id, { onDelete: "cascade" }),
  data: jsonb("data").notNull(),
  revision: integer("revision").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Version 2: Konten mit Rollen, Mitglieder-Dokumente, Audit-Log, Einstellungen
// (app_users/app_user_data bleiben als Altbestand für die Übernahme erhalten)
// ---------------------------------------------------------------------------

/** Benutzerkonten. Rolle und Status werden bei jeder Anfrage serverseitig geprüft. */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Anmeldename (klein geschrieben); ältere Konten können nur einen Benutzernamen haben. */
    email: text("email"),
    username: text("username"),
    firstName: text("first_name").notNull().default(""),
    lastName: text("last_name").notNull().default(""),
    role: text("role").notNull().default("USER"),
    status: text("status").notNull().default("ACTIVE"),
    emailVerified: boolean("email_verified").notNull().default(false),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    /** Neue E-Mail-Adresse bis zur Bestätigung. */
    pendingEmail: text("pending_email"),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    passwordHash: text("password_hash").notNull(),
    /** Ändert sich bei jedem Passwortwechsel – meldet bestehende Sitzungen ab. */
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("users_email_idx").on(t.email),
    uniqueIndex("users_username_idx").on(t.username),
    check("users_role_check", sql`${t.role} in ('USER', 'SUPPORT', 'ADMIN', 'SUPER_ADMIN')`),
    check("users_status_check", sql`${t.status} in ('ACTIVE', 'DISABLED', 'LOCKED')`),
  ],
);

/** Einmal-Token (E-Mail-Bestätigung, Passwort zurücksetzen). Gespeichert wird nur der SHA-256-Hash. */
export const authTokens = pgTable(
  "auth_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("auth_tokens_hash_idx").on(t.tokenHash), index("auth_tokens_user_idx").on(t.userId), check("auth_tokens_purpose_check", sql`${t.purpose} in ('VERIFY_EMAIL', 'RESET_PASSWORD')`)],
);

/** Daten eines Mitglieds (Profil, Runden, Entwürfe, Vorlieben) als ein Dokument mit Revision. */
export const memberData = pgTable("member_data", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  data: jsonb("data").notNull(),
  revision: integer("revision").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Audit-Log: bleibt auch nach dem Löschen eines Kontos erhalten (keine Fremdschlüssel). */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    action: text("action").notNull(),
    actorId: uuid("actor_id"),
    actorName: text("actor_name"),
    userId: uuid("user_id"),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value"),
  },
  (t) => [index("audit_log_created_idx").on(t.createdAt), index("audit_log_action_idx").on(t.action), index("audit_log_user_idx").on(t.userId)],
);

/** Einstellungen (Schlüssel → JSON). */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Server-Fehler (für die Systemseite im Admin-Bereich). */
export const errorLog = pgTable("error_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  message: text("message").notNull(),
});

/** Versendete E-Mails (nur Empfänger, Betreff, Status – kein Inhalt). */
export const mailLog = pgTable("mail_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  recipient: text("recipient").notNull(),
  subject: text("subject").notNull(),
  status: text("status").notNull(),
});

// ---------------------------------------------------------------------------
// Community und Golfstatistik (aus den Mitglieder-Dokumenten abgeleitet – Quelle bleibt member_data)
// ---------------------------------------------------------------------------

/**
 * Community-Profil je Mitglied: Einstellungen, aktueller HCPI und freigegebene Kennzahlen. Wird nach jeder
 * Änderung am Mitglieder-Dokument serverseitig neu berechnet (Ranking ohne Neuberechnung aller Mitglieder).
 */
export const communityProfiles = pgTable(
  "community_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    publicId: text("public_id").notNull(),
    displayName: text("display_name").notNull(),
    initials: text("initials").notNull(),
    avatarVersion: integer("avatar_version"),
    rankingVisible: boolean("ranking_visible").notNull().default(false),
    profileVisible: boolean("profile_visible").notNull().default(false),
    roundsVisible: boolean("rounds_visible").notNull().default(false),
    statsVisible: boolean("stats_visible").notNull().default(false),
    notesVisible: boolean("notes_visible").notNull().default(false),
    handicapIndex: doublePrecision("handicap_index"),
    roundsCount: integer("rounds_count").notNull().default(0),
    publicRoundsCount: integer("public_rounds_count").notNull().default(0),
    homeCourseId: text("home_course_id"),
    homeCourseName: text("home_course_name"),
    region: text("region"),
    /** nur bei freigegebener Statistik */
    performance: jsonb("performance"),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("community_profiles_public_idx").on(t.publicId),
    index("community_profiles_ranking_idx").on(t.rankingVisible, t.handicapIndex),
    index("community_profiles_profile_idx").on(t.profileVisible, t.displayName),
  ],
);

/** Für Mitglieder freigegebene Runden (Stufe BASIC/FULL) – nur freigegebene Felder. */
export const publicRounds = pgTable(
  "public_rounds",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roundId: text("round_id").notNull(),
    level: text("level").notNull(),
    date: date("date").notNull(),
    courseId: text("course_id"),
    courseName: text("course_name").notNull(),
    holes: smallint("holes").notNull(),
    /** vollständiger freigegebener Datensatz (PublicRoundRecord) */
    record: jsonb("record").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("public_rounds_pk").on(t.userId, t.roundId),
    index("public_rounds_created_idx").on(t.createdAt),
    index("public_rounds_user_date_idx").on(t.userId, t.date),
    index("public_rounds_course_idx").on(t.courseId),
    check("public_rounds_level_check", sql`${t.level} in ('BASIC', 'FULL')`),
  ],
);

/** Täglicher Ranking-Stand (für Trend „+4 Plätze“ und Verlaufsdiagramme). */
export const rankingSnapshots = pgTable(
  "ranking_snapshots",
  {
    snapshotDate: date("snapshot_date").notNull(),
    scope: text("scope").notNull().default("ALL"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    handicapIndex: doublePrecision("handicap_index").notNull(),
  },
  (t) => [uniqueIndex("ranking_snapshots_pk").on(t.snapshotDate, t.scope, t.userId), index("ranking_snapshots_user_idx").on(t.userId, t.snapshotDate)],
);

/** Index aller Runden (auch private): Statistik, Sichtbarkeit, Moderation – nur für aggregierte Auswertungen und Moderation im Admin-Bereich. */
export const roundStatistics = pgTable(
  "round_statistics",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roundId: text("round_id").notNull(),
    date: date("date").notNull(),
    holes: smallint("holes").notNull(),
    courseId: text("course_id"),
    /** true: Lochstatistik erfasst */
    detailed: boolean("detailed").notNull().default(false),
    /** vollständig erfasst (alle Löcher mit Schlägen, Putts, GIR, Strafschlägen) */
    complete: boolean("complete").notNull().default(false),
    /** Anzahl Hinweise der Plausibilitätsprüfung (z. B. Statistik ohne Schlagzahl) */
    warnings: smallint("warnings").notNull().default(0),
    /** gewählte Sichtbarkeit und Moderation (für die Übersicht im Admin-Bereich) */
    visibility: text("visibility").notNull().default("PRIVATE"),
    hidden: boolean("hidden").notNull().default(false),
    courseName: text("course_name").notNull().default(""),
    stats: jsonb("stats"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("round_statistics_pk").on(t.userId, t.roundId), index("round_statistics_course_idx").on(t.courseId), index("round_statistics_visibility_idx").on(t.visibility, t.hidden)],
);

/** Profilbilder (verkleinert im Browser, höchstens 150 KB). */
export const userAvatars = pgTable("user_avatars", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  mime: text("mime").notNull(),
  data: text("data").notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type AuditRow = typeof auditLog.$inferSelect;
