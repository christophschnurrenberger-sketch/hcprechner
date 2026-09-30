CREATE TABLE "community_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"display_name" text NOT NULL,
	"initials" text NOT NULL,
	"avatar_version" integer,
	"ranking_visible" boolean DEFAULT false NOT NULL,
	"profile_visible" boolean DEFAULT false NOT NULL,
	"rounds_visible" boolean DEFAULT false NOT NULL,
	"stats_visible" boolean DEFAULT false NOT NULL,
	"notes_visible" boolean DEFAULT false NOT NULL,
	"handicap_index" double precision,
	"rounds_count" integer DEFAULT 0 NOT NULL,
	"public_rounds_count" integer DEFAULT 0 NOT NULL,
	"home_course_id" text,
	"home_course_name" text,
	"region" text,
	"performance" jsonb,
	"last_activity_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "public_rounds" (
	"user_id" uuid NOT NULL,
	"round_id" text NOT NULL,
	"level" text NOT NULL,
	"date" date NOT NULL,
	"course_id" text,
	"course_name" text NOT NULL,
	"holes" smallint NOT NULL,
	"record" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "public_rounds_level_check" CHECK ("public_rounds"."level" in ('BASIC', 'FULL'))
);
--> statement-breakpoint
CREATE TABLE "ranking_snapshots" (
	"snapshot_date" date NOT NULL,
	"scope" text DEFAULT 'ALL' NOT NULL,
	"user_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"handicap_index" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "round_statistics" (
	"user_id" uuid NOT NULL,
	"round_id" text NOT NULL,
	"date" date NOT NULL,
	"holes" smallint NOT NULL,
	"course_id" text,
	"detailed" boolean DEFAULT false NOT NULL,
	"complete" boolean DEFAULT false NOT NULL,
	"warnings" smallint DEFAULT 0 NOT NULL,
	"visibility" text DEFAULT 'PRIVATE' NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"course_name" text DEFAULT '' NOT NULL,
	"stats" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_avatars" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"mime" text NOT NULL,
	"data" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "community_profiles" ADD CONSTRAINT "community_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_rounds" ADD CONSTRAINT "public_rounds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_snapshots" ADD CONSTRAINT "ranking_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_statistics" ADD CONSTRAINT "round_statistics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_avatars" ADD CONSTRAINT "user_avatars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "community_profiles_public_idx" ON "community_profiles" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "community_profiles_ranking_idx" ON "community_profiles" USING btree ("ranking_visible","handicap_index");--> statement-breakpoint
CREATE INDEX "community_profiles_profile_idx" ON "community_profiles" USING btree ("profile_visible","display_name");--> statement-breakpoint
CREATE UNIQUE INDEX "public_rounds_pk" ON "public_rounds" USING btree ("user_id","round_id");--> statement-breakpoint
CREATE INDEX "public_rounds_created_idx" ON "public_rounds" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "public_rounds_user_date_idx" ON "public_rounds" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "public_rounds_course_idx" ON "public_rounds" USING btree ("course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ranking_snapshots_pk" ON "ranking_snapshots" USING btree ("snapshot_date","scope","user_id");--> statement-breakpoint
CREATE INDEX "ranking_snapshots_user_idx" ON "ranking_snapshots" USING btree ("user_id","snapshot_date");--> statement-breakpoint
CREATE UNIQUE INDEX "round_statistics_pk" ON "round_statistics" USING btree ("user_id","round_id");--> statement-breakpoint
CREATE INDEX "round_statistics_course_idx" ON "round_statistics" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "round_statistics_visibility_idx" ON "round_statistics" USING btree ("visibility","hidden");