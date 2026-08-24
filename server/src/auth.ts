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
  account: {
    accountLinking: {
      enabled: true,
      // Signing in with Google onto an address that already has a GoodForm
      // account attaches to it instead of failing with `account_not_linked`.
      // Google is trusted here because it verifies the address itself, so the
      // match is evidence of ownership rather than a claim.
      //
      // This does mean whoever controls the Google account controls the
      // GoodForm account — which is the whole point, and is exactly why
      // DEV_LOGIN must be false anywhere reachable: it would otherwise let a
      // stranger pre-register your address and have you link yourself into
      // their account.
      trustedProviders: ['google'],
      // The other half of the same decision. Better Auth also requires the
      // *existing local* account to have a verified email before it will link,
      // and GoodForm has no verification flow — every account made through the
      // dev email/password form is permanently unverified, so Google could
      // never link to one. Google's own verification of the address is the
      // evidence we actually have, and it is the stronger of the two.
      requireLocalEmailVerified: false,
    },
  },
  trustedOrigins: [env.appUrl, ...env.devOrigins],
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
});

export type AuthSession = typeof auth.$Infer.Session;
