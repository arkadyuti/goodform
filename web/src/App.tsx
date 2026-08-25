import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { useSession } from './lib/auth.ts';
import { useProfile, useSaveSettings } from './api/hooks.ts';
import { browserTimezone } from './lib/push.ts';
import { Nav } from './components/Nav.tsx';
import { Login } from './routes/Login.tsx';
import { Onboarding } from './routes/Onboarding.tsx';
import { Today } from './routes/Today.tsx';
import { RunSession } from './routes/RunSession.tsx';
import { StrengthSession } from './routes/StrengthSession.tsx';
import { PlanView } from './routes/PlanView.tsx';
import { Calendar } from './routes/Calendar.tsx';
import { FoodLog } from './routes/FoodLog.tsx';
import { History, SessionDetail } from './routes/History.tsx';
import { Progress } from './routes/Progress.tsx';
import { Reassess } from './routes/Reassess.tsx';
import { Regimen } from './routes/Regimen.tsx';
import { SettingsView } from './routes/Settings.tsx';

/**
 * Reserves the full viewport so nothing shifts when the real screen arrives,
 * and stays blank briefly rather than flashing a spinner on a fast connection.
 */
function Loading() {
  return (
    <div className="flex min-h-dvh items-center justify-center" aria-busy="true">
      <span className="sr-only">Loading</span>
      <span className="h-2 w-2 animate-pulse rounded-full bg-line" aria-hidden />
    </div>
  );
}

export function App() {
  const { data: session, isPending } = useSession();
  const { data: profileData, isLoading: profileLoading } = useProfile();
  const location = useLocation();
  const queryClient = useQueryClient();
  const saveSettings = useSaveSettings();
  const userId = session?.user?.id;

  /**
   * Keep the stored zone matching the device. Reminder times are wall-clock —
   * an 08:00 dose is 08:00 wherever you are — so the server needs the current
   * zone, not the one in force when reminders were first switched on. Fires
   * once on a real change; the refetch that follows makes them agree.
   */
  const storedTimezone = profileData?.settings?.timezone;
  useEffect(() => {
    if (!storedTimezone) return;
    const actual = browserTimezone();
    if (actual && actual !== storedTimezone) saveSettings.mutate({ timezone: actual });
    // Deliberately keyed on the stored value alone: including the mutation
    // would re-run this on every render it causes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedTimezone]);

  // Queries made while signed out cached a 401; signing in has to refetch them.
  useEffect(() => {
    void queryClient.invalidateQueries();
  }, [userId, queryClient]);

  // Move focus to the new screen on navigation. Skipped on first paint, where
  // stealing focus from the top of the document would be its own annoyance.
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    mainRef.current?.focus();
  }, [location.pathname]);

  if (isPending) return <Loading />;
  if (!session?.user) return <Login />;
  if (profileLoading) return <Loading />;

  const onboarded = Boolean(profileData?.profile);
  if (!onboarded && location.pathname !== '/onboarding')
    return <Navigate to="/onboarding" replace />;

  // The session player takes the whole screen — no navigation to mis-tap mid-run.
  const immersive =
    location.pathname.startsWith('/session/') || location.pathname === '/onboarding';

  return (
    <div className="min-h-dvh">
      {/*
        Seven nav links sit above every screen, so without this a keyboard or
        switch user tabs through all of them on every navigation before
        reaching anything. Visible only when focused, which is the point.
      */}
      {!immersive && (
        <a
          href="#main"
          className="sr-only rounded-xl bg-ink px-4 py-2 text-chalk focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50"
        >
          Skip to content
        </a>
      )}
      {!immersive && <Nav />}
      <main
        id="main"
        ref={mainRef}
        // Focused on every navigation, so a screen reader announces the new
        // screen instead of leaving focus on the link that was just clicked and
        // saying nothing at all. -1 keeps it out of the tab order otherwise.
        tabIndex={-1}
        className={`outline-none ${immersive ? '' : 'mx-auto w-full max-w-2xl px-4 pt-4 pb-16'}`}
        // The bottom padding clears the iPhone home indicator today by
        // coincidence; the inset makes it deliberate. Immersive screens set
        // their own, because they paint to the edges on purpose.
        style={
          immersive ? undefined : { paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))' }
        }
      >
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/session/run" element={<RunSession />} />
          <Route path="/session/strength" element={<StrengthSession />} />
          <Route path="/plan" element={<PlanView />} />
          <Route path="/food" element={<FoodLog />} />
          <Route path="/regimen" element={<Regimen />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/history" element={<History />} />
          <Route path="/history/:id" element={<SessionDetail />} />
          <Route path="/reassess" element={<Reassess />} />
          <Route path="/settings" element={<SettingsView />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
