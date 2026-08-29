import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Adherence,
  DietaryPattern,
  Discomfort,
  DoseState,
  DoseStatus,
  FoodItem,
  Goal,
  Prescription,
  Profile,
  RegimenItem,
  ScreeningFlag,
  StopReason,
  WeeklyReview,
} from '@goodform/shared';
import { today } from '../lib/date.ts';
import { api } from './client.ts';
import { expectPlan, expectProfile, expectTrends } from './shapes.ts';

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

  timezone: string;
  remindersEnabled: boolean;
  regimenReminders: boolean;
  sessionReminders: boolean;
  weeklyCheckReminders: boolean;
  /** Weekdays carrying runs and strength work, Sunday = 0. */
  runDays: number[];
  strengthDays: number[];
  weeklyCheckDay: number;
  weeklyCheckTime: string;
  quietHoursStart: string;
  quietHoursEnd: string;
  hideNamesInNotifications: boolean;
  medicineEscalation: boolean;
  sessionTime: string;
  fuellingTips: boolean;

  /** Set when the guardrails put the numeric targets away (P3). */
  targetsWithdrawnAt: string | null;
  targetsRestoredAt: string | null;
  guardrailSignals: { id: string; label: string; detail: string }[];
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
  beers: number;
  cigarettes: number;
  customHabits: Record<string, number>;
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
  /**
   * Everything `GET /sessions` returns. It used to stop short of these three,
   * so a screen that re-saved a session could not forward what it was handed —
   * and the write blanked them.
   */
  intervalsCompleted: number | null;
  exerciseLog: Record<string, number> | null;
  planId: string | null;
  /** The shared type, not a copy of it — the two had already drifted. */
  prescription: Prescription | null;
}

/**
 * Offline, a refetch is served from the service worker's cached copy, which is
 * older than the change just made — so refetching would undo it on screen.
 * The sync watcher invalidates everything once the queue drains.
 */
function invalidateIfOnline(
  qc: ReturnType<typeof useQueryClient>,
  queryKeys: readonly (readonly unknown[])[],
): void {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  for (const key of queryKeys) void qc.invalidateQueries({ queryKey: key });
}

export const keys = {
  session: ['auth-session'] as const,
  profile: ['profile'] as const,
  plan: ['plan'] as const,
  weekReview: ['week-review'] as const,
  breakCheck: ['break-check'] as const,
  sessions: (from?: string) => ['sessions', from ?? 'all'] as const,
  dailyLog: (date: string) => ['daily-log', date] as const,
  dailyRange: (from: string) => ['daily-range', from] as const,
  nutrition: (date: string) => ['nutrition', date] as const,
  foods: (q: string, diet?: string) => ['foods', q, diet ?? ''] as const,
  progress: ['progress'] as const,
  strengthProgress: ['strength-progress'] as const,
  trends: ['trends'] as const,
  weeklyReview: (week: string) => ['weekly-review', week] as const,
  sessionDetail: (id: string) => ['session-detail', id] as const,
  blockOutcome: ['block-outcome'] as const,
  regimenItems: ['regimen-items'] as const,
  regimenDue: (date: string) => ['regimen-due', date] as const,
  regimenHistory: (from: string) => ['regimen-history', from] as const,
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
      api.get<unknown>('/profile').then((body) =>
        expectProfile<{
          profile: ServerProfile | null;
          screening: { flags: ScreeningFlag[]; acknowledgedAt: string | null } | null;
          settings: Settings | null;
        }>(body),
      ),
    retry: false,
  });
}

export function usePlan() {
  return useQuery({
    queryKey: keys.plan,
    queryFn: () =>
      api
        .get<unknown>('/plan')
        .then((body) => expectPlan<{ plan: PlanRow | null; weeks: PlanWeekRow[] }>(body)),
  });
}

