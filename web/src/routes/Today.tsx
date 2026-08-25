import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { WITHDRAWAL_MESSAGE, daysClear, proteinTarget, startOfWeek } from '@goodform/shared';
import {
  emptyLog,
  type SessionRow,
  useDailyLog,
  useDailyRange,
  useNutrition,
  usePlan,
  useProfile,
  useSaveDailyLog,
  useSessions,
  useWeekDecision,
  useBreakCheck,
  useReturnFromBreak,
  useWeekReview,
} from '../api/hooks.ts';
import { dayName, scheduleFor, shiftDays, today } from '../lib/date.ts';
import { Button, Card, Eyebrow, LoadFailed, Note, Stepper } from '../components/ui.tsx';
import { DueNow } from '../components/DueNow.tsx';
import { Fuelling } from '../components/Fuelling.tsx';
import { IntervalRibbon } from '../components/IntervalRibbon.tsx';
import { WeeklyCheckIn } from '../components/WeeklyCheckIn.tsx';
import { WeekStrip } from '../components/WeekStrip.tsx';

export function Today() {
  const date = today();
  const navigate = useNavigate();
  const { data: profileData } = useProfile();
  const {
    data: planData,
    isPending: planPending,
    isError: planFailed,
    refetch: refetchPlan,
  } = usePlan();
  const { data: logData, isPending: logPending } = useDailyLog(date);
  const { data: nutritionData, isPending: nutritionPending } = useNutrition(date);
  const { data: sessionData, isPending: sessionsPending } = useSessions(shiftDays(date, -7));
  const { data: rangeData, isPending: rangePending } = useDailyRange(shiftDays(date, -30));
  // `isLoading`, not `isPending`: a disabled query stays 'pending' forever, so
  // gating the screen on `isPending` blanked all of Today the moment the plan
  // stopped being active.
  const { isLoading: reviewPending } = useWeekReview(planData?.plan?.status === 'active');
  const { data: breakData } = useBreakCheck(planData?.plan?.status === 'active');
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

  // P3: when the guardrails have put the numbers away, they stay away —
  // including here, where the dial is the most insistent of them.
  const targetsWithdrawn = Boolean(settings?.targetsWithdrawnAt);
  const protein = profile && !targetsWithdrawn ? proteinTarget(profile.weightKg) : null;
  const proteinTotal = nutritionData?.proteinTotal ?? 0;

  const tracked = settings?.trackedHabits ?? ['water', 'sleep', 'beer', 'alcohol', 'cigarettes'];

  // Today is rendered as one piece once its data has settled. Letting cards
  // arrive one by one pushes the screen around under whoever is reading it.
  const ready =
    !planPending &&
    !reviewPending &&
    !logPending &&
    !nutritionPending &&
    !sessionsPending &&
    !rangePending;

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
        <Link
          to="/calendar"
          className="mt-2 inline-block text-[0.8125rem] text-run underline underline-offset-4"
        >
          Calendar — fill in a day you missed
        </Link>
      </header>

      {!ready && <div className="min-h-[60dvh]" aria-busy="true" aria-label="Loading today" />}

      {ready && plan && plan.status === 'paused' && <PausedBanner reason={plan.pausedReason} />}
      {ready && breakData?.onBreak && breakData.result && (
        <WelcomeBack gapDays={breakData.gapDays ?? 0} result={breakData.result} />
      )}
      {ready && plan && plan.status === 'completed' && <BlockCompleteBanner />}
      {ready && <WeekGate hasPlan={plan?.status === 'active'} />}
      {ready && targetsWithdrawn && <GuardrailNotice signals={settings?.guardrailSignals ?? []} />}

      {/* --- Today's session -------------------------------------------- */}
      {ready && scheduled === 'run' && week && plan?.status === 'active' && (
        <Card className="overflow-hidden !p-0">
          <div className="p-4">
            <div className="flex items-baseline justify-between gap-3">
              <Eyebrow>
                Run · week {plan.currentWeek}
                {week.isDeload && ' · lighter'}
              </Eyebrow>
              {runDone && (
                <span className="text-[0.8125rem] font-semibold text-good">Done today</span>
              )}
            </div>
            <p className="mt-2 flex items-baseline gap-2">
              <span className="tabular text-5xl" style={{ fontWeight: 800 }}>
                {week.runSec / 60}
              </span>
              <span className="text-ink-soft">
                min running, {week.walkSec / 60} min walking, × {week.reps}
              </span>
            </p>
            <div className="mt-4">
              <IntervalRibbon
                runSec={week.runSec}
                walkSec={week.walkSec}
                reps={week.reps}
                height={16}
                label
              />
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
              {strengthDone && (
                <span className="text-[0.8125rem] font-semibold text-good">Done today</span>
              )}
            </div>
            <p className="mt-2 text-[1.0625rem] leading-snug">
              Calves, shins and single-leg control — the tissue that decides whether you are still
              running in six months.
            </p>
            <p className="mt-1.5 text-[0.875rem] text-ink-soft">About 15 minutes.</p>
          </div>
          <Button
            full
            className="!rounded-none py-4 text-[1.0625rem]"
            onClick={() => navigate('/session/strength')}
          >
            {strengthDone ? 'Do it again' : 'Start strength'}
          </Button>
        </Card>
      )}

      {ready &&
        scheduled !== 'rest' &&
        plan?.status === 'active' &&
        profile &&
        settings?.fuellingTips && (
          <Fuelling
            sessionTime={settings.sessionTime}
            sessionType={scheduled}
            dietaryPattern={profile.dietaryPattern}
            sessionDone={scheduled === 'run' ? runDone : strengthDone}
          />
        )}

      {ready && <DueNow />}

      {ready && scheduled === 'rest' && (
        <RestDay
          hasPlan={plan?.status === 'active'}
          sessions={sessionData?.sessions ?? []}
          onRun={() => navigate('/session/run')}
        />
      )}

      {/*
        A failed request and an account with no plan look identical from the
        data alone — `planData` is undefined either way — so the error is
        checked first. Telling someone mid-block that they have not started is
        worse than telling them the network is having a moment.
      */}
      {ready && planFailed && !plan && (
        <LoadFailed what="your plan" onRetry={() => void refetchPlan()} />
      )}

      {ready && !planFailed && !plan && (
        <Card>
          <Eyebrow>No plan yet</Eyebrow>
          <p className="mt-2 leading-snug">
            Finish your baseline assessment and GoodForm will build your block.
          </p>
          <Button className="mt-3" onClick={() => navigate('/onboarding')}>
            Finish setup
          </Button>
        </Card>
      )}

      {/* --- Protein ------------------------------------------------------ */}
      {ready && targetsWithdrawn && (
        <Card>
          <Eyebrow>Food</Eyebrow>
          <p className="mt-2 leading-snug">
            Logging still works. There is just no number attached to it at the moment.
          </p>
          <Link
            to="/food"
            className="tap mt-3 flex items-center justify-center rounded-xl border border-line bg-chalk text-[0.9375rem] font-medium transition-colors hover:border-ink-faint"
          >
            Log food
          </Link>
        </Card>
      )}

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
                max={100}
                onChange={(cigarettes) => saveLog.mutate({ ...log, cigarettes })}
              />
            )}
            {tracked.includes('beer') && (
              <Stepper
                label="Beer"
                value={log.beers}
                unit={log.beers === 1 ? 'drink' : 'drinks'}
                max={50}
                onChange={(beers) => saveLog.mutate({ ...log, beers })}
              />
            )}
            {tracked.includes('alcohol') && (
              <Stepper
                label="Other alcohol"
                hint="One unit is roughly a 30ml peg of spirits, half a glass of wine, or a third of a pint."
                value={log.alcoholUnits}
                unit="units"
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
                  saveLog.mutate({
                    ...log,
                    customHabits: { ...log.customHabits, [habit.key]: next },
                  })
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
          GoodForm gives general fitness guidance. It is not medical advice and does not replace a
          doctor or physiotherapist.
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
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
      className="shrink-0"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--color-chalk-deep)"
        strokeWidth={stroke}
      />
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

/**
 * Rest days are a recommendation, not a lock. The plan advises and the runner
 * decides — the same rule the weekly gate follows — so the card keeps rest as
 * the headline and puts running behind one tap and one honest sentence.
 *
 * The warning is specific rather than generic: what actually hurts beginners is
 * running on consecutive days and adding volume, not the day's name.
 */
function RestDay({
  hasPlan,
  sessions,
  onRun,
}: {
  hasPlan: boolean;
  sessions: SessionRow[];
  onRun: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const date = today();

  const runs = sessions.filter(
    (s) => (s.type === 'run' || s.type === 'baseline') && s.completion !== 'skipped',
  );
  const ranYesterday = runs.some((s) => s.date === shiftDays(date, -1));
  const weekStart = startOfWeek(date);
  const runsThisWeek = runs.filter((s) => s.date >= weekStart && s.date <= date).length;

  const caution = ranYesterday
    ? 'You ran yesterday. Back-to-back running days are where beginners actually get hurt — the load lands on tissue that has not finished repairing from the last one.'
    : runsThisWeek >= 3
      ? `That would be your fourth run this week. Weekly running time is meant to grow by no more than a tenth, and a fourth session is a much bigger jump than that.`
      : 'Fine — a rest day moved is not a rest day skipped. Try to keep a clear day either side of it.';

  // Two days in seven, a brand new plan lands here first. "Adaptation happens
  // now" is true of a rest day between sessions and nonsense on day zero — you
  // have not done anything yet — so the first one says where the plan starts
  // instead.
  const nothingLoggedYet = runs.length === 0;
  const firstRun = nextRunDate(date);

  return (
    <Card>
      <Eyebrow>{nothingLoggedYet ? 'Nothing today' : 'Rest day'}</Eyebrow>
      <p className="mt-2 text-[1.0625rem] leading-snug">
        {nothingLoggedYet ? (
          <>
            Your first run is <span style={{ fontWeight: 600 }}>{dayName(firstRun)}</span>. Have a
            look at week one now, so nothing is a surprise on the day.
          </>
        ) : (
          'Nothing scheduled. Adaptation happens now, not during the run.'
        )}
      </p>

      {hasPlan &&
        (asking ? (
          <div className="mt-3">
            <Note tone={ranYesterday || runsThisWeek >= 3 ? 'alert' : 'neutral'}>{caution}</Note>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={onRun}>Run it anyway</Button>
              <Button variant="quiet" onClick={() => setAsking(false)}>
                Leave it
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" className="mt-3" onClick={() => setAsking(true)}>
            Run today instead
          </Button>
        ))}

      <Link to="/plan" className="mt-3 block text-[0.875rem] text-run underline underline-offset-4">
        {nothingLoggedYet ? 'See week one' : 'See the week ahead'}
      </Link>
    </Card>
  );
}

/** The next day the plan asks for a run, starting from tomorrow. */
function nextRunDate(from: string): string {
  for (let i = 1; i <= 7; i++) {
    const candidate = shiftDays(from, i);
    if (scheduleFor(candidate) === 'run') return candidate;
  }
  return shiftDays(from, 1);
}

/**
 * A gap in training, acknowledged.
 *
 * Coming back after three weeks off used to show the same week you left and a
 * session card asking for intervals you could no longer do — the step-back
 * rule, its copy and its endpoint all existed and nothing ever called them.
 * It is offered rather than applied, because it is the runner's plan.
 */
function WelcomeBack({
  gapDays,
  result,
}: {
  gapDays: number;
  result: { stepBackWeeks: number; needsReassessment: boolean; reason: string };
}) {
  const apply = useReturnFromBreak();
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <Card className="border-ink">
      <Eyebrow>Welcome back</Eyebrow>
      <p className="mt-1.5 text-[1.0625rem] leading-snug">
        {gapDays} days since your last session. Nothing about that needs explaining.
      </p>
      <p className="mt-2 leading-relaxed text-ink-soft">{result.reason}</p>

      {result.needsReassessment ? (
        <Link
          to="/reassess"
          className="tap mt-3 flex items-center justify-center rounded-xl bg-ink px-5 font-medium text-chalk transition-colors hover:bg-ink/90"
        >
          Set a fresh starting point
        </Link>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button disabled={apply.isPending} onClick={() => apply.mutate()}>
            {result.stepBackWeeks > 0 ? 'Step the plan back' : 'Pick up where I left off'}
          </Button>
          <Button variant="quiet" onClick={() => setDismissed(true)}>
            Keep me where I was
          </Button>
        </div>
      )}
    </Card>
  );
}

/** P3: a finished block is an event, not a dead end. */
function BlockCompleteBanner() {
  return (
    <Card className="border-ink">
      <Eyebrow>Block complete</Eyebrow>
      <p className="mt-1.5 text-[1.0625rem] leading-snug">
        You finished the block. What comes next is worth a minute's thought rather than an automatic
        next week.
      </p>
      <Link
        to="/reassess"
        className="tap mt-3 flex items-center justify-center rounded-xl bg-ink px-5 font-medium text-chalk transition-colors hover:bg-ink/90"
      >
        See what you did, and choose
      </Link>
    </Card>
  );
}

/**
 * P3: the numeric targets have been withdrawn. This says so plainly, once, and
 * offers a way back — it does not diagnose anybody and it does not argue.
 */
function GuardrailNotice({
  signals,
}: {
  signals: { id: string; label: string; detail: string }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="border-walk bg-walk-wash">
      <Eyebrow className="!text-walk-deep">A change to what is shown</Eyebrow>
      <p className="mt-1.5 leading-relaxed">{WITHDRAWAL_MESSAGE}</p>
      {signals.length > 0 && (
        <>
          <Button variant="secondary" className="mt-3" onClick={() => setOpen((v) => !v)}>
            {open ? 'Hide the reason' : 'Why'}
          </Button>
          {open && (
            <ul className="mt-3 flex flex-col gap-2.5">
              {signals.map((signal) => (
                <li key={signal.id}>
                  <p className="text-[0.9375rem]" style={{ fontWeight: 600 }}>
                    {signal.label}
                  </p>
                  <p className="text-[0.875rem] leading-relaxed text-ink-soft">{signal.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}

function PausedBanner({ reason }: { reason: string | null }) {
  const decide = useWeekDecision();
  return (
    <Card className="border-alert bg-alert-wash">
      <Eyebrow className="!text-alert">Progression paused</Eyebrow>
      <p className="mt-1.5 leading-snug text-ink">
        {reason ?? 'Resting until discomfort settles.'}
      </p>
      <Button
        variant="secondary"
        className="mt-3"
        onClick={() => decide.mutate({ action: 'resume' })}
      >
        It has settled — resume
      </Button>
    </Card>
  );
}

/**
 * The end-of-week decision, surfaced where it gets seen.
 *
 * Two rules govern *when* it appears, because getting that wrong made the card
 * nonsense. The gate judges a whole week, so an attendance verdict asked for on
 * a Wednesday always reads "sessions missed" — those wait until the week is
 * actually over. A discomfort verdict is a safety signal and does not wait.
 */
function WeekGate({ hasPlan }: { hasPlan: boolean }) {
  const { data, isLoading } = useWeekReview(hasPlan);
  const decide = useWeekDecision();
  const [showRisk, setShowRisk] = useState(false);

  if (!data || isLoading) return null;

  const gate = data.gate;
  const discomfortDriven =
    gate.decision === 'pause_medical' || (gate.decision === 'repeat' && gate.strengthEmphasis);
  if (!discomfortDriven && !data.weekOver) return null;

  // A week finished cleanly. Without this the plan simply never moved on: the
  // only control that advanced it was the override, which is why being told to
  // "move to next week anyway" after a good week made no sense.
  if (gate.decision === 'advance') {
    return (
      <Card className="border-good">
        <Eyebrow className="!text-good">Week done</Eyebrow>
        <p className="mt-1.5 text-[1.0625rem] leading-snug">{gate.reason}</p>
        <Button full className="mt-3.5" onClick={() => decide.mutate({ action: 'advance' })}>
          Start next week
        </Button>
      </Card>
    );
  }

  const tone = gate.decision === 'pause_medical' ? 'alert' : 'neutral';

  return (
    <Card className={tone === 'alert' ? 'border-alert bg-alert-wash' : 'border-walk bg-walk-wash'}>
      <Eyebrow className={tone === 'alert' ? '!text-alert' : '!text-walk-deep'}>
        {gate.decision === 'pause_medical'
          ? 'Stop and check'
          : discomfortDriven
            ? 'Worth easing off'
            : 'End of week'}
      </Eyebrow>
      <p className="mt-1.5 leading-snug">{gate.reason}</p>
      <div className="mt-3.5 flex flex-wrap gap-2">
        {gate.decision === 'pause_medical' ? (
          <Button variant="alert" onClick={() => decide.mutate({ action: 'pause' })}>
            Pause my plan
          </Button>
        ) : (
          <Button onClick={() => decide.mutate({ action: 'repeat' })}>
            {data.weekOver ? 'Repeat this week' : 'Repeat it rather than move on'}
          </Button>
        )}
        {gate.decision === 'step_back' && (
          <Button variant="secondary" onClick={() => decide.mutate({ action: 'step_back' })}>
            Step back a week
          </Button>
        )}
        {gate.overridable && (
          <Button
            variant="secondary"
            onClick={() =>
              showRisk ? decide.mutate({ action: 'advance', override: true }) : setShowRisk(true)
            }
          >
            {showRisk ? 'Yes, move on anyway' : 'Move on to week ' + (data.week.index + 1)}
          </Button>
        )}
      </div>
      {showRisk && (
        <Note tone="alert">
          Tendons and bone take three to six months to adapt — far longer than your lungs. Pushing
          through discomfort is the most common way beginners end up stopping altogether. It is
          still your call.
        </Note>
      )}
    </Card>
  );
}

function QuitSupport({
  logs,
  settings,
}: {
  logs: { date: string; cigarettes: number; alcoholUnits: number; beers: number }[];
  settings:
    | { smokingBaselinePerDay: number | null; cigaretteCost: number | null; currency: string }
    | null
    | undefined;
}) {
  const stats = useMemo(() => {
    if (!logs.length) return null;
    const smokeFree = daysClear(logs, 'cigarettes');
    const drinkFree = daysClear(logs, ['alcoholUnits', 'beers']);
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
          <Stat
            value={stats.smokeFree}
            label={stats.smokeFree === 1 ? 'day smoke-free' : 'days smoke-free'}
          />
        )}
        {stats.drinkFree > 0 && (
          <Stat
            value={stats.drinkFree}
            label={stats.drinkFree === 1 ? 'day alcohol-free' : 'days alcohol-free'}
          />
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
