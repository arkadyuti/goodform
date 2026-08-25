ALTER TABLE "settings" ADD COLUMN "run_days" integer[] DEFAULT '{1,3,6}' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "strength_days" integer[] DEFAULT '{2,5}' NOT NULL;