import { useState } from 'react';
import { Link } from 'react-router';
import { startOfWeek, type WeeklyReview } from '@goodform/shared';
import {
  useDailyRange,
  useProgress,
  useRegimenHistory,
  useTrends,
  useWeeklyReview,
} from '../api/hooks.ts';
import { shiftDays, shortDate, today } from '../lib/date.ts';
import { Card, Eyebrow, LoadFailed, Note } from '../components/ui.tsx';
import { AdherenceStrip, DiscomfortChart, TrendChart } from '../components/Chart.tsx';
import { formatMinutes } from '../components/IntervalRibbon.tsx';

export function Progress() {
  const { data, isError, isFetching, refetch } = useProgress();
  const { data: trends } = useTrends();
  const { data: rangeData } = useDailyRange(shiftDays(today(), -28));
  const { data: regimen } = useRegimenHistory(shiftDays(today(), -27));

  // Only when there is nothing to show. A refetch that fails while a good copy
  // is still cached should leave the good copy on screen — replacing it with an
  // error is a downgrade, and the runner did not ask for one.
  if (isError && !data)
    return (
      <div className="pt-6">
        <LoadFailed what="your progress" retrying={isFetching} onRetry={() => void refetch()} />
      </div>
    );
  if (!data) return <p className="eyebrow pt-6">Loading</p>;

  const { adherence, longestRunSec } = data;
  const logs = rangeData?.logs ?? [];
  const cigarettes = logs.reduce((sum, l) => sum + l.cigarettes, 0);
  const beers = logs.reduce((sum, l) => sum + l.beers, 0);
  const alcohol = logs.reduce((sum, l) => sum + l.alcoholUnits, 0);
  const regimenItems = (regimen?.items ?? []).filter((row) => row.adherence.due > 0);

  return (
    <div className="flex flex-col gap-5 pt-1">
      <header>
        <Eyebrow>Progress</Eyebrow>
        <h1 className="mt-1 text-4xl" style={{ fontWeight: 780 }}>
          What has actually changed
        </h1>
      </header>

      <WeeklyReviewCard />

      <Card>
        <Eyebrow>Longest run interval</Eyebrow>
        <p className="mt-1 flex items-baseline gap-2">
          <span className="tabular text-5xl leading-none" style={{ fontWeight: 800 }}>
            {formatMinutes(longestRunSec).replace(' min', '')}
          </span>
          <span className="text-ink-soft">minutes unbroken</span>
        </p>
      </Card>

      <Card>
        <Eyebrow>Sessions</Eyebrow>
        <div className="mt-2 grid grid-cols-2 gap-4">
          <div>
            <p className="tabular text-3xl leading-none" style={{ fontWeight: 800 }}>
              {adherence.runsCompleted}
              <span className="text-xl text-ink-faint">/{adherence.runsPlanned || '–'}</span>
            </p>
            <p className="mt-1 text-[0.8125rem] text-ink-soft">runs completed</p>
          </div>
          <div>
            <p className="tabular text-3xl leading-none" style={{ fontWeight: 800 }}>
              {adherence.strengthCompleted}
            </p>
            <p className="mt-1 text-[0.8125rem] text-ink-soft">strength sessions</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          <Link to="/history" className="text-[0.875rem] text-run underline underline-offset-4">
            See every session
          </Link>
          <Link to="/calendar" className="text-[0.875rem] text-run underline underline-offset-4">
            Calendar and backfill
          </Link>
        </div>
      </Card>

      {/* Small multiples rather than one crowded plot: minutes, kilograms,
          centimetres and beats share no scale, and forcing them onto one pair
          of axes would invent a relationship between them. */}
      {trends && (
        <>
          <Card>
            <TrendChart
              title="Longest interval, by week"
              points={trends.longestRun}
              unit="min"
              caption="The number the whole plan is about. Walks stay put while this stretches."
              goodDirection="up"
              empty="Finish a run and this starts drawing."
            />
          </Card>

          <Card>
            <TrendChart
              title="Resting heart rate"
              points={trends.restingHr}
              unit="bpm"
              caption="Moves before weight does, and keeps moving after weight stalls."
              goodDirection="down"
              empty="Log a resting heart rate in the weekly check-in."
            />
          </Card>

          <Card>
            <TrendChart
              title="Waist"
              points={trends.waist}
              unit="cm"
              caption="Falling here with weight holding steady is muscle arriving while fat leaves."
              goodDirection="down"
              empty="Measure your waist in the weekly check-in."
            />
          </Card>

          <Card>
            <TrendChart
              title="Weight"
              points={trends.weight}
              unit="kg"
              caption="The least informative of the four. Read it alongside your waist, never on its own."
              empty="Log a weight in the weekly check-in."
            />
          </Card>

          <Card>
            <TrendChart
              title="Strength level"
              points={trends.strengthLevel}
              caption="Your prescription advances every third completed session, so this is capability rather than attendance."
              goodDirection="up"
              zeroBased
              empty="Finish a few strength sessions and the prescription starts advancing."
            />
          </Card>

          <Card>
            <DiscomfortChart points={trends.discomfort} />
          </Card>
        </>
      )}

      {logs.length > 0 && (
        <Card>
          <Eyebrow>Last 4 weeks</Eyebrow>
          <div className="mt-2 grid grid-cols-3 gap-4">
            <div>
              <p className="tabular text-3xl leading-none" style={{ fontWeight: 800 }}>
                {cigarettes}
              </p>
              <p className="mt-1 text-[0.8125rem] text-ink-soft">cigarettes</p>
            </div>
            <div>
              <p className="tabular text-3xl leading-none" style={{ fontWeight: 800 }}>
                {beers}
              </p>
              <p className="mt-1 text-[0.8125rem] text-ink-soft">
                beers{alcohol > 0 ? ` + ${Math.round(alcohol)} units` : ''}
              </p>
            </div>
            <div>
              <p className="tabular text-3xl leading-none" style={{ fontWeight: 800 }}>
                {
                  logs.filter((l) => l.cigarettes === 0 && l.alcoholUnits === 0 && l.beers === 0)
                    .length
                }
              </p>
              <p className="mt-1 text-[0.8125rem] text-ink-soft">clear days</p>
            </div>
          </div>
        </Card>
      )}

      {regimenItems.length > 0 && (
        <Card>
          <Eyebrow>Doses, last four weeks</Eyebrow>
          <ul className="mt-2.5 flex flex-col gap-3.5">
            {regimenItems.map((row) => (
              <li key={row.item.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-[0.9375rem]">{row.item.name}</span>
                  <span className="tabular shrink-0 text-[0.8125rem] text-ink-soft">
                    {row.adherence.taken} of {row.adherence.due}
                    {row.adherence.skipped > 0 && ` · ${row.adherence.skipped} skipped`}
                  </span>
                </div>
                <div className="mt-1">
                  <AdherenceStrip
                    days={row.days}
                    label={`${row.item.name}: ${row.adherence.taken} of ${row.adherence.due} doses taken`}
                  />
                </div>
              </li>
            ))}
          </ul>
          <Link
            to="/regimen"
            className="mt-3 inline-block text-[0.875rem] text-run underline underline-offset-4"
          >
            Manage your list
          </Link>
        </Card>
      )}

      <ExportCard />

      <Note>
        Waist and resting heart rate respond long before weight does. Weight holding steady while
        your waist comes down is the result to want.
      </Note>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Weekly review (P2)
// ---------------------------------------------------------------------------

function WeeklyReviewCard() {
  const [week, setWeek] = useState(() => startOfWeek(shiftDays(today(), -7)));
  const { data, isPending } = useWeeklyReview(week);

  const thisWeek = startOfWeek(today());
  const canGoForward = week < thisWeek;
  const earliest = data?.weeksAvailable.earliest;
  const canGoBack = !earliest || week > earliest;

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setWeek((w) => shiftDays(w, -7))}
          disabled={!canGoBack}
          aria-label="Previous week"
          className="tap rounded-lg px-2 text-ink-faint transition-colors hover:text-ink disabled:opacity-30"
        >
          ←
        </button>
        <div className="text-center">
          <p className="eyebrow">{week === thisWeek ? 'This week' : 'Week of'}</p>
          <p className="text-[0.875rem] text-ink-soft">
            {shortDate(week)} – {shortDate(shiftDays(week, 6))}
          </p>
        </div>
        <button
          onClick={() => setWeek((w) => shiftDays(w, 7))}
          disabled={!canGoForward}
          aria-label="Next week"
          className="tap rounded-lg px-2 text-ink-faint transition-colors hover:text-ink disabled:opacity-30"
        >
          →
        </button>
      </div>

      {isPending || !data ? (
        <div className="min-h-32" aria-busy="true" aria-label="Loading the week" />
      ) : (
        <ReviewBody review={data.review} />
      )}
    </Card>
  );
}

function ReviewBody({ review }: { review: WeeklyReview }) {
  const { habits, protein, measurements, regimen } = review;

  return (
    <div className="mt-3">
      <p className="text-[1.0625rem] leading-snug">{review.headline}</p>

      <div className="mt-3.5 grid grid-cols-3 gap-4">
        <Figure value={`${review.runs.completed}/${review.runs.planned}`} label="runs" />
        <Figure value={String(review.strength.completed)} label="strength" />
        <Figure
          value={review.totalRunSec > 0 ? `${Math.round(review.totalRunSec / 60)}` : '–'}
          label="min running"
        />
      </div>

      {(protein || measurements || regimen) && (
        <dl className="mt-3.5 divide-y divide-line">
          {protein && (
            <Line
              label="Protein"
              value={`${protein.avgG} g average · ${protein.daysOnTarget}/${protein.loggedDays} days on target`}
            />
          )}
          {habits.loggedDays > 0 && (
            <Line label="Clear days" value={`${habits.clearDays} of ${habits.loggedDays} logged`} />
          )}
          {habits.sleepAvgHours !== null && (
            <Line label="Sleep" value={`${habits.sleepAvgHours.toFixed(1)} hours average`} />
          )}
          {measurements?.weightKg !== null && measurements?.weightKg !== undefined && (
            <Line
              label="Weight"
              value={`${measurements.weightKg} kg${
                measurements.weightDelta !== null
                  ? ` (${measurements.weightDelta > 0 ? '+' : ''}${measurements.weightDelta})`
                  : ''
              }`}
            />
          )}
          {regimen && regimen.due > 0 && (
            <Line label="Doses" value={`${regimen.taken} of ${regimen.due} ticked`} />
          )}
        </dl>
      )}

      {review.notes.length > 0 && (
        <ul className="mt-3.5 flex flex-col gap-2">
          {review.notes.map((note) => (
            <li key={note} className="flex gap-2.5 text-[0.9375rem] leading-snug text-ink-soft">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-walk" />
              {note}
            </li>
          ))}
        </ul>
      )}

      {review.discomfort.length > 0 && (
        <p className="mt-3 text-[0.875rem] leading-relaxed text-walk-deep">
          Discomfort logged{' '}
          {review.discomfort.map((entry) => `${entry.location} ${entry.severity}/5`).join(', ')}.
        </p>
      )}
    </div>
  );
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="tabular text-2xl leading-none" style={{ fontWeight: 800 }}>
        {value}
      </p>
      <p className="mt-1 text-[0.8125rem] text-ink-soft">{label}</p>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-[0.9375rem] text-ink-soft">{label}</dt>
      <dd className="text-right text-[0.9375rem]">{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export (P2, and the data half of P3's GDPR requirement)
// ---------------------------------------------------------------------------

const DATASETS = [
  { key: 'sessions', label: 'Sessions' },
  { key: 'daily', label: 'Daily habits' },
  { key: 'nutrition', label: 'Food' },
  { key: 'weekly', label: 'Measurements' },
  { key: 'plan', label: 'Plan weeks' },
  { key: 'regimen', label: 'Your list' },
  { key: 'doses', label: 'Doses' },
];

export function ExportCard() {
  return (
    <Card>
      <Eyebrow>Take your data</Eyebrow>
      <p className="mt-1.5 text-[0.9375rem] leading-snug text-ink-soft">
        Everything here is yours. The JSON file is the complete record; the CSVs open in any
        spreadsheet.
      </p>

      <a
        href="/api/account/export"
        download
        className="tap mt-3 flex items-center justify-center rounded-xl bg-ink px-5 font-medium text-chalk transition-colors hover:bg-ink/90"
      >
        Download everything (JSON)
      </a>

      <p className="mt-3.5 text-[0.75rem] tracking-wide text-ink-faint uppercase">As CSV</p>
      <ul className="mt-1.5 grid grid-cols-2 gap-2">
        {DATASETS.map((dataset) => (
          <li key={dataset.key}>
            <a
              href={`/api/account/export.csv?dataset=${dataset.key}`}
              download
              className="tap flex items-center justify-center rounded-xl border border-line bg-paper px-3 text-center text-[0.875rem] transition-colors hover:border-ink-faint"
            >
              {dataset.label}
            </a>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[0.75rem] leading-relaxed text-ink-faint">
        Exports are generated when you tap, and are never cached offline.
      </p>
    </Card>
  );
}
