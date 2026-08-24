import type { Context, Next } from 'hono';
import { eq } from 'drizzle-orm';
import { auth } from './auth.js';
import { db, schema } from './db/index.js';
import { localParts } from './time.js';

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

/**
 * Today, in the user's day — not the server's.
 *
 * The client sends `?date=` wherever it can, and that is the best answer: it
 * is the date on the device in the runner's hand. Where it does not, falling
 * back to the server's UTC date was wrong by a whole day for anyone east of
 * Greenwich in the evening — the server is on UTC, so a user in India opening
 * the app at 2am saw yesterday. Their IANA zone is already stored from
 * onboarding, so resolve the current instant through that instead.
 *
 * Only the fallback costs a query, so the common path is unchanged.
 */
export async function todayFrom(c: Context<AppEnv>): Promise<string> {
  const q = c.req.query('date');
  if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q;

  const userId = c.get('userId');
  if (userId) {
    const [row] = await db
      .select({ timezone: schema.settings.timezone })
      .from(schema.settings)
      .where(eq(schema.settings.userId, userId));
    if (row?.timezone) return localParts(new Date(), row.timezone).date;
  }
  return new Date().toISOString().slice(0, 10);
}
