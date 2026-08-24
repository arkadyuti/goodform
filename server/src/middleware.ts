import type { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { addDays, daysBetween } from '@goodform/shared';
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

/** Matches a date the rest of the app can actually work with. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A bounded `from`/`to` pair off the query string.
 *
 * Every range endpoint walks one iteration per calendar day, so an unbounded
 * span is a way to make the process allocate millions of objects — on a box
 * capped at a 192MB heap, that is a crash, and `Restart=always` makes it a
 * loop. A malformed date is worse than useless: it becomes `Invalid Date` and
 * throws somewhere further in. Reject both here, once, rather than in seven
 * handlers that each have to remember.
 */
export async function dateRangeFrom(
  c: Context<AppEnv>,
  options: { maxDays?: number; defaultDays?: number } = {},
): Promise<{ from: string; to: string }> {
  const { maxDays = 366, defaultDays = 30 } = options;
  const to = c.req.query('to') ?? (await todayFrom(c));
  const from = c.req.query('from') ?? addDays(to, -defaultDays);

  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) {
    throw new HTTPException(400, { message: 'Dates must be YYYY-MM-DD' });
  }
  const span = daysBetween(from, to);
  if (span < 0) throw new HTTPException(400, { message: 'The range ends before it starts' });
  if (span > maxDays)
    throw new HTTPException(400, { message: `Ranges are limited to ${maxDays} days` });

  return { from, to };
}

/**
 * A bounded `limit` off the query string.
 *
 * `Number(c.req.query('limit') ?? 200)` turned `?limit=abc` into `NaN`, which
 * Postgres rejects, and `?limit=99999999` into an unbounded row fetch on a
 * process with a 192MB heap. Neither is something a caller should be able to
 * ask for by accident.
 */
export function limitFrom(c: Context, fallback: number, max: number): number {
  const value = Number(c.req.query('limit'));
  return Number.isInteger(value) && value > 0 ? Math.min(value, max) : fallback;
}
