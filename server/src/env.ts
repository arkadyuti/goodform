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
};

export const googleEnabled = Boolean(env.googleClientId && env.googleClientSecret);
