/**
 * Notification permission and push subscription, from the browser's side.
 *
 * Permission is never requested on load. It is requested in context — after a
 * first item exists and the user has asked for reminders — because a prompt
 * that arrives before anyone knows what it is for gets denied permanently, and
 * a denied permission cannot be asked for again.
 */

export type PushSupport =
  | { state: 'ready' }
  | { state: 'needs_install'; reason: string }
  | { state: 'unsupported'; reason: string }
  | { state: 'denied'; reason: string };

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS reports itself as a Mac, and is only distinguishable by touch.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari's own, non-standard flag; it is the only signal on iOS.
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

/** Whether this browser can deliver a scheduled reminder at all, and why not. */
export function pushSupport(): PushSupport {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return { state: 'unsupported', reason: 'This browser has no service worker, so it cannot receive reminders.' };
  }
  if (!('PushManager' in window) || !('Notification' in window)) {
    // iOS gained Web Push in 16.4, but only for home-screen apps — so a
    // missing PushManager on an iPhone means "not installed", not "never".
    if (isIos() && !isStandalone()) {
      return {
        state: 'needs_install',
        reason: 'On iPhone and iPad, notifications only work once GoodForm is added to the home screen.',
      };
    }
    return { state: 'unsupported', reason: 'This browser cannot deliver notifications.' };
  }
  if (isIos() && !isStandalone()) {
    return {
      state: 'needs_install',
      reason: 'On iPhone and iPad, notifications only work once GoodForm is added to the home screen.',
    };
  }
  if (Notification.permission === 'denied') {
    return {
      state: 'denied',
      reason: 'Notifications are blocked for this site. Your browser settings are the only place that can undo it.',
    };
  }
  return { state: 'ready' };
}

/** The base64url application key, in the byte form `subscribe` expects. */
function decodeKey(key: string): ArrayBuffer {
  const padded = (key + '='.repeat((4 - (key.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

/**
 * `navigator.serviceWorker.ready` never settles when nothing is registered —
 * it waits on an event that will not come. Checking for a registration first,
 * and capping the wait, turns "silently hangs forever" into a message.
 */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration();
  if (!existing) return null;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
  ]);
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  const registered = await registration();
  return (await registered?.pushManager.getSubscription()) ?? null;
}

export interface SubscribeResult {
  ok: boolean;
  /** Plain-language failure, safe to show as-is. */
  reason?: string;
}

/**
 * Asks for permission and registers the device. Returns rather than throws:
 * every failure here is something the user needs told, not an exception.
 */
export async function subscribeToPush(): Promise<SubscribeResult> {
  const support = pushSupport();
  if (support.state !== 'ready') return { ok: false, reason: support.reason };

  const response = await fetch('/api/push/key', { credentials: 'include' });
  const { enabled, key } = (await response.json()) as { enabled: boolean; key: string | null };
  if (!enabled || !key) {
    return { ok: false, reason: 'This server has no push keys configured, so scheduled reminders are off.' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return {
      ok: false,
      reason:
        permission === 'denied'
          ? 'Notifications are blocked. The due-now card on Today still works, and nothing is lost.'
          : 'Notification permission was not granted.',
    };
  }

  const registered = await registration();
  if (!registered) {
    return {
      ok: false,
      reason:
        'No service worker is running on this page, so there is nothing to receive a notification. Reload once and try again.',
    };
  }

  const existing = await registered.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registered.pushManager.subscribe({
      // Required everywhere: a push may never be silent.
      userVisibleOnly: true,
      applicationServerKey: decodeKey(key),
    }));

  const saved = await fetch('/api/push/subscribe', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!saved.ok) return { ok: false, reason: 'The server would not accept this device. Try again shortly.' };

  return { ok: true };
}

export async function unsubscribeFromPush(): Promise<void> {
  const subscription = await currentSubscription();
  const endpoint = subscription?.endpoint;
  await subscription?.unsubscribe().catch(() => {});
  await fetch('/api/push/subscribe', {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: endpoint ?? '' }),
  }).catch(() => {});
}

export async function sendTestPush(): Promise<number> {
  const response = await fetch('/api/push/test', { method: 'POST', credentials: 'include' });
  if (!response.ok) return 0;
  const { delivered } = (await response.json()) as { delivered: number };
  return delivered;
}

/** The IANA zone the schedule should be read in. */
export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
