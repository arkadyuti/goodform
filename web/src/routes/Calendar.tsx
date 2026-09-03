import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  severityHint,
  severityLabel,
  DISCOMFORT_LOCATIONS,
  EFFORT_LEVELS,
  effortHint,
  effortLabel,
  type DiscomfortLocation,
  type SessionType,
} from '@goodform/shared';
import {
  emptyLog,
  useBackfillSession,
  useCalendar,
  useDailyLog,
  useDeleteSession,
  useLogDose,
  usePlan,
  useProfile,
  useRegimenDue,
  useSaveDailyLog,
  useSaveWeeklyCheck,
  type CalendarDay,
} from '../api/hooks.ts';
import { shortDate, today } from '../lib/date.ts';
import {
  Button,
  Card,
  Choices,
  Eyebrow,
  Field,
  Note,
  Stepper,
  TextInput,
} from '../components/ui.tsx';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** `2026-08-25` → `[2026, 8]`. The caller always holds a real date string. */
function yearMonth(date: string): [number, number] {
  const [year, month] = date.split('-').map(Number);
  return [year ?? 1970, month ?? 1];
}

function monthEnd(date: string): string {
  const [year, month] = yearMonth(date);
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function addMonths(date: string, delta: number): string {
  const [year, month] = yearMonth(date);
  return `${new Date(Date.UTC(year, month - 1 + delta, 1)).toISOString().slice(0, 7)}-01`;
}

function monthLabel(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

/** Monday-first column for a date, matching the weekday header. */
function columnOf(date: string): number {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day === 0 ? 6 : day - 1;
}

/**
 * The month, and a way to fill in what was not logged at the time.
 *
 * Backfilling matters more here than in most trackers: the plan's gates are
 * computed from what is logged, so a week that actually went fine but was never
 * entered reads as two missed sessions and steps the runner backwards.
 */
export function Calendar() {
  const [month, setMonth] = useState(() => monthStart(today()));
  const [selected, setSelected] = useState<string | null>(today());

  const from = month;
  const to = monthEnd(month);
  const { data, isPending } = useCalendar(from, to);

  const days = data?.days ?? [];
  const byDate = useMemo(() => new Map(days.map((day) => [day.date, day])), [days]);
  const now = today();

  const leading = columnOf(from);
  const cells: (CalendarDay | null)[] = [...Array.from({ length: leading }, () => null), ...days];

  return (
    <div className="flex flex-col gap-5 pt-1">
      <header>
        <Eyebrow>Calendar</Eyebrow>
        <h1 className="mt-1 text-4xl" style={{ fontWeight: 780 }}>
          Fill in the gaps
        </h1>
        <p className="mt-2 leading-relaxed text-ink-soft">
          Anything you did but did not log can go in here. It is worth doing: the plan decides
          whether to advance from what is logged, so an unrecorded week looks exactly like a missed
          one.
        </p>
      </header>

      <Card>
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setMonth((m) => addMonths(m, -1))}
            aria-label="Previous month"
            className="tap rounded-lg px-2 text-ink-faint transition-colors hover:text-ink"
          >
            ←
          </button>
          <p className="text-[1.0625rem]" style={{ fontWeight: 600 }}>
            {monthLabel(month)}
          </p>
          <button
            onClick={() => setMonth((m) => addMonths(m, 1))}
            disabled={monthStart(now) <= month}
            aria-label="Next month"
            className="tap rounded-lg px-2 text-ink-faint transition-colors hover:text-ink disabled:opacity-30"
          >
            →
          </button>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-1">
          {WEEKDAYS.map((letter, i) => (
            <span key={i} className="pb-1 text-center text-[0.6875rem] text-ink-faint">
              {letter}
            </span>
          ))}
          {isPending
            ? Array.from({ length: 35 }, (_, i) => (
                <span key={i} className="h-12 rounded-lg bg-chalk-deep/40" />
              ))
            : cells.map((day, i) =>
                day === null ? (
                  <span key={`blank-${i}`} />
                ) : (
                  <DayCell
                    key={day.date}
                    day={day}
                    isToday={day.date === now}
                    isFuture={day.date > now}
                    selected={selected === day.date}
                    onSelect={() => setSelected(day.date)}
                  />
                ),
              )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6875rem] text-ink-soft">
          <Key className="bg-run" label="run logged" />
          <Key className="bg-walk" label="strength logged" />
          <Key className="bg-alert" label="discomfort 4 or above" />
          <Key className="bg-run/20" label="scheduled, nothing logged" />
          <Key className="bg-ink/25" label="habits logged" />
          <Key className="bg-good" label="every dose taken" />
        </div>
      </Card>

      {selected && byDate.get(selected) && (
        <DayEditor key={selected} day={byDate.get(selected)!} isFuture={selected > now} />
      )}

      <Link
        to="/history"
        className="text-center text-[0.875rem] text-run underline underline-offset-4"
      >
        See sessions in detail
      </Link>
    </div>
  );
}

function Key({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${className}`} />
      {label}
    </span>
  );
}

function DayCell({
  day,
  isToday,
  isFuture,
  selected,
  onSelect,
}: {
  day: CalendarDay;
  isToday: boolean;
  isFuture: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const done = day.sessions.filter((s) => s.completion !== 'skipped');
  const runDone = done.some((s) => s.type === 'run' || s.type === 'baseline');
  const strengthDone = done.some((s) => s.type === 'strength');
  const hasLog = Boolean(
    day.log &&
    (day.log.waterMl > 0 ||
      day.log.sleepHours !== null ||
      day.log.cigarettes > 0 ||
      day.log.beers > 0 ||
      day.log.alcoholUnits > 0),
  );
  const sore = day.sessions.some((s) => (s.discomfortSeverity ?? 0) >= 4);

  // An unfilled day that asked for something is the whole point of the screen,
  // so it is drawn as a faint ghost of what it should have been.
  // `scheduled` is null before the plan started, and those days asked for
  // nothing, so they are not gaps to fill.
  const expected =
    !isFuture && !runDone && !strengthDone && day.scheduled !== 'rest' && day.scheduled !== null;

  return (
    <button
      onClick={onSelect}
      aria-label={`${shortDate(day.date)}${runDone || strengthDone ? ', session logged' : expected ? ', session not logged' : ''}`}
      aria-pressed={selected}
      className={`tap flex !min-h-12 !min-w-0 flex-col items-center justify-center gap-1 rounded-lg border transition-colors ${
        selected ? 'border-ink bg-chalk-deep' : 'border-transparent hover:bg-chalk-deep/60'
      } ${isFuture ? 'opacity-40' : ''}`}
    >
      <span
        className={`text-[0.8125rem] leading-none ${
          isToday ? 'font-bold text-ink' : 'text-ink-soft'
        }`}
      >
        {Number(day.date.slice(8))}
      </span>
      <span className="flex h-2.5 items-center gap-[3px]">
        {runDone && <span className={`h-2 w-2 rounded-full ${sore ? 'bg-alert' : 'bg-run'}`} />}
        {strengthDone && <span className="h-2 w-2 rounded-full bg-walk" />}
        {expected && (
          <span
            className={`h-2 w-2 rounded-full ${day.scheduled === 'run' ? 'bg-run/20' : 'bg-walk/20'}`}
          />
        )}
        {hasLog && <span className="h-1.5 w-1.5 rounded-full bg-ink/25" />}
        {day.doses.due > 0 && day.doses.taken >= day.doses.due && (
          <span className="h-1.5 w-1.5 rounded-full bg-good" />
        )}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// One day, editable
// ---------------------------------------------------------------------------

function DayEditor({ day, isFuture }: { day: CalendarDay; isFuture: boolean }) {
  const date = day.date;
  const { data: logData } = useDailyLog(date);
  const saveLog = useSaveDailyLog(date);
  const { data: profileData } = useProfile();
  const settings = profileData?.settings;
  const log = logData?.log ?? day.log ?? emptyLog(date);
  const tracked = settings?.trackedHabits ?? ['water', 'sleep', 'beer', 'alcohol', 'cigarettes'];

  const full = new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  if (isFuture) {
    return (
      <Card>
        <Eyebrow as="h2">{full}</Eyebrow>
        <p className="mt-2 leading-snug text-ink-soft">
          Still to come. There is nothing to fill in for a day that has not happened.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <Eyebrow as="h2">{full}</Eyebrow>
        <p className="mt-1 text-[0.875rem] text-ink-soft">
          {day.scheduled === null
            ? 'Before your plan started'
            : day.scheduled === 'rest'
              ? 'Rest day'
              : day.scheduled === 'run'
                ? 'Running day'
                : 'Strength day'}
          {day.proteinG > 0 && ` · ${day.proteinG} g protein logged`}
        </p>
      </Card>

      <SessionBackfill day={day} />

      <Card>
        <Eyebrow as="h2">Habits that day</Eyebrow>
        <div className="mt-1 divide-y divide-line">
          {tracked.includes('water') && (
            <Stepper
              label="Water"
              value={log.waterMl}
              unit="ml"
              step={250}
              max={10000}
              onChange={(waterMl) => saveLog.mutate({ waterMl })}
            />
          )}
          {tracked.includes('sleep') && (
            <Stepper
              label="Sleep"
              value={log.sleepHours ?? 0}
              unit="hours"
              step={0.5}
              max={24}
              onChange={(sleepHours) => saveLog.mutate({ sleepHours })}
            />
          )}
          {tracked.includes('cigarettes') && (
            <Stepper
              label="Cigarettes"
              value={log.cigarettes}
              max={100}
              onChange={(cigarettes) => saveLog.mutate({ cigarettes })}
            />
          )}
          {tracked.includes('beer') && (
            <Stepper
              label="Beer"
              value={log.beers}
              unit={log.beers === 1 ? 'drink' : 'drinks'}
              max={50}
              onChange={(beers) => saveLog.mutate({ beers })}
            />
          )}
          {tracked.includes('alcohol') && (
            <Stepper
              label="Other alcohol"
              hint="One unit is roughly a 30ml peg of spirits, half a glass of wine, or a third of a pint."
              value={log.alcoholUnits}
              unit="units"
              max={50}
              onChange={(alcoholUnits) => saveLog.mutate({ alcoholUnits })}
            />
          )}
          {(settings?.customHabits ?? []).map((habit) => (
            <Stepper
              key={habit.key}
              label={habit.label}
              value={log.customHabits[habit.key] ?? 0}
              unit={habit.unit}
              onChange={(next) =>
                saveLog.mutate({ ...log, customHabits: { ...log.customHabits, [habit.key]: next } })
              }
            />
          ))}
        </div>
      </Card>

      <DoseBackfill date={date} />
      <MeasurementBackfill day={day} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

const SEVERITIES = [1, 2, 3, 4, 5];

function SessionBackfill({ day }: { day: CalendarDay }) {
  const backfill = useBackfillSession();
  const remove = useDeleteSession();
  const { data: planData } = usePlan();
  const [adding, setAdding] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [entryId, setEntryId] = useState(() => crypto.randomUUID());

  const [type, setType] = useState<SessionType>(day.scheduled === 'strength' ? 'strength' : 'run');
  const [completion, setCompletion] = useState<'full' | 'partial' | 'skipped'>('full');
  const [effort, setEffort] = useState(3);
  const [minutes, setMinutes] = useState('');
  const [location, setLocation] = useState<DiscomfortLocation | null>(null);
  const [severity, setSeverity] = useState(0);

  const plan = planData?.plan ?? null;
  const weeks = planData?.weeks ?? [];

  // Attach the week the date actually falls in, so a backfilled run counts
  // towards that week's gate and shows up on the trend charts.
  const planWeek = useMemo(() => {
    if (!plan || day.date < plan.startDate) return null;
    // The week whose current attempt had begun by that date. Windows move when
    // a week comes round again, so counting sevens from the start date put a
    // backfilled run in a week the plan had not reached.
    let chosen: (typeof weeks)[number] | null = null;
    for (const week of weeks) {
      if (!week.startedOn || week.startedOn > day.date) continue;
      if (!chosen?.startedOn || week.startedOn > chosen.startedOn) chosen = week;
    }
    return chosen ?? weeks[0] ?? null;
  }, [plan, weeks, day.date]);

  const save = async () => {
    setSaveError(null);
    try {
      await doSave();
    } catch {
      setSaveError('That did not save. Nothing was lost — try again.');
    }
  };

  const doSave = async () => {
    await backfill.mutateAsync({
      // One id per open form, not per tap. Offline the write is queued and
      // resolves, but the list above still reads "nothing logged" — so the
      // obvious thing to do is enter it again, and a fresh id each time meant
      // two rows on the next flush. On a screen whose whole purpose is that an
      // unlogged week steps the plan backwards, double-counting is worse.
      id: entryId,
      date: day.date,
      type,
      planId: type === 'run' ? (plan?.id ?? null) : null,
      planWeek: type === 'run' ? (planWeek?.index ?? null) : null,
      prescription:
        type === 'run' && planWeek
          ? { runSec: planWeek.runSec, walkSec: planWeek.walkSec, reps: planWeek.reps }
          : null,
      completion,
      effort,
      discomfort:
        location && severity > 0 ? { location, severity: severity as 1 | 2 | 3 | 4 | 5 } : null,
      intervalsCompleted:
        type === 'run' && planWeek ? (completion === 'full' ? planWeek.reps : null) : null,
      durationSec: minutes ? Math.round(Number(minutes) * 60) : null,
      notes: 'Added later from the calendar',
    });
    setAdding(false);
    // A new id for the next entry, so two genuinely different sessions on one
    // day stay two.
    setEntryId(crypto.randomUUID());
    setMinutes('');
    setLocation(null);
    setSeverity(0);
  };

  return (
    <Card>
      <Eyebrow as="h2">Sessions</Eyebrow>

      {day.sessions.length > 0 ? (
        <ul className="mt-1 divide-y divide-line">
          {day.sessions.map((session) => (
            <LoggedSession
              key={session.id}
              session={session}
              onRemove={() => remove.mutate(session.id)}
              removing={remove.isPending}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 text-[0.9375rem] text-ink-soft">
          {day.scheduled === null
            ? 'This is before your plan began. You can still record something you did.'
            : day.scheduled === 'rest'
              ? 'Nothing was scheduled. You can still add one.'
              : 'Nothing logged, and this day asked for something.'}
        </p>
      )}

      {!adding ? (
        <Button variant="secondary" full className="mt-3" onClick={() => setAdding(true)}>
          Add a session
        </Button>
      ) : (
        <div className="mt-3 flex flex-col gap-3.5">
          <div>
            <span className="eyebrow">What was it</span>
            <div className="mt-1.5">
              <Choices
                columns={2}
                value={[type]}
                onChange={([v]) => v && setType(v)}
                options={[
                  { value: 'run' as const, label: 'Run' },
                  { value: 'strength' as const, label: 'Strength' },
                ]}
              />
            </div>
          </div>

          <div>
            <span className="eyebrow">How it ended</span>
            <div className="mt-1.5">
              <Choices
                columns={2}
                value={[completion]}
                onChange={([v]) => v && setCompletion(v)}
                options={[
                  { value: 'full' as const, label: 'Finished it' },
                  { value: 'partial' as const, label: 'Cut it short' },
                  // A day you chose to take off is not a gap in the record.
                  { value: 'skipped' as const, label: 'Decided not to' },
                ]}
              />
            </div>
          </div>

          {/* None of what follows means anything about a session that did not
              happen, so it is not asked. */}
          {completion !== 'skipped' && (
            <>
              <div>
                <span className="eyebrow">How hard was it</span>
                <div className="mt-1.5 flex gap-1.5">
                  {EFFORT_LEVELS.map((level) => (
                    <button
                      key={level.value}
                      type="button"
                      aria-pressed={effort === level.value}
                      aria-label={`${level.value} of 5 — ${level.label}`}
                      onClick={() => setEffort(level.value)}
                      className={`tap flex-1 rounded-xl border text-[0.9375rem] transition-colors ${
                        effort === level.value
                          ? 'border-ink bg-ink text-chalk'
                          : 'border-line bg-paper hover:border-ink-faint'
                      }`}
                    >
                      {level.value}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[0.8125rem] leading-snug text-ink-faint">
                  <strong className="text-ink-soft">{effortLabel(effort)}</strong> —{' '}
                  {effortHint(effort)}. Recorded for your own reading of the block; it does not
                  change the plan.
                </p>
              </div>

              <Field label="Minutes" hint="Optional">
                <TextInput
                  type="number"
                  inputMode="numeric"
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                />
              </Field>

              <div>
                <span className="eyebrow">Any discomfort</span>
                <p className="mt-0.5 text-[0.8125rem] leading-snug text-ink-soft">
                  Unlike effort, this does move the plan: 3 twice in a week repeats it, 4 or above
                  pauses it.
                </p>
                <div className="mt-1.5">
                  <Choices
                    columns={2}
                    value={location ? [location] : []}
                    onChange={([v]) => setLocation(v === location ? null : (v ?? null))}
                    options={DISCOMFORT_LOCATIONS.map((site) => ({ value: site, label: site }))}
                  />
                </div>
                {location && (
                  <div className="mt-2 flex gap-1.5">
                    {SEVERITIES.map((n) => (
                      <button
                        key={n}
                        type="button"
                        aria-pressed={severity === n}
                        aria-label={`Severity ${n} of 5`}
                        onClick={() => setSeverity(n)}
                        className={`tap flex-1 rounded-xl border text-[0.9375rem] transition-colors ${
                          severity === n
                            ? n >= 4
                              ? 'border-alert bg-alert text-white'
                              : 'border-walk bg-walk text-ink'
                            : 'border-line bg-paper hover:border-ink-faint'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                )}
                {location && (
                  <p className="mt-1.5 text-[0.9375rem] leading-snug">
                    <span style={{ fontWeight: 600 }}>{severityLabel(severity)}</span>
                    <span className="text-ink-soft"> — {severityHint(severity)}</span>
                  </p>
                )}
              </div>

              {location && severity >= 4 && (
                <Note tone="alert">
                  Logging a 4 or above will pause progression, exactly as it would have at the time.
                  That is the point of recording it honestly.
                </Note>
              )}
            </>
          )}

          <div className="flex gap-2.5">
            <Button full disabled={backfill.isPending} onClick={save}>
              Save it
            </Button>
            <Button variant="quiet" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
          {saveError && <Note tone="alert">{saveError}</Note>}
        </div>
      )}
    </Card>
  );
}

