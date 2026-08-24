import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const env = {
  databaseUrl: required('DATABASE_URL'),
  port: Number(process.env.PORT ?? 8790),
  appUrl: process.env.APP_URL ?? 'http://localhost:8790',
  authSecret: required('BETTER_AUTH_SECRET', 'dev-secret-change-me-dev-secret-change'),
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  devLogin: process.env.DEV_LOGIN === 'true',
  isProd: process.env.NODE_ENV === 'production',
  /** Vite dev server, allowed through CORS while developing. */
  devOrigins: (process.env.DEV_ORIGINS ?? 'http://localhost:5173').split(','),

  // --- Web Push (P3.1) ---------------------------------------------------
  // Generate a pair once with `pnpm --filter @goodform/server keys:vapid`.
  // Without them the app still works: the due-now card on Today is the
  // baseline everything falls back to, and no permission is ever requested.
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? '',
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? '',
  /** Contact for the push service, per RFC 8292. A mailto: or https: URL. */
  vapidSubject: process.env.VAPID_SUBJECT ?? 'mailto:admin@localhost',
  /** Off by default in development, where a minute-by-minute tick is noise. */
  schedulerEnabled: process.env.REMINDER_SCHEDULER !== 'false',
};

export const googleEnabled = Boolean(env.googleClientId && env.googleClientSecret);
export const pushEnabled = Boolean(env.vapidPublicKey && env.vapidPrivateKey);
