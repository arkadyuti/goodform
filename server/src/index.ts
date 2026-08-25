import { serve } from '@hono/node-server';
import { app } from './app.js';
import { pool } from './db/index.js';
import { env, googleEnabled } from './env.js';
import { startScheduler } from './scheduler.js';

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

// Synchronous throws from an EventEmitter never reach the handler above. Log
// and keep serving: the health check decides whether this process is still fit
// to run, and it can answer that better than a stack trace can.
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});
