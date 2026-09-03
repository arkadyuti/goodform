import { afterEach, describe, expect, it, vi } from 'vitest';
import { IntervalTimer, buildIntervals, formatClock } from './engine.ts';

function harness(intervals = buildIntervals(120, 60, 3)) {
  const phases: string[] = [];
  const timer = new IntervalTimer(intervals, {
    onTick: () => undefined,
    onPhaseChange: (_from, to) => to && phases.push(`${to.phase}${to.rep}`),
    onCountdown: () => undefined,
    onFinish: () => phases.push('finish'),
  });
  return { timer, phases };
}

afterEach(() => vi.useRealTimers());

describe('buildIntervals', () => {
  it('alternates run and walk for every repetition', () => {
    const intervals = buildIntervals(120, 60, 3);
    expect(intervals.map((i) => i.phase)).toEqual(['run', 'walk', 'run', 'walk', 'run', 'walk']);
    expect(intervals.reduce((sum, i) => sum + i.durationSec, 0)).toBe(540);
  });
});

describe('IntervalTimer', () => {
  it('locates position from wall-clock time, not tick counts', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T06:00:00Z'));
    const { timer } = harness();
    timer.start();

    // No animation frames fire here at all — position still has to be right.
    vi.setSystemTime(new Date('2026-08-24T06:02:30Z')); // 150s in
    const state = timer.state();
    expect(state.intervals[state.index]!.phase).toBe('walk');
    expect(state.phaseElapsed).toBeCloseTo(30, 1);
    expect(state.totalElapsed).toBeCloseTo(150, 1);
  });

  it('rolls forward through every phase a suspension swallowed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T06:00:00Z'));
    const { timer } = harness();
    timer.start();

    // The screen locks for four minutes — two whole phases go by unobserved.
    vi.setSystemTime(new Date('2026-08-24T06:04:00Z')); // 240s in
    const state = timer.state();
    expect(state.totalElapsed).toBeCloseTo(240, 1);
    expect(state.index).toBe(2); // second run interval
    expect(state.intervals[state.index]!.rep).toBe(2);
    expect(state.finished).toBe(false);
  });

  it('does not drift when paused and resumed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T06:00:00Z'));
    const { timer } = harness();
    timer.start();

    vi.setSystemTime(new Date('2026-08-24T06:00:50Z'));
    timer.pause();
    // Ten minutes of standing still must not advance the session.
    vi.setSystemTime(new Date('2026-08-24T06:10:50Z'));
    expect(timer.state().totalElapsed).toBeCloseTo(50, 1);

    timer.start();
    vi.setSystemTime(new Date('2026-08-24T06:11:20Z'));
    expect(timer.state().totalElapsed).toBeCloseTo(80, 1);
  });

  it('finishes exactly at the end of the last interval', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T06:00:00Z'));
    const { timer } = harness();
    timer.start();
    vi.setSystemTime(new Date('2026-08-24T06:09:00Z')); // 540s — the full session
    expect(timer.state().finished).toBe(true);
    expect(timer.state().totalElapsed).toBe(540);
  });

  it('skips to the start of the next interval', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T06:00:00Z'));
    const { timer } = harness();
    timer.start();
    vi.setSystemTime(new Date('2026-08-24T06:00:10Z'));
    timer.skip();
    const state = timer.state();
    expect(state.totalElapsed).toBeCloseTo(120, 1);
    expect(state.intervals[state.index]!.phase).toBe('walk');
  });

  it('does not count a run interval that was skipped', () => {
    // run 120 / walk 60 × 3: runs at 0, 180 and 360.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T06:00:00Z'));
    const { timer } = harness();
    timer.start();
    vi.setSystemTime(new Date('2026-08-24T06:00:10Z'));
    timer.skip(); // rep 1 forfeited
    vi.setSystemTime(new Date('2026-08-24T06:06:00Z')); // 360s: into rep 3
    const state = timer.state();
    expect(state.completedReps).toBe(1);
    expect(state.skippedReps).toBe(1);
  });

  it('counts a skipped walk as nothing lost', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T06:00:00Z'));
    const { timer } = harness();
    timer.start();
    vi.setSystemTime(new Date('2026-08-24T06:02:10Z')); // 130s: walk 1
    timer.skip();
    expect(timer.state().completedReps).toBe(1);
    expect(timer.state().skippedReps).toBe(0);
  });

  it('finishes a session of nothing but skips with nothing completed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T06:00:00Z'));
    const { timer } = harness();
    timer.start();
    for (let i = 0; i < 6; i++) timer.skip();
    const state = timer.state();
    expect(state.finished).toBe(true);
    expect(state.completedReps).toBe(0);
  });

  it('rewinds without going below zero', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T06:00:00Z'));
    const { timer } = harness();
    timer.start();
    vi.setSystemTime(new Date('2026-08-24T06:00:10Z'));
    timer.rewind(30);
    expect(timer.state().totalElapsed).toBe(0);
  });
});

describe('formatClock', () => {
  it('shows whole seconds, rounded up, always two digits', () => {
    expect(formatClock(90)).toBe('1:30');
    expect(formatClock(59.2)).toBe('1:00');
    expect(formatClock(5)).toBe('0:05');
    expect(formatClock(-3)).toBe('0:00');
  });
});
