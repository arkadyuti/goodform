import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'GoodForm',
        short_name: 'GoodForm',
        description:
          'Adaptive run-walk training and daily habits, built to keep beginners running.',
        theme_color: '#14201b',
        background_color: '#f1f3ee',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Pulled into the generated worker so push and notification taps are
        // handled. A service worker cannot wake itself, so this is the only
        // code path the server's scheduler can actually reach.
        importScripts: ['/push-sw.js'],
        // It is imported, not precached — precaching it would have the worker
        // cache a copy of part of itself.
        globIgnores: ['**/push-sw.js'],
        // A session already open must keep running with no network (FR-4.6).
        navigateFallback: '/index.html',
        // Client-side routes fall back to the shell; anything under /api must
        // not. Without this the worker answers *every* navigation from
        // precache — including Google's redirect back to
        // /api/auth/callback/google, which the server then never sees, so the
        // OAuth code is never exchanged and the app simply shows the login
        // page again. Same for the export download, which is a navigation too.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // Read-only app data, including the session check, is served from
            // cache when the network is gone — that is what lets a signed-in
            // runner open the app mid-session with no signal (FR-4.6).
            urlPattern: ({ url, request }) =>
              url.pathname.startsWith('/api/') &&
              request.method === 'GET' &&
              // Exports are one-off downloads of the whole account; caching
              // them would fill the quota and serve a stale copy next time.
              !url.pathname.startsWith('/api/account/export') &&
              // Never the session check. A cached one outlives signing out, so
              // the next person to open the app on a shared phone — offline,
              // or on a slow link — would be let straight into the previous
              // user's account and their medicine list.
              !url.pathname.startsWith('/api/auth/') &&
              // Which sign-in methods exist is a server fact, and a stale copy
              // shows buttons that no longer work.
              url.pathname !== '/api/config',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'app-data',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 14 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
      // A service worker in development too. Without one there is nothing to
      // receive a push, and `navigator.serviceWorker.ready` simply never
      // settles — so the reminder switch appeared to do nothing at all.
      devOptions: { enabled: true, type: 'module', navigateFallback: 'index.html' },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8790', changeOrigin: true },
    },
  },
});
