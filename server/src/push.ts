import { eq } from 'drizzle-orm';
import webpush from 'web-push';
import { db, schema } from './db/index.js';
import { env, pushEnabled } from './env.js';

if (pushEnabled) {
  webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);
}

export interface PushPayload {
  title: string;
  body: string;
  /** Replaces an earlier notification for the same occurrence rather than
   *  stacking a second one on the lock screen. */
  tag: string;
  url: string;
  /** Adds "Taken" and "Snooze" buttons, and tells the worker what to post. */
  regimen?: { itemId: string; dueDate: string; dueTime: string; reminderKey: string };
  urgent: boolean;
}

/**
 * Sends one notification to every device a user has registered.
 *
 * A push is best-effort on every platform — a phone may be off, a subscription
 * may have expired, a browser may simply drop it. Nothing here retries, and
 * nothing anywhere in the app treats a failure to deliver as evidence that a
 * dose was missed.
 */
export async function pushToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!pushEnabled) return 0;

  const subscriptions = await db
    .select()
    .from(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.userId, userId));

  let delivered = 0;
  const body = JSON.stringify(payload);

  // Every device this user has, at once. Sequential sends meant one slow
  // endpoint delayed the rest, and the scheduler is a single loop over every
  // user — so a delay here is a delay for everybody.
  const results = await Promise.allSettled(
    subscriptions.map((subscription) =>
      withTimeout(
        webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          body,
          { urgency: payload.urgent ? 'high' : 'normal', TTL: 60 * 60 },
        ),
      ),
    ),
  );

  for (const [index, result] of results.entries()) {
    const subscription = subscriptions[index]!;
    if (result.status === 'fulfilled') {
      delivered += 1;
      continue;
    }

    const status = (result.reason as { statusCode?: number }).statusCode;
    // 404/410 mean the browser has thrown the subscription away — usually the
    // app was uninstalled or site data cleared. Stop writing to a dead
    // endpoint rather than failing forever.
    if (status === 404 || status === 410) {
      await db
        .delete(schema.pushSubscriptions)
        .where(eq(schema.pushSubscriptions.endpoint, subscription.endpoint));
    } else {
      console.warn(
        `Push to ${subscription.endpoint.slice(0, 48)}… failed (${status ?? 'no status'})`,
      );
    }
  }

  return delivered;
}

/** How long a single push may take before it is abandoned. */
const PUSH_TIMEOUT_MS = 10_000;

/**
 * Caps how long one push may hang.
 *
 * `web-push` hands its options to Node's `https.request`, which has no default
 * response timeout: an endpoint that accepts the connection and then never
 * answers leaves the promise pending for ever. The reminder scheduler awaits
 * this inside a loop over every user, guarded so ticks cannot overlap — so a
 * single wedged endpoint on a single phone would stop reminders for the whole
 * instance, silently and permanently. A push is best-effort anyway; giving up
 * on one is the correct outcome, and hanging is not.
 */
function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) =>
      setTimeout(() => reject(new Error('Push timed out')), PUSH_TIMEOUT_MS).unref(),
    ),
  ]);
}
