import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { daysClear, proteinTarget } from '@goodform/shared';
import {
  emptyLog,
  useDailyLog,
  useDailyRange,
  useNutrition,
  usePlan,
  useProfile,
  useSaveDailyLog,
  useSessions,
  useWeekDecision,
  useWeekReview,
} from '../api/hooks.ts';
import { dayName, scheduleFor, shiftDays, today } from '../lib/date.ts';
import { Button, Card, Eyebrow, Note, Stepper } from '../components/ui.tsx';
import { IntervalRibbon } from '../components/IntervalRibbon.tsx';
import { WeeklyCheckIn } from '../components/WeeklyCheckIn.tsx';
import { WeekStrip } from '../components/WeekStrip.tsx';

export function Today() {
  const date = today();
  const navigate = useNavigate();
  const { data: profileData } = useProfile();
  const { data: planData, isPending: planPending } = usePlan();
  const { data: logData, isPending: logPending } = useDailyLog(date);
  const { data: nutritionData, isPending: nutritionPending } = useNutrition(date);
  const { data: sessionData, isPending: sessionsPending } = useSessions(shiftDays(date, -7));
  const { data: rangeData, isPending: rangePending } = useDailyRange(shiftDays(date, -30));
  const { isPending: reviewPending } = useWeekReview(planData?.plan?.status === 'active');
  const saveLog = useSaveDailyLog(date);

  const profile = profileData?.profile;
  const settings = profileData?.settings;
  const plan = planData?.plan ?? null;
  const week = planData?.weeks.find((w) => w.index === plan?.currentWeek);
  const log = logData?.log ?? emptyLog(date);

  const scheduled = scheduleFor(date);
  const doneToday = (sessionData?.sessions ?? []).filter((s) => s.date === date);
  const runDone = doneToday.some((s) => s.type === 'run' || s.type === 'baseline');
  const strengthDone = doneToday.some((s) => s.type === 'strength');

  const protein = profile ? proteinTarget(profile.weightKg) : null;
  const proteinTotal = nutritionData?.proteinTotal ?? 0;

  const tracked = settings?.trackedHabits ?? ['water', 'sleep', 'alcohol', 'cigarettes'];

  // Today is rendered as one piece once its data has settled. Letting cards
  // arrive one by one pushes the screen around under whoever is reading it.
  const ready = !planPending && !reviewPending && !logPending && !nutritionPending && !sessionsPending && !rangePending;

  return (
    <div className="flex flex-col gap-5 pt-1">
      <header>
        <Eyebrow>{dayName(date)}</Eyebrow>
        <h1 className="mt-1 text-4xl" style={{ fontWeight: 780 }}>
          {headline(scheduled, runDone || strengthDone)}
        </h1>
        <div className="mt-4">
          <WeekStrip sessions={sessionData?.sessions ?? []} />
        </div>
      </header>

      {!ready && <div className="min-h-[60dvh]" aria-busy="true" aria-label="Loading today" />}

      {ready && plan && plan.status === 'paused' && <PausedBanner reason={plan.pausedReason} />}
      {ready && <WeekGate hasPlan={plan?.status === 'active'} />}


      {/* --- Today's session -------------------------------------------- */}
      {ready && scheduled === 'run' && week && plan?.status === 'active' && (
        <Card className="overflow-hidden !p-0">
          <div className="p-4">
            <div className="flex items-baseline justify-between gap-3">
              <Eyebrow>Run · week {plan.currentWeek}{week.isDeload && ' · lighter'}</Eyebrow>
              {runDone && <span className="text-[0.8125rem] font-semibold text-good">Done today</span>}
            </div>
            <p className="mt-2 flex items-baseline gap-2">
              <span className="tabular text-5xl" style={{ fontWeight: 800 }}>
                {week.runSec / 60}
              </span>
              <span className="text-ink-soft">min running, {week.walkSec / 60} min walking, × {week.reps}</span>
            </p>
            <div className="mt-4">
              <IntervalRibbon runSec={week.runSec} walkSec={week.walkSec} reps={week.reps} height={16} label />
            </div>
          </div>
          <Button
            full
            className="!rounded-none py-4 text-[1.0625rem]"
            onClick={() => navigate('/session/run')}
          >
            {runDone ? 'Run it again' : 'Start session'}
          </Button>
        </Card>
      )}

      {ready && scheduled === 'strength' && plan?.status === 'active' && (
        <Card className="overflow-hidden !p-0">
          <div className="p-4">
            <div className="flex items-baseline justify-between gap-3">
              <Eyebrow>Strength</Eyebrow>
              {strengthDone && <span className="text-[0.8125rem] font-semibold text-good">Done today</span>}
            </div>
            <p className="mt-2 text-[1.0625rem] leading-snug">
              Calves, shins and single-leg control — the tissue that decides whether you are still running in six
              months.
            </p>
            <p className="mt-1.5 text-[0.875rem] text-ink-soft">About 15 minutes.</p>
          </div>
          <Button full className="!rounded-none py-4 text-[1.0625rem]" onClick={() => navigate('/session/strength')}>
            {strengthDone ? 'Do it again' : 'Start strength'}
          </Button>
        </Card>
      )}

      {ready && scheduled === 'rest' && (
        <Card>
          <Eyebrow>Rest day</Eyebrow>
          <p className="mt-2 text-[1.0625rem] leading-snug">
            Nothing scheduled. Adaptation happens now, not during the run.
          </p>
          <Link to="/plan" className="mt-3 inline-block text-[0.875rem] text-run underline underline-offset-4">
            See the week ahead
          </Link>
        </Card>
      )}

      {ready && !plan && (
        <Card>
          <Eyebrow>No plan yet</Eyebrow>
          <p className="mt-2 leading-snug">Finish your baseline assessment and GoodForm will build your block.</p>
          <Button className="mt-3" onClick={() => navigate('/onboarding')}>
            Finish setup
          </Button>
        </Card>
      )}

      {/* --- Protein ------------------------------------------------------ */}
      {ready && protein && (
        <Card>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Eyebrow>Protein today</Eyebrow>
              <p className="mt-1.5 flex items-baseline gap-1.5">
                <span className="tabular text-4xl" style={{ fontWeight: 800 }}>
                  {proteinTotal}
                </span>
                <span className="text-ink-soft">/ {protein.targetG} g</span>
              </p>
            </div>
            <ProteinDial value={proteinTotal} target={protein.targetG} />
          </div>
          <Link
            to="/food"
            className="tap mt-3 flex items-center justify-center rounded-xl border border-line bg-chalk text-[0.9375rem] font-medium transition-colors hover:border-ink-faint"
          >
            Log food
          </Link>
        </Card>
      )}

      {/* --- Habits ------------------------------------------------------- */}
      {ready && (
      <Card>
        <Eyebrow>Today's log</Eyebrow>
        <div className="mt-1 divide-y divide-line">
          {tracked.includes('water') && (
            <Stepper
              label="Water"
              value={log.waterMl}
              unit="ml"
              step={250}
              max={10000}
              onChange={(waterMl) => saveLog.mutate({ ...log, waterMl })}
            />
          )}
          {tracked.includes('cigarettes') && (
            <Stepper
              label="Cigarettes"
              value={log.cigarettes}
              tone="watch"
              max={100}
              onChange={(cigarettes) => saveLog.mutate({ ...log, cigarettes })}
            />
          )}
          {tracked.includes('alcohol') && (
            <Stepper
              label="Alcohol"
              value={log.alcoholUnits}
              unit="units"
              tone="watch"
              max={50}
              onChange={(alcoholUnits) => saveLog.mutate({ ...log, alcoholUnits })}
            />
          )}
          {tracked.includes('sleep') && (
            <Stepper
              label="Sleep last night"
              value={log.sleepHours ?? 0}
              unit="hours"
              step={0.5}
              max={24}
              onChange={(sleepHours) => saveLog.mutate({ ...log, sleepHours })}
            />
          )}
          {(settings?.customHabits ?? []).map((habit) => (
            <Stepper
              key={habit.key}
              label={habit.label}
              value={log.customHabits[habit.key] ?? 0}
              unit={habit.unit}
              onChange={(next) =>
                saveLog.mutate({ ...log, customHabits: { ...log.customHabits, [habit.key]: next } })
              }
            />
          ))}
        </div>
      </Card>
      )}

      {/* --- Quit support -------------------------------------------------- */}
      {ready && <QuitSupport logs={rangeData?.logs ?? []} settings={settings} />}

      {ready && <WeeklyCheckIn />}

      {ready && (
      <p className="px-1 pt-2 text-[0.75rem] leading-relaxed text-ink-faint">
        GoodForm gives general fitness guidance. It is not medical advice and does not replace a doctor or
        physiotherapist.
      </p>
      )}
    </div>
  );
}

