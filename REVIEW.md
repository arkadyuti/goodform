# Review backlog

Seven review agents went over the codebase on 2026-08-24, from the angles of a
beginner runner, the user journey, notifications, security, PWA/offline
behaviour, data integrity and coding standards. The blockers and every
CRITICAL/HIGH defect found were fixed and deployed the same night — see the git
log from `Add regimen tracking…` onward.

This file is what is **left**, ranked, so none of it is lost. Nothing here stops
the app working; all of it makes it better.

## Fixed already — for context, not to redo

Production would not run at all (`pnpm build && pnpm start` never worked — the
compiled server imported the shared package as raw TypeScript). Beyond that:
cross-tenant writes on sessions, dose events and nutrition entries; SSRF via the
push endpoint; unbounded date ranges that could OOM a 512MB box; email/password
sign-up open on a public URL; CSV formula injection; the run timer resetting to
0:00 on any parent re-render and going silent on a locked screen; the offline
queue deleting a finished run when the session had expired; "today" resolved as
server UTC rather than the user's timezone; the calendar telling a brand-new
user they had missed fifteen sessions; the weekly rhythm never being stated;
`return-from-break` being fully built, tested, and called by nothing; a Postgres
restart killing the process outright; one wedged push endpoint stalling
reminders for every user; and a save failure leaving the runner on a button that
said "Saving" for ever.

---

## High value, not yet done

### 1. Type-aware ESLint, and `noUncheckedIndexedAccess`
`eslint.config.js` uses `tseslint.configs.recommended`, not `recommendedTypeChecked`,
and sets no `parserOptions.projectService` — so every rule needing the type
checker is off. `no-misused-promises` and `no-floating-promises` would have
caught the silent-save bugs found in this review automatically. Turning it on
for `server/` and `shared/` first (no JSX) is six lines of config and perhaps a
half-day of fallout. `noUncheckedIndexedAccess` is the matching tsconfig flag —
the dominant idiom here is `const [row] = await db.select()`, and the scattered
`!`s are the author compensating for its absence by hand. One of them,
`plan.ts` `weeks[weeks.length - 1]!.index`, is reachable: a plan and its weeks
are inserted as two statements with no transaction, so a partial failure leaves
exactly the state that crashes it. Wrap those two blocks in `db.transaction()`.

### 2. There is no shared contract between the server and the client
`web/src/api/hooks.ts` re-declares by hand what `server/src/db/schema.ts`
already defines — `SessionRow`, `PlanRow`, `PlanWeekRow`, `Settings` (26 fields),
`DailyLogRow` — and they have already drifted. `SessionRow.prescription` is
typed as a run prescription while the column is untyped `jsonb` and the route
accepts `z.unknown()`, so a strength session's payload arrives typed as
something it is not, and the charts read `.runSec` off it. `server/src/index.ts`
already exports `AppType` for exactly this and nothing uses it: `hc<AppType>`
deletes about 120 lines and turns drift into a typecheck failure.

Related: `web/src/api/client.ts` returns `response.json() as Promise<T>` with no
runtime validation anywhere. Validating the three responses where a wrong shape
does real damage — `/profile`, `/plan`, `/progress/trends` — is worth more than
validating all twenty-five.

### 3. Query errors render as empty states
`isError` appears at two call sites in the whole of `web/src`. When `/api/plan`
fails, Today renders the *no plan yet* state — a server error shown to the
runner as "you haven't started", indistinguishable from data loss. Same in
Progress, Calendar, FoodLog and Regimen.

### 4. The loop never closes after a session
`web/src/routes/RunSession.tsx` — on save it navigates to Today and says nothing.
The form says "thirty seconds now decides next week", then nothing reflects that
decision back. A first-ever run deserves an acknowledgement and a "here is what
this changed".

### 5. A run cannot be marked "skipped"
The `Completion` type has `'skipped'` and `evaluateWeek` distinguishes attempted
from missed, but no UI produces a skipped *run* — only strength, incidentally,
when zero sets are ticked. Someone who deliberately decides not to run has no way
to say so, and the week's gate later reads it as a silent miss. Add the third
option to the post-session and backfill choices, and teach the gate copy the
difference.

### 6. Sessions are unreachable on the wrong day
`/session/strength` is linked from exactly one place, gated on it being a
strength day — so it cannot be opened on five days out of seven. Runs have the
same problem on strength days. The "advise, don't lock" pattern already exists in
`RestDay`; reuse it.

### 7. Training days are fixed and cannot be changed
`shared/src/schedule.ts` hard-codes runs to Mon/Wed/Sat and strength to Tue/Fri.
The rhythm is now *stated* on the plan reveal, which was the urgent half, but
someone who works Saturdays still cannot move it. Needs a day picker in
onboarding or Settings, with `scheduleFor()` reading it.

### 8. A dose scheduled inside quiet hours never fires
By design only a medicine may interrupt quiet hours, and the Regimen screen now
says so where the time is chosen. But a supplement at 22:30 with quiet hours from
22:00 silently produces nothing, for ever. Worth deciding deliberately: either
let anything *deliberately* scheduled inside quiet hours through, or defer it to
quiet-hours end rather than dropping it.

