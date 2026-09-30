CREATE TABLE "hole_geo" (
	"layout_id" uuid NOT NULL,
	"hole_number" smallint NOT NULL,
	"green_front_lat" double precision,
	"green_front_lng" double precision,
	"green_center_lat" double precision,
	"green_center_lng" double precision,
	"green_back_lat" double precision,
	"green_back_lng" double precision,
	"green_polygon" jsonb,
	"pin_lat" double precision,
	"pin_lng" double precision,
	"pin_set_at" timestamp with time zone,
	"tee_positions" jsonb,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hole_geo_pk" PRIMARY KEY("layout_id","hole_number"),
	CONSTRAINT "hole_geo_hole_number_check" CHECK ("hole_geo"."hole_number" between 1 and 36),
	CONSTRAINT "hole_geo_latitude_check" CHECK (("hole_geo"."green_front_lat" is null or "hole_geo"."green_front_lat" between -90 and 90) and ("hole_geo"."green_center_lat" is null or "hole_geo"."green_center_lat" between -90 and 90) and ("hole_geo"."green_back_lat" is null or "hole_geo"."green_back_lat" between -90 and 90) and ("hole_geo"."pin_lat" is null or "hole_geo"."pin_lat" between -90 and 90)),
	CONSTRAINT "hole_geo_longitude_check" CHECK (("hole_geo"."green_front_lng" is null or "hole_geo"."green_front_lng" between -180 and 180) and ("hole_geo"."green_center_lng" is null or "hole_geo"."green_center_lng" between -180 and 180) and ("hole_geo"."green_back_lng" is null or "hole_geo"."green_back_lng" between -180 and 180) and ("hole_geo"."pin_lng" is null or "hole_geo"."pin_lng" between -180 and 180)),
	CONSTRAINT "hole_geo_pairs_check" CHECK (("hole_geo"."green_front_lat" is null) = ("hole_geo"."green_front_lng" is null) and ("hole_geo"."green_center_lat" is null) = ("hole_geo"."green_center_lng" is null) and ("hole_geo"."green_back_lat" is null) = ("hole_geo"."green_back_lng" is null) and ("hole_geo"."pin_lat" is null) = ("hole_geo"."pin_lng" is null)),
	CONSTRAINT "hole_geo_source_check" CHECK ("hole_geo"."source" is null or "hole_geo"."source" in ('MANUAL','DEVICE_GPS','CSV_IMPORT','MAP'))
);
--> statement-breakpoint
ALTER TABLE "hole_geo" ADD CONSTRAINT "hole_geo_layout_id_layouts_id_fk" FOREIGN KEY ("layout_id") REFERENCES "public"."layouts"("id") ON DELETE cascade ON UPDATE no action;