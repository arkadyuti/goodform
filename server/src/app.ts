import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auth } from './auth.js';
import { pool } from './db/index.js';
import { env, googleEnabled } from './env.js';
import { accountDeleteRoutes, accountRoutes } from './routes/account.js';
import { logRoutes, nutritionRoutes } from './routes/logs.js';
import { planRoutes } from './routes/plan.js';
import { profileRoutes } from './routes/profile.js';
import { progressRoutes } from './routes/progress.js';
import { pushRoutes } from './routes/push.js';
import { regimenRoutes } from './routes/regimen.js';
import { sessionRoutes } from './routes/sessions.js';

/**
 * The application, built but not served.
 *
 * Kept apart from `index.ts` so it can be imported without binding a port —
 * which is what lets the route guards be tested without a server or a
 * database in front of them.
 */
export const app = new Hono();

app.use(
  '/api/*',
  cors({
    origin: [env.appUrl, ...env.devOrigins],
    credentials: true,
    allowHeaders: ['Content-Type'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  }),
);

// Nothing this app accepts is large — the biggest body is a settings object.
// Without a cap, one request can make the process allocate until systemd kills
// it, which on a 512MB box takes very little effort.
app.use(
  '/api/*',
  bodyLimit({ maxSize: 256 * 1024, onError: (c) => c.json({ error: 'Too large' }, 413) }),
);

/**
 * One line per API request: method, path, status, duration.
 *
 * There was no request log anywhere — not here, not in Caddy — so when a run
 * went missing from a phone there was no way to tell whether its writes had
 * arrived and been rejected, or never arrived at all. No query strings, no
 * bodies, no identities: enough to trace, nothing to leak.
 */
app.use('/api/*', async (c, next) => {
  const started = Date.now();
  await next();
  console.log(`${c.req.method} ${c.req.path} ${c.res.status} ${Date.now() - started}ms`);
});

// Which sign-in methods the client should offer.
app.get('/api/config', (c) => c.json({ google: googleEnabled, devLogin: env.devLogin }));
/**
 * Liveness plus a real dependency check.
 *
 * The deploy pipeline gates a release on this endpoint and rolls back if it
 * does not answer. A bare `{ ok: true }` would pass while the database was
 * unreachable, so a release that could not serve a single page would be
 * declared healthy. One cheap round trip makes the gate mean something.
 */
app.get('/api/health', async (c) => {
  try {
    await pool.query('SELECT 1');
    return c.json({ ok: true, db: true });
  } catch {
    return c.json({ ok: false, db: false }, 503);
  }
});

app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));

app.route('/api/profile', profileRoutes);
app.route('/api/plan', planRoutes);
app.route('/api/sessions', sessionRoutes);
app.route('/api/logs', logRoutes);
app.route('/api/nutrition', nutritionRoutes);
app.route('/api/progress', progressRoutes);
app.route('/api/regimen', regimenRoutes);
app.route('/api/push', pushRoutes);
app.route('/api/account', accountRoutes);
app.route('/api/account', accountDeleteRoutes);

/**
 * Locates the built SPA by walking up from this module, so the server runs the
 * same whether it is started from the repo root, from server/, or from dist/.
 */
function findWebDist(): string | null {
  if (process.env.WEB_DIST) return resolve(process.env.WEB_DIST);
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, 'web', 'dist');
    if (existsSync(join(candidate, 'index.html'))) return candidate;
    dir = dirname(dir);
  }
  return null;
}

// In production the same process serves the built SPA.
if (env.isProd) {
  const webDist = findWebDist();
  if (!webDist) {
    console.warn('No built web app found. Run `pnpm build` before starting in production.');
  } else {
    // serveStatic resolves `root` against the working directory.
    const root = relative(process.cwd(), webDist) || '.';
    const indexHtml = join(webDist, 'index.html');
    app.use('/*', serveStatic({ root }));
    // Client-side routes fall back to the shell — but an unknown /api path must
    // not. Without the guard it would answer a mistyped endpoint with the HTML
    // shell and a 200, and the client would try to parse a page as JSON.
    app.get('*', async (c) => {
      if (c.req.path.startsWith('/api/')) return c.json({ error: 'Not found' }, 404);
      return c.html(await readFile(indexHtml, 'utf8'));
    });
  }
}

/**
 * One place every unhandled route error ends up.
 *
 * Without this, a thrown database error travels to the client as whatever the
 * framework decides to say, which can include the query and the schema. The
 * caller gets a shape it can actually parse, the detail stays in the journal
 * where the operator can read it, and a 404 for an unknown /api path returns
 * JSON rather than the SPA shell.
 */
app.onError((err, c) => {
  console.error(`${c.req.method} ${c.req.path} failed:`, err);
  if (err instanceof HTTPException) return err.getResponse();
  return c.json({ error: 'Something went wrong. Please try again.' }, 500);
});

app.notFound((c) =>
  c.req.path.startsWith('/api/') ? c.json({ error: 'Not found' }, 404) : c.text('Not found', 404),
);

export type AppType = typeof app;
