import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  DISCOMFORT_LOCATIONS,
  EFFORT_LEVELS,
  effortHint,
  effortLabel,
  severityHint,
  severityLabel,
  type DiscomfortLocation,
  DEFAULT_TRAINING_DAYS,
  WITHDRAWAL_MESSAGE,
  daysClear,
  proteinTarget,
  startOfWeek,
  type TrainingDays,
} from '@goodform/shared';
import {
  emptyLog,
  useLogSession,
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
import { dayName, scheduleFor, shiftDays, today, type ScheduledDay } from '../lib/date.ts';
import { Button, Card, Choices, Eyebrow, LoadFailed, Note, Stepper } from '../components/ui.tsx';
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

  // The runner's own week, not the default one.
  const trainingDays = {
    run: settings?.runDays ?? DEFAULT_TRAINING_DAYS.run,
    strength: settings?.strengthDays ?? DEFAULT_TRAINING_DAYS.strength,
  };
  const scheduled = scheduleFor(date, trainingDays);
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
          <WeekStrip sessions={sessionData?.sessions ?? []} trainingDays={trainingDays} />
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
        <WelcomeBack
          gapDays={breakData.gapDays ?? 0}
          result={breakData.result}
          currentWeek={plan?.currentWeek ?? 1}
        />
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
            {/*
              What you are actually committing to. The card described the
              shape of the session and left the length to be worked out from
              it — so a week that reads as "1 minute of running" is twenty
              minutes outside, and you only found that out once you had
              started.
            */}
            <p className="mt-1.5 text-[0.9375rem] text-ink-soft">
              {Math.round(((week.runSec + week.walkSec) * week.reps) / 60)} minutes in total,{' '}
              {Math.round((week.runSec * week.reps) / 60)} of them running.
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

      {/*
        A session that was recorded but never described.
        Finishing a run writes it immediately, which is the whole point — but
        it means a session can exist with no effort or discomfort against it,
        and discomfort is what moves the plan. This is where that gets asked,
        without needing the run screen again.
      */}
      {ready &&
        doneToday
          .filter((session) => session.effort === null && session.completion !== 'skipped')
          .map((session) => <HowItWent key={session.id} session={session} />)}

      {/*
        What that session just changed.
        Logging one used to end in silence — the form promises "thirty seconds
        now decides next week" and then nothing ever showed what it decided.
      */}
      {ready && (runDone || strengthDone) && plan?.status === 'active' && week && (
        <WeekProgress
          runsThisWeek={(sessionData?.sessions ?? []).filter(
            (session) =>
              (session.type === 'run' || session.type === 'baseline') &&
              session.completion !== 'skipped' &&
              session.date >= startOfWeek(date) &&
              session.date <= date,
          )}
          runsPlanned={week.sessionsPerWeek}
          weekIndex={plan.currentWeek}
        />
      )}

      {/*
        The other kind of session, on any day the plan asked for one.
        `/session/strength` was linked from a single place, gated on it being a
        strength day, so it could not be opened on five days out of seven — and
        a run could not be started on a strength day at all. The plan advises;
        it does not lock the door.
      */}
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
        <RestDay sessions={sessionData?.sessions ?? []} days={trainingDays} />
      )}

      {ready && plan?.status === 'active' && (
        <SomethingElse
          scheduled={scheduled}
          sessions={sessionData?.sessions ?? []}
          onRun={() => navigate('/session/run')}
          onStrength={() => navigate('/session/strength')}
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
          <Eyebrow as="h2">No plan yet</Eyebrow>
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
          <Eyebrow as="h2">Food</Eyebrow>
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
          <Eyebrow as="h2">Today's log</Eyebrow>
          <div className="mt-1 divide-y divide-line">
            {tracked.includes('water') && (
              <Stepper
                label="Water"
                value={log.waterMl}
                unit="ml"
                step={250}
                max={10000}
                onChange={(waterMl) => saveLog.mutate({ waterMl })}
              />
            )}
            {tracked.includes('cigarettes') && (
              <Stepper
                label="Cigarettes"
                value={log.cigarettes}
                max={100}
                onChange={(cigarettes) => saveLog.mutate({ cigarettes })}
              />
            )}
            {tracked.includes('beer') && (
              <Stepper
                label="Beer"
                value={log.beers}
                unit={log.beers === 1 ? 'drink' : 'drinks'}
                max={50}
                onChange={(beers) => saveLog.mutate({ beers })}
              />
            )}
            {tracked.includes('alcohol') && (
              <Stepper
                label="Other alcohol"
                hint="One unit is roughly a 30ml peg of spirits, half a glass of wine, or a third of a pint."
                value={log.alcoholUnits}
                unit="units"
                max={50}
                onChange={(alcoholUnits) => saveLog.mutate({ alcoholUnits })}
              />
            )}
            {tracked.includes('sleep') && (
              <Stepper
                label="Sleep last night"
                value={log.sleepHours ?? 0}
                unit="hours"
                step={0.5}
                max={24}
                onChange={(sleepHours) => saveLog.mutate({ sleepHours })}
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

/**
 * The short version of the post-session form, for a session already recorded.
 *
 * Only the two things the app cannot infer: how hard it felt, and whether
 * anything hurt. Everything else — duration, repetitions, whether it was
 * finished — was written when the run ended.
 */
function HowItWent({ session }: { session: SessionRow }) {
  const log = useLogSession();
  const [effort, setEffort] = useState(3);
  const [hurt, setHurt] = useState(false);
  const [location, setLocation] = useState<DiscomfortLocation>('shin');
  const [severity, setSeverity] = useState<1 | 2 | 3 | 4 | 5>(2);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const submit = () =>
    log.mutate(
      {
        // Only what this card is actually adding. The server leaves every
        // field a caller does not send exactly as it was, so the interval
        // count and the set log survive.
        id: session.id,
        date: session.date,
        type: session.type,
        completion: session.completion,
        effort,
        discomfort: hurt ? { location, severity } : null,
      },
      { onSuccess: () => setDismissed(true) },
    );

  return (
    <Card>
      <Eyebrow as="h2">How did it go?</Eyebrow>
      <p className="mt-1.5 leading-snug text-ink-soft">
        Your {session.type === 'strength' ? 'strength session' : 'run'} is already saved. These two
        answers are what the plan reads.
      </p>

      <div className="mt-3">
        <span className="eyebrow">Effort</span>
        <div className="mt-1.5 flex gap-1.5">
          {EFFORT_LEVELS.map((level) => (
            <button
              key={level.value}
              type="button"
              aria-pressed={effort === level.value}
              aria-label={`${level.value} of 5 — ${level.label}`}
              onClick={() => setEffort(level.value)}
              className={`tap flex-1 rounded-xl border text-[0.9375rem] transition-colors ${
                effort === level.value
                  ? 'border-ink bg-ink text-chalk'
                  : 'border-line bg-paper hover:border-ink-faint'
              }`}
            >
              {level.value}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[0.8125rem] leading-snug text-ink-faint">
          <span className="text-ink-soft">{effortLabel(effort)}</span> — {effortHint(effort)}
        </p>
      </div>

      <div className="mt-3">
        <Choices
          multiple
          value={hurt ? ['hurt'] : []}
          onChange={(next) => setHurt(next.includes('hurt'))}
          options={[{ value: 'hurt', label: 'Something hurt or felt off' }]}
        />
      </div>

      {hurt && (
        <div className="mt-2.5">
          <Choices
            columns={2}
            value={[location]}
            onChange={([v]) => v && setLocation(v)}
            options={DISCOMFORT_LOCATIONS.map((site) => ({ value: site, label: site }))}
          />
          <div className="mt-2 flex gap-1.5">
            {([1, 2, 3, 4, 5] as const).map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={severity === n}
                aria-label={`${n} of 5 — ${severityLabel(n)}`}
                onClick={() => setSeverity(n)}
                className={`tap flex-1 rounded-xl border text-[0.9375rem] transition-colors ${
                  severity === n
                    ? n >= 4
                      ? 'border-alert bg-alert text-white'
                      : 'border-walk bg-walk text-ink'
                    : 'border-line bg-paper hover:border-ink-faint'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[0.9375rem] leading-snug">
            <span style={{ fontWeight: 600 }}>{severityLabel(severity)}</span>
            <span className="text-ink-soft"> — {severityHint(severity)}</span>
          </p>
        </div>
      )}

      <div className="mt-3 flex gap-2.5">
        <Button full disabled={log.isPending} onClick={submit}>
          {log.isPending ? 'Saving' : 'Save'}
        </Button>
        <Button variant="quiet" onClick={() => setDismissed(true)}>
          Later
        </Button>
      </div>
    </Card>
  );
}

/**
 * Where the week stands, shown the moment a session is logged.
 *
 * The gate that actually decides anything only speaks at the end of the week,
 * which left the most motivated moment in the whole app — just after finishing
 * — with nothing to say. This is not the gate and does not pretend to be; it
 * is the count, and what the count is heading towards.
 */
function WeekProgress({
  runsThisWeek,
  runsPlanned,
  weekIndex,
}: {
  runsThisWeek: SessionRow[];
  runsPlanned: number;
  weekIndex: number;
}) {
  // Turning up and finishing are different things, and the week's gate reads
  // the second one. Counting only attendance here meant this card could say
  // "that is the week" while the review that followed said not every session
  // finished as planned — the two disagreeing about the same week.
  const attended = runsThisWeek.length;
  const finished = runsThisWeek.filter((session) => session.completion === 'full').length;
  const cutShort = attended - finished;
  const left = Math.max(0, runsPlanned - attended);
  return (
    <Card>
      <Eyebrow as="h2">Where week {weekIndex} stands</Eyebrow>
      <p className="mt-1.5 flex items-baseline gap-2">
        <span className="tabular text-4xl" style={{ fontWeight: 800 }}>
          {attended}
        </span>
        <span className="text-ink-soft">
          of {runsPlanned} run{runsPlanned === 1 ? '' : 's'} this week
        </span>
      </p>
      {cutShort > 0 && (
        <p className="mt-1 text-[0.9375rem] leading-snug text-ink-soft">
          {finished === 0
            ? `${cutShort === 1 ? 'It was' : 'They were'} cut short — which counts, and is what the plan reads at the review.`
            : `${finished} finished as planned, ${cutShort} cut short.`}
        </p>
      )}
      <p className="mt-2 leading-snug text-ink-soft">
        {left > 0
          ? left === 1
            ? 'One more and the week is done.'
            : `${left} to go.`
          : finished >= runsPlanned
            ? 'That is the week. Nothing above mild discomfort and the plan moves on at the review.'
            : 'That is three sessions. Because some were cut short, the review will offer to repeat the week rather than move on — which is the plan being careful, not you falling behind.'}
      </p>
      <Link to="/plan" className="mt-3 block text-[0.875rem] text-run underline underline-offset-4">
        See the week
      </Link>
    </Card>
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
/**
 * Why running today might not be the best idea — or null when it is fine.
 *
 * Only running carries this. Strength work is not the load that hurts
 * beginners, so it is never gated: the point of the whole screen below is that
 * the plan advises and the runner decides.
 */
function runCautionFor(sessions: SessionRow[], date: string): string | null {
  const runs = sessions.filter(
    (s) => (s.type === 'run' || s.type === 'baseline') && s.completion !== 'skipped',
  );
  if (runs.some((s) => s.date === shiftDays(date, -1))) {
    return 'You ran yesterday. Back-to-back running days are where beginners actually get hurt — the load lands on tissue that has not finished repairing from the last one.';
  }
  const weekStart = startOfWeek(date);
  if (runs.filter((s) => s.date >= weekStart && s.date <= date).length >= 3) {
    return 'That would be your fourth run this week. Weekly running time is meant to grow by no more than a tenth, and a fourth session is a much bigger jump than that.';
  }
  return null;
}

/**
 * Do something other than what today asked for.
 *
 * The plan lays out a week; it does not know that it is raining, that the park
 * is shut, or that you have forty minutes and a floor. Every session type is
 * reachable on every day — including a rest day, where strength work was
 * previously not offered at all and running was the only alternative on the
 * screen. Nothing here asks for a reason.
 */
function SomethingElse({
  scheduled,
  sessions,
  onRun,
  onStrength,
}: {
  scheduled: ScheduledDay;
  sessions: SessionRow[];
  onRun: () => void;
  onStrength: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const caution = runCautionFor(sessions, today());

  const offerRun = scheduled !== 'run';
  const offerStrength = scheduled !== 'strength';
  if (!offerRun && !offerStrength) return null;

  if (asking && caution) {
    return (
      <Card>
        <Eyebrow as="h2">Before you do</Eyebrow>
        <div className="mt-2">
          <Note tone="alert">{caution}</Note>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={onRun}>Run anyway</Button>
          <Button variant="quiet" onClick={() => setAsking(false)}>
            Leave it
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <Eyebrow as="h2">Something else today</Eyebrow>
      <p className="mt-1.5 leading-snug text-ink-soft">
        {scheduled === 'rest'
          ? 'Nothing is asked of you today, but the door is open.'
          : 'Raining, gym shut, wrong shoes — the plan is a suggestion, not a rota.'}
      </p>
      <div className="mt-3 flex flex-wrap gap-2.5">
        {offerStrength && (
          <Button variant="secondary" onClick={onStrength}>
            Do the strength session
          </Button>
        )}
        {offerRun && (
          <Button variant="secondary" onClick={() => (caution ? setAsking(true) : onRun())}>
            Go for a run
          </Button>
        )}
      </div>
    </Card>
  );
}

/** What a rest day says. Choosing to do something anyway lives in `SomethingElse`. */
function RestDay({ sessions, days }: { sessions: SessionRow[]; days: TrainingDays }) {
  const date = today();
  const runs = sessions.filter(
    (s) => (s.type === 'run' || s.type === 'baseline') && s.completion !== 'skipped',
  );

  // Two days in seven, a brand new plan lands here first. "Adaptation happens
  // now" is true of a rest day between sessions and nonsense on day zero — you
  // have not done anything yet — so the first one says where the plan starts
  // instead.
  const nothingLoggedYet = runs.length === 0;
  const firstRun = nextRunDate(date, days);

  return (
    <Card>
      <Eyebrow as="h2">{nothingLoggedYet ? 'Nothing today' : 'Rest day'}</Eyebrow>
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

      <Link to="/plan" className="mt-3 block text-[0.875rem] text-run underline underline-offset-4">
        {nothingLoggedYet ? 'See week one' : 'See the week ahead'}
      </Link>
    </Card>
  );
}

/** The next day the plan asks for a run, starting from tomorrow. */
function nextRunDate(from: string, days: TrainingDays): string {
  for (let i = 1; i <= 7; i++) {
    const candidate = shiftDays(from, i);
    if (scheduleFor(candidate, days) === 'run') return candidate;
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
  currentWeek,
}: {
  gapDays: number;
  result: { stepBackWeeks: number; needsReassessment: boolean; reason: string };
  currentWeek: number;
}) {
  const apply = useReturnFromBreak();
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <Card className="border-ink">
      <Eyebrow as="h2">Welcome back</Eyebrow>
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
          <Button disabled={apply.isPending} onClick={() => apply.mutate(currentWeek)}>
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
      <Eyebrow as="h2">Block complete</Eyebrow>
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
      <Eyebrow as="h2" className="!text-walk-deep">
        A change to what is shown
      </Eyebrow>
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
      <Eyebrow as="h2" className="!text-alert">
        Progression paused
      </Eyebrow>
      <p className="mt-1.5 leading-snug text-ink">
        {reason ?? 'Resting until discomfort settles.'}
      </p>
      <Button
        variant="secondary"
        className="mt-3"
        disabled={decide.isPending}
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
        <Eyebrow as="h2" className="!text-good">
          Week done
        </Eyebrow>
        <p className="mt-1.5 text-[1.0625rem] leading-snug">{gate.reason}</p>
        <Button
          full
          className="mt-3.5"
          disabled={decide.isPending}
          onClick={() => decide.mutate({ action: 'advance', fromWeek: data.week.index })}
        >
          Start next week
        </Button>
      </Card>
    );
  }

  const tone = gate.decision === 'pause_medical' ? 'alert' : 'neutral';

  return (
    <Card className={tone === 'alert' ? 'border-alert bg-alert-wash' : 'border-walk bg-walk-wash'}>
      <Eyebrow as="h2" className={tone === 'alert' ? '!text-alert' : '!text-walk-deep'}>
        {gate.decision === 'pause_medical'
          ? 'Stop and check'
          : discomfortDriven
            ? 'Worth easing off'
            : 'End of week'}
      </Eyebrow>
      {data.behindByWeeks > 0 && (
        <p className="mt-1.5 leading-snug text-ink-soft">
          Your plan is still on week {data.week.index}, {data.behindByWeeks}{' '}
          {data.behindByWeeks === 1 ? 'week' : 'weeks'} behind the calendar — it only moves when you
          decide what happens next. This is about the week you have just had.
        </p>
      )}
      <p className="mt-1.5 leading-snug">{gate.reason}</p>
      <div className="mt-3.5 flex flex-wrap gap-2">
        {gate.decision === 'pause_medical' ? (
          <Button
            variant="alert"
            disabled={decide.isPending}
            onClick={() => decide.mutate({ action: 'pause', fromWeek: data.week.index })}
          >
            Pause my plan
          </Button>
        ) : (
          <Button
            disabled={decide.isPending}
            onClick={() => decide.mutate({ action: 'repeat', fromWeek: data.week.index })}
          >
            {data.weekOver ? 'Repeat this week' : 'Repeat it rather than move on'}
          </Button>
        )}
        {gate.decision === 'ease' && gate.easeTo && (
          <Button
            disabled={decide.isPending}
            onClick={() =>
              decide.mutate({ action: 'ease', fromWeek: data.week.index, easeTo: gate.easeTo })
            }
          >
            Make the week smaller
          </Button>
        )}
        {gate.decision === 'step_back' && (
          <Button
            variant="secondary"
            disabled={decide.isPending}
            onClick={() => decide.mutate({ action: 'step_back', fromWeek: data.week.index })}
          >
            Step back a week
          </Button>
        )}
        {gate.overridable && (
          <Button
            variant="secondary"
            onClick={() =>
              showRisk
                ? decide.mutate({
                    action: 'advance',
                    override: true,
                    fromWeek: data.week.index,
                    overriddenGate: gate.decision,
                  })
                : setShowRisk(true)
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
      <Eyebrow as="h2">Holding</Eyebrow>
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
