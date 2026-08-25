-- Every timestamp column becomes `timestamptz`.
--
-- The USING clause is not optional here. Without it Postgres reinterprets the
-- stored value in whatever the *session* timezone happens to be, so running
-- this from a laptop in IST would silently move every recorded instant by five
-- and a half hours. These values were all written by a server running on UTC,
-- so that is what they are read back as, whoever runs the migration.

ALTER TABLE "account" ALTER COLUMN "access_token_expires_at" SET DATA TYPE timestamp with time zone USING "access_token_expires_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "refresh_token_expires_at" SET DATA TYPE timestamp with time zone USING "refresh_token_expires_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "baselines" ALTER COLUMN "recorded_at" SET DATA TYPE timestamp with time zone USING "recorded_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "daily_logs" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "nutrition_entries" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "plan_weeks" ALTER COLUMN "completed_at" SET DATA TYPE timestamp with time zone USING "completed_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "plans" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "push_subscriptions" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "push_subscriptions" ALTER COLUMN "last_seen_at" SET DATA TYPE timestamp with time zone USING "last_seen_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "regimen_events" ALTER COLUMN "recorded_at" SET DATA TYPE timestamp with time zone USING "recorded_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "regimen_items" ALTER COLUMN "archived_at" SET DATA TYPE timestamp with time zone USING "archived_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "regimen_items" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "regimen_items" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "reminders" ALTER COLUMN "last_sent_at" SET DATA TYPE timestamp with time zone USING "last_sent_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "reminders" ALTER COLUMN "snoozed_until" SET DATA TYPE timestamp with time zone USING "snoozed_until" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "reminders" ALTER COLUMN "resolved_at" SET DATA TYPE timestamp with time zone USING "resolved_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "screenings" ALTER COLUMN "completed_at" SET DATA TYPE timestamp with time zone USING "completed_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "screenings" ALTER COLUMN "acknowledged_at" SET DATA TYPE timestamp with time zone USING "acknowledged_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone USING "expires_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "targets_withdrawn_at" SET DATA TYPE timestamp with time zone USING "targets_withdrawn_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "targets_restored_at" SET DATA TYPE timestamp with time zone USING "targets_restored_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "strength_progress" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone USING "expires_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "weekly_checks" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "workout_sessions" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';