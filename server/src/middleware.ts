import type { Context, Next } from 'hono';
import { auth } from './auth.js';

export interface AppEnv {
  Variables: {
    userId: string;
    userEmail: string;
  };
}

export async function requireAuth(c: Context<AppEnv>, next: Next) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return c.json({ error: 'Not signed in' }, 401);
  c.set('userId', session.user.id);
  c.set('userEmail', session.user.email);
  await next();
}

/** Today in the user's local date terms, supplied by the client. */
export function todayFrom(c: Context): string {
  const q = c.req.query('date');
  if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
  return new Date().toISOString().slice(0, 10);
}
