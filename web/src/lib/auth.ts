import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({ basePath: '/api/auth' });
export const { useSession, signIn, signUp } = authClient;

/**
 * Signs out and clears what was cached for the signed-in user.
 *
 * The service worker keeps read-only API responses so the app opens with no
 * signal. Left behind, they are the previous user's plan, logs and medicine
 * list, readable by whoever opens the app next on the same phone. Anything
 * still queued is deliberately left alone — those are writes someone made, and
 * they belong to the account that made them, not to this device.
 */
export async function signOut(): Promise<void> {
  try {
    await authClient.signOut();
  } finally {
    if (typeof caches !== 'undefined') {
      await caches.delete('app-data').catch(() => {});
    }
  }
}
