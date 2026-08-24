import { useDailyRange, useProgress } from '../api/hooks.ts';
import { shiftDays, shortDate, today } from '../lib/date.ts';
import { Card, Eyebrow, Note } from '../components/ui.tsx';
import { formatMinutes } from '../components/IntervalRibbon.tsx';

export function Progress() {
  const { data } = useProgress();
  const { data: rangeData } = useDailyRange(shiftDays(today(), -28));

  if (!data) return <p className="eyebrow pt-6">Loading</p>;

  const { adherence, longestRunSec, discomfort, checks } = data;
  const logs = rangeData?.logs ?? [];
  const cigarettes = logs.reduce((sum, l) => sum + l.cigarettes, 0);
  const alcohol = logs.reduce((sum, l) => sum + l.alcoholUnits, 0);

  return (
    <div className="flex flex-col gap-5 pt-1">
      <header>
        <Eyebrow>Progress</Eyebrow>
        <h1 className="mt-1 text-4xl" style={{ fontWeight: 780 }}>
          What has actually changed
        </h1>
      </header>

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
      </Card>

      {(cigarettes > 0 || alcohol > 0 || logs.length > 0) && (
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
                {Math.round(alcohol)}
              </p>
              <p className="mt-1 text-[0.8125rem] text-ink-soft">alcohol units</p>
            </div>
            <div>
              <p className="tabular text-3xl leading-none" style={{ fontWeight: 800 }}>
                {logs.filter((l) => l.cigarettes === 0 && l.alcoholUnits === 0).length}
              </p>
              <p className="mt-1 text-[0.8125rem] text-ink-soft">clear days</p>
            </div>
          </div>
        </Card>
      )}

      {checks.length > 0 && (
        <Card>
          <Eyebrow>Measurements</Eyebrow>
          <table className="mt-2 w-full text-[0.9375rem]">
            <thead>
              <tr className="text-left text-[0.75rem] tracking-wide text-ink-faint uppercase">
                <th className="pb-1.5 font-medium">Date</th>
                <th className="pb-1.5 text-right font-medium">Weight</th>
                <th className="pb-1.5 text-right font-medium">Waist</th>
                <th className="pb-1.5 text-right font-medium">Rest HR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {checks.slice(0, 8).map((check) => (
                <tr key={check.date}>
                  <td className="py-1.5">{shortDate(check.date)}</td>
                  <td className="tabular py-1.5 text-right">{check.weightKg ?? '–'}</td>
                  <td className="tabular py-1.5 text-right">{check.waistCm ?? '–'}</td>
                  <td className="tabular py-1.5 text-right">{check.restingHr ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card>
        <Eyebrow>Discomfort</Eyebrow>
        {discomfort.length === 0 ? (
          <p className="mt-2 leading-snug text-ink-soft">Nothing logged. That is the outcome we are after.</p>
        ) : (
          <>
            <p className="mt-1.5 text-[0.875rem] leading-snug text-ink-soft">
              The same place appearing repeatedly is the earliest warning of an overuse injury — earlier than
              pain that stops you.
            </p>
            <ul className="mt-3 flex flex-col gap-1.5">
              {discomfort.slice(0, 12).map((entry, i) => (
                <li key={i} className="flex items-center gap-3">
                  <span className="w-14 shrink-0 text-[0.8125rem] text-ink-faint">{shortDate(entry.date)}</span>
                  <span className="w-16 shrink-0 text-[0.875rem] capitalize">{entry.location}</span>
                  <span className="flex gap-1" aria-label={`Severity ${entry.severity} of 5`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span
                        key={n}
                        className={`h-2.5 w-2.5 rounded-full ${
                          n <= entry.severity ? (entry.severity >= 4 ? 'bg-alert' : 'bg-walk') : 'bg-chalk-deep'
                        }`}
                      />
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Note>
        Waist and resting heart rate respond long before weight does. Weight holding steady while your waist
        comes down is the result to want.
      </Note>
    </div>
  );
}
