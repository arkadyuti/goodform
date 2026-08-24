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

## Stack

- **web/** — React 19 + Vite + TypeScript + Tailwind v4, installable PWA (vite-plugin-pwa)
- **server/** — Hono on Node 20, Better Auth, Drizzle ORM
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

### Tests

```bash
pnpm -r test                # plan engine, timer, selection logic
```

The plan engine tests pin the progression rules and every gating decision; the
timer tests simulate a suspended tab to prove the session does not drift.

### Dev login

With `DEV_LOGIN=true`, the login page shows an email/password form with sign-up
allowed, so the app is usable before Google OAuth exists.

**Set `DEV_LOGIN=false` before this is reachable from anywhere but your own
machine** — it lets anyone who can reach the server create an account.

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

## Production

`pnpm build` produces `web/dist` (static) and the server bundle. The server
serves both the API and the built app from one process, locating `web/dist` by
walking up from its own directory, so it runs the same from the repo root or
from `dist/`. Put Caddy in front for TLS.

## Offline

The app is installable and works with no network. Reads come from the service
worker cache; writes go to an IndexedDB queue that survives a reload and drains
on reconnect. Habit logs carry the whole day rather than a patch, so two edits
made offline cannot overwrite each other. React Query is set to
`networkMode: 'always'` on purpose — its own offline pausing would hold writes
in memory, where a reload loses them.

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
