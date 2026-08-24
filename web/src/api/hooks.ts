import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DietaryPattern,
  Discomfort,
  FoodItem,
  Profile,
  ScreeningFlag,
  StopReason,
} from '@goodform/shared';
import { api } from './client.ts';

export interface ServerProfile extends Profile {
  userId: string;
}

export interface Settings {
  audioMode: 'transient' | 'playback';
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  trackedHabits: string[];
  customHabits: { key: string; label: string; unit: string }[];
  smokingBaselinePerDay: number | null;
  cigaretteCost: number | null;
  alcoholBaselinePerWeek: number | null;
  alcoholUnitCost: number | null;
  currency: string;
}

export interface PlanRow {
  id: string;
  goal: string;
  conservatism: number;
  conservatismReasons: string[];
  startDate: string;
  currentWeek: number;
  status: 'active' | 'paused' | 'completed' | 'abandoned';
  pausedReason: string | null;
}

export interface PlanWeekRow {
  planId: string;
  index: number;
  runSec: number;
  walkSec: number;
  reps: number;
  sessionsPerWeek: number;
  isDeload: boolean;
  totalRunSec: number;
  repeats: number;
  completedAt: string | null;
}

export interface DailyLogRow {
  date: string;
  waterMl: number;
  sleepHours: number | null;
  alcoholUnits: number;
  cigarettes: number;
  customHabits: Record<string, number>;
  supplements: Record<string, boolean>;
  notes: string | null;
}

export interface SessionRow {
  id: string;
  date: string;
  type: 'run' | 'strength' | 'baseline';
  planWeek: number | null;
  completion: 'full' | 'partial' | 'skipped';
  effort: number | null;
  discomfortLocation: string | null;
  discomfortSeverity: number | null;
  durationSec: number | null;
  prescription: { runSec: number; walkSec: number; reps: number } | null;
}

/**
 * Offline, a refetch is served from the service worker's cached copy, which is
 * older than the change just made — so refetching would undo it on screen.
 * The sync watcher invalidates everything once the queue drains.
 */
function invalidateIfOnline(qc: ReturnType<typeof useQueryClient>, queryKeys: readonly (readonly unknown[])[]): void {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  for (const key of queryKeys) void qc.invalidateQueries({ queryKey: key });
}

export const keys = {
  session: ['auth-session'] as const,
  profile: ['profile'] as const,
  plan: ['plan'] as const,
  weekReview: ['week-review'] as const,
  sessions: (from?: string) => ['sessions', from ?? 'all'] as const,
  dailyLog: (date: string) => ['daily-log', date] as const,
  dailyRange: (from: string) => ['daily-range', from] as const,
  nutrition: (date: string) => ['nutrition', date] as const,
  foods: (q: string, diet?: string) => ['foods', q, diet ?? ''] as const,
  progress: ['progress'] as const,
  strengthProgress: ['strength-progress'] as const,
};

export function useAuthConfig() {
  return useQuery({
    queryKey: ['auth-config'],
    queryFn: () => api.get<{ google: boolean; devLogin: boolean }>('/config'),
    staleTime: Infinity,
  });
}

export function useProfile() {
  return useQuery({
    queryKey: keys.profile,
    queryFn: () =>
      api.get<{
        profile: ServerProfile | null;
        screening: { flags: ScreeningFlag[]; acknowledgedAt: string | null } | null;
        settings: Settings | null;
      }>('/profile'),
    retry: false,
  });
}

export function usePlan() {
  return useQuery({
    queryKey: keys.plan,
    queryFn: () => api.get<{ plan: PlanRow | null; weeks: PlanWeekRow[] }>('/plan'),
  });
}

export function useWeekReview(enabled = true) {
  return useQuery({
    queryKey: keys.weekReview,
    queryFn: () =>
      api.get<{
        gate: { decision: string; reason: string; overridable: boolean; strengthEmphasis: boolean };
        week: PlanWeekRow;
        range: { from: string; to: string };
        sessions: unknown[];
      }>('/plan/week-review'),
    enabled,
    retry: false,
  });
}

export function useSessions(from?: string) {
  return useQuery({
    queryKey: keys.sessions(from),
    queryFn: () => api.get<{ sessions: SessionRow[] }>(`/sessions${from ? `?from=${from}` : ''}`),
  });
}

export function useDailyLog(date: string) {
  return useQuery({
    queryKey: keys.dailyLog(date),
    queryFn: () => api.get<{ log: DailyLogRow | null }>(`/logs/daily/${date}`),
  });
}

export function useDailyRange(from: string) {
  return useQuery({
    queryKey: keys.dailyRange(from),
    queryFn: () => api.get<{ logs: DailyLogRow[] }>(`/logs/daily?from=${from}`),
  });
}

export function useNutrition(date: string) {
  return useQuery({
    queryKey: keys.nutrition(date),
    queryFn: () =>
      api.get<{
        entries: { id: string; foodItemId: string; name: string; servingLabel: string; proteinG: number; servings: number }[];
        proteinTotal: number;
      }>(`/nutrition/entries/${date}`),
  });
}

export function useFoods(query: string, diet?: DietaryPattern) {
  return useQuery({
    queryKey: keys.foods(query, diet),
    queryFn: () =>
      api.get<{ foods: FoodItem[] }>(
        `/nutrition/foods?q=${encodeURIComponent(query)}${diet ? `&diet=${diet}` : ''}`,
      ),
    staleTime: 5 * 60_000,
  });
}

