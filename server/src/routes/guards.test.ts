import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Hono } from 'hono';

/**
 * Every API route requires a signed-in user.
 *
 * Written as one sweep over the router rather than a test per route, because
 * the regression that will actually happen is a new route file mounted without
 * `requireAuth`, or a handler registered *above* the `.use()` line that applies
 * it. Both are invisible to a per-route test suite that nobody remembers to
 * extend. `push.ts` already relies on that ordering deliberately — `/key` is
 * public and sits above the guard — so moving one line there would silently
 * unguard everything below it.
 */
vi.mock('../auth.js', () => ({
  auth: {
    api: { getSession: vi.fn().mockResolvedValue(null) },
    handler: vi.fn(),
  },
}));

/** Deliberately reachable without a session. */
const PUBLIC = new Set(['/api/config', '/api/health', '/api/push/key']);

let app: Hono;

beforeAll(async () => {
  ({ app } = await import('../app.js'));
});

describe('the authorisation boundary', () => {
  it('exposes only the routes that are meant to be public', async () => {
    const paths = [...new Set(app.routes.map((route) => route.path))].filter(
      (path) => path.startsWith('/api/') && !path.startsWith('/api/auth/') && path !== '/api/*',
    );

    // A guard sweep that silently matched nothing would pass for ever.
    expect(paths.length).toBeGreaterThan(15);

    const unguarded: string[] = [];
    for (const path of paths) {
      if (PUBLIC.has(path)) continue;
      const response = await app.request(path.replace(/:\w+/g, 'probe'));
      if (response.status !== 401) unguarded.push(`${path} → ${response.status}`);
    }

    expect(unguarded).toEqual([]);
  });

  it('still serves the public ones', async () => {
    for (const path of ['/api/config', '/api/push/key']) {
      const response = await app.request(path);
      expect(response.status, path).toBe(200);
    }
  });
});
