import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { StopReason } from '@goodform/shared';
import { Button, Choices, Eyebrow, Note } from './ui.tsx';
import { Cues, hapticsSupported } from '../timer/cues.ts';
import { formatClock } from '../timer/engine.ts';
import { ScreenWakeLock } from '../timer/wakeLock.ts';

const WARMUP_SEC = 300;

type Stage = 'intro' | 'walk' | 'run' | 'why';

/**
 * Measures the starting point instead of asking someone to know it. Five
 * minutes of walking, then a run that counts up until they choose to stop —
 * no target on screen, because a target would change how long they run.
 */
export function BaselineRun({
  onDone,
  onCancel,
}: {
  onDone: (result: { minutesRun: number; stopReason: StopReason }) => void;
  onCancel: () => void;
}) {
  const [stage, setStage] = useState<Stage>('intro');
  const [elapsed, setElapsed] = useState(0);
  const [ranSec, setRanSec] = useState(0);
  const startedAt = useRef(0);
  const wakeLock = useRef<ScreenWakeLock | null>(null);

  const cues = useMemo(
    () => new Cues({ sound: true, haptics: hapticsSupported(), mode: 'transient' }),
    [],
  );

  useEffect(() => {
    wakeLock.current = new ScreenWakeLock();
    return () => {
      wakeLock.current?.destroy();
      cues.release();
    };
  }, [cues]);

  const beginRun = useCallback(() => {
    cues.runCue();
    startedAt.current = Date.now();
    setElapsed(0);
    setStage('run');
  }, [cues]);

  // Wall-clock, so a locked screen mid-walk does not lose the time.
  //
  // The warm-up handover lives in the same tick rather than in an effect
  // watching `elapsed`: it is the clock reaching a threshold that ends the
  // walk, and reading that off the clock directly means there is no render in
  // between where the two could disagree.
  useEffect(() => {
    if (stage !== 'walk' && stage !== 'run') return;
    const id = window.setInterval(() => {
      const seconds = (Date.now() - startedAt.current) / 1000;
      if (stage === 'walk' && seconds >= WARMUP_SEC) {
        window.clearInterval(id);
        beginRun();
        return;
      }
      setElapsed(seconds);
    }, 200);
    return () => window.clearInterval(id);
  }, [stage, beginRun]);

  const beginWalk = async () => {
    await cues.arm();
    await wakeLock.current?.acquire();
    startedAt.current = Date.now();
    setElapsed(0);
    setStage('walk');
  };

  const stopRun = () => {
    cues.walkCue();
    void wakeLock.current?.release();
    setRanSec((Date.now() - startedAt.current) / 1000);
    setStage('why');
  };

  if (stage === 'intro') {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-3xl" style={{ fontWeight: 750 }}>
            I'll time it for you
          </h1>
          <p className="mt-2 leading-relaxed text-ink-soft">
            Put your shoes on and take your phone outside. This takes about ten minutes and there is
            nothing to get right.
          </p>
        </div>

        <ol className="flex flex-col gap-3">
          <Step number={1} title="Walk for 5 minutes">
            Normal walking pace, just enough to warm up. I'll tell you when it's done.
          </Step>
          <Step number={2} title="Then run — as slowly as you like">
            Slow enough that you could talk to someone. There's no distance to reach and no clock to
            beat.
          </Step>
          <Step number={3} title="Stop whenever you want to">
            Not when you can't go on — when you'd rather stop. One minute is a perfectly normal
            answer.
          </Step>
        </ol>

        <Note tone="run">
          Whatever number comes out of this decides where your plan starts. A small number means a
          plan that fits you, which is the whole point.
        </Note>

        <Button full className="py-4 text-[1.0625rem]" onClick={beginWalk}>
          I'm outside — start
        </Button>
        <Button variant="quiet" full className="py-3" onClick={onCancel}>
          Not now
        </Button>
      </div>
    );
  }

  if (stage === 'walk' || stage === 'run') {
    const isWalk = stage === 'walk';
    return (
      <div
        className={`fixed inset-0 z-50 flex flex-col ${isWalk ? 'bg-walk' : 'bg-run'}`}
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div className="px-4 py-3">
          <p className={`eyebrow ${isWalk ? '!text-ink/70' : '!text-white/80'}`}>
            {isWalk ? 'Step 1 of 2 · warming up' : 'Step 2 of 2 · running'}
          </p>
        </div>

        <div
          className={`flex flex-1 flex-col items-center justify-center px-6 ${isWalk ? 'text-ink' : 'text-white'}`}
        >
          <p
            className="display text-[clamp(2.25rem,11vw,3.5rem)] uppercase"
            style={{
              fontWeight: 800,
              letterSpacing: '0.02em',
              fontVariationSettings: "'wdth' 122",
            }}
          >
            {isWalk ? 'Walk' : 'Run'}
          </p>
          <p
            className="tabular mt-1 text-[clamp(5rem,30vw,9rem)] leading-[0.85]"
            style={{ fontWeight: 800 }}
          >
            {formatClock(isWalk ? WARMUP_SEC - elapsed : elapsed)}
          </p>
          <p
            className={`mt-4 max-w-xs text-center text-[1.0625rem] ${isWalk ? 'text-ink/80' : 'text-white/85'}`}
          >
            {isWalk
              ? 'Just walking. Running starts on its own when this reaches zero.'
              : 'Slow is correct. Stop the moment you want to.'}
          </p>
        </div>

        <div className="px-4 pb-4">
          {isWalk ? (
            <button
              onClick={beginRun}
              className="tap w-full rounded-2xl bg-ink py-5 text-xl font-semibold text-chalk transition-colors hover:bg-ink/90"
            >
              I'm warm — start running
            </button>
          ) : (
            <button
              onClick={stopRun}
              className="tap w-full rounded-2xl bg-white py-5 text-xl font-semibold text-ink transition-colors hover:bg-white/92"
            >
              I've stopped
            </button>
          )}
        </div>
      </div>
    );
  }

  const minutes = Math.round((ranSec / 60) * 2) / 2;
  return (
    <div className="flex flex-col gap-5">
      <div>
        <Eyebrow>Done</Eyebrow>
        <h1 className="mt-1.5 text-4xl" style={{ fontWeight: 780 }}>
          You ran{' '}
          {minutes < 0.5
            ? 'under half a minute'
            : `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`}
        </h1>
        <p className="mt-2 leading-relaxed text-ink-soft">
          One question left, and it matters more than the number: what made you stop?
        </p>
      </div>

      <StopReasonChoice onPick={(stopReason) => onDone({ minutesRun: minutes, stopReason })} />
    </div>
  );
}

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3.5">
      <span
        className="tabular flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-sm text-chalk"
        aria-hidden
      >
        {number}
      </span>
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="mt-0.5 block leading-snug text-ink-soft">{children}</span>
      </span>
    </li>
  );
}

/** Plain language — nobody thinks of themselves as "tissue-limited". */
export function StopReasonChoice({
  value,
  onPick,
}: {
  value?: StopReason | null;
  onPick: (reason: StopReason) => void;
}) {
  return (
    <Choices
      value={value ? [value] : []}
      onChange={([v]) => v && onPick(v)}
      options={[
        {
          value: 'breath',
          label: 'I was out of breath',
          hint: 'Breathing hard, heart pounding, legs felt fine',
        },
        {
          value: 'legs',
          label: 'My legs were heavy or sore',
          hint: 'Legs gave up before your breathing did',
        },
        {
          value: 'choice',
          label: 'Neither — I just decided to stop',
          hint: 'You had more in you, you chose not to use it',
        },
      ]}
    />
  );
}
