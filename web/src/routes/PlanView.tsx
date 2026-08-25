import { Link } from 'react-router';
import { usePlan, useSessions, useWeekReview } from '../api/hooks.ts';
import { shiftDays, today } from '../lib/date.ts';
import { Card, Eyebrow, Note } from '../components/ui.tsx';
import { IntervalRibbon } from '../components/IntervalRibbon.tsx';

export function PlanView() {
  const { data } = usePlan();
  const { data: sessionData } = useSessions(shiftDays(today(), -120));
  // A finished block has no week left to gate on, so asking would only 404.
  const { data: review } = useWeekReview(data?.plan?.status === 'active');

  const plan = data?.plan;
  const weeks = data?.weeks ?? [];

  if (!plan) {
    return (
      <div className="pt-6">
        <Note>No active plan. Record a baseline and GoodForm will build one.</Note>
      </div>
    );
  }

  // One shared time scale across the block, so the ribbons compare honestly.
  const longestSessionSec = Math.max(...weeks.map((w) => (w.runSec + w.walkSec) * w.reps), 1);

  const runsThisWeek = (sessionData?.sessions ?? []).filter(
    (s) => s.planWeek === plan.currentWeek && s.type === 'run',
  );
  const currentWeek = weeks.find((w) => w.index === plan.currentWeek);

  return (
    <div className="flex flex-col gap-5 pt-1">
      <header>
        <Eyebrow>Your block</Eyebrow>
        <h1 className="mt-1 text-4xl" style={{ fontWeight: 780 }}>
          {plan.status === 'completed'
            ? `${weeks.length} weeks, done`
            : `Week ${Math.min(plan.currentWeek, weeks.length)} of ${weeks.length}`}
        </h1>
        <p className="mt-2 leading-relaxed text-ink-soft">
          Cobalt is running, amber is walking, drawn to scale. Watch the run blocks stretch while
          the walks stay exactly where they are.
        </p>
      </header>

      {plan.status === 'completed' && (
        <Card className="border-ink">
          <Eyebrow as="h2">Block complete</Eyebrow>
          <p className="mt-1.5 text-[1.0625rem] leading-snug">
            You finished this block. The next one starts from where it left off rather than from
            scratch.
          </p>
          <Link
            to="/reassess"
            className="tap mt-3 flex items-center justify-center rounded-xl bg-ink px-5 font-medium text-chalk transition-colors hover:bg-ink/90"
          >
            See what you did, and choose
          </Link>
        </Card>
      )}

      {plan.status === 'active' && currentWeek && (
        <Card className="border-ink">
          <div className="flex items-baseline justify-between">
            <Eyebrow>This week</Eyebrow>
            <p className="tabular text-[0.8125rem] text-ink-soft">
              {runsThisWeek.filter((s) => s.completion === 'full').length} of{' '}
              {currentWeek.sessionsPerWeek} runs done
            </p>
          </div>
          <p className="mt-2 flex items-baseline gap-2">
            <span className="tabular text-4xl" style={{ fontWeight: 800 }}>
              {currentWeek.runSec / 60}
            </span>
            <span className="text-ink-soft">
              min run · {currentWeek.walkSec / 60} min walk · × {currentWeek.reps}
            </span>
          </p>
          <div className="mt-3">
            <IntervalRibbon
              runSec={currentWeek.runSec}
              walkSec={currentWeek.walkSec}
              reps={currentWeek.reps}
              height={16}
              scaleToSec={longestSessionSec}
            />
          </div>
          {currentWeek.repeats > 0 && (
            <p className="mt-2.5 text-[0.875rem] text-walk-deep">
              Repeated {currentWeek.repeats} {currentWeek.repeats === 1 ? 'time' : 'times'} — the
              plan waiting for your legs, which is what it is for.
            </p>
          )}
          {review && review.gate.decision !== 'advance' && (
            <p className="mt-2.5 text-[0.875rem] leading-snug text-ink-soft">
              {review.gate.reason}
            </p>
          )}
        </Card>
      )}

      <ol className="flex flex-col gap-3">
        {weeks.map((week) => {
          const state =
            plan.status === 'completed' || week.index < plan.currentWeek
              ? 'done'
              : week.index === plan.currentWeek
                ? 'current'
                : 'ahead';
          return (
            <li
              key={week.index}
              className={`flex items-center gap-3.5 rounded-xl px-2 py-2 ${
                state === 'current' ? 'bg-chalk-deep' : ''
              }`}
            >
              <span
                className={`tabular w-7 shrink-0 text-right text-sm ${
                  state === 'done'
                    ? 'text-good'
                    : state === 'current'
                      ? 'font-bold text-ink'
                      : 'text-ink-faint'
                }`}
              >
                {state === 'done' ? '✓' : week.index}
              </span>
              <div className={`min-w-0 flex-1 ${state === 'ahead' ? 'opacity-55' : ''}`}>
                <IntervalRibbon
                  runSec={week.runSec}
                  walkSec={week.walkSec}
                  reps={week.reps}
                  height={14}
                  scaleToSec={longestSessionSec}
                />
                <p className="mt-1 text-[0.8125rem] text-ink-faint">
                  {week.runSec / 60} min × {week.reps}
                  {week.isDeload && <span className="ml-1.5 text-walk-deep">· lighter week</span>}
                  {week.repeats > 0 && <span className="ml-1.5">· repeated {week.repeats}×</span>}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      {plan.conservatismReasons.length > 0 && (
        <Card>
          <Eyebrow as="h2">Why this plan starts where it does</Eyebrow>
          <ul className="mt-2.5 flex flex-col gap-2">
            {plan.conservatismReasons.map((reason) => (
              <li key={reason} className="flex gap-2.5 text-[0.9375rem] leading-snug text-ink-soft">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-walk" />
                {reason}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Note>
        Tendon and bone adaptation takes three to six months and cannot be rushed by effort. This
        single fact prevents more injuries than any feature in this app.
      </Note>
    </div>
  );
}
