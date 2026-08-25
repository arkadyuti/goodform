# GoodForm

Train with good form. Get into good form.

A mobile-first PWA for beginners who want to start running without getting hurt
— and who know the drinking, smoking and eating around it decides whether any
of it sticks. Multi-user, with Google login.

## What it does

**Builds a plan from your actual starting point.** It asks how long you can run
now and, more importantly, what makes you stop. Legs give out before lungs? The
whole plan slows down, because tendons and bone take three to six months to
adapt while your lungs take weeks. Never run before is a first-class answer that
asks for no numbers at all — or the app will time a baseline run for you.

**Adapts to what you log.** Finish three sessions cleanly and you advance. Log
discomfort at 3 or above twice and the week repeats with extra strength work.
Log a 4 and progression pauses with a nudge to get it looked at. You can always
override, and you are told the risk exactly once — it advises, it doesn't lock
you out.

**Runs the session.** Warm-up, an interval timer built to survive a locked
screen, then a cool-down. The whole screen turns cobalt to run and amber to
walk, so a glance at arm's length in daylight tells you what to do.

**Tracks the rest of it.** Water, sleep, cigarettes, beer, other alcohol, your
own custom habits, and protein against a target derived from your weight. No
calorie counting — you are building tissue, and that doesn't happen in a hole.
If the pattern in your logs turns into one where a number on a screen makes
eating harder, the numbers go away until you ask for them back.

**Holds your list.** Supplements and medicines, on separate footings. A missed
shake is nothing; a missed course of antibiotics is not, so only medicines get a
second nudge, only medicines are allowed through quiet hours they were
deliberately scheduled into, and a medicine's name never reaches a lock screen
unless you say so. Courses count down and stop on their own.

**Shows what changed.** Longest interval, resting heart rate, waist, weight and
strength level, each on its own chart because they share no scale. A weekly
review for any week, every session openable in full, and the whole account
downloadable as JSON or CSV whenever you want it.

## Stack

