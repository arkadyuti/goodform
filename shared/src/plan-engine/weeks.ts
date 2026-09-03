import { addDays, daysBetween, startOfWeek } from '../dates.js';
import type { GateResult, PlanWeek, WorkoutSession } from '../types.js';
import { evaluateWeek } from './gating.js';

/**
 * The calendar dates a plan week occupies.
 *
 * A week is a quota, not a rota: three runs, done by Sunday. If they are not
 * done, the same week comes round again the following Monday and every later
 * week moves with it. The plan never advances on the calendar's say-so.
 */
export interface WeekWindow {
  from: string;
  to: string;
}

/**
 * The window of an attempt that began on `startedOn`.
 *
 * Every window ends on a Sunday. A plan begun on a Thursday would otherwise
 * get a three-day first week, be judged to have missed two sessions, and
 * repeat before the runner had a fair go — so a late start runs through to
 * the Sunday after next. Only the first attempt of week one can be long;
 * everything that follows starts on a Monday and is exactly seven days.
 */
export function windowFrom(startedOn: string): WeekWindow {
  const sunday = addDays(startOfWeek(startedOn), 6);
  const to = daysBetween(startedOn, sunday) < 4 ? addDays(sunday, 7) : sunday;
  return { from: startedOn, to };
}

/**
 * The window a date fell in, reading the plan as contiguous windows from its
 * start. Decisions that restart a week part-way through — stepping back,
 * pushing on, resuming — break that, so this is for history, where "what did
 * that day ask for" is being reconstructed, not for the live week.
 */
export function windowContaining(startDate: string, date: string): WeekWindow | null {
  if (date < startDate) return null;
  let window = windowFrom(startDate);
  while (date > window.to) window = windowFrom(addDays(window.to, 1));
  return window;
}

export function inWindow(date: string, window: WeekWindow): boolean {
  return date >= window.from && date <= window.to;
}

export interface SettleWeek extends PlanWeek {
  repeats: number;
  /** The first day of the current attempt; null on rows from before it was recorded. */
  startedOn: string | null;
}

export type SettleAction =
  | { kind: 'advanced'; week: number; window: WeekWindow; gate: GateResult }
  | { kind: 'repeated'; week: number; window: WeekWindow; gate: GateResult }
  /** The window passed with no running in it. The dates move; the attempt is not counted. */
  | { kind: 'waited'; week: number; window: WeekWindow }
  | { kind: 'completed'; week: number; window: WeekWindow; gate: GateResult };

export interface Settled {
  currentWeek: number;
  weeks: SettleWeek[];
  completed: boolean;
  actions: SettleAction[];
}

/** No plan is this long; a bad start date must not spin for ever. */
const MAX_ROLLS = 520;

/**
 * Brings a plan up to today.
 *
 * Progression used to wait for a tap. The gate reached its verdict at the end
 * of the week and then sat on the screen until the runner pressed something —
 * so a plan whose owner trained without ever tapping stayed on week one with
 * its window drifting further into the past. Now a window that has closed
 * decides itself: target met, on to the next week; not met, the same week
 * again from Monday. Decisions that need the runner — stepping back, easing,
 * pausing — stay theirs, on top of a plan whose dates are already right.
 */
export function settleWeeks(
  plan: { currentWeek: number; startDate: string },
  weeks: SettleWeek[],
  sessions: WorkoutSession[],
  today: string,
): Settled {
  const next = weeks.map((w) => ({ ...w }));
  const byIndex = new Map(next.map((w) => [w.index, w]));
  const actions: SettleAction[] = [];
  let currentWeek = plan.currentWeek;
  let completed = false;

  let week = byIndex.get(currentWeek);
  if (!week) return { currentWeek, weeks: next, completed, actions };
  week.startedOn ??= plan.startDate;

  for (let rolls = 0; rolls < MAX_ROLLS; rolls++) {
    const window = windowFrom(week.startedOn ?? plan.startDate);
    if (today <= window.to) break;

    const runs = sessions.filter(
      (s) => (s.type === 'run' || s.type === 'baseline') && inWindow(s.date, window),
    );
    const monday = addDays(window.to, 1);

    if (runs.length === 0) {
      actions.push({ kind: 'waited', week: week.index, window });
      week.startedOn = monday;
      continue;
    }

    const gate = evaluateWeek(week, runs, week.repeats, true);
    if (gate.decision !== 'advance') {
      actions.push({ kind: 'repeated', week: week.index, window, gate });
      week.repeats += 1;
      week.startedOn = monday;
      continue;
    }

    const following = byIndex.get(week.index + 1);
    if (!following) {
      actions.push({ kind: 'completed', week: week.index, window, gate });
      completed = true;
      break;
    }
    actions.push({ kind: 'advanced', week: week.index, window, gate });
    following.startedOn = monday;
    currentWeek = following.index;
    week = following;
  }

  return { currentWeek, weeks: next, completed, actions };
}
