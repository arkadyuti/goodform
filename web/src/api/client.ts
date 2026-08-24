import { enqueue, flush } from '../lib/offline.ts';

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new ApiError(detail.error ?? detail.message ?? 'Something went wrong', response.status);
  }
  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  del: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'DELETE', ...(body === undefined ? {} : { body: JSON.stringify(body) }) }),

  /**
   * A write that must not be lost if the phone has no signal — session logs
   * and habit entries. Queued locally and replayed on reconnect.
   */
  async durable(path: string, method: 'POST' | 'PUT' | 'DELETE', body: unknown, id: string): Promise<void> {
    try {
      await request(path, { method, body: method === 'DELETE' ? undefined : JSON.stringify(body) });
    } catch (error) {
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) throw error;
      await enqueue({ id, url: `/api${path}`, method, body, queuedAt: Date.now() });
    }
  },
};

export function startSyncWatcher(onSynced?: (count: number) => void): () => void {
  const run = async () => {
    const sent = await flush();
    if (sent > 0) onSynced?.(sent);
  };
  void run();
  window.addEventListener('online', run);
  const interval = window.setInterval(run, 60_000);
  return () => {
    window.removeEventListener('online', run);
    window.clearInterval(interval);
  };
}
