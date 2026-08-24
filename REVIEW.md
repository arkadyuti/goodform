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
user they had missed fifteen sessions; the weekly rhythm never being stated; and
`return-from-break` being fully built, tested, and called by nothing.

---

## High value, not yet done

### 1. The loop never closes after a session
`web/src/routes/RunSession.tsx` — on save it navigates to Today and says nothing.
The form says "thirty seconds now decides next week", then nothing reflects that
decision back. A first-ever run deserves an acknowledgement and a "here is what
this changed".

### 2. A run cannot be marked "skipped"
The `Completion` type has `'skipped'` and `evaluateWeek` distinguishes attempted
from missed, but no UI produces a skipped *run* — only strength, incidentally,
when zero sets are ticked. Someone who deliberately decides not to run has no way
to say so, and the week's gate later reads it as a silent miss. Add the third
option to the post-session and backfill choices, and teach the gate copy the
difference.

### 3. Sessions are unreachable on the wrong day
`/session/strength` is linked from exactly one place, gated on it being a
strength day — so it cannot be opened on five days out of seven. Runs have the
same problem on strength days. The "advise, don't lock" pattern already exists in
`RestDay`; reuse it.

### 4. Training days are fixed and cannot be changed
`shared/src/schedule.ts` hard-codes runs to Mon/Wed/Sat and strength to Tue/Fri.
The rhythm is now *stated* on the plan reveal, which was the urgent half, but
someone who works Saturdays still cannot move it. Needs a day picker in
onboarding or Settings, with `scheduleFor()` reading it.

### 5. A dose scheduled inside quiet hours never fires
By design only a medicine may interrupt quiet hours, and the Regimen screen now
says so where the time is chosen. But a supplement at 22:30 with quiet hours from
22:00 silently produces nothing, for ever. Worth deciding deliberately: either
let anything *deliberately* scheduled inside quiet hours through, or defer it to
quiet-hours end rather than dropping it.

### 6. DST: a dose in the skipped hour never fires
On a spring-forward day a dose at 02:30 in a zone that jumps 02:00→03:00 gets no
tick at all, because that wall-clock time does not occur. Verified by sweeping
every minute of 2026-03-08 in America/New_York.

### 7. A snooze that crosses midnight is lost
Snoozing at 23:50 to 00:20 sets the record for the next day, but that day's dose
list only contains that day's doses, so the snoozed occurrence is never seen
again.

### 8. Timestamps are `timestamp without time zone`
Every timestamp column stores local-to-the-server time with no offset. It works
today because the box is UTC; it stops working the moment that is not true.
Migrating to `timestamptz` is cheap now and painful later.

### 9. No transaction around multi-statement plan mutations
`server/src/routes/plan.ts` writes a plan and its weeks in separate statements.
A failure between them leaves a plan with no weeks.

### 10. `adjustSupply` is a read-then-write with no locking
Two devices ticking the same dose can both decrement, or neither.

---

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

## Operating notes

- **Google OAuth needs its production redirect URI registered** before the Google
  button works: `https://goodform.visharka.us/api/auth/callback/google`.
- **Sign-up is allowlisted.** `SIGNUP_ALLOWLIST` in `/opt/goodform/.env` decides
  who may create an account; it gates Google and email/password alike. Blank it
  to open sign-ups.
- **`DEV_LOGIN` must stay false in production** — the server now refuses to boot
  otherwise, which the deploy health check turns into an automatic rollback.