/**
 * A logged session, with removal behind a confirmation.
 *
 * Deleting one is not a small thing: it destroys the only record of a session
 * and silently changes what the week's gate decides. A stray thumb on a phone
 * should not be able to do that, so the × asks first.
 */
function LoggedSession({
  session,
  onRemove,
  removing,
}: {
  session: CalendarDay['sessions'][number];
  onRemove: () => void;
  removing: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);

  // Move into the confirmation when it opens, and back to the × when it
  // closes. Without this, opening it left focus on a button that had just been
  // disabled and closing it dropped focus to the document — a keyboard user had
  // to tab the whole page back to where they were.
  useEffect(() => {
    if (confirming) keepRef.current?.focus();
  }, [confirming]);

  const name =
    session.type === 'strength' ? 'Strength' : session.type === 'baseline' ? 'Baseline run' : 'Run';
  const detail =
    [
      session.durationSec ? `${Math.round(session.durationSec / 60)} min` : null,
      session.effort ? `effort ${session.effort}/5` : null,
      session.discomfortSeverity
        ? `${session.discomfortLocation} ${session.discomfortSeverity}/5`
        : null,
    ]
      .filter(Boolean)
      .join(' · ') || 'No detail recorded';

  return (
    <li className="py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.9375rem]">
            {name}
            <span className="ml-2 text-[0.8125rem] text-ink-faint">
              {session.completion === 'full'
                ? 'finished'
                : session.completion === 'partial'
                  ? 'cut short'
                  : 'skipped'}
            </span>
          </p>
          <p className="text-[0.8125rem] text-ink-faint">{detail}</p>
        </div>
        {/* Disabled rather than unmounted: removing the focused element is
            what dropped focus to the document in the first place. */}
        <button
          ref={triggerRef}
          type="button"
          disabled={confirming}
          onClick={() => setConfirming(true)}
          aria-label={`Remove this ${name.toLowerCase()} session`}
          aria-expanded={confirming}
          className="tap shrink-0 rounded-lg px-2 text-ink-faint transition-colors hover:text-alert disabled:opacity-40"
        >
          ×
        </button>
      </div>

      {confirming && (
        <div
          className="mt-2.5 rounded-xl border border-alert bg-alert-wash p-3.5"
          // Not `alertdialog`: this is an inline panel, not a modal, and
          // claiming the role without trapping focus or handling Escape
          // promises behaviour it does not have. `alert` announces it, which
          // is the part that was actually wanted.
          role="alert"
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            event.stopPropagation();
            setConfirming(false);
            triggerRef.current?.focus();
          }}
        >
          <p className="text-[0.9375rem] leading-snug">
            Remove this {name.toLowerCase()} session? It cannot be undone, and it will change what
            your week&apos;s review decides.
          </p>
          <div className="mt-3 flex gap-2.5">
            {/* The safe way out is the wider, first-reached control. */}
            <Button
              ref={keepRef}
              variant="secondary"
              full
              onClick={() => {
                setConfirming(false);
                triggerRef.current?.focus();
              }}
            >
              Keep it
            </Button>
            <Button variant="alert" disabled={removing} onClick={onRemove}>
              Remove
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Doses and measurements
// ---------------------------------------------------------------------------

function DoseBackfill({ date }: { date: string }) {
  // 23:59 asks for the whole day; nothing on a past day is "overdue" any more.
  const { data } = useRegimenDue(date, '23:59');
  const log = useLogDose(date);

  if (!data || data.doses.length === 0) return null;

  return (
    <Card>
      <Eyebrow as="h2">Doses that day</Eyebrow>
      <ul className="mt-1 divide-y divide-line">
        {data.doses.map((dose) => (
          <li
            key={`${dose.item.id}-${dose.dueTime}`}
            className="flex items-center justify-between gap-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-[0.9375rem]">{dose.item.name}</p>
              <p className="text-[0.8125rem] text-ink-faint">{dose.dueTime}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() =>
                  log.mutate({ itemId: dose.item.id, dueTime: dose.dueTime, status: 'skipped' })
                }
                className={`tap rounded-xl border px-3 text-[0.875rem] transition-colors ${
                  dose.status === 'skipped'
                    ? 'border-walk bg-walk-wash text-walk-deep'
                    : 'border-line bg-paper text-ink-soft hover:border-ink-faint'
                }`}
              >
                Skipped
              </button>
              <button
                onClick={() =>
                  log.mutate({ itemId: dose.item.id, dueTime: dose.dueTime, status: 'taken' })
                }
                className={`tap rounded-xl px-4 text-[0.875rem] transition-colors ${
                  dose.status === 'taken'
                    ? 'bg-good text-white'
                    : 'bg-ink text-chalk hover:bg-ink/90'
                }`}
              >
                Took it
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function MeasurementBackfill({ day }: { day: CalendarDay }) {
  const save = useSaveWeeklyCheck(day.date);
  const [open, setOpen] = useState(false);
  const [weight, setWeight] = useState(day.check?.weightKg ? String(day.check.weightKg) : '');
  const [waist, setWaist] = useState(day.check?.waistCm ? String(day.check.waistCm) : '');
  const [hr, setHr] = useState(day.check?.restingHr ? String(day.check.restingHr) : '');

  if (!open && !day.check) {
    return (
      <Button variant="quiet" full className="py-3" onClick={() => setOpen(true)}>
        Add measurements for this day
      </Button>
    );
  }

  return (
    <Card>
      <Eyebrow as="h2">Measurements</Eyebrow>
      <div className="mt-2 grid grid-cols-3 gap-2.5">
        <Field label="Weight kg">
          <TextInput
            type="number"
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
        </Field>
        <Field label="Waist cm">
          <TextInput
            type="number"
            inputMode="decimal"
            value={waist}
            onChange={(e) => setWaist(e.target.value)}
          />
        </Field>
        <Field label="Resting heart rate" hint="Beats per minute, taken before you get out of bed.">
          <TextInput
            type="number"
            inputMode="numeric"
            value={hr}
            onChange={(e) => setHr(e.target.value)}
          />
        </Field>
      </div>
      <Button
        full
        className="mt-3"
        disabled={save.isPending}
        onClick={() =>
          save.mutate({
            weightKg: weight ? Number(weight) : null,
            waistCm: waist ? Number(waist) : null,
            restingHr: hr ? Number(hr) : null,
          })
        }
      >
        Save measurements
      </Button>
      <p className="mt-2 text-[0.75rem] leading-relaxed text-ink-faint">
        A backdated weight updates your protein target, same as one entered on the day.
      </p>
    </Card>
  );
}