### 9. DST: a dose in the skipped hour never fires
On a spring-forward day a dose at 02:30 in a zone that jumps 02:00→03:00 gets no
tick at all, because that wall-clock time does not occur. Verified by sweeping
every minute of 2026-03-08 in America/New_York.

### 10. A snooze that crosses midnight is lost
Snoozing at 23:50 to 00:20 sets the record for the next day, but that day's dose
list only contains that day's doses, so the snoozed occurrence is never seen
again.

### 11. Timestamps are `timestamp without time zone`
Every timestamp column stores local-to-the-server time with no offset. It works
today because the box is UTC; it stops working the moment that is not true.
Migrating to `timestamptz` is cheap now and painful later.

### 12. No transaction around multi-statement plan mutations
`server/src/routes/plan.ts` writes a plan and its weeks in separate statements.
A failure between them leaves a plan with no weeks.

### 13. `adjustSupply` is a read-then-write with no locking
Two devices ticking the same dose can both decrement, or neither.

---

## Accessibility

- **No focus management on route change**, and no skip link — reaching content
  past the seven-item nav costs seven tabs on every screen.
- **19 `<h1>` and no `<h2>`–`<h6>` in the entire app.** Every section title is a
  styled paragraph, so heading navigation finds nothing on screens with eight
  sections.
- **`Choices` renders toggle buttons where radios are meant.** All of onboarding
  is built on it: no "1 of 5" position, no arrow-key navigation, each option
  announced as an independent toggle rather than one choice.
- **The inline confirm unmounts the focused element**, dropping focus to
  `<body>`; and it claims `role="alertdialog"` without focus trapping, Escape or
  focus return. Either implement the behaviour or drop the role for an
  `aria-live` panel.

## Smaller, worth a pass

- **Progress on day 0** opens on a week the user did not exist for.
- **Goals are named in kilometres** ("Get to 5K") while the entire app is
  measured in minutes; nothing bridges the two.
- **The calendar legend** lists four of its six dot meanings.
- **"prescription"** leaks into user-facing copy.
- **"Rest HR"** is an abbreviation with no unit and no instructions.
- **In-session controls** (Pause / Skip / −30s) have no accessible labels.
- **`/api/push/dismiss`** is dead code; actioning a notification on one device
  leaves it on screen on every other.
- **Undoing a tick** leaves the reminder resolved, so no further nudge follows.
- **Scheduler N+1** — roughly six sequential queries per user per minute, users
  processed serially. Fine at this size, not at a hundred users.
- **Server tests** cover only CSV formatting. The highest-value additions are the
  authorisation boundary (every route scoped to its own user) and the offline
  queue's drain behaviour.

---

## Deleting and resetting data

**What exists.** `DELETE /api/account` (`server/src/routes/account.ts`), reached
from Settings → "Delete everything". It is gated on typing your own email
address, removes the foods you created while leaving the seeded library alone,
and cascades from the `user` row through every table — including the auth
session, which is what signs the browser out. Verified against the live schema:
all 21 foreign keys are `ON DELETE CASCADE`, and `workout_sessions.plan_id` is
`SET NULL` on purpose, so a logged session outlives the plan it belonged to.
The JSON and CSV exports sit next to it, so nothing has to be lost to leave.

Two things it does not cover:

### 14. No way to start over without deleting the account
The only reset is total: the account goes too, and with Google sign-in that
means the login is destroyed along with the data. Someone who wants a clean
slate — a false start, a plan built on a wrong baseline, a year of stale logs —
has to delete everything and sign up again. A "clear my training data, keep my
account" action would delete plans, sessions, logs, checks, nutrition entries
and dose history while leaving the user row, profile and settings intact, and
drop the caller back at onboarding. It is the same cascade with a narrower root,
plus the same typed-confirmation guard.

### 15. No per-user cleanup for whoever runs the server
There is no operator path to remove or reset one specific person — only the
self-serve route, which needs their session. `README.md` documents
`DELETE FROM "user";` under "Starting over", but that is *every* user, which is
the right tool for a development database and the wrong one for a live box with
more than one account on it. The single-user form is:

```bash
sudo -u postgres psql -d goodform -c "DELETE FROM \"user\" WHERE email = 'someone@example.com';"
```

Worth adding to the README beside the existing command, with the distinction
spelled out — the two differ by a `WHERE` clause and by everything.

## Operating notes

- **Google OAuth needs its production redirect URI registered** before the Google
  button works: `https://goodform.visharka.us/api/auth/callback/google`.
- **Sign-up is allowlisted.** `SIGNUP_ALLOWLIST` in `/opt/goodform/.env` decides
  who may create an account; it gates Google and email/password alike. Blank it
  to open sign-ups.
- **`DEV_LOGIN` must stay false in production** — the server now refuses to boot
  otherwise, which the deploy health check turns into an automatic rollback.
