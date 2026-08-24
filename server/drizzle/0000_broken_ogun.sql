CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "baselines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"minutes_run" real NOT NULL,
	"stop_reason" text NOT NULL,
	"recorded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_logs" (
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"water_ml" integer DEFAULT 0 NOT NULL,
	"sleep_hours" real,
	"alcohol_units" real DEFAULT 0 NOT NULL,
	"cigarettes" integer DEFAULT 0 NOT NULL,
	"custom_habits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"supplements" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "daily_logs_user_id_date_pk" PRIMARY KEY("user_id","date")
);
--> statement-breakpoint
CREATE TABLE "food_items" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"locale" text DEFAULT 'GLOBAL' NOT NULL,
	"dietary_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"serving_label" text NOT NULL,
	"protein_g" real NOT NULL,
	"owner_id" text
);
--> statement-breakpoint
CREATE TABLE "nutrition_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"food_item_id" text NOT NULL,
	"servings" numeric(5, 2) DEFAULT '1' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_weeks" (
	"plan_id" uuid NOT NULL,
	"index" integer NOT NULL,
	"run_sec" integer NOT NULL,
	"walk_sec" integer NOT NULL,
	"reps" integer NOT NULL,
	"sessions_per_week" integer NOT NULL,
	"is_deload" boolean DEFAULT false NOT NULL,
	"total_run_sec" integer NOT NULL,
	"repeats" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp,
	CONSTRAINT "plan_weeks_plan_id_index_pk" PRIMARY KEY("plan_id","index")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"goal" text NOT NULL,
	"conservatism" integer NOT NULL,
	"conservatism_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"start_date" date NOT NULL,
	"current_week" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"paused_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"age" integer NOT NULL,
	"sex_at_birth" text NOT NULL,
	"height_cm" real NOT NULL,
	"weight_kg" real NOT NULL,
	"units" text DEFAULT 'metric' NOT NULL,
	"dietary_pattern" text NOT NULL,
	"exclusions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"activity_level" text NOT NULL,
	"smoking_status" text NOT NULL,
	"alcohol_frequency" text DEFAULT 'never' NOT NULL,
	"injury_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"injury_notes" text,
	"equipment" jsonb DEFAULT '["none"]'::jsonb NOT NULL,
	"goal" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "screenings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"completed_at" timestamp DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"audio_mode" text DEFAULT 'transient' NOT NULL,
	"sound_enabled" boolean DEFAULT true NOT NULL,
	"haptics_enabled" boolean DEFAULT true NOT NULL,
	"tracked_habits" jsonb DEFAULT '["water","sleep","alcohol","cigarettes"]'::jsonb NOT NULL,
	"custom_habits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"smoking_baseline_per_day" real,
	"cigarette_cost" real,
	"alcohol_baseline_per_week" real,
	"alcohol_unit_cost" real,
	"currency" text DEFAULT 'INR' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strength_progress" (
	"user_id" text NOT NULL,
	"exercise_id" text NOT NULL,
	"sessions_completed" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "strength_progress_user_id_exercise_id_pk" PRIMARY KEY("user_id","exercise_id")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_checks" (
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"weight_kg" real,
	"waist_cm" real,
	"resting_hr" integer,
	"capability" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_checks_user_id_date_pk" PRIMARY KEY("user_id","date")
);
--> statement-breakpoint
CREATE TABLE "workout_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"plan_id" uuid,
	"date" date NOT NULL,
	"type" text NOT NULL,
	"plan_week" integer,
	"prescription" jsonb,
	"completion" text NOT NULL,
	"effort" integer,
	"discomfort_location" text,
	"discomfort_severity" integer,
	"intervals_completed" integer,
	"duration_sec" integer,
	"exercise_log" jsonb,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baselines" ADD CONSTRAINT "baselines_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_items" ADD CONSTRAINT "food_items_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrition_entries" ADD CONSTRAINT "nutrition_entries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrition_entries" ADD CONSTRAINT "nutrition_entries_food_item_id_food_items_id_fk" FOREIGN KEY ("food_item_id") REFERENCES "public"."food_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_weeks" ADD CONSTRAINT "plan_weeks_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screenings" ADD CONSTRAINT "screenings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strength_progress" ADD CONSTRAINT "strength_progress_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_checks" ADD CONSTRAINT "weekly_checks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "food_owner_idx" ON "food_items" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "nutrition_user_date_idx" ON "nutrition_entries" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "plans_user_idx" ON "plans" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_date_idx" ON "workout_sessions" USING btree ("user_id","date");