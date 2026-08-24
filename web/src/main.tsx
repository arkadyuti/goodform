import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';
import { App } from './App.tsx';
import { startSyncWatcher } from './api/client.ts';
import './index.css';

const queryClient = new QueryClient({
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