export function useProgress() {
  return useQuery({
    queryKey: keys.progress,
    queryFn: () =>
      api.get<{
        adherence: { runsCompleted: number; runsPlanned: number; strengthCompleted: number };
        longestRunSec: number;
        discomfort: { date: string; location: string; severity: number }[];
        checks: { date: string; weightKg: number | null; waistCm: number | null; restingHr: number | null }[];
        recentSessions: SessionRow[];
      }>('/progress/summary'),
  });
}

export function useStrengthProgress() {
  return useQuery({
    queryKey: keys.strengthProgress,
    queryFn: () => api.get<{ progress: Record<string, number> }>('/sessions/strength-progress'),
  });
}

// --- mutations -------------------------------------------------------------

export function useSaveProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (profile: Profile) => api.put('/profile', profile),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.profile }),
  });
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings: Partial<Settings>) => api.put('/profile/settings', settings),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.profile }),
  });
}

export function useSaveScreening() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { flags: ScreeningFlag[]; acknowledged: boolean }) =>
      api.post('/profile/screening', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.profile }),
  });
}

export function useSaveBaseline() {
  return useMutation({
    mutationFn: (input: { minutesRun: number; stopReason: StopReason }) => api.post('/plan/baseline', input),
  });
}

export function useGeneratePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/plan/generate', {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.plan });
      void qc.invalidateQueries({ queryKey: keys.weekReview });
    },
  });
}

export interface SessionInput {
  id: string;
  date: string;
  type: 'run' | 'strength' | 'baseline';
  planId?: string | null;
  planWeek?: number | null;
  prescription?: unknown;
  completion: 'full' | 'partial' | 'skipped';
  effort?: number | null;
  discomfort?: Discomfort | null;
  intervalsCompleted?: number | null;
  durationSec?: number | null;
  exerciseLog?: Record<string, number> | null;
  notes?: string | null;
}

export function useLogSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SessionInput) => api.durable('/sessions', 'POST', input, `session:${input.id}`),
    onSettled: () =>
      invalidateIfOnline(qc, [['sessions'], keys.weekReview, keys.progress, keys.strengthProgress]),
  });
}

export function useWeekDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { action: 'advance' | 'repeat' | 'step_back' | 'pause' | 'resume'; override?: boolean }) =>
      api.post('/plan/week-decision', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.plan });
      void qc.invalidateQueries({ queryKey: keys.weekReview });
    },
  });
}

/**
 * Callers pass the whole day, not a patch. Queued offline writes for one day
 * share a key and replace each other, so a partial patch would drop whatever
 * was logged before it.
 */
export function useSaveDailyLog(date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (log: Partial<DailyLogRow>) =>
      api.durable(`/logs/daily/${date}`, 'PUT', log, `daily:${date}`),
    onMutate: async (patch) => {
      // The habit steppers must feel instant, online or not.
      await qc.cancelQueries({ queryKey: keys.dailyLog(date) });
      const previous = qc.getQueryData<{ log: DailyLogRow | null }>(keys.dailyLog(date));
      qc.setQueryData(keys.dailyLog(date), {
        log: { ...(previous?.log ?? emptyLog(date)), ...patch },
      });
      return { previous };
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) qc.setQueryData(keys.dailyLog(date), context.previous);
    },
    onSettled: () => invalidateIfOnline(qc, [keys.dailyLog(date), ['daily-range']]),
  });
}

export function emptyLog(date: string): DailyLogRow {
  return {
    date,
    waterMl: 0,
    sleepHours: null,
    alcoholUnits: 0,
    cigarettes: 0,
    customHabits: {},
    supplements: {},
    notes: null,
  };
}

export function useAddFoodEntry(date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { foodItemId: string; servings: number; food?: FoodItem }) => {
      const id = crypto.randomUUID();
      return api.durable(
        '/nutrition/entries',
        'POST',
        { id, date, foodItemId: input.foodItemId, servings: input.servings },
        `nutrition:${id}`,
      );
    },
    onMutate: async (input) => {
      if (!input.food) return;
      await qc.cancelQueries({ queryKey: keys.nutrition(date) });
      const previous = qc.getQueryData<{ entries: unknown[]; proteinTotal: number }>(keys.nutrition(date));
      qc.setQueryData(keys.nutrition(date), {
        entries: [
          {
            id: `pending-${crypto.randomUUID()}`,
            foodItemId: input.food.id,
            name: input.food.name,
            servingLabel: input.food.servingLabel,
            proteinG: input.food.proteinG,
            servings: input.servings,
          },
          ...(previous?.entries ?? []),
        ],
        proteinTotal: Math.round((previous?.proteinTotal ?? 0) + input.food.proteinG * input.servings),
      });
      return { previous };
    },
    onError: (_e, _v, context) => {
      if (context?.previous) qc.setQueryData(keys.nutrition(date), context.previous);
    },
    onSettled: () => invalidateIfOnline(qc, [keys.nutrition(date)]),
  });
}

export function useRemoveFoodEntry(date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/nutrition/entries/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.nutrition(date) }),
  });
}

export function useSaveWeeklyCheck(date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { weightKg?: number | null; waistCm?: number | null; restingHr?: number | null }) =>
      api.put(`/logs/weekly/${date}`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.progress });
      void qc.invalidateQueries({ queryKey: keys.profile });
    },
  });
}

export function useCreateFood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; servingLabel: string; proteinG: number }) =>
      api.post<{ food: FoodItem }>('/nutrition/foods', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['foods'] }),
  });
}
