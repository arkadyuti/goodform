import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { COOLDOWN, RUN_CUES, STOP_RULES, WARMUP } from '@goodform/shared/content';
import type { Discomfort, DiscomfortLocation } from '@goodform/shared';
import { useLogSession, usePlan, useProfile } from '../api/hooks.ts';
import { today } from '../lib/date.ts';
import { Cues, hapticsSupported } from '../timer/cues.ts';
import { IntervalTimer, buildIntervals, formatClock, type Interval, type TimerState } from '../timer/engine.ts';
import { ScreenWakeLock } from '../timer/wakeLock.ts';
import { Button, Card, Choices, Eyebrow, Note } from '../components/ui.tsx';
import { IntervalRibbon } from '../components/IntervalRibbon.tsx';
import { StopRules } from '../components/StopRules.tsx';
import { ConnectionState } from '../components/ConnectionState.tsx';

type Stage = 'warmup' | 'intervals' | 'cooldown' | 'log';

export function RunSession() {
  const navigate = useNavigate();
  const { data: planData } = usePlan();
  const { data: profileData } = useProfile();
  const logSession = useLogSession();

  const plan = planData?.plan ?? null;
  const week = planData?.weeks.find((w) => w.index === plan?.currentWeek);
  const settings = profileData?.settings;

  const [stage, setStage] = useState<Stage>('warmup');
  const [elapsedAtFinish, setElapsedAtFinish] = useState(0);
  const [intervalsDone, setIntervalsDone] = useState(0);

  if (!week || !plan) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Note>No active plan to run. Build one from your baseline first.</Note>
        <Button className="mt-4" onClick={() => navigate('/')}>
          Back to today
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-dvh">
      {stage === 'warmup' && (
        <Warmup week={week} onStart={() => setStage('intervals')} onQuit={() => navigate('/')} />
      )}
      {stage === 'intervals' && (
        <Intervals
          runSec={week.runSec}
          walkSec={week.walkSec}
          reps={week.reps}
          settings={settings}
          onDone={(elapsed, completedIntervals) => {
            setElapsedAtFinish(elapsed);
            setIntervalsDone(completedIntervals);
            setStage('cooldown');
          }}
        />
      )}
      {stage === 'cooldown' && <Cooldown onDone={() => setStage('log')} />}
      {stage === 'log' && (
        <PostSession
          planned={week.reps}
          completed={intervalsDone}
          durationSec={Math.round(elapsedAtFinish)}
          onSave={async (input) => {
            await logSession.mutateAsync({
              id: crypto.randomUUID(),
              date: today(),
              type: 'run',
              planId: plan.id,
              planWeek: plan.currentWeek,
              prescription: { runSec: week.runSec, walkSec: week.walkSec, reps: week.reps },
              intervalsCompleted: intervalsDone,
              durationSec: Math.round(elapsedAtFinish),
              ...input,
            });
            navigate('/');
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Warmup({
  week,
  onStart,
  onQuit,
}: {
  week: { runSec: number; walkSec: number; reps: number };
  onStart: () => void;
  onQuit: () => void;
}) {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const cue = useMemo(() => RUN_CUES[Math.floor(Math.random() * RUN_CUES.length)]!, []);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-5">
      <ConnectionState />
      <div className="flex items-center justify-between">
        <Eyebrow>Warm-up</Eyebrow>
        <button onClick={onQuit} className="tap px-2 text-[0.875rem] text-ink-faint hover:text-ink">
          Not today
        </button>
      </div>
      <h1 className="mt-2 text-3xl" style={{ fontWeight: 780 }}>
        Wake the legs up
      </h1>
      <p className="mt-2 leading-relaxed text-ink-soft">
        Movement only — no holding stretches yet. Static stretching now would take away exactly the tendon
        stiffness that protects you while you run.
      </p>

      <div className="mt-5">
        <IntervalRibbon runSec={week.runSec} walkSec={week.walkSec} reps={week.reps} height={14} label />
      </div>

      <ul className="mt-5 flex flex-col gap-2">
        {WARMUP.map((item) => {
          const isDone = done[item.id] ?? false;
          return (
            <li key={item.id}>
              <button
                onClick={() => setDone((d) => ({ ...d, [item.id]: !isDone }))}
                aria-pressed={isDone}
                className={`flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-colors ${
                  isDone ? 'border-line bg-chalk-deep' : 'border-line bg-paper hover:border-ink-faint'
                }`}
              >
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 text-sm ${
                    isDone ? 'border-good bg-good text-white' : 'border-line'
                  }`}
                  aria-hidden
                >
                  {isDone && '✓'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block font-medium ${isDone ? 'text-ink-faint line-through' : ''}`}>
                    {item.name}
                    <span className="ml-2 font-normal text-ink-faint">
                      {item.unit === 'reps'
                        ? `${item.amount} reps`
                        : item.amount >= 60
                          ? `${item.amount / 60} min`
                          : `${item.amount}s`}
                      {item.perSide && ' each side'}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[0.8125rem] leading-snug text-ink-soft">{item.cue}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <Card className="mt-5 border-run bg-run-wash">
        <Eyebrow className="!text-run-deep">Today's cue</Eyebrow>
        <p className="mt-1 font-semibold">{cue.title}</p>
        <p className="mt-1 text-[0.9375rem] leading-snug text-ink-soft">{cue.body}</p>
      </Card>

      <Button full className="mt-5 py-4 text-[1.0625rem]" onClick={onStart}>
        Warm up done — start the timer
      </Button>
      <StopRules className="mt-4" />
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * The signature screen: the whole display carries the phase colour, so a
 * glance at arm's length in daylight tells you whether to run or walk before
 * you have read a single character (NFR-5, NFR-14).
 */
function Intervals({
  runSec,
  walkSec,
  reps,
  settings,
  onDone,
}: {
  runSec: number;
  walkSec: number;
  reps: number;
  settings: { soundEnabled: boolean; hapticsEnabled: boolean; audioMode: 'transient' | 'playback' } | null | undefined;
  onDone: (elapsedSec: number, completedIntervals: number) => void;
}) {
  const intervals = useMemo(() => buildIntervals(runSec, walkSec, reps), [runSec, walkSec, reps]);
  const [state, setState] = useState<TimerState | null>(null);
  const [started, setStarted] = useState(false);
  const timerRef = useRef<IntervalTimer | null>(null);
  const cuesRef = useRef<Cues | null>(null);
  const wakeRef = useRef<ScreenWakeLock | null>(null);

  const cues = useMemo(
    () =>
      new Cues({
        sound: settings?.soundEnabled ?? true,
        haptics: (settings?.hapticsEnabled ?? true) && hapticsSupported(),
        mode: settings?.audioMode ?? 'transient',
      }),
    [settings?.soundEnabled, settings?.hapticsEnabled, settings?.audioMode],
  );

  const finish = useCallback(() => {
    const final = timerRef.current?.state();
    cuesRef.current?.finish();
    void wakeRef.current?.release();
    const completed = final ? Math.ceil(final.index / 2) : reps;
    onDone(final?.totalElapsed ?? 0, Math.min(completed, reps));
  }, [onDone, reps]);

  useEffect(() => {
    cuesRef.current = cues;
    wakeRef.current = new ScreenWakeLock();
    const timer = new IntervalTimer(intervals, {
      onTick: setState,
      onPhaseChange: (_from, to) => {
        if (!to) return;
        if (to.phase === 'run') cues.runCue();
        if (to.phase === 'walk') cues.walkCue();
      },
      onCountdown: () => cues.countdown(),
      onFinish: finish,
    });
    timerRef.current = timer;
    setState(timer.state());

    return () => {
      timer.destroy();
      wakeRef.current?.destroy();
      cues.release();
    };
    // The timer is built once per prescription; cues are stable per settings.
  }, [intervals, cues, finish]);

  const begin = async () => {
    await cues.arm();
    await wakeRef.current?.acquire();
    timerRef.current?.start();
    setStarted(true);
  };

  const current: Interval | null = state ? (state.intervals[state.index] ?? null) : null;
  const phase = current?.phase ?? 'run';
  const isRun = phase === 'run';
  const remaining = current ? current.durationSec - (state?.phaseElapsed ?? 0) : 0;
  const progress = state ? state.totalElapsed / state.totalDuration : 0;
  const running = state?.running ?? false;

  return (
    <div
      className={`flex min-h-dvh flex-col transition-colors duration-300 ${isRun ? 'bg-run' : 'bg-walk'}`}
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <p className={`eyebrow ${isRun ? '!text-white/80' : '!text-ink/70'}`}>
          Rep {current?.rep ?? reps} of {reps}
        </p>
        <p className={`tabular text-sm ${isRun ? 'text-white/80' : 'text-ink/70'}`}>
          {formatClock((state?.totalDuration ?? 0) - (state?.totalElapsed ?? 0))} left
        </p>
      </div>

      <div className={`flex flex-1 flex-col items-center justify-center px-6 ${isRun ? 'text-white' : 'text-ink'}`}>
        <p
          className="display text-[clamp(2.25rem,11vw,3.5rem)] uppercase"
          style={{ fontWeight: 800, letterSpacing: '0.02em', fontVariationSettings: "'wdth' 122" }}
        >
          {isRun ? 'Run' : 'Walk'}
        </p>
        <p
          className="tabular mt-1 text-[clamp(5rem,30vw,9rem)] leading-[0.85]"
          style={{ fontWeight: 800 }}
          aria-live="off"
        >
          {formatClock(remaining)}
        </p>
        <p className={`mt-4 text-[1.0625rem] ${isRun ? 'text-white/85' : 'text-ink/80'}`}>
          {isRun ? 'Conversational pace. Short, quick steps.' : 'Keep moving. Let the breath settle.'}
        </p>
      </div>

      <div className="px-4 pb-4">
        {/* The session's own shape, filling as you work through it. */}
        <div className="mb-4">
          <IntervalRibbon
            runSec={runSec}
            walkSec={walkSec}
            reps={reps}
            progress={progress}
            height={10}
            onColor={isRun}
          />
        </div>

        {!started ? (
          <button
            onClick={begin}
            className={`tap w-full rounded-2xl py-5 text-xl font-semibold transition-colors ${
              isRun ? 'bg-white text-ink hover:bg-white/92' : 'bg-ink text-chalk hover:bg-ink/90'
            }`}
          >
            Start
          </button>
        ) : (
          <div className="flex gap-2.5">
            <button
              onClick={() => timerRef.current?.rewind(30)}
              className={`tap flex-1 rounded-2xl py-4 font-medium transition-colors ${
                isRun ? 'bg-white/18 text-white hover:bg-white/28' : 'bg-ink/12 text-ink hover:bg-ink/20'
              }`}
            >
              −30s
            </button>
            <button
              onClick={() => (running ? timerRef.current?.pause() : timerRef.current?.start())}
              className={`tap flex-[2] rounded-2xl py-4 text-lg font-semibold transition-colors ${
                isRun ? 'bg-white text-ink hover:bg-white/92' : 'bg-ink text-chalk hover:bg-ink/90'
              }`}
            >
              {running ? 'Pause' : 'Resume'}
            </button>
            <button
              onClick={() => timerRef.current?.skip()}
              className={`tap flex-1 rounded-2xl py-4 font-medium transition-colors ${
                isRun ? 'bg-white/18 text-white hover:bg-white/28' : 'bg-ink/12 text-ink hover:bg-ink/20'
              }`}
            >
              Skip
            </button>
          </div>
        )}

        <button
          onClick={finish}
          className={`tap mt-2.5 w-full rounded-2xl py-3 text-[0.9375rem] underline underline-offset-4 ${
            isRun ? 'text-white/85 hover:text-white' : 'text-ink/75 hover:text-ink'
          }`}
        >
          End session and log it
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Cooldown({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const [remaining, setRemaining] = useState(COOLDOWN[0]!.amount);
  const [running, setRunning] = useState(false);
  const item = COOLDOWN[index]!;

  useEffect(() => {
    if (!running) return;
    const startedAt = Date.now();
    const from = remaining;
    const id = window.setInterval(() => {
      const left = from - (Date.now() - startedAt) / 1000;
      if (left <= 0) {
        window.clearInterval(id);
        setRunning(false);
        if (index < COOLDOWN.length - 1) {
          setIndex(index + 1);
          setRemaining(COOLDOWN[index + 1]!.amount);
          setRunning(true);
        } else {
          setRemaining(0);
        }
      } else {
        setRemaining(left);
      }
    }, 100);
    return () => window.clearInterval(id);
    // Restarting the hold restarts the countdown from whatever is left.
  }, [running, index]);

  const last = index === COOLDOWN.length - 1;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-5">
      <Eyebrow>Cool-down</Eyebrow>
      <h1 className="mt-2 text-3xl" style={{ fontWeight: 780 }}>
        Now you can hold
      </h1>
      <p className="mt-2 leading-relaxed text-ink-soft">
        {index + 1} of {COOLDOWN.length}. Each hold counts itself down and moves on.
      </p>

      <Card className="mt-5">
        <p className="text-xl font-semibold">
          {item.name}
          {item.perSide && <span className="ml-2 text-[0.9375rem] font-normal text-ink-faint">each side</span>}
        </p>
        <p className="mt-1 text-[0.9375rem] leading-snug text-ink-soft">{item.cue}</p>
        <p className="tabular mt-4 text-6xl" style={{ fontWeight: 800 }}>
          {Math.ceil(remaining)}
          <span className="ml-1 text-xl font-normal text-ink-faint">s</span>
        </p>
        <div className="mt-4 flex gap-2.5">
          <Button full onClick={() => setRunning(!running)}>
            {running ? 'Pause' : remaining === 0 ? 'Repeat' : 'Start hold'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setRunning(false);
              if (last) return onDone();
              setIndex(index + 1);
              setRemaining(COOLDOWN[index + 1]!.amount);
            }}
          >
            {last ? 'Finish' : 'Next'}
          </Button>
        </div>
      </Card>

      <ol className="mt-4 flex flex-col gap-1.5">
        {COOLDOWN.map((c, i) => (
          <li
            key={c.id}
            className={`flex items-center gap-2.5 text-[0.875rem] ${i === index ? 'text-ink' : 'text-ink-faint'}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${i < index ? 'bg-good' : i === index ? 'bg-ink' : 'bg-line'}`} />
            {c.name}
          </li>
        ))}
      </ol>

      <Button variant="quiet" full className="mt-5 py-3" onClick={onDone}>
        Skip the rest and log the session
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------

const LOCATIONS: { value: DiscomfortLocation; label: string }[] = [
  { value: 'shin', label: 'Shin' },
  { value: 'calf', label: 'Calf' },
  { value: 'knee', label: 'Knee' },
  { value: 'achilles', label: 'Achilles' },
  { value: 'hip', label: 'Hip' },
  { value: 'foot', label: 'Foot' },
  { value: 'back', label: 'Back' },
  { value: 'other', label: 'Somewhere else' },
];

function PostSession({
  planned,
  completed,
  durationSec,
  onSave,
}: {
  planned: number;
  completed: number;
  durationSec: number;
  onSave: (input: { completion: 'full' | 'partial' | 'skipped'; effort: number; discomfort: Discomfort | null; notes: string | null }) => Promise<void>;
}) {
  const [completion, setCompletion] = useState<'full' | 'partial'>(completed >= planned ? 'full' : 'partial');
  const [effort, setEffort] = useState(3);
  const [hasDiscomfort, setHasDiscomfort] = useState(false);
  const [location, setLocation] = useState<DiscomfortLocation>('shin');
  const [severity, setSeverity] = useState<1 | 2 | 3 | 4 | 5>(2);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-5">
      <Eyebrow>Session done</Eyebrow>
      <h1 className="mt-2 text-3xl" style={{ fontWeight: 780 }}>
        {Math.round(durationSec / 60)} minutes, {completed} of {planned} reps
      </h1>
      <p className="mt-2 leading-relaxed text-ink-soft">
        This is the part that makes your plan adapt. Thirty seconds now decides next week.
      </p>

      <div className="mt-5 flex flex-col gap-5">
        <div>
          <Eyebrow>How did it go?</Eyebrow>
          <div className="mt-1.5">
            <Choices
              value={[completion]}
              onChange={([v]) => v && setCompletion(v)}
              options={[
                { value: 'full' as const, label: 'Finished as planned' },
                { value: 'partial' as const, label: 'Cut it short' },
              ]}
              columns={2}
            />
          </div>
        </div>

        <div>
          <Eyebrow>How hard was it?</Eyebrow>
          <div className="mt-1.5 flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setEffort(n)}
                aria-pressed={effort === n}
                className={`tap flex-1 rounded-xl border py-3 text-lg font-semibold transition-colors ${
                  effort === n ? 'border-ink bg-ink text-chalk' : 'border-line bg-paper hover:border-ink-faint'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[0.8125rem] text-ink-faint">1 is easy, 5 is as hard as you could go.</p>
        </div>

        <div>
          <Eyebrow>Any discomfort?</Eyebrow>
          <div className="mt-1.5">
            <Choices
              value={[hasDiscomfort ? 'yes' : 'no']}
              onChange={([v]) => setHasDiscomfort(v === 'yes')}
              options={[
                { value: 'no' as const, label: 'Nothing to report' },
                { value: 'yes' as const, label: 'Yes, something' },
              ]}
              columns={2}
            />
          </div>
        </div>

        {hasDiscomfort && (
          <>
            <div>
              <Eyebrow>Where?</Eyebrow>
              <div className="mt-1.5">
                <Choices value={[location]} onChange={([v]) => v && setLocation(v)} options={LOCATIONS} columns={2} />
              </div>
            </div>
            <div>
              <Eyebrow>How bad?</Eyebrow>
              <div className="mt-1.5 flex gap-2">
                {([1, 2, 3, 4, 5] as const).map((n) => (
                  <button
                    key={n}
                    onClick={() => setSeverity(n)}
                    aria-pressed={severity === n}
                    className={`tap flex-1 rounded-xl border py-3 text-lg font-semibold transition-colors ${
                      severity === n
                        ? n >= 4
                          ? 'border-alert bg-alert text-white'
                          : 'border-ink bg-ink text-chalk'
                        : 'border-line bg-paper hover:border-ink-faint'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[0.8125rem] text-ink-faint">
                1 is barely noticeable. 4 or more means we pause the plan and suggest getting it looked at.
              </p>
            </div>
            {severity >= 4 && (
              <Note tone="alert">
                Progression will pause. Rest it, and get it assessed before you run again — this is the point of
                logging honestly.
              </Note>
            )}
          </>
        )}

        <label className="block">
          <Eyebrow>Anything else</Eyebrow>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Optional — weather, surface, how you felt"
            className="mt-1.5 w-full rounded-xl border border-line bg-paper p-3 outline-none transition-colors focus:border-run"
          />
        </label>

        <Button
          full
          className="py-4 text-[1.0625rem]"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            await onSave({
              completion,
              effort,
              discomfort: hasDiscomfort ? { location, severity } : null,
              notes: notes.trim() || null,
            });
          }}
        >
          {saving ? 'Saving' : 'Save session'}
        </Button>
      </div>
    </div>
  );
}
