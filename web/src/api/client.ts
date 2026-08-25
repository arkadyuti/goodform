import { enqueue, flush } from '../lib/offline.ts';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
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
    // The body is whatever the server sent, which on a proxy error or a
    // truncated response is not JSON at all — so it is narrowed rather than
    // trusted to have the shape we hope for.
    const detail: unknown = await response.json().catch(() => null);
    const message =
      detail && typeof detail === 'object' && 'error' in detail && typeof detail.error === 'string'
        ? detail.error
        : detail &&
            typeof detail === 'object' &&
            'message' in detail &&
            typeof detail.message === 'string'
          ? detail.message
          : 'Something went wrong';
    throw new ApiError(message, response.status);
  }
  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  del: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'DELETE',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),

  /**
   * A write that must not be lost if the phone has no signal — session logs
   * and habit entries. Queued locally and replayed on reconnect.
   */
  async durable(
    path: string,
    method: 'POST' | 'PUT' | 'DELETE',
    body: unknown,
    id: string,
  ): Promise<void> {
    try {
      await request(path, { method, body: method === 'DELETE' ? undefined : JSON.stringify(body) });
    } catch (error) {
      // A validation failure is the caller's problem and retrying cannot fix
      // it, so it is raised. Everything else — no signal, a server having a
      // bad minute, or an expired session that signing back in will cure — is
      // queued, because the alternative is losing a session someone just ran.
      const unfixable =
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 401 &&
        error.status !== 403 &&
        error.status !== 408 &&
        error.status !== 429;
      if (unfixable) throw error;
      await enqueue({ id, url: `/api${path}`, method, body, queuedAt: Date.now() });
    }
  },
};

export function startSyncWatcher(onSynced?: (count: number) => void): () => void {
  // Wrapped rather than handed over directly: `addEventListener` and
  // `setInterval` both discard what they are given back, so a rejection from a
  // drain would have had nowhere to go and would surface only as an unhandled
  // rejection in a console nobody has open.
  const run = () => {
    void (async () => {
      try {
        const sent = await flush();
        if (sent > 0) onSynced?.(sent);
      } catch (error) {
        console.warn('Sync sweep failed; queued writes stay queued.', error);
      }
    })();
  };
  run();
  window.addEventListener('online', run);
  const interval = window.setInterval(run, 60_000);
  return () => {
    window.removeEventListener('online', run);
    window.clearInterval(interval);
  };
}
