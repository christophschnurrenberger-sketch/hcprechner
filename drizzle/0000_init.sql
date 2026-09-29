CREATE TABLE "change_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"action" text NOT NULL,
	"source" text NOT NULL,
	"changes" jsonb,
	"actor" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"official_name" text,
	"club_name" text,
	"normalized_name" text NOT NULL,
	"facility_type" text DEFAULT 'GOLF_COURSE' NOT NULL,
	"city" text,
	"postal_code" text,
	"address" text,
	"federal_state" text DEFAULT 'BY' NOT NULL,
	"country" text DEFAULT 'DE' NOT NULL,
	"region" text,
	"latitude" double precision,
	"longitude" double precision,
	"website" text,
	"official_source_url" text,
	"bayern_golfverband_url" text,
	"external_club_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"last_verified_at" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "courses_facility_type_check" CHECK ("courses"."facility_type" in ('GOLF_COURSE','SHORT_COURSE','PAR3','DRIVING_RANGE'))
);
--> statement-breakpoint
CREATE TABLE "holes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"layout_id" uuid NOT NULL,
	"hole_number" smallint NOT NULL,
	"par" smallint NOT NULL,
	"stroke_index" smallint,
	"length_men" integer,
	"length_women" integer,
	"tee_color" text,
	"gender" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holes_par_check" CHECK ("holes"."par" between 3 and 6),
	CONSTRAINT "holes_gender_check" CHECK ("holes"."gender" is null or "holes"."gender" in ('M','F'))
);
--> statement-breakpoint
CREATE TABLE "import_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"summary" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "layouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"combination_name" text,
	"holes_count" smallint NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "layouts_type_check" CHECK ("layouts"."type" in ('9_HOLE','18_HOLE','27_HOLE','36_HOLE','SHORT_COURSE'))
);
--> statement-breakpoint
CREATE TABLE "player_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key_hash" text NOT NULL,
	"profile" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rating_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"layout_id" uuid NOT NULL,
	"gender" text NOT NULL,
	"tee_color" text NOT NULL,
	"tee_name" text,
	"holes" smallint NOT NULL,
	"nine" text,
	"par" smallint,
	"course_rating" numeric(4, 1),
	"slope_rating" smallint,
	"yardage" integer,
	"valid_from" date,
	"valid_to" date,
	"source_type" text,
	"source_url" text,
	"checked_at" date,
	"verified" boolean DEFAULT false NOT NULL,
	"last_verified_at" date,
	"confidence" text,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rating_sets_gender_check" CHECK ("rating_sets"."gender" in ('M','F')),
	CONSTRAINT "rating_sets_holes_check" CHECK ("rating_sets"."holes" in (9,18)),
	CONSTRAINT "rating_sets_nine_check" CHECK ("rating_sets"."nine" is null or "rating_sets"."nine" in ('FRONT','BACK')),
	CONSTRAINT "rating_sets_slope_check" CHECK ("rating_sets"."slope_rating" is null or ("rating_sets"."slope_rating" between 55 and 155)),
	CONSTRAINT "rating_sets_confidence_check" CHECK ("rating_sets"."confidence" is null or "rating_sets"."confidence" in ('HIGH','MEDIUM','LOW')),
	CONSTRAINT "rating_sets_verified_requires_values" CHECK (not "rating_sets"."verified" or ("rating_sets"."course_rating" is not null and "rating_sets"."slope_rating" is not null and "rating_sets"."par" is not null and "rating_sets"."source_type" is not null))
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" text PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"date" date NOT NULL,
	"sequence" smallint DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"format" text NOT NULL,
	"result_status" text NOT NULL,
	"holes" smallint NOT NULL,
	"holes_played" smallint,
	"course_id" uuid,
	"layout_id" uuid,
	"rating_set_id" uuid,
	"pcc" smallint DEFAULT 0 NOT NULL,
	"course_snapshot" jsonb NOT NULL,
	"rating_snapshot" jsonb NOT NULL,
	"nine_hole_ratings" jsonb,
	"hole_data" jsonb,
	"entry" jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "holes" ADD CONSTRAINT "holes_layout_id_layouts_id_fk" FOREIGN KEY ("layout_id") REFERENCES "public"."layouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "layouts" ADD CONSTRAINT "layouts_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating_sets" ADD CONSTRAINT "rating_sets_layout_id_layouts_id_fk" FOREIGN KEY ("layout_id") REFERENCES "public"."layouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_profile_id_player_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."player_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_layout_id_layouts_id_fk" FOREIGN KEY ("layout_id") REFERENCES "public"."layouts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_rating_set_id_rating_sets_id_fk" FOREIGN KEY ("rating_set_id") REFERENCES "public"."rating_sets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "change_log_entity_idx" ON "change_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "courses_slug_idx" ON "courses" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "courses_normalized_name_idx" ON "courses" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "courses_region_idx" ON "courses" USING btree ("region");--> statement-breakpoint
CREATE INDEX "holes_layout_idx" ON "holes" USING btree ("layout_id");--> statement-breakpoint
CREATE INDEX "layouts_course_idx" ON "layouts" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "rating_sets_layout_idx" ON "rating_sets" USING btree ("layout_id");--> statement-breakpoint
CREATE INDEX "rounds_profile_date_idx" ON "rounds" USING btree ("profile_id","date");