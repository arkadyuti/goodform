import { useEffect, useState } from 'react';
import { pending } from '../lib/offline.ts';

/**
 * Says plainly when the app is working offline and whether anything is still
 * waiting to sync. Silence would leave the runner unsure their log was kept.
 */
export function ConnectionState() {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [queued, setQueued] = useState(0);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);

    const check = () => {
      void pending()
        .then((writes) => setQueued(writes.length))
        .catch(() => {
          /* IndexedDB unavailable — the badge simply does not update. */
        });
    };
    check();
    const interval = window.setInterval(check, 4000);

    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
      window.clearInterval(interval);
    };
  }, []);

  if (online && queued === 0) return null;

  return (
    <p
      className="border-b border-walk/40 bg-walk-wash px-4 py-1.5 text-center text-[0.8125rem] text-walk-deep"
      role="status"
    >
      {online
        ? `Syncing ${queued} ${queued === 1 ? 'entry' : 'entries'}`
        : queued > 0
          ? 'Offline — your logs are saved and will sync'
          : 'Offline — you can still run and log'}
    </p>
  );
}
