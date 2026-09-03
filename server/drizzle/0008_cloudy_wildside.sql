ALTER TABLE "plan_weeks" ADD COLUMN "started_on" date;--> statement-breakpoint
UPDATE "plan_weeks" w
SET "started_on" = p."start_date" + (7 * (
  w."index" - 1 + COALESCE((
    SELECT SUM(x."repeats") FROM "plan_weeks" x
    WHERE x."plan_id" = w."plan_id" AND x."index" <= w."index"
  ), 0)
))::integer
FROM "plans" p
WHERE p."id" = w."plan_id" AND w."index" <= p."current_week";
