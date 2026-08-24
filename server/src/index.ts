import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
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
import { startScheduler } from './scheduler.js';

const app = new Hono();

app.use(
  '/api/*',
  cors({
    origin: [env.appUrl, ...env.devOrigins],
    credentials: true,
    allowHeaders: ['Content-Type'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  }),
);

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
    // Client-side routes fall back to the shell.
    app.get('*', async (c) => c.html(await readFile(indexHtml, 'utf8')));
  }
}

let stopScheduler: () => void = () => {};

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`GoodForm API on http://localhost:${info.port}`);
  console.log(`  Google login: ${googleEnabled ? 'enabled' : 'not configured'}`);
  console.log(`  Dev login:    ${env.devLogin ? 'enabled' : 'disabled'}`);
  // Reminders need a process that is awake between requests: a service worker
  // cannot wake itself, so the schedule lives here.
  stopScheduler = startScheduler();
});

/**
 * Shut down without cutting a request off mid-flight.
 *
 * systemd sends SIGTERM on every deploy. Exiting immediately would abandon
 * whatever was in the connection pool, which for a write means the caller sees
 * a dropped connection and cannot tell whether it landed. Stop the scheduler,
 * let the pool drain, and keep a hard deadline so a stuck query cannot hold
 * the restart open forever.
 */
let shuttingDown = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    stopScheduler();
    const deadline = setTimeout(() => process.exit(0), 5000);
    deadline.unref();
    void pool
      .end()
      .catch(() => {})
      .finally(() => process.exit(0));
  });
}

// A rejection nobody handled must not take the process down mid-session; log it
// and let systemd's health gate catch anything that actually broke.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

export type AppType = typeof app;
