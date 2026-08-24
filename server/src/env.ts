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
  /**
   * Addresses allowed to create an account, comma separated.
   *
   * Empty means anyone can, which is right on a laptop and wrong on a public
   * URL. It gates both sign-up methods, because the point is who may hold an
   * account here at all, not which button they arrived through.
   */
  signupAllowlist: (process.env.SIGNUP_ALLOWLIST ?? '')
    .split(',')
    .map((address) => address.trim().toLowerCase())
    .filter(Boolean),
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

/**
 * Refuse to start in a configuration that is unsafe to expose.
 *
 * Each of these is a single environment variable away from a serious problem,
 * and each fails silently otherwise — the app comes up looking fine. Failing at
 * boot instead means the deploy health check catches it and rolls back, so the
 * bad configuration never serves a request.
 */
if (env.isProd) {
  const problems: string[] = [];

  // Email/password sign-up in production lets whoever knows an allowlisted
  // address register it first, set a password, and then have the real owner's
  // Google sign-in link straight into that account.
  if (env.devLogin) problems.push('DEV_LOGIN must be false in production');

  if (env.authSecret === 'dev-secret-change-me-dev-secret-change')
    problems.push('BETTER_AUTH_SECRET is still the published development default');
  if (env.authSecret.length < 32) problems.push('BETTER_AUTH_SECRET must be at least 32 characters');

  if (!env.appUrl.startsWith('https://')) problems.push('APP_URL must be https in production');

  // A credentialed CORS origin of localhost means anything running on a user's
  // own machine can call the API as them.
  const local = env.devOrigins.filter((origin) => !origin.startsWith('https://'));
  if (local.length) problems.push(`DEV_ORIGINS must be https in production (got ${local.join(', ')})`);

  if (problems.length) {
    throw new Error(`Refusing to start with an unsafe production configuration:\n  - ${problems.join('\n  - ')}`);
  }
}

export const googleEnabled = Boolean(env.googleClientId && env.googleClientSecret);
export const pushEnabled = Boolean(env.vapidPublicKey && env.vapidPrivateKey);
