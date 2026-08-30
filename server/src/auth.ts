import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
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
    // Belt and braces with the boot check in env.ts: even if that were removed,
    // this can never be on in production.
    enabled: env.devLogin && !env.isProd,
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
  databaseHooks: {
    user: {
      create: {
        /**
         * The one place both sign-up routes meet.
         *
         * GoodForm is a personal app on a public address. Left open, the
         * email/password form lets anyone who finds the URL create an account,
         * and Google sign-in does the same for any Google user alive. Gating
         * user *creation* rather than either login route covers both at once,
         * and cannot be bypassed by picking the other provider.
         *
         * Signing in still works normally for accounts that already exist —
         * this only decides who may make a new one.
         */
        // `async` with nothing awaited: Better Auth types this hook as
        // returning a promise, and throwing from an async function is what
        // makes the refusal arrive as a rejection it can turn into a 403.
        // eslint-disable-next-line @typescript-eslint/require-await
        before: async (user: { email?: string }) => {
          if (env.signupAllowlist.length === 0) return;
          const email = (user.email ?? '').toLowerCase();
          if (env.signupAllowlist.includes(email)) return;
          throw new APIError('FORBIDDEN', {
            /**
             * The `code` is what makes this a redirect rather than a raw body.
             *
             * Better Auth's OAuth callback only turns a thrown error into a
             * redirect when it carries one (`callback.mjs`: `if (isAPIError(e)
             * && e.body?.code)`). Without it the refusal fell through and the
             * browser was handed `{"message":"This app is not open for
             * sign-ups."}` as a plain file — Safari offered to save it as
             * `google.json`.
             */
            code: 'SIGNUP_NOT_OPEN',
            message: 'This app is not open for sign-ups.',
          });
        },
      },
    },
  },
  /**
   * Where a failed sign-in lands.
   *
   * Without this, a refusal during the OAuth callback is answered with the raw
   * API body — so someone who is not on the allowlist sees
   * `{"message":"This app is not open for sign-ups."}` as plain text on a blank
   * page, and Safari offers to download it as `google.json`. Sending them back
   * to the app means the login screen can say what happened in a sentence.
   */
  onAPIError: {
    errorURL: `${env.appUrl}/?signin=failed`,
  },
  trustedOrigins: [env.appUrl, ...env.devOrigins],
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
});

export type AuthSession = typeof auth.$Infer.Session;
