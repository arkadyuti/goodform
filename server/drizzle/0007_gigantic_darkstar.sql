ALTER TABLE "plan_weeks" ADD COLUMN "overridden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "plan_weeks" ADD COLUMN "overridden_gate" text;