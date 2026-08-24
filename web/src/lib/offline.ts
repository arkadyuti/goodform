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
      // A rejected write will never succeed on retry; drop it rather than
      // blocking everything behind it.
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        await db.delete('queue', write.id);
        sent += 1;
      }
    } catch {
      break; // Still offline — keep the rest queued in order.
    }
  }
  return sent;
}

/** Last-known-good copies so today's screen renders with no network. */
export async function cacheSet(key: string, value: unknown): Promise<void> {
  const db = await database();
  await db.put('cache', value, key);
}

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  const db = await database();
  return (await db.get('cache', key)) as T | undefined;
}
