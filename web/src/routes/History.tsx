import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { STRENGTH_EXERCISES } from '@goodform/shared/content';
import { useSessionDetail, useSessions } from '../api/hooks.ts';
import { shiftDays, shortDate, today } from '../lib/date.ts';
import { Button, Card, Eyebrow, Note } from '../components/ui.tsx';
import { IntervalRibbon, formatMinutes } from '../components/IntervalRibbon.tsx';

const RANGES = [
  { days: 30, label: '30 days' },
  { days: 90, label: '3 months' },
  { days: 365, label: 'A year' },
];

const COMPLETION_LABEL: Record<string, string> = {
  full: 'Finished',
  partial: 'Cut short',
  skipped: 'Skipped',
};

/** P2: every session logged, newest first, each one openable in full. */
export function History() {
  const navigate = useNavigate();
  const [range, setRange] = useState(90);
  const { data, isPending } = useSessions(shiftDays(today(), -range));

  const sessions = data?.sessions ?? [];

  return (
    <div className="flex flex-col gap-5 pt-1">
      <header>
        <Eyebrow>History</Eyebrow>
        <h1 className="mt-1 text-4xl" style={{ fontWeight: 780 }}>
          Every session
        </h1>
      </header>

      <div className="flex gap-2">
        {RANGES.map((option) => (
          <button
            key={option.days}
            onClick={() => setRange(option.days)}
            aria-pressed={range === option.days}
            className={`tap flex-1 rounded-xl border px-3 text-[0.875rem] transition-colors ${
              range === option.days ? 'border-ink bg-ink text-chalk' : 'border-line bg-paper hover:border-ink-faint'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {isPending && <div className="min-h-[40dvh]" aria-busy="true" aria-label="Loading history" />}

      {!isPending && sessions.length === 0 && (
        <Note>Nothing logged in this window. Sessions appear here as soon as you finish one.</Note>
      )}

      <ul className="flex flex-col gap-2.5">
        {sessions.map((session) => (
          <li key={session.id}>
            <button
              onClick={() => navigate(`/history/${session.id}`)}
              className="tap w-full rounded-card border border-line bg-paper p-3.5 text-left transition-colors hover:border-ink-faint"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[0.9375rem]" style={{ fontWeight: 600 }}>
                  {session.type === 'strength' ? 'Strength' : session.type === 'baseline' ? 'Baseline run' : 'Run'}
                  {session.planWeek !== null && (
                    <span className="ml-1.5 font-normal text-ink-faint">week {session.planWeek}</span>
                  )}
                </span>
                <span className="text-[0.8125rem] text-ink-faint">{shortDate(session.date)}</span>
              </div>

              {session.prescription && (
                <div className="mt-2">
                  <IntervalRibbon
                    runSec={session.prescription.runSec}
                    walkSec={session.prescription.walkSec}
                    reps={session.prescription.reps}
                    height={10}
                  />
                </div>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem]">
                <span className={session.completion === 'full' ? 'text-good' : 'text-ink-soft'}>
                  {COMPLETION_LABEL[session.completion]}
                </span>
                {session.durationSec !== null && (
                  <span className="text-ink-faint">{Math.round(session.durationSec / 60)} min</span>
                )}
                {session.effort !== null && <span className="text-ink-faint">effort {session.effort}/5</span>}
                {session.discomfortSeverity !== null && (
                  <span className={session.discomfortSeverity >= 4 ? 'text-alert' : 'text-walk-deep'}>
                    {session.discomfortLocation} {session.discomfortSeverity}/5
                  </span>
                )}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One session in full, with the day around it. */
export function SessionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isPending, isError } = useSessionDetail(id ?? null);

  if (isPending) return <div className="min-h-[60dvh]" aria-busy="true" aria-label="Loading session" />;
  if (isError || !data) {
    return (
      <div className="flex flex-col gap-4 pt-6">
        <Note>That session could not be found.</Note>
        <Button variant="secondary" onClick={() => navigate('/history')}>
          Back to history
        </Button>
      </div>
    );
  }

  const { session, dailyLog, proteinG, daysSincePrevious } = data;
  const prescription = session.prescription;
  const exerciseLog = session.exerciseLog ?? {};
  const exercises = Object.entries(exerciseLog);

  return (
    <div className="flex flex-col gap-5 pt-1">
      <header>
        <button
          onClick={() => navigate('/history')}
          className="tap -ml-2 inline-flex items-center px-2 text-[0.875rem] text-run underline underline-offset-4"
        >
          ← History
        </button>
        <Eyebrow className="mt-2">{shortDate(session.date)}</Eyebrow>
        <h1 className="mt-1 text-4xl" style={{ fontWeight: 780 }}>
          {session.type === 'strength' ? 'Strength session' : session.type === 'baseline' ? 'Baseline run' : 'Run'}
        </h1>
      </header>

      {prescription && (
        <Card>
          <Eyebrow>What was prescribed</Eyebrow>
          <p className="mt-2 flex items-baseline gap-2">
            <span className="tabular text-4xl" style={{ fontWeight: 800 }}>
              {prescription.runSec / 60}
            </span>
            <span className="text-ink-soft">
              min run · {prescription.walkSec / 60} min walk · × {prescription.reps}
            </span>
          </p>
          <div className="mt-3">
            <IntervalRibbon
              runSec={prescription.runSec}
              walkSec={prescription.walkSec}
              reps={prescription.reps}
              height={16}
              progress={
                session.intervalsCompleted !== null
                  ? Math.min(1, session.intervalsCompleted / prescription.reps)
                  : undefined
              }
              label
            />
          </div>
          {session.intervalsCompleted !== null && session.intervalsCompleted < prescription.reps && (
            <p className="mt-2.5 text-[0.875rem] text-walk-deep">
              {session.intervalsCompleted} of {prescription.reps} intervals done. Stopping early is information,
              not a failure.
            </p>
          )}
        </Card>
      )}

      <Card>
        <Eyebrow>How it went</Eyebrow>
        <dl className="mt-2 divide-y divide-line">
          <Row label="Completion" value={COMPLETION_LABEL[session.completion] ?? session.completion} />
          {session.durationSec !== null && (
            <Row label="Time" value={formatMinutes(session.durationSec)} />
          )}
          {session.effort !== null && <Row label="Effort" value={`${session.effort} of 5`} />}
          {session.discomfortSeverity !== null && (
            <Row
              label="Discomfort"
              value={`${session.discomfortLocation} · ${session.discomfortSeverity} of 5`}
              tone={session.discomfortSeverity >= 4 ? 'alert' : 'watch'}
            />
          )}
          {daysSincePrevious !== null && (
            <Row
              label="Since the last one"
              value={`${daysSincePrevious} ${daysSincePrevious === 1 ? 'day' : 'days'}`}
            />
          )}
        </dl>
        {session.notes && <p className="mt-3 rounded-xl bg-chalk-deep px-3.5 py-3 text-[0.9375rem] leading-relaxed">{session.notes}</p>}
      </Card>

      {exercises.length > 0 && (
        <Card>
          <Eyebrow>Exercises</Eyebrow>
          <ul className="mt-1 divide-y divide-line">
            {exercises.map(([exerciseId, sets]) => (
              <li key={exerciseId} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-[0.9375rem]">
                  {STRENGTH_EXERCISES.find((e) => e.id === exerciseId)?.name ?? exerciseId}
                </span>
                <span className="tabular text-[0.875rem] text-ink-soft">
                  {sets} {sets === 1 ? 'set' : 'sets'}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <Eyebrow>That day</Eyebrow>
        <p className="mt-1.5 text-[0.875rem] leading-snug text-ink-soft">
          Sleep and what you drank the night before explain more sessions than the plan does.
        </p>
        <dl className="mt-2 divide-y divide-line">
          <Row label="Protein" value={proteinG > 0 ? `${proteinG} g` : 'Not logged'} />
          {dailyLog ? (
            <>
              <Row
                label="Sleep"
                value={dailyLog.sleepHours ? `${dailyLog.sleepHours} hours` : 'Not logged'}
                tone={dailyLog.sleepHours !== null && dailyLog.sleepHours < 6.5 ? 'watch' : undefined}
              />
              <Row label="Water" value={dailyLog.waterMl > 0 ? `${dailyLog.waterMl} ml` : 'Not logged'} />
              {(dailyLog.beers > 0 || dailyLog.alcoholUnits > 0) && (
                <Row
                  label="Alcohol"
                  value={[
                    dailyLog.beers > 0 ? `${dailyLog.beers} ${dailyLog.beers === 1 ? 'beer' : 'beers'}` : '',
                    dailyLog.alcoholUnits > 0 ? `${dailyLog.alcoholUnits} units` : '',
                  ]
                    .filter(Boolean)
                    .join(' + ')}
                  tone="watch"
                />
              )}
              {dailyLog.cigarettes > 0 && <Row label="Cigarettes" value={String(dailyLog.cigarettes)} tone="watch" />}
            </>
          ) : (
            <Row label="Daily log" value="Nothing logged" />
          )}
        </dl>
      </Card>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'watch' | 'alert' }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-[0.9375rem] text-ink-soft">{label}</dt>
      <dd className={`text-[0.9375rem] ${tone === 'alert' ? 'text-alert' : tone === 'watch' ? 'text-walk-deep' : ''}`}>
        {value}
      </dd>
    </div>
  );
}
