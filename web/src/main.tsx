import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';
import { App } from './App.tsx';
import { startSyncWatcher } from './api/client.ts';
import './index.css';

/**
 * Nothing a mutation does fails silently.
 *
 * Every write goes through TanStack Query, and most callers are
 * `onClick={async () => …}` — where a rejection has nowhere to go and shows up
 * only as an unhandled rejection in a console nobody has open. That is how a
 * finished run came to vanish with the button still reading "Saving". Screens
 * that can say something useful still catch locally; this is the floor beneath
 * them, so a failure is at least recorded.
 */
const mutationCache = new MutationCache({
  onError: (error, _variables, _context, mutation) => {
    const what = mutation.options.mutationKey?.join('/') ?? 'a write';
    console.error(`Mutation failed (${what}):`, error);
  },
});

const queryClient = new QueryClient({
  mutationCache,
  defaultOptions: {
    // 'always' rather than the default 'online': offline reads are answered
    // from the service worker cache, and offline writes must reach the
    // IndexedDB queue, which survives a reload. React Query's own offline
    // pausing would hold both in memory and lose them.
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
      networkMode: 'always',
    },
    mutations: {
      networkMode: 'always',
      retry: 0,
    },
  },
});

startSyncWatcher(() => {
  void queryClient.invalidateQueries();
});

/**
 * Keep an installed app from running old code.
 *
 * `autoUpdate` makes a new service worker take over as soon as one is found,
 * but finding one only happens when the browser re-checks the worker script.
 * An installed PWA that is opened and closed without a full navigation may not
 * do that for days, so a fix deployed tonight can still be missing from the
 * phone next week. Ask explicitly, on an interval and whenever the app comes
 * back to the foreground — which is exactly when someone is about to use it.
 */
if ('serviceWorker' in navigator) {
  const check = async () => {
    if (!navigator.onLine) return;
    const registration = await navigator.serviceWorker.getRegistration();
    await registration?.update().catch(() => {});
  };
  window.setInterval(() => void check(), 60 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check();
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