/** The headline says what today asks of you, not what time it is. */
function headline(scheduled: 'run' | 'strength' | 'rest', done: boolean): string {
  if (done) return 'Logged and done';
  if (scheduled === 'run') return 'Running day';
  if (scheduled === 'strength') return 'Strength day';
  return 'Rest day';
}

function ProteinDial({ value, target }: { value: number; target: number }) {
  const fraction = Math.min(1, value / target);
  const size = 64;
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-chalk-deep)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--color-run)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - fraction)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 400ms ease' }}
      />
    </svg>
  );
}

function PausedBanner({ reason }: { reason: string | null }) {
  const decide = useWeekDecision();
  return (
    <Card className="border-alert bg-alert-wash">
      <Eyebrow className="!text-alert">Progression paused</Eyebrow>
      <p className="mt-1.5 leading-snug text-ink">{reason ?? 'Resting until discomfort settles.'}</p>
      <Button variant="secondary" className="mt-3" onClick={() => decide.mutate({ action: 'resume' })}>
        It has settled — resume
      </Button>
    </Card>
  );
}

/** Surfaces the week's gate decision on the home screen, where it gets seen. */
function WeekGate({ hasPlan }: { hasPlan: boolean }) {
  const { data, isPending } = useWeekReview(hasPlan);
  const decide = useWeekDecision();
  const [showRisk, setShowRisk] = useState(false);

  if (!data || isPending || data.gate.decision === 'advance') return null;

  const gate = data.gate;
  const tone = gate.decision === 'pause_medical' ? 'alert' : 'neutral';

  return (
    <Card className={tone === 'alert' ? 'border-alert bg-alert-wash' : 'border-walk bg-walk-wash'}>
      <Eyebrow className={tone === 'alert' ? '!text-alert' : '!text-walk-deep'}>
        {gate.decision === 'pause_medical' ? 'Stop and check' : 'End of week'}
      </Eyebrow>
      <p className="mt-1.5 leading-snug">{gate.reason}</p>
      <div className="mt-3.5 flex flex-wrap gap-2">
        {gate.decision === 'pause_medical' ? (
          <Button variant="alert" onClick={() => decide.mutate({ action: 'pause' })}>
            Pause my plan
          </Button>
        ) : (
          <Button onClick={() => decide.mutate({ action: 'repeat' })}>Repeat this week</Button>
        )}
        {gate.decision === 'step_back' && (
          <Button variant="secondary" onClick={() => decide.mutate({ action: 'step_back' })}>
            Step back a week
          </Button>
        )}
        {gate.overridable && (
          <Button variant="secondary" onClick={() => (showRisk ? decide.mutate({ action: 'advance', override: true }) : setShowRisk(true))}>
            {showRisk ? 'Yes, move on anyway' : 'Move on anyway'}
          </Button>
        )}
      </div>
      {showRisk && (
        <Note tone="alert">
          Tendons and bone take three to six months to adapt — far longer than your lungs. Pushing through
          discomfort is the most common way beginners end up stopping altogether. It is still your call.
        </Note>
      )}
    </Card>
  );
}

