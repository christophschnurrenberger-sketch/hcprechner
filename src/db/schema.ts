/**
 * Relationales Datenmodell.
 *
 * Golfanlage (courses) → Layout/Platz (layouts) → Rating-Set je Abschlag,
 * Geschlecht, 9/18 Loch und Gültigkeitszeitraum (rating_sets) → Löcher (holes).
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
}));

export const ratingSetsRelations = relations(ratingSets, ({ one }) => ({
  layout: one(layouts, { fields: [ratingSets.layoutId], references: [layouts.id] }),
}));

export const holesRelations = relations(holes, ({ one }) => ({
  layout: one(layouts, { fields: [holes.layoutId], references: [layouts.id] }),
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
