# Review backlog

Seven review agents went over the codebase on 2026-08-24 — from the angles of a
beginner runner, the user journey, notifications, security, PWA/offline
behaviour, data integrity and coding standards. Everything they found has now
been worked through. This file is the record of what was done and the few
things deliberately left.

## Done

**Correctness and safety**

- Production would not run at all: the compiled server imported the shared
  package as raw TypeScript. It is bundled with esbuild now.
- Cross-tenant writes on sessions, dose events and nutrition entries — a
  client-supplied id with an unguarded `onConflictDoUpdate` — closed with
  `setWhere`.
- SSRF through the push endpoint; unbounded date ranges that could exhaust a
  512MB box; email/password sign-up open on a public URL; CSV formula injection.
- A Postgres restart killed the process outright — an unhandled `error` event on
  the pool throws synchronously, past the rejection handler.
- One wedged push endpoint stalled reminders for every user, for ever. Sends are
  time-boxed and now run per-device in parallel.
- Plan creation wrote a plan and its weeks as two statements; a failure between
  them left a plan with no weeks, which several screens crash on. Both sites are
  transactions.
- Supply counting was a read-then-write, so two devices ticking the same dose
  lost one. It is a single atomic statement, and scoped to the owner.
- Every timestamp column is `timestamptz`. The migration converts existing
  values explicitly as UTC, so running it from a non-UTC session cannot shift
  them.

**The runner's experience**

- The run timer reset to 0:00 on any parent re-render, closed the AudioContext
  for good and dropped the wake lock — silently, mid-session. It is keyed to the
  prescription alone now, and keeps ticking on a hidden screen.
- The offline queue deleted a finished run when the session had expired, and
  reported it as synced. A 401 now stops the drain and keeps everything.
- A failed save left the button reading "Saving" for ever, on every save path.
- "Today" was the server's UTC date on routes the client did not supply one for
  — a day wrong for anyone east of Greenwich, every evening.
- The calendar told a brand-new user they had missed fifteen sessions.
- The weekly rhythm was never stated and could not be changed. It is stated on
  the plan reveal and there is a day picker in Settings.
- `return-from-break` was fully built, tested, and called by nothing, so a
  three-week gap was met with the same week and no acknowledgement.
- A run could not be declined on purpose, so the gate read a decision and a
  silence identically. It can, and the gate no longer calls a decision a miss.
- `/session/strength` was unreachable five days out of seven.
- Logging a session ended in silence; it now shows where the week stands.
- Discomfort severity — the number that moves the plan — had one line of
  explanation for the whole scale, while effort, which changes nothing, had
  five named anchors. It has five now.
- Honest habit logging turned the number red. An alcohol "unit" is defined
  where it is asked for.
- A dose scheduled inside quiet hours never fired, for ever, with nothing
  saying why. A time deliberately set inside your own quiet hours is honoured.
- A first nudge lost to a late tick is delivered for up to 45 minutes; a snooze
  that crosses midnight resumes; a dose in the hour DST skips still arrives.
- Un-ticking a dose reopens its reminder instead of leaving it resolved.

**Standards**

- ESLint is type-aware on all three packages, with `noUncheckedIndexedAccess`.
  Every resulting error was fixed rather than suppressed.
- Query failures say so instead of rendering an empty state — but only when
  there is no cached data to show, because replacing good data with an error is
  a downgrade.
- The client re-declared server types by hand and they had drifted:
  `prescription` was typed as a whole `PlanWeek` while every writer sent three
  fields. One shared type now, validated on write, with runtime shape checks on
  the three responses where a wrong shape does real damage.
- Accessibility: focus moves to the new screen on navigation, there is a skip
  link, single-select chip groups are real radio groups with arrow keys, and
  card titles are `<h2>` rather than nineteen `<h1>`s and nothing else.
- Tests went from 111 to 143, adding the authorisation boundary (every route
  proven to require a session, with no database), `dates.ts` (the most-imported
  module, previously untested, including DST), response shape guards, and the
  timer's behaviour with no animation frames.

## Deliberately left

- **Full `hc<AppType>` RPC between client and server.** The drift that mattered
  is fixed and the dangerous responses are checked, but the client still
  declares its own types for the rest. Worth doing; not worth doing at the same
  time as everything above.
