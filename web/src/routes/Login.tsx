import { useState } from 'react';
import { useAuthConfig } from '../api/hooks.ts';
import { signIn, signUp } from '../lib/auth.ts';
import { Button, Field, Note, TextInput } from '../components/ui.tsx';

export function Login() {
  // `isLoading`, not `isPending`: until the server has answered, `config` is
  // undefined and every `config?.google` check reads false — which rendered
  // "no sign-in method is configured" on first paint, for everyone, every time.
  const { data: config, isLoading: configLoading, isError: configFailed } = useAuthConfig();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  /**
   * A sign-in that failed on the way back from Google.
   *
   * The server redirects here rather than answering the callback with its own
   * JSON body, which is what someone not on the allowlist used to be shown —
   * `{"message":"This app is not open for sign-ups."}` on a blank page, with
   * the browser offering to save it as a file.
   */
  const params = new URLSearchParams(window.location.search);
  const signinFailed = params.get('signin') === 'failed';
  const notInvited = params.get('error') === 'SIGNUP_NOT_OPEN';
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result =
      mode === 'signup'
        ? await signUp.email({ email, password, name: name || email.split('@')[0] || email })
        : await signIn.email({ email, password });
    setBusy(false);
    if (result.error)
      setError(result.error.message ?? 'That did not work. Check the email and password.');
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-9">
        <span className="mb-5 flex h-4 w-28 overflow-hidden rounded-full">
          <span className="h-full flex-[3] bg-run" />
          <span className="h-full flex-[1] bg-walk" />
          <span className="h-full flex-[3] bg-run" />
          <span className="h-full flex-[1] bg-walk" />
        </span>
        <h1 className="text-5xl" style={{ fontWeight: 800, fontVariationSettings: "'wdth' 120" }}>
          GoodForm
        </h1>
        <p className="mt-3 max-w-sm text-[1.0625rem] leading-relaxed text-ink-soft">
          A run-walk plan that builds at the speed your legs adapt, not the speed your lungs allow —
          plus the daily habits that decide whether it sticks.
        </p>
      </div>

      {signinFailed && (
        <div className="mb-4">
          <Note tone="alert">
            {notInvited
              ? 'This copy of GoodForm is invitation-only, and that address has not been added yet. Ask whoever sent you the link to add it.'
              : 'That sign-in did not go through. Try again — and if it keeps happening, it is a problem at our end rather than yours.'}
          </Note>
        </div>
      )}

      {config?.google && (
        <Button
          variant="secondary"
          full
          className="mb-4 py-3"
          onClick={() => signIn.social({ provider: 'google', callbackURL: '/' })}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
            <path
              fill="#4285F4"
              d="M23 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.6z"
            />
            <path
              fill="#34A853"
              d="M12 23.5c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.3 1.1-3.9 1.1-3 0-5.5-2-6.4-4.7H1.8v3C3.7 21 7.6 23.5 12 23.5z"
            />
            <path
              fill="#FBBC05"
              d="M5.6 14.2a6.9 6.9 0 0 1 0-4.4v-3H1.8a11.5 11.5 0 0 0 0 10.4l3.8-3z"
            />
            <path
              fill="#EA4335"
              d="M12 4.8c1.7 0 3.2.6 4.4 1.7l3.3-3.3C17.7 1.3 15.1.3 12 .3 7.6.3 3.7 2.8 1.8 6.5l3.8 3C6.5 6.8 9 4.8 12 4.8z"
            />
          </svg>
          Continue with Google
        </Button>
      )}

      {config?.google && config?.devLogin && (
        <div className="my-2 flex items-center gap-3">
          <span className="h-px flex-1 bg-line" />
          <span className="eyebrow">or</span>
          <span className="h-px flex-1 bg-line" />
        </div>
      )}

      {config?.devLogin && (
        <form onSubmit={submit} className="mt-2 flex flex-col gap-3">
          {mode === 'signup' && (
            <Field label="Name">
              <TextInput
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </Field>
          )}
          <Field label="Email">
            <TextInput
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </Field>
          <Field label="Password">
            <TextInput
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
          </Field>
          {error && <Note tone="alert">{error}</Note>}
          <Button type="submit" full className="py-3" disabled={busy}>
            {busy ? 'One moment' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </Button>
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'signup' ? 'signin' : 'signup');
              setError(null);
            }}
            className="tap text-[0.875rem] text-ink-soft underline underline-offset-4 hover:text-ink"
          >
            {mode === 'signup' ? 'I already have an account' : 'Create an account instead'}
          </button>
        </form>
      )}

      {configLoading && (
        <div className="mb-4 h-12 animate-pulse rounded-xl bg-chalk-deep" aria-hidden />
      )}

      {/*
        Three separate situations, and they used to collapse into one alert
        aimed at whoever deployed the app rather than whoever is looking at it.
      */}
      {!configLoading && configFailed && (
        <Note tone="alert">
          {typeof navigator !== 'undefined' && !navigator.onLine
            ? 'You are offline, so signing in has to wait for a connection. Anything you logged while offline is saved and will sync.'
            : 'We could not reach GoodForm just now. Check your connection and try again in a moment.'}
        </Note>
      )}

      {!configLoading && !configFailed && !config?.google && !config?.devLogin && (
        <Note tone="alert">
          Signing in is unavailable at the moment. Nothing you have saved is affected.
        </Note>
      )}

      <p className="mt-9 text-[0.8125rem] leading-relaxed text-ink-faint">
        GoodForm gives general fitness guidance. It is not medical advice and does not replace a
        doctor or physiotherapist.
      </p>
    </div>
  );
}
