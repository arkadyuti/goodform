import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { readFile } from 'node:fs/promises';
import { auth } from './auth.js';
import { env, googleEnabled } from './env.js';
import { logRoutes, nutritionRoutes } from './routes/logs.js';
import { planRoutes } from './routes/plan.js';
import { profileRoutes } from './routes/profile.js';
import { progressRoutes } from './routes/progress.js';
import { sessionRoutes } from './routes/sessions.js';

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
app.get('/api/health', (c) => c.json({ ok: true }));

app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));

app.route('/api/profile', profileRoutes);
app.route('/api/plan', planRoutes);
app.route('/api/sessions', sessionRoutes);
app.route('/api/logs', logRoutes);
app.route('/api/nutrition', nutritionRoutes);
app.route('/api/progress', progressRoutes);

// In production the same process serves the built SPA.
if (env.isProd) {
  app.use('/*', serveStatic({ root: './web/dist' }));
  app.get('*', async (c) => {
    const html = await readFile('./web/dist/index.html', 'utf8');
    return c.html(html);
  });
}

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`GoodForm API on http://localhost:${info.port}`);
  console.log(`  Google login: ${googleEnabled ? 'enabled' : 'not configured'}`);
  console.log(`  Dev login:    ${env.devLogin ? 'enabled' : 'disabled'}`);
});

export type AppType = typeof app;