function QuitSupport({
  logs,
  settings,
}: {
  logs: { date: string; cigarettes: number; alcoholUnits: number }[];
  settings: { smokingBaselinePerDay: number | null; cigaretteCost: number | null; currency: string } | null | undefined;
}) {
  const stats = useMemo(() => {
    if (!logs.length) return null;
    const smokeFree = daysClear(logs, 'cigarettes');
    const drinkFree = daysClear(logs, 'alcoholUnits');
    const smoked = logs.reduce((sum, l) => sum + l.cigarettes, 0);
    const baseline = settings?.smokingBaselinePerDay ?? 0;
    const cost = settings?.cigaretteCost ?? 0;
    const saved = baseline && cost ? Math.max(0, (baseline * logs.length - smoked) * cost) : 0;
    return { smokeFree, drinkFree, saved, currency: settings?.currency ?? 'INR' };
  }, [logs, settings]);

  if (!stats || (stats.smokeFree === 0 && stats.drinkFree === 0 && !stats.saved)) return null;

  return (
    <Card>
      <Eyebrow>Holding</Eyebrow>
      <div className="mt-2 grid grid-cols-2 gap-4">
        {stats.smokeFree > 0 && (
          <Stat value={stats.smokeFree} label={stats.smokeFree === 1 ? 'day smoke-free' : 'days smoke-free'} />
        )}
        {stats.drinkFree > 0 && (
          <Stat value={stats.drinkFree} label={stats.drinkFree === 1 ? 'day alcohol-free' : 'days alcohol-free'} />
        )}
        {stats.saved > 0 && (
          <Stat value={Math.round(stats.saved)} label={`${stats.currency} not spent`} />
        )}
      </div>
    </Card>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="tabular text-3xl leading-none" style={{ fontWeight: 800 }}>
        {value}
      </p>
      <p className="mt-1 text-[0.8125rem] leading-snug text-ink-soft">{label}</p>
    </div>
  );
}