export function useWeekReview(enabled = true) {
  return useQuery({
    queryKey: keys.weekReview,
    queryFn: () =>
      api.get<{
        gate: {
          decision: string;
          reason: string;
          overridable: boolean;
          strengthEmphasis: boolean;
          easeTo?: { runSec: number; reps: number };
          /** The verdict being pushed past, so the override is on the record. */
          overriddenGate?: string;
        };
        week: PlanWeekRow;
        range: { from: string; to: string };
        /** False mid-week, when an attendance verdict would be premature. */
        weekOver: boolean;
        daysLeft: number;
        /** Weeks the plan has fallen behind the calendar; 0 when current. */
        behindByWeeks: number;
        sessions: unknown[];
      }>(`/plan/week-review?date=${today()}`),
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
        entries: {
          id: string;
          foodItemId: string;
          name: string;
          servingLabel: string;
          proteinG: number;
          servings: number;
        }[];
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
        checks: {
          date: string;
          weightKg: number | null;
          waistCm: number | null;
          restingHr: number | null;
        }[];
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
    mutationFn: (input: { minutesRun: number; stopReason: StopReason }) =>
      api.post('/plan/baseline', input),
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
    mutationFn: (input: SessionInput) =>
      api.durable('/sessions', 'POST', input, `session:${input.id}`),
    onSettled: () =>
      invalidateIfOnline(qc, [['sessions'], keys.weekReview, keys.progress, keys.strengthProgress]),
  });
}

export function useWeekDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      action: 'advance' | 'repeat' | 'step_back' | 'pause' | 'resume' | 'ease';
      override?: boolean;
      /** The week the screen was showing, so a repeated tap is ignored. */
      fromWeek?: number;
      easeTo?: { runSec: number; reps: number };
      /** The verdict being pushed past, so the override is on the record. */
      overriddenGate?: string;
    }) => api.post('/plan/week-decision', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.plan });
      void qc.invalidateQueries({ queryKey: keys.weekReview });
    },
    // Without this a failed decision was completely silent: the button posted,
    // the server refused, and the card sat there as though nothing had been
    // tapped. Whatever the reason, the runner should be able to see that it
    // did not work.
    onError: (error) => console.error('Week decision failed:', error),
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
    beers: 0,
    cigarettes: 0,
    customHabits: {},
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
      const previous = qc.getQueryData<{ entries: unknown[]; proteinTotal: number }>(
        keys.nutrition(date),
      );
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
        proteinTotal: Math.round(
          (previous?.proteinTotal ?? 0) + input.food.proteinG * input.servings,
        ),
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
    mutationFn: (input: {
      weightKg?: number | null;
      waistCm?: number | null;
      restingHr?: number | null;
    }) => api.put(`/logs/weekly/${date}`, input),
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

// ---------------------------------------------------------------------------
// Insight (P2)
// ---------------------------------------------------------------------------

export interface TrendPoint {
  date: string;
  value: number;
}

export interface Trends {
  from: string;
  to: string;
  longestRun: TrendPoint[];
  weight: TrendPoint[];
  waist: TrendPoint[];
  restingHr: TrendPoint[];
  strengthLevel: TrendPoint[];
  strengthSessions: TrendPoint[];
  discomfort: { date: string; location: string; severity: number }[];
}

export function useTrends() {
  return useQuery({
    queryKey: keys.trends,
    // The server has no idea what day it is where the runner is standing.
    queryFn: () =>
      api
        .get<unknown>(`/progress/trends?date=${today()}`)
        .then((body) => expectTrends<Trends>(body)),
  });
}

export function useWeeklyReview(week: string) {
  return useQuery({
    queryKey: keys.weeklyReview(week),
    queryFn: () =>
      api.get<{ review: WeeklyReview; weeksAvailable: { earliest: string } }>(
        `/progress/weekly-review?week=${week}&date=${today()}`,
      ),
  });
}

export interface SessionDetail {
  session: SessionRow & {
    exerciseLog: Record<string, number> | null;
    notes: string | null;
    intervalsCompleted: number | null;
  };
  dailyLog: DailyLogRow | null;
  proteinG: number;
  previous: { id: string; date: string } | null;
  daysSincePrevious: number | null;
}

export function useSessionDetail(id: string | null) {
  return useQuery({
    queryKey: keys.sessionDetail(id ?? ''),
    queryFn: () => api.get<SessionDetail>(`/progress/session/${id}`),
    enabled: Boolean(id),
  });
}

