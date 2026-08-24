# GoodForm

Train with good form. Get into good form.

A mobile-first PWA for beginners: adaptive run-walk training plans that respect
tissue adaptation, home strength work, and one-tap daily habit tracking
(smoking, alcohol, water, sleep, protein). Multi-user with Google login.

## Stack

- **web/** — React 19 + Vite + TypeScript + Tailwind v4, installable PWA (vite-plugin-pwa)
- **server/** — Hono on Node 20, Better Auth, Drizzle ORM
- **shared/** — types, plan engine (pure TS), seed content
- **Postgres 16** — per-user data

## Local development

```bash
cp .env.example .env        # fill in DATABASE_URL password + BETTER_AUTH_SECRET
pnpm install
pnpm db:migrate             # apply schema to the goodform database
pnpm db:seed                # food library + strength content
pnpm dev                    # web on :5173 (proxies /api), server on :8790
```

Local Postgres runs in the shared docker-compose (`postgres-db` container);
create the database once with:

```bash
docker exec postgres-db psql -U admin -d postgres -c "CREATE DATABASE goodform;"
```

### Dev login

With `DEV_LOGIN=true`, the login page shows an email/password form
(sign-up allowed) so you can use the app before configuring Google OAuth.

### Google login

1. Create an OAuth client at https://console.cloud.google.com/apis/credentials
2. Authorized redirect URI: `http://localhost:8790/api/auth/callback/google`
   (plus your production URL later)
3. Put the client ID and secret in `.env`

## Production

`pnpm build` produces `web/dist` (static) and the server bundle; the server
serves both API and static files from one process — put Caddy in front for TLS.

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for what is built and what remains.

## Design notes

The palette is functional, not decorative: **cobalt is running, amber is
walking**, and the whole session screen carries the phase colour so a glance at
arm's length in daylight tells you what to do before you have read anything.
Blue against yellow stays distinguishable in bright sun and for the most common
colour vision deficiencies.

The **interval ribbon** draws a session to scale — run blocks against walks —
and runs through the whole app: on today's card, as the in-session progress
bar, and down the plan where every week shares one time scale, so you can watch
the run blocks stretch as the repetitions fall away.

Verified: Lighthouse 100 for accessibility, best practices and SEO; installable
and fully usable offline, with logs queued in IndexedDB and synced on reconnect.