- **web/** — React 19 + Vite + TypeScript + Tailwind v4, installable PWA (vite-plugin-pwa)
- **server/** — Hono on Node 22, Better Auth, Drizzle ORM
- **shared/** — types, plan engine (pure TS, unit-tested), seed content
- **Postgres 16** — per-user data

The plan engine lives in `shared/` deliberately: the same code runs on the
server and in the browser, so a plan can be reasoned about offline.

## Local development

Postgres runs in the shared docker-compose (`postgres-db` container). Create the
database once:

```bash
docker exec postgres-db psql -U admin -d postgres -c "CREATE DATABASE goodform;"
```

Then:

```bash
cp .env.example .env        # fill in DATABASE_URL password + BETTER_AUTH_SECRET
pnpm install
pnpm db:migrate             # apply schema to the goodform database
pnpm db:seed                # food library
pnpm dev                    # web on :5173 (proxies /api), server on :8790
```

**Open http://localhost:5173.** That is the app. Port 8790 is the API only
during development and serves no UI — it serves the built app as well, on that
single port, in production.

`pnpm db:migrate` again after any pull that touches `server/src/db/schema.ts`.
To change the schema, edit it and run `pnpm db:generate` to write a migration.

### Reminders

Scheduled reminders need a VAPID key pair — a service worker cannot wake itself,
so the schedule lives in the server process and pushes to the browser:

```bash
pnpm --filter @goodform/server keys:vapid   # prints the two keys for .env
```

Without them the app still works: everything due appears on Today, permission is
never requested, and Settings says why. With them, the server ticks once a
minute, resolves each user's wall clock through their own IANA timezone — so a
schedule survives travel and DST unshifted — and respects quiet hours. Set
`REMINDER_SCHEDULER=false` to stop the tick.

On iPhone and iPad, Web Push only works once the app is on the home screen
(iOS 16.4+). GoodForm detects that case and offers the install step instead of
a prompt that would do nothing.

### Tests

```bash
pnpm -r test                # plan engine, reminders, regimen, timer, CSV export
pnpm lint
pnpm -r typecheck
```

The plan engine tests pin the progression rules and every gating decision; the
timer tests simulate a suspended tab to prove the session does not drift, and
that it keeps ticking with no animation frames at all — the phone-in-a-pocket
case. CI runs all three before it will deploy.

### Dev login

With `DEV_LOGIN=true`, the login page shows an email/password form with sign-up
allowed, so the app is usable before Google OAuth exists.

**`DEV_LOGIN` must be false in production.** The server refuses to start
otherwise, and because the deploy gates a release on `/api/health`, a build
configured that way rolls back rather than serving. The same check rejects a
development `BETTER_AUTH_SECRET`, a non-https `APP_URL`, and a non-https entry
in `DEV_ORIGINS`.

The risk it closes: with sign-up open, whoever knows an allowlisted address can
register it first and set a password. Because Google is a trusted linking
provider, the real owner's Google sign-in then attaches to *that* account.

### Google login

1. Create an OAuth client at https://console.cloud.google.com/apis/credentials
2. Authorized redirect URI: `http://localhost:5173/api/auth/callback/google`
   (plus your production URL later)
3. Put the client ID and secret in `.env`

`APP_URL` must match the origin you browse, because Better Auth builds its
OAuth redirect from it. In development that is `http://localhost:5173` — point
it at 8790 and Google will return you to a port that serves no UI. In
production both are the same origin, so it stops mattering.

The login page shows whichever methods are configured, so the Google button
appears on its own once the keys are set.

### Starting over

```bash
docker exec postgres-db psql -U admin -d goodform -c 'DELETE FROM "user";'
```

Cascades to every profile, plan, session and log. Seeded foods survive — they
belong to nobody. Hard-refresh afterwards to clear the stale session cookie.

That is **every** account, which is what you want on a laptop and not what you
want on a server with more than one person on it. For a single account:

```bash
psql -d goodform -c "DELETE FROM \"user\" WHERE email = 'someone@example.com';"
```

Anyone can also delete their own account from Settings — it asks them to type
their email address, cascades the same way, and sits next to the export so
nothing has to be lost to leave.

## Production

`pnpm build` typechecks everything and bundles the server with esbuild into
three standalone files — `dist/index.js`, `dist/migrate.js`, `dist/seed.js` —
alongside `web/dist`. Bundling is not an optimisation: the server imports
`@goodform/shared`, whose entry point is TypeScript source, so `tsc` output
alone leaves a bare specifier that Node resolves to a `.ts` file and refuses to
load.

**`NODE_ENV=production` is required.** Serving the built app is gated on it, so
without it the API answers and every page 404s.

One process serves the API and the SPA. It finds `web/dist` by walking up from
its own directory; set `WEB_DIST` to say so outright. Put Caddy in front for
TLS.

GoodForm is deployed by GitHub Actions on every push to `main` —
[deploy/README.md](./deploy/README.md) covers the release layout, the health
gate, the rollback, and the four secrets CI needs.

### Who may sign up

`SIGNUP_ALLOWLIST` is a comma-separated list of addresses allowed to *create* an
account. It gates Google and email/password alike, because the question is who
may hold an account here, not which button they arrived through. Empty means
anyone can — right on a laptop, wrong on a public URL.

## Your data

Everything is exportable from Settings or Progress: one JSON file holding the
whole account, or a CSV per dataset — sessions, daily habits, food,
measurements, plan weeks, your list, doses. Account deletion is self-serve,
behind typing your own email address, and cascades through every table.

## Offline

The app is installable and works with no network. Reads come from the service
worker cache; writes go to an IndexedDB queue that survives a reload and drains
on reconnect. Habit logs carry the whole day rather than a patch, so two edits
made offline cannot overwrite each other. React Query is set to
`networkMode: 'always'` on purpose — its own offline pausing would hold writes
in memory, where a reload loses them.

A queued write is only discarded when the server actually rejects it. A 401 —
a session that expired while the phone was away — stops the drain and keeps
everything, because those writes are good and will land after signing in again.

Verified end to end: logged offline, reloaded offline, reconnected, values
landed in Postgres intact.

## Design notes

The palette is functional, not decorative: **cobalt is running, amber is
walking**, and the whole session screen carries the phase colour. Blue against
yellow stays distinguishable in bright sun and for the most common colour vision
deficiencies. Text on amber is ink, not white — white on amber fails contrast.

The **interval ribbon** draws a session to scale, run blocks against walks, and
runs through the whole app: on today's card, as the in-session progress bar, and
down the plan where every week shares one time scale, so you can watch the run
blocks stretch as the repetitions fall away.

Navigation is sticky at the top, never fixed to the bottom — mobile browser
chrome overlaps bottom bars even with safe-area insets applied.

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for what is built and what remains.

## Not medical advice

GoodForm gives general fitness guidance. It is not medical advice and does not
replace a doctor or physiotherapist. The progression rules are a considered
reading of how beginners get injured, not a clinically validated protocol.
