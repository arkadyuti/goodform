import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  FOOD_RULE_LABELS,
  absorptionNotes,
  bandLabel,
  courseDaysRemaining,
  doseLabel,
  groupByBand,
  needsRefill,
  type DoseState,
  type RegimenItem,
} from '@goodform/shared';
import { useLogDose, useRegimenDue } from '../api/hooks.ts';
import { nowTime, today } from '../lib/date.ts';
import { Button, Card, Eyebrow } from './ui.tsx';

/**
 * P3.1's baseline: everything due today, on the screen the runner already
 * opens. It needs no permission, works offline, and is what the whole reminder
 * feature falls back to when a notification does not arrive — which is why it
 * says what is due rather than what was missed.
 */
export function DueNow() {
  const date = today();
  const [clock, setClock] = useState(nowTime);
  const { data, isPending } = useRegimenDue(date, clock);
  const log = useLogDose(date);

  // The overdue marks are a function of the clock, so the clock has to move.
  useEffect(() => {
    const timer = window.setInterval(() => setClock(nowTime()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  if (isPending || !data) return null;

  // The server's `overdue` was true when the query ran; the clock has moved
  // since. Recomputing here keeps the marks honest between refetches.
  const doses = data.doses.map((dose) => ({
    ...dose,
    overdue: dose.status === null && dose.dueTime < clock,
  }));

  const outstanding = doses.filter((dose) => dose.status === null);
  const done = doses.length - outstanding.length;
  const refills = data.items.filter(needsRefill);

  if (doses.length === 0 && data.asNeeded.length === 0 && data.finishedCourses.length === 0) return null;

  const groups = groupByBand(doses);

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <Eyebrow>To take today</Eyebrow>
        <Link to="/regimen" className="text-[0.8125rem] text-run underline underline-offset-4">
          Manage
        </Link>
      </div>

      {doses.length > 0 && (
        <p className="mt-1.5 text-[0.875rem] text-ink-soft">
          {outstanding.length === 0
            ? 'All ticked off.'
            : `${done} of ${doses.length} done${
                outstanding.some((d) => d.overdue) ? ' — some are past their time' : ''
              }.`}
        </p>
      )}

      {groups.map((group) => (
        <div key={group.band} className="mt-3">
          <p className="text-[0.75rem] tracking-wide text-ink-faint uppercase">{bandLabel(group.band)}</p>
          <ul className="mt-1 divide-y divide-line">
            {group.doses.map((dose) => (
              <DoseRow
                key={`${dose.item.id}-${dose.dueTime}`}
                dose={dose}
                onLog={(status) => log.mutate({ itemId: dose.item.id, dueTime: dose.dueTime, status })}
              />
            ))}
          </ul>
        </div>
      ))}

      {data.asNeeded.length > 0 && (
        <div className="mt-3">
          <p className="text-[0.75rem] tracking-wide text-ink-faint uppercase">As needed</p>
          <ul className="mt-1.5 flex flex-wrap gap-2">
            {data.asNeeded.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => log.mutate({ itemId: item.id, dueTime: null, status: 'taken' })}
                  className="tap rounded-xl border border-line bg-paper px-3.5 text-[0.875rem] transition-colors hover:border-ink-faint"
                >
                  Took {item.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.finishedCourses.map((item) => (
        <p key={item.id} className="mt-3 rounded-xl bg-chalk-deep px-3.5 py-3 text-[0.875rem] leading-relaxed text-ink-soft">
          <strong className="text-ink">{item.name}</strong> has finished its course. It has stopped appearing on
          its own — nothing to turn off.
        </p>
      ))}

      {refills.length > 0 && (
        <p className="mt-3 rounded-xl bg-walk-wash px-3.5 py-3 text-[0.875rem] leading-relaxed text-walk-deep">
          Running low on {refills.map((item) => item.name).join(', ')}. Worth reordering before it runs out.
        </p>
      )}

      <p className="mt-3 text-[0.75rem] leading-relaxed text-ink-faint">
        Notifications are best-effort on every phone. A dose showing here has not been missed — it just has not
        been ticked.
      </p>
    </Card>
  );
}

function DoseRow({ dose, onLog }: { dose: DoseState; onLog: (status: 'taken' | 'skipped') => void }) {
  const [showNotes, setShowNotes] = useState(false);
  const notes = absorptionNotes(dose.item);
  const item: RegimenItem = dose.item;
  const courseLeft = courseDaysRemaining(item, dose.dueDate);

  const detail = [doseLabel(item), FOOD_RULE_LABELS[item.foodRule], dose.dueTime].filter(Boolean).join(' · ');

  return (
    <li className="py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className={`truncate text-[0.9375rem] ${dose.status === 'skipped' ? 'text-ink-faint line-through' : ''}`}>
            {item.name}
            {item.kind === 'medicine' && (
              <span className="ml-1.5 rounded bg-chalk-deep px-1.5 py-0.5 text-[0.6875rem] tracking-wide text-ink-soft uppercase">
                medicine
              </span>
            )}
          </p>
          <p className={`text-[0.8125rem] ${dose.overdue ? 'text-walk-deep' : 'text-ink-faint'}`}>
            {detail}
            {dose.overdue && ' · still to tick'}
            {courseLeft !== null && courseLeft > 0 && ` · ${courseLeft} ${courseLeft === 1 ? 'day' : 'days'} left`}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {dose.status === null ? (
            <>
              <button
                onClick={() => onLog('skipped')}
                aria-label={`Skip ${item.name}`}
                className="tap rounded-xl border border-line bg-paper px-3 text-[0.875rem] text-ink-soft transition-colors hover:border-ink-faint"
              >
                Skip
              </button>
              <button
                onClick={() => {
                  if (notes.length > 0) setShowNotes(true);
                  onLog('taken');
                }}
                aria-label={`Mark ${item.name} taken`}
                className="tap rounded-xl bg-ink px-4 text-[0.875rem] text-chalk transition-colors hover:bg-ink/90"
              >
                Taken
              </button>
            </>
          ) : (
            <button
              onClick={() => onLog(dose.status === 'taken' ? 'skipped' : 'taken')}
              className={`tap rounded-xl px-3 text-[0.875rem] ${
                dose.status === 'taken' ? 'text-good' : 'text-ink-faint'
              }`}
            >
              {dose.status === 'taken' ? '✓ taken' : 'skipped'}
            </button>
          )}
        </div>
      </div>

      {/* Absorption notes arrive at the moment of logging, where they can still
          change what happens in the next few minutes. */}
      {showNotes && notes.length > 0 && (
        <div className="mt-2 rounded-xl bg-run-wash px-3.5 py-3">
          {notes.map((note) => (
            <p key={note.id} className="text-[0.8125rem] leading-relaxed text-run-deep">
              {note.text}
            </p>
          ))}
          <Button variant="quiet" className="mt-1 px-2 !text-run-deep" onClick={() => setShowNotes(false)}>
            Got it
          </Button>
        </div>
      )}
    </li>
  );
}