// ---------------------------------------------------------------------------
// Lifecycle (P3)
// ---------------------------------------------------------------------------

export interface BlockOutcome {
  goal: Goal;
  weeksPlanned: number;
  weeksCompleted: number;
  totalRepeats: number;
  runsCompleted: number;
  achievedRunSec: number;
  achievedMinutes: number;
  worstDiscomfort: number;
  continueFrom: { runSec: number; walkSec: number; reps: number } | null;
}

export function useBlockOutcome(enabled: boolean) {
  return useQuery({
    queryKey: keys.blockOutcome,
    queryFn: () =>
      api.get<{
        plan: PlanRow;
        outcome: BlockOutcome;
        options: { goal: Goal; label: string; hint: string; recommended: boolean }[];
        needsBaseline: boolean;
        daysSinceLastRun: number | null;
      }>('/plan/block-outcome'),
    enabled,
    retry: false,
  });
}

export interface BreakCheck {
  onBreak: boolean;
  gapDays?: number;
  lastSession?: string;
  result?: { stepBackWeeks: number; needsReassessment: boolean; reason: string };
}

/** FR-3.5: has there been a gap long enough to change the plan? */
export function useBreakCheck(enabled: boolean) {
  return useQuery({
    queryKey: keys.breakCheck,
    queryFn: () => api.get<BreakCheck>(`/plan/break-check?date=${today()}`),
    enabled,
    retry: false,
  });
}

export function useReturnFromBreak() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fromWeek?: number) =>
      api.post(`/plan/return-from-break?date=${today()}`, { fromWeek }),
    onSuccess: () => {
      void qc.invalidateQueries();
    },
  });
}

export function useReassess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      goal: Goal;
      baseline?: { minutesRun: number; stopReason: StopReason } | null;
    }) => api.post('/plan/reassess', input),
    onSuccess: () => {
      void qc.invalidateQueries();
    },
  });
}

export function useRestoreTargets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/profile/restore-targets', {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.profile }),
  });
}

/** FR: start over without losing the account. */
export function useResetData() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['account', 'reset'],
    mutationFn: (confirmEmail: string) => api.post('/account/reset', { confirmEmail }),
    onSuccess: () => {
      void qc.invalidateQueries();
    },
  });
}

export function useDeleteAccount() {
  return useMutation({
    mutationFn: (confirmEmail: string) => api.del('/account', { confirmEmail }),
  });
}

// ---------------------------------------------------------------------------
// Supplements and medicines (P3.1)
// ---------------------------------------------------------------------------

export type RegimenItemInput = Omit<RegimenItem, 'id' | 'archivedAt'>;

export function useRegimenItems(includeArchived = false) {
  return useQuery({
    queryKey: [...keys.regimenItems, includeArchived],
    queryFn: () =>
      api.get<{ items: RegimenItem[] }>(`/regimen/items${includeArchived ? '?all=true' : ''}`),
  });
}

export interface RegimenDue {
  date: string;
  doses: DoseState[];
  asNeeded: RegimenItem[];
  finishedCourses: RegimenItem[];
  items: RegimenItem[];
}

export function useRegimenDue(date: string, nowTime: string) {
  return useQuery({
    queryKey: keys.regimenDue(date),
    queryFn: () => api.get<RegimenDue>(`/regimen/due?date=${date}&time=${nowTime}`),
    // The overdue marks move with the clock, so this goes stale quickly.
    staleTime: 60_000,
  });
}

export interface RegimenHistoryRow {
  item: RegimenItem;
  adherence: Adherence;
  lastTaken: string | null;
  days: { date: string; taken: number; skipped: number; missed: number }[];
}

export function useRegimenHistory(from: string) {
  return useQuery({
    queryKey: keys.regimenHistory(from),
    queryFn: () =>
      api.get<{ from: string; to: string; items: RegimenHistoryRow[] }>(
        `/regimen/history?from=${from}`,
      ),
  });
}

