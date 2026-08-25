/*
 * Push handling, imported into the generated Workbox service worker.
 *
 * It lives here as plain JavaScript rather than inside the bundle because a
 * service worker cannot wake itself: the only thing that starts this file is
 * the browser delivering a push from the server's scheduler.
 */

function api(path, body) {
  return fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {
    // The phone may be offline when the notification is acted on. The tick is
    // lost rather than queued — the app will still show the dose as due, which
    // is the honest outcome and never reads as "you missed it".
  });
}

function uuid() {
  if (self.crypto && typeof self.crypto.randomUUID === 'function') return self.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

self.addEventListener('push', (event) => {
  let payload;
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const regimen = payload.regimen;
  const options = {
    body: payload.body || '',
    // One notification per occurrence: an escalation replaces its own first
    // nudge rather than stacking a second copy on the lock screen.
    tag: payload.tag || 'goodform',
    renotify: Boolean(payload.urgent),
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: payload,
    // A medicine stays on screen until it is dealt with. A supplement does not.
    requireInteraction: Boolean(payload.urgent),
    actions: regimen
      ? [
          { action: 'taken', title: 'Taken' },
          { action: 'snooze', title: 'In 30 min' },
        ]
      : [],
  };

  event.waitUntil(self.registration.showNotification(payload.title || 'GoodForm', options));
});

self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data || {};
  const regimen = data.regimen;
  event.notification.close();

  if (regimen && event.action === 'taken') {
    event.waitUntil(
      api('/api/regimen/events', {
        id: uuid(),
        itemId: regimen.itemId,
        dueDate: regimen.dueDate,
        dueTime: regimen.dueTime,
        status: 'taken',
        reminderKey: regimen.reminderKey,
      }),
    );
    return;
  }

  if (regimen && event.action === 'snooze') {
    event.waitUntil(api('/api/regimen/snooze', { reminderKey: regimen.reminderKey, minutes: 30 }));
    return;
  }

  // Acting on one of these stops the nudge. `/api/push/dismiss` existed for
  // exactly this and nothing ever called it, so a session or check-in reminder
  // that had already been dealt with could still escalate.
  if (!regimen && data.tag) {
    const kind = String(data.tag).split(':')[0];
    if (kind === 'session' || kind === 'weekly_check') {
      event.waitUntil(
        api('/api/push/dismiss', { kind, key: String(data.tag).slice(kind.length + 1) }),
      );
    }
  }

  // The same occurrence may be on screen more than once on this device — an
  // escalation beside its first nudge. Dealing with it once should clear both.
  if (data.tag) {
    event.waitUntil(
      self.registration
        .getNotifications({ tag: data.tag })
        .then((open) => open.forEach((n) => n.close()))
        .catch(() => {}),
    );
  }

  // Tapping the body opens the app — reusing a window that is already there,
  // so a half-finished screen is not thrown away.
  const url = data.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

/*
 * Browsers rotate push subscriptions on their own schedule. Without this the
 * server keeps writing to an endpoint nobody is listening to.
 */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const response = await fetch('/api/push/key', { credentials: 'include' });
      const { enabled, key } = await response.json();
      if (!enabled || !key) return;
      const subscription = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      });
      await fetch('/api/push/subscribe', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      });
    })().catch(() => {}),
  );
});
