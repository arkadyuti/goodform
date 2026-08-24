import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../db/index.js';
import { env, pushEnabled } from '../env.js';
import { pushToUser } from '../push.js';
import { requireAuth, type AppEnv } from '../middleware.js';
import { resolveReminder } from '../regimen-store.js';

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(200) }),
});

export const pushRoutes = new Hono<AppEnv>()
  /**
   * Public: the client needs the application key before it can even ask for
   * permission, and `enabled: false` is how it knows not to ask at all.
   */
  .get('/key', (c) => c.json({ enabled: pushEnabled, key: pushEnabled ? env.vapidPublicKey : null }))

  .use('*', requireAuth)

  .post('/subscribe', async (c) => {
    if (!pushEnabled) return c.json({ error: 'Push is not configured on this server' }, 503);
    const parsed = subscriptionSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: 'Invalid subscription' }, 400);

    const values = {
      userId: c.get('userId'),
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userAgent: c.req.header('user-agent')?.slice(0, 300) ?? null,
      lastSeenAt: new Date(),
    };
    // A browser may hand back the same endpoint after a re-subscribe, and it
    // may belong to a different account on a shared device.
    await db
      .insert(schema.pushSubscriptions)
      .values(values)
      .onConflictDoUpdate({ target: schema.pushSubscriptions.endpoint, set: values });

    return c.json({ ok: true });
  })

  .delete('/subscribe', async (c) => {
    const parsed = z.object({ endpoint: z.string().max(2000) }).safeParse(await c.req.json().catch(() => ({})));
    const userId = c.get('userId');
    if (parsed.success && parsed.data.endpoint) {
      await db
        .delete(schema.pushSubscriptions)
        .where(
          and(
            eq(schema.pushSubscriptions.userId, userId),
            eq(schema.pushSubscriptions.endpoint, parsed.data.endpoint),
          ),
        );
    } else {
      await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, userId));
    }
    return c.json({ ok: true });
  })

  /** Proves the whole chain works, right after permission is granted. */
  .post('/test', async (c) => {
    const delivered = await pushToUser(c.get('userId'), {
      title: 'GoodForm',
      body: 'Notifications are working. This is the only one you asked for.',
      tag: 'test',
      url: '/settings',
      urgent: false,
    });
    return c.json({ delivered });
  })

  /**
   * "Already took it", straight from the notification. The worker calls this
   * for the non-regimen kinds, where there is no dose to log — it only needs
   * the nudge to stop.
   */
  .post('/dismiss', async (c) => {
    const parsed = z
      .object({ kind: z.enum(['regimen', 'session', 'weekly_check']), key: z.string().max(200) })
      .safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: 'Invalid dismissal' }, 400);
    await resolveReminder(c.get('userId'), parsed.data.kind, parsed.data.key);
    return c.json({ ok: true });
  });
