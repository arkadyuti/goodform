import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db, schema } from './db/index.js';
import { env, googleEnabled } from './env.js';

export const auth = betterAuth({
  baseURL: env.appUrl,
  basePath: '/api/auth',
  secret: env.authSecret,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  // Local development sign-in, so the app is usable before Google OAuth
  // credentials exist. Disabled by leaving DEV_LOGIN unset in production.
  emailAndPassword: {
    enabled: env.devLogin,
    requireEmailVerification: false,
  },
  socialProviders: googleEnabled
    ? {
        google: {
          clientId: env.googleClientId,
          clientSecret: env.googleClientSecret,
        },
      }
    : {},
  trustedOrigins: [env.appUrl, ...env.devOrigins],
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
});

export type AuthSession = typeof auth.$Infer.Session;
