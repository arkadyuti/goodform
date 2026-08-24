CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "regimen_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"item_id" uuid NOT NULL,
	"due_date" date NOT NULL,
	"due_time" text,
	"status" text NOT NULL,
	"recorded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regimen_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'supplement' NOT NULL,
	"dose_amount" real,
	"dose_form" text DEFAULT 'tablet' NOT NULL,
	"schedule_kind" text DEFAULT 'daily' NOT NULL,
	"weekdays" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"interval_days" integer DEFAULT 1 NOT NULL,
	"anchor_date" date NOT NULL,
	"times" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"food_rule" text DEFAULT 'none' NOT NULL,
	"course_start" date,
	"course_end" date,
	"supply_count" integer,
	"reminders_enabled" boolean DEFAULT true NOT NULL,
	"notes" text,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_sent_at" timestamp,
	"snoozed_until" timestamp,
	"resolved_at" timestamp,
	CONSTRAINT "reminders_user_id_kind_key_pk" PRIMARY KEY("user_id","kind","key")
);
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "timezone" text DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "reminders_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "regimen_reminders" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "session_reminders" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "weekly_check_reminders" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "weekly_check_day" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "weekly_check_time" text DEFAULT '09:30' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "quiet_hours_start" text DEFAULT '22:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "quiet_hours_end" text DEFAULT '07:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "hide_names_in_notifications" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "medicine_escalation" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "session_time" text DEFAULT '07:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "fuelling_tips" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "targets_withdrawn_at" timestamp;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "targets_restored_at" timestamp;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "guardrail_signals" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regimen_events" ADD CONSTRAINT "regimen_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regimen_events" ADD CONSTRAINT "regimen_events_item_id_regimen_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."regimen_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regimen_items" ADD CONSTRAINT "regimen_items_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "push_subs_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "regimen_events_user_date_idx" ON "regimen_events" USING btree ("user_id","due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "regimen_events_occurrence_idx" ON "regimen_events" USING btree ("item_id","due_date","due_time");--> statement-breakpoint
CREATE INDEX "regimen_items_user_idx" ON "regimen_items" USING btree ("user_id");