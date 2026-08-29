import { openDB, type IDBPDatabase } from 'idb';

export interface QueuedWrite {
  id: string;
  url: string;
  method: 'POST' | 'PUT' | 'DELETE';
  body: unknown;
  queuedAt: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function database() {
  dbPromise ??= openDB('goodform', 1, {
    upgrade(db) {
      db.createObjectStore('queue', { keyPath: 'id' });
      db.createObjectStore('cache');
    },
  });
  return dbPromise;
}

/**
 * Writes made offline are held here and replayed when the connection returns.
 * Every queued write carries a client-generated id, so replaying twice is
 * harmless — the server upserts on that id (FR-4.6).
 */
export async function enqueue(write: QueuedWrite): Promise<void> {
  const db = await database();
  await db.put('queue', write);
}

export async function pending(): Promise<QueuedWrite[]> {
  const db = await database();
  return (await db.getAll('queue')) as QueuedWrite[];
}

export async function flush(): Promise<number> {
  const writes = await pending();
  if (!writes.length) return 0;
  const db = await database();
  let sent = 0;

  for (const write of writes.sort((a, b) => a.queuedAt - b.queuedAt)) {
    try {
      const response = await fetch(write.url, {
        method: write.method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: write.method === 'DELETE' ? undefined : JSON.stringify(write.body),
      });
      // Not signed in. These writes are perfectly good and will land as soon
      // as there is a session again, so stop draining and keep every one of
      // them — deleting here used to destroy a finished run and then report it
      // as synced, which is the worst of both.
      if (response.status === 401 || response.status === 403) break;

      // A write the server has actually rejected will never succeed on retry;
      // drop it rather than blocking everything behind it.
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        await db.delete('queue', write.id);
        sent += 1;
        continue;
      }

      // 5xx: the server is unwell, not the write. Leave it queued and stop, so
      // the order it was made in survives.
      break;
    } catch {
      break; // Still offline — keep the rest queued in order.
    }
  }
  return sent;
}

/*
 * There was a `cacheSet`/`cacheGet` pair here, described as "last-known-good
 * copies so today's screen renders with no network". Nothing ever called them.
 * Offline reads are genuinely served — by the service worker's NetworkFirst
 * rule in vite.config.ts — so the behaviour was real and this was not the thing
 * doing it. A comment describing a job no code performs is worse than no
 * comment: the next person reads it and believes the wrong thing.
 *
 * The `cache` object store stays in the schema; removing it would need a
 * version bump for no gain.
 */
