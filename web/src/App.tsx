import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { useSession } from './lib/auth.ts';
import { useProfile } from './api/hooks.ts';
import { Nav } from './components/Nav.tsx';
import { Login } from './routes/Login.tsx';
import { Onboarding } from './routes/Onboarding.tsx';
import { Today } from './routes/Today.tsx';
import { RunSession } from './routes/RunSession.tsx';
import { StrengthSession } from './routes/StrengthSession.tsx';
import { PlanView } from './routes/PlanView.tsx';
import { FoodLog } from './routes/FoodLog.tsx';
import { Progress } from './routes/Progress.tsx';
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
  const userId = session?.user?.id;

  // Queries made while signed out cached a 401; signing in has to refetch them.
  useEffect(() => {
    void queryClient.invalidateQueries();
  }, [userId, queryClient]);

  if (isPending) return <Loading />;
  if (!session?.user) return <Login />;
  if (profileLoading) return <Loading />;

  const onboarded = Boolean(profileData?.profile);
  if (!onboarded && location.pathname !== '/onboarding') return <Navigate to="/onboarding" replace />;

  // The session player takes the whole screen — no navigation to mis-tap mid-run.
  const immersive = location.pathname.startsWith('/session/') || location.pathname === '/onboarding';

  return (
    <div className="min-h-dvh">
      {!immersive && <Nav />}
      <main className={immersive ? '' : 'mx-auto w-full max-w-2xl px-4 pt-4 pb-16'}>
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/session/run" element={<RunSession />} />
          <Route path="/session/strength" element={<StrengthSession />} />
          <Route path="/plan" element={<PlanView />} />
          <Route path="/food" element={<FoodLog />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/settings" element={<SettingsView />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
