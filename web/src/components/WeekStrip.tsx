import { Link } from 'react-router';
import type { TrainingDays, WeekContext } from '@goodform/shared';
import type { SessionRow } from '../api/hooks.ts';
import { scheduleFor, shiftDays, today } from '../lib/date.ts';

const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * The week's rhythm at a glance — runs, strength and rest in the same cobalt
 * and amber vocabulary as the interval ribbon. Rest days are as visible as
 * working days, because rest is when the adaptation actually happens.
 */
export function WeekStrip({
  sessions,
  trainingDays,
  week,
}: {
  sessions: SessionRow[];
  trainingDays: TrainingDays;
  /** The live week, so the days ahead show where the plan has moved things. */
  week?: WeekContext;
}) {
  const now = today();
  const start = shiftDays(now, -new Date(`${now}T12:00:00`).getDay());
  const days = Array.from({ length: 7 }, (_, i) => shiftDays(start, i));

  return (
    <Link
      to="/plan"
      className="flex items-end gap-1.5 rounded-xl px-0.5 py-1 transition-colors hover:bg-chalk-deep"
    >
      {/* The accessible name has to contain the visible day letters. */}
      <span className="sr-only">This week's sessions — open the plan.</span>
      {days.map((date, i) => {
        const scheduled = scheduleFor(date, trainingDays, week);
        const done = sessions.some((s) => s.date === date && s.completion !== 'skipped');
        const isToday = date === now;
        const past = date < now;

        return (
          <span key={date} className="flex flex-1 flex-col items-center gap-1.5">
            <span
              className={`h-7 w-full rounded ${
                done
                  ? 'bg-run'
                  : scheduled === 'run'
                    ? past
                      ? 'bg-run-wash'
                      : 'bg-run/18'
                    : scheduled === 'strength'
                      ? past
                        ? 'bg-walk-wash'
                        : 'bg-walk/18'
                      : 'bg-chalk-deep'
              } ${isToday ? 'ring-2 ring-ink ring-offset-[3px] ring-offset-chalk' : ''}`}
              aria-hidden
            />
            <span
              className={`text-[0.6875rem] ${isToday ? 'font-bold text-ink' : 'text-ink-faint'}`}
            >
              {LETTERS[i]}
            </span>
          </span>
        );
      })}
    </Link>
  );
}
