export type Phase = 'warmup' | 'run' | 'walk' | 'cooldown' | 'done';

export interface Interval {
  phase: Phase;
  durationSec: number;
  /** 1-based repetition number for run/walk phases. */
  rep: number;
}

export interface TimerState {
  intervals: Interval[];
  index: number;
  /** Seconds elapsed inside the current interval. */
  phaseElapsed: number;
  totalElapsed: number;
  totalDuration: number;
  running: boolean;
  finished: boolean;
}

/** Builds the interval list for one run-walk session. */
export function buildIntervals(runSec: number, walkSec: number, reps: number): Interval[] {
  const intervals: Interval[] = [];
  for (let rep = 1; rep <= reps; rep++) {
    intervals.push({ phase: 'run', durationSec: runSec, rep });
    // The last walk is the cool-down walk, so it is kept — it is where the
    // heart rate comes down, not padding.
    intervals.push({ phase: 'walk', durationSec: walkSec, rep });
  }
  return intervals;
}

/**
 * Wall-clock interval timer.
 *
 * Mobile browsers throttle or stop timers behind a locked screen, so nothing
 * here counts ticks. Position is always recomputed from timestamp deltas,
 * which means a session that was suspended for four minutes rolls forward
 * through every phase it missed instead of drifting (PRD §5.2).
 */
export class IntervalTimer {
  private intervals: Interval[];
  private startedAt = 0;
  private accumulated = 0;
  private running = false;
  private raf: { raf: number | null; timeout: number } | null = null;
  private lastAnnouncedIndex = -1;
  private lastCountdown = -1;

  constructor(
    intervals: Interval[],
    private readonly handlers: {
      onTick: (state: TimerState) => void;
      onPhaseChange: (from: Interval | null, to: Interval | null) => void;
      onCountdown: (secondsLeft: number, next: Interval | null) => void;
      onFinish: () => void;
    },
  ) {
    this.intervals = intervals;
  }

  get totalDuration(): number {
    return this.intervals.reduce((sum, i) => sum + i.durationSec, 0);
  }

  private elapsedSec(): number {
    const live = this.running ? (Date.now() - this.startedAt) / 1000 : 0;
    return this.accumulated + live;
  }

  /** Which interval a given elapsed time falls in, and how far into it. */
  private locate(elapsed: number): { index: number; phaseElapsed: number } {
    let remaining = elapsed;
    for (let i = 0; i < this.intervals.length; i++) {
      const duration = this.intervals[i]!.durationSec;
      if (remaining < duration) return { index: i, phaseElapsed: remaining };
      remaining -= duration;
    }
    return { index: this.intervals.length, phaseElapsed: 0 };
  }

  state(): TimerState {
    const totalElapsed = Math.min(this.elapsedSec(), this.totalDuration);
    const { index, phaseElapsed } = this.locate(totalElapsed);
    return {
      intervals: this.intervals,
      index,
      phaseElapsed,
      totalElapsed,
      totalDuration: this.totalDuration,
      running: this.running,
      finished: index >= this.intervals.length,
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.startedAt = Date.now();
    this.loop();
  }

  pause(): void {
    if (!this.running) return;
    this.accumulated = this.elapsedSec();
    this.running = false;
    if (this.raf !== null) unschedule(this.raf);
    this.raf = null;
    this.handlers.onTick(this.state());
  }

  reset(): void {
    this.pause();
    this.accumulated = 0;
    this.lastAnnouncedIndex = -1;
    this.lastCountdown = -1;
    this.handlers.onTick(this.state());
  }

  /** Jumps to the start of the next interval, keeping wall-clock alignment. */
  skip(): void {
    const { index } = this.locate(this.elapsedSec());
    const target = this.intervals.slice(0, index + 1).reduce((sum, i) => sum + i.durationSec, 0);
    this.accumulated = target;
    this.startedAt = Date.now();
    this.tick();
  }

  /** Adds seconds back — for when a road crossing interrupts a run interval. */
  rewind(seconds: number): void {
    this.accumulated = Math.max(0, this.elapsedSec() - seconds);
    this.startedAt = Date.now();
    this.tick();
  }

  destroy(): void {
    if (this.raf !== null) unschedule(this.raf);
    this.raf = null;
    this.running = false;
  }

  private tick(): void {
    const state = this.state();
    const current = this.intervals[state.index] ?? null;

    if (state.index !== this.lastAnnouncedIndex) {
      const previous = this.intervals[this.lastAnnouncedIndex] ?? null;
      this.lastAnnouncedIndex = state.index;
      this.lastCountdown = -1;
      this.handlers.onPhaseChange(previous, current);
    }

    if (current) {
      const left = Math.ceil(current.durationSec - state.phaseElapsed);
      if (left <= 3 && left >= 1 && left !== this.lastCountdown) {
        this.lastCountdown = left;
        this.handlers.onCountdown(left, this.intervals[state.index + 1] ?? null);
      }
    }

    this.handlers.onTick(state);

    if (state.finished && this.running) {
      this.pause();
      this.handlers.onFinish();
    }
  }

  private loop = (): void => {
    if (!this.running) return;
    // A round is scheduled twice — an animation frame and a timeout — so that a
    // hidden page still ticks. Whichever fires first cancels its sibling here,
    // otherwise every round would leave one live callback behind and the number
    // of them would double each time.
    if (this.raf !== null) unschedule(this.raf);
    this.raf = null;
    this.tick();
    if (this.running) this.raf = schedule(this.loop);
  };
}

/**
 * Prefers animation frames for a smooth display, but the timer's correctness
 * never depends on them — position always comes from the wall clock.
 *
 * The fallback timeout is not only for environments without rAF. Animation
 * frames stop entirely on a hidden page, and on this screen that is the case
 * that matters most: a phone in a pocket. The clock stays right either way,
 * but ticks are what emit the run and walk cues, so without a second source
 * the beeps that let a runner not look at the screen simply never arrive.
 * Running both means whichever one the browser still services keeps the cues
 * coming; `tick()` is idempotent, so being called twice costs nothing.
 */
function schedule(callback: () => void): { raf: number | null; timeout: number } {
  return {
    raf: typeof requestAnimationFrame === 'function' ? requestAnimationFrame(callback) : null,
    // Background timers are throttled to about a second, which is fine: cues
    // are emitted on a phase boundary, not on a particular frame.
    timeout: setTimeout(callback, 200) as unknown as number,
  };
}

function unschedule(handle: { raf: number | null; timeout: number }): void {
  if (handle.raf !== null && typeof cancelAnimationFrame === 'function')
    cancelAnimationFrame(handle.raf);
  clearTimeout(handle.timeout);
}

export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