function invalidateRegimen(qc: ReturnType<typeof useQueryClient>) {
  invalidateIfOnline(qc, [keys.regimenItems, ['regimen-due'], ['regimen-history']]);
}

export function useSaveRegimenItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: RegimenItemInput & { id?: string }) =>
      id ? api.put(`/regimen/items/${id}`, input) : api.post('/regimen/items', input),
    onSuccess: () => invalidateRegimen(qc),
  });
}

export function useArchiveRegimenItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; permanent?: boolean }) =>
      api.del(`/regimen/items/${input.id}${input.permanent ? '?permanent=true' : ''}`),
    onSuccess: () => invalidateRegimen(qc),
  });
}

export function useRestoreRegimenItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/regimen/items/${id}/restore`, {}),
    onSuccess: () => invalidateRegimen(qc),
  });
}

export function useRefillRegimenItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; doses: number }) =>
      api.post(`/regimen/items/${input.id}/refill`, { doses: input.doses }),
    onSuccess: () => invalidateRegimen(qc),
  });
}

/**
 * Ticking a dose is a durable write: a medicine gets taken in a kitchen with
 * no signal as often as anywhere else, and the tick must not evaporate.
 */
export function useLogDose(date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { itemId: string; dueTime: string | null; status: DoseStatus }) => {
      const id = crypto.randomUUID();
      return api.durable(
        '/regimen/events',
        'POST',
        { id, itemId: input.itemId, dueDate: date, dueTime: input.dueTime, status: input.status },
        `dose:${input.itemId}:${date}:${input.dueTime ?? id}`,
      );
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: keys.regimenDue(date) });
      const previous = qc.getQueryData<RegimenDue>(keys.regimenDue(date));
      if (previous) {
        qc.setQueryData<RegimenDue>(keys.regimenDue(date), {
          ...previous,
          doses: previous.doses.map((dose) =>
            dose.item.id === input.itemId && dose.dueTime === input.dueTime
              ? { ...dose, status: input.status, overdue: false }
              : dose,
          ),
        });
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) qc.setQueryData(keys.regimenDue(date), context.previous);
    },
    onSettled: () => invalidateRegimen(qc),
  });
}

// ---------------------------------------------------------------------------
// Calendar and backfill
// ---------------------------------------------------------------------------

export interface CalendarDay {
  date: string;
  /** null on days before the plan existed — nothing was asked of anyone yet. */
  scheduled: 'run' | 'strength' | 'rest' | null;
  sessions: {
    id: string;
    type: 'run' | 'strength' | 'baseline';
    completion: 'full' | 'partial' | 'skipped';
    effort: number | null;
    discomfortLocation: string | null;
    discomfortSeverity: number | null;
    durationSec: number | null;
    intervalsCompleted: number | null;
    /** The shared type, not a copy of it — the two had already drifted. */
    prescription: Prescription | null;
  }[];
  log: DailyLogRow | null;
  check: { weightKg: number | null; waistCm: number | null; restingHr: number | null } | null;
  proteinG: number;
  doses: { due: number; taken: number; skipped: number };
}

export function useCalendar(from: string, to: string) {
  return useQuery({
    queryKey: ['calendar', from, to],
    queryFn: () =>
      api.get<{ from: string; to: string; days: CalendarDay[] }>(
        `/progress/calendar?from=${from}&to=${to}`,
      ),
  });
}

/**
 * A session logged for a day that has already passed. Shares the durable write
 * path with the live session player, so a backfill made offline survives too.
 */
export function useBackfillSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SessionInput) =>
      api.durable('/sessions', 'POST', input, `session:${input.id}`),
    onSettled: () =>
      invalidateIfOnline(qc, [
        ['sessions'],
        ['calendar'],
        keys.weekReview,
        keys.progress,
        keys.trends,
        ['weekly-review'],
        keys.strengthProgress,
      ]),
  });
}

export function useDeleteSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/sessions/${id}`),
    onSettled: () =>
      invalidateIfOnline(qc, [
        ['sessions'],
        ['calendar'],
        keys.weekReview,
        keys.progress,
        keys.trends,
      ]),
  });
}