- **Cross-device notification dismissal.** Acting on a reminder now stops the
  nudge and clears duplicates on that device. Clearing it on a *second* device
  needs the server to push a close instruction to every other subscription —
  real, but more machinery than the problem currently justifies.
- **Six sequential queries per user per tick.** Users are processed five at a
  time now, so one straggler no longer blocks the rest. The per-user query count
  is unchanged and is fine at this size.
- **`isDateString` checks shape, not validity** — `2026-13-45` passes. Every
  caller hands the result to date arithmetic that produces `Invalid Date`
  rather than a wrong date, and the range validator rejects it. Documented in
  the tests.

## The week is a quota, not a rota (2026-09-03)

The plan used to be a counter that moved when a button was tapped, judged
against a window arithmetic'd from the start date. Now:

- **Every window is Mon–Sun** (a late start runs to the Sunday after next), and
  a closed window settles itself the next time anything reads the plan: target
  met, on to the next week; not met, the same week again and every later week
  shifts with it; nothing logged at all, the dates move but it is not counted
  as an attempt. `settleWeeks` in `shared/src/plan-engine/weeks.ts` is pure and
  tested; `server/src/plan/settle.ts` applies it under a row lock.
- **Today asks for what the week still owes.** Preferred days first; another
  day only when the preferred days left cannot hold it; never a run the day
  after a run. `scheduleFor` in `shared/src/schedule.ts`, with the rota as the
  fallback when there is no live week. The reminder scheduler and the calendar
  history read the same function.
- **A skipped run interval does not count.** The timer tracks forfeited reps;
  progress and completion read those, not the timer's position.
- **The review card explains rather than asks.** On a fresh window it says why
  this is week N (again); the choices left to the runner are step back, ease,
  push on, pause. There is no "start next week" button.
- Strength emphasis carries into a repeated attempt instead of vanishing with
  the window that recommended it. The plan's calendar-history `scheduled`
  field is reconstructed from contiguous windows and is an approximation after
  a step-back or push-on.

## Still open, from the 2026-08-29 bug hunt

Five agents drove the app and simulated months of use. Everything CRITICAL and
most of the HIGH findings are fixed and deployed; these are what remain, ranked.
Each was verified against the running app, not inferred from the code.

### Reminders
- **Moving one of several daily times still erases those ticks.** The day-level
  fallback covers a wholesale change; a partial one still mismatches.
- **Adherence counts the whole of today as missed from midnight**, so the rate
  looks worse every morning and recovers through the day.
- **A finished course keeps nagging** to reorder; `courseDaysRemaining` also
  counts down a course that has not started.
- **Supply inflates** when doses are ticked past zero and then un-ticked.
- **`?permanent=true` leaves orphaned reminder rows**, and snooze-only rows
  never expire.

### The runner's experience
- **A height/weight combination can still be absurd within its bounds** — 250 cm
  and 25 kg are each individually allowed, and together give a BMI of 4 and a
  38 g protein target. Each field is now range-checked; the *combination* is not.
- **Today contradicts itself after an off-plan run**: "Logged and done" above a
  rest-day card still offering "Run today instead".
- **Streak counters invent history** from days that were never logged, and
  "money not spent" scales with how often you log rather than with time.
- **The measurements form breaks its layout at phone width**, and a bare
  em-dash renders on the calendar backfill form.
- **Refreshing mid-run loses the timer**, though the session itself now
  survives — you return to the warm-up with the run already recorded.

### Plan
- **A block never reaches its own goal** before offering the next distance up.

## Operating notes

- **Google OAuth** needs `https://goodform.visharka.us/api/auth/callback/google`
  registered in the console.
- **Sign-up is allowlisted.** `SIGNUP_ALLOWLIST` in `/opt/goodform/.env` decides
  who may create an account; it gates Google and email/password alike. Blank it
  to open sign-ups.
- **`DEV_LOGIN` must stay false in production** — the server refuses to boot
  otherwise, which the deploy health check turns into an automatic rollback.
- **Starting over.** Settings offers both: clear your training data and keep the
  account, or delete the account entirely. For one specific person, from the
  box: `psql -d goodform -c "DELETE FROM \"user\" WHERE email = '...';"`
