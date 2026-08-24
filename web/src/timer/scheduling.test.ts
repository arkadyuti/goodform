import { describe, expect, it, vi } from 'vitest';
import { IntervalTimer } from './engine.ts';

const handlers = () => ({
  onTick: () => {},
  onPhaseChange: () => {},
  onCountdown: () => {},
  onFinish: () => {},
});

describe('timer scheduling', () => {
  it('still changes phase with no animation frames — the pocket case', () => {
    // Animation frames stop on a hidden page. Ticks are what emit the run and
    // walk cues, so without a second source a runner with the screen off hears
    // nothing for the whole session.
    vi.useFakeTimers();
    const original = globalThis.requestAnimationFrame;
    // @ts-expect-error deliberately removing it for the duration of the test
    globalThis.requestAnimationFrame = undefined;

    const phases: string[] = [];
    const timer = new IntervalTimer(
      [
        { phase: 'run', durationSec: 2, rep: 1 },
        { phase: 'walk', durationSec: 2, rep: 1 },
      ],
      { ...handlers(), onPhaseChange: (_from, to) => to && phases.push(to.phase) },
    );
    timer.start();
    vi.advanceTimersByTime(2500);
    timer.destroy();

    globalThis.requestAnimationFrame = original;
    vi.useRealTimers();
    expect(phases).toContain('walk');
  });

  it('does not multiply pending callbacks each round', () => {
    // Each round arms both a frame and a timeout. If the one that fires does
    // not cancel its sibling, the number of live callbacks doubles every round.
    vi.useFakeTimers();
    const original = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
      setTimeout(() => cb(0), 16) as unknown as number) as typeof requestAnimationFrame;

    const timer = new IntervalTimer([{ phase: 'run', durationSec: 60, rep: 1 }], handlers());
    timer.start();
    vi.advanceTimersByTime(3000);
    const pending = vi.getTimerCount();
    timer.destroy();

    globalThis.requestAnimationFrame = original;
    vi.useRealTimers();
    // At most the in-flight frame and its sibling timeout.
    expect(pending).toBeLessThanOrEqual(2);
  });

  it('leaves nothing scheduled after destroy', () => {
    vi.useFakeTimers();
    const timer = new IntervalTimer([{ phase: 'run', durationSec: 60, rep: 1 }], handlers());
    timer.start();
    vi.advanceTimersByTime(1000);
    timer.destroy();
    vi.advanceTimersByTime(50);
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
});
