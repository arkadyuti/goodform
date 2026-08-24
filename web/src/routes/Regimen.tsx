import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  DOSE_FORMS,
  FOOD_RULE_LABELS,
  absorptionNotes,
  courseDaysRemaining,
  daysOfSupply,
  doseLabel,
  needsRefill,
  scheduleSummary,
  type DoseForm,
  type FoodRule,
  type ItemKind,
  type RegimenItem,
  type ScheduleKind,
} from '@goodform/shared';
import {
  useArchiveRegimenItem,
  useRefillRegimenItem,
  useRegimenHistory,
  useRegimenItems,
  useRestoreRegimenItem,
  useSaveRegimenItem,
  type RegimenItemInput,
} from '../api/hooks.ts';
import { shiftDays, shortDate, today } from '../lib/date.ts';
import { AdherenceStrip } from '../components/Chart.tsx';
import { Button, Card, Choices, Eyebrow, Field, Note, TextInput } from '../components/ui.tsx';

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function Regimen() {
  const [editing, setEditing] = useState<RegimenItem | 'new' | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const { data, isPending } = useRegimenItems(showArchived);
  const { data: history } = useRegimenHistory(shiftDays(today(), -27));

  const items = data?.items ?? [];
  const live = items.filter((i) => !i.archivedAt);
  const archived = items.filter((i) => i.archivedAt);
  const medicines = live.filter((i) => i.kind === 'medicine');
  const supplements = live.filter((i) => i.kind === 'supplement');

  if (editing) {
    return (
      <ItemForm
        item={editing === 'new' ? null : editing}
        onDone={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5 pt-1">
      <header>
        <Eyebrow>Your list</Eyebrow>
        <h1 className="mt-1 text-4xl" style={{ fontWeight: 780 }}>
          What you take
        </h1>
        <p className="mt-2 leading-relaxed text-ink-soft">
          Medicines and supplements are not the same thing here. A missed shake is nothing; a missed course is
          not, and GoodForm treats the two differently.
        </p>
      </header>

      <Button full className="py-3.5" onClick={() => setEditing('new')}>
        Add something
      </Button>

      {isPending && <div className="min-h-[40dvh]" aria-busy="true" aria-label="Loading your list" />}

      {!isPending && live.length === 0 && (
        <Card>
          <Eyebrow>Nothing here yet</Eyebrow>
          <p className="mt-2 leading-snug">
            Add a tablet, a scoop or a course, and it will appear on Today grouped by when you take it.
          </p>
        </Card>
      )}

      {medicines.length > 0 && (
        <Group title="Medicines" items={medicines} history={history?.items ?? []} onEdit={setEditing} />
      )}
      {supplements.length > 0 && (
        <Group title="Supplements" items={supplements} history={history?.items ?? []} onEdit={setEditing} />
      )}

      <Note>
        GoodForm does not check for drug interactions, and never suggests starting, stopping or changing a
        medicine. It surfaces a handful of absorption notes and reminds you of a routine you already have. Your
        doctor and your pharmacist are the people for everything else.
      </Note>

      <div>
        <Button variant="quiet" full className="py-3" onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? 'Hide stopped items' : 'Show stopped items'}
        </Button>
        {showArchived && archived.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1.5">
            {archived.map((item) => (
              <ArchivedRow key={item.id} item={item} />
            ))}
          </ul>
        )}
        {showArchived && archived.length === 0 && (
          <p className="mt-2 text-center text-[0.875rem] text-ink-faint">Nothing stopped.</p>
        )}
      </div>

      <Link to="/progress" className="text-center text-[0.875rem] text-run underline underline-offset-4">
        See adherence over time
      </Link>
    </div>
  );
}

function Group({
  title,
  items,
  history,
  onEdit,
}: {
  title: string;
  items: RegimenItem[];
  history: { item: RegimenItem; adherence: { taken: number; due: number }; days: { date: string; taken: number; skipped: number; missed: number }[] }[];
  onEdit: (item: RegimenItem) => void;
}) {
  return (
    <section>
      <Eyebrow>{title}</Eyebrow>
      <ul className="mt-2 flex flex-col gap-2.5">
        {items.map((item) => (
          <li key={item.id}>
            <ItemRow item={item} history={history.find((h) => h.item.id === item.id)} onEdit={() => onEdit(item)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ItemRow({
  item,
  history,
  onEdit,
}: {
  item: RegimenItem;
  history?: { adherence: { taken: number; due: number }; days: { date: string; taken: number; skipped: number; missed: number }[] };
  onEdit: () => void;
}) {
  const refill = useRefillRegimenItem();
  const [refilling, setRefilling] = useState(false);
  const [doses, setDoses] = useState('');

  const daysLeft = courseDaysRemaining(item, today());
  const supplyDays = daysOfSupply(item);
  const dose = doseLabel(item);
  const notes = absorptionNotes(item);

  return (
    <Card className={item.kind === 'medicine' ? 'border-ink' : ''}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[1.0625rem]" style={{ fontWeight: 600 }}>
            {item.name}
          </p>
          <p className="mt-0.5 text-[0.8125rem] text-ink-soft">
            {[dose, scheduleSummary(item), FOOD_RULE_LABELS[item.foodRule]].filter(Boolean).join(' · ')}
          </p>
        </div>
        <button onClick={onEdit} className="tap shrink-0 rounded-lg px-2 text-[0.875rem] text-run underline underline-offset-4">
          Edit
        </button>
      </div>

      {daysLeft !== null && (
        <p className={`mt-2 text-[0.875rem] ${daysLeft <= 2 ? 'text-alert' : 'text-walk-deep'}`}>
          {daysLeft === 0
            ? 'Course finished — this stops on its own.'
            : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left on this course, to ${shortDate(item.courseEnd!)}.`}
        </p>
      )}

      {item.supplyCount !== null && (
        <p className={`mt-1.5 text-[0.875rem] ${needsRefill(item) ? 'text-alert' : 'text-ink-soft'}`}>
          {item.supplyCount} left{supplyDays !== null && ` — about ${supplyDays} ${supplyDays === 1 ? 'day' : 'days'}`}
          {needsRefill(item) && '. Worth reordering now.'}
        </p>
      )}

      {notes.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {notes.map((note) => (
            <li key={note.id} className="flex gap-2 text-[0.8125rem] leading-snug text-ink-soft">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-walk" />
              {note.text}
            </li>
          ))}
        </ul>
      )}

      {history && history.adherence.due > 0 && (
        <div className="mt-3">
          <div className="flex items-baseline justify-between text-[0.75rem] text-ink-faint">
            <span>Last four weeks</span>
            <span className="tabular">
              {history.adherence.taken} of {history.adherence.due}
            </span>
          </div>
          <div className="mt-1">
            <AdherenceStrip
              days={history.days}
              label={`${item.name}: ${history.adherence.taken} of ${history.adherence.due} doses ticked in the last four weeks`}
            />
          </div>
        </div>
      )}

      {item.supplyCount !== null &&
        (refilling ? (
          <div className="mt-3 flex gap-2.5">
            <TextInput
              type="number"
              inputMode="numeric"
              autoFocus
              placeholder="Doses in the new packet"
              value={doses}
              onChange={(e) => setDoses(e.target.value)}
            />
            <Button
              variant="secondary"
              disabled={!doses}
              onClick={async () => {
                await refill.mutateAsync({ id: item.id, doses: Number(doses) });
                setDoses('');
                setRefilling(false);
              }}
            >
              Save
            </Button>
          </div>
        ) : (
          <Button variant="quiet" className="mt-2 px-2" onClick={() => setRefilling(true)}>
            Refilled
          </Button>
        ))}
    </Card>
  );
}

function ArchivedRow({ item }: { item: RegimenItem }) {
  const restore = useRestoreRegimenItem();
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-line bg-chalk px-3.5 py-2.5">
      <span className="min-w-0">
        <span className="block truncate text-[0.9375rem]">{item.name}</span>
        <span className="block text-[0.8125rem] text-ink-faint">
          Stopped {item.archivedAt ? shortDate(item.archivedAt.slice(0, 10)) : ''} — history kept
        </span>
      </span>
      <button
        onClick={() => restore.mutate(item.id)}
        className="tap shrink-0 rounded-lg px-2 text-[0.875rem] text-run underline underline-offset-4"
      >
        Start again
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Add / edit
// ---------------------------------------------------------------------------

const SCHEDULE_OPTIONS: { value: ScheduleKind; label: string; hint: string }[] = [
  { value: 'daily', label: 'Every day', hint: 'The usual answer.' },
  { value: 'weekdays', label: 'Certain days', hint: 'Pick the days of the week.' },
  { value: 'interval', label: 'Every few days', hint: 'A weekly injection, a fortnightly dose.' },
  { value: 'as_needed', label: 'As needed', hint: 'Never due, logged when taken.' },
];

const FOOD_OPTIONS: { value: FoodRule; label: string }[] = [
  { value: 'none', label: 'No rule' },
  { value: 'with_food', label: 'With food' },
  { value: 'empty_stomach', label: 'Empty stomach' },
  { value: 'before_bed', label: 'Before bed' },
];

function ItemForm({ item, onDone }: { item: RegimenItem | null; onDone: () => void }) {
  const save = useSaveRegimenItem();
  const archive = useArchiveRegimenItem();

  const [name, setName] = useState(item?.name ?? '');
  const [kind, setKind] = useState<ItemKind>(item?.kind ?? 'supplement');
  const [doseAmount, setDoseAmount] = useState(item?.doseAmount === null || item === null ? '' : String(item.doseAmount));
  const [doseForm, setDoseForm] = useState<DoseForm>(item?.doseForm ?? 'tablet');
  const [scheduleKind, setScheduleKind] = useState<ScheduleKind>(item?.scheduleKind ?? 'daily');
  const [weekdays, setWeekdays] = useState<number[]>(item?.weekdays ?? []);
  const [intervalDays, setIntervalDays] = useState(String(item?.intervalDays ?? 2));
  const [times, setTimes] = useState<string[]>(item?.times ?? ['08:00']);
  const [foodRule, setFoodRule] = useState<FoodRule>(item?.foodRule ?? 'none');
  const [isCourse, setIsCourse] = useState(Boolean(item?.courseEnd));
  const [courseStart, setCourseStart] = useState(item?.courseStart ?? today());
  const [courseEnd, setCourseEnd] = useState(item?.courseEnd ?? shiftDays(today(), 6));
  const [countSupply, setCountSupply] = useState(item?.supplyCount !== null && item !== null);
  const [supplyCount, setSupplyCount] = useState(item?.supplyCount === null || item === null ? '' : String(item.supplyCount));
  const [remindersEnabled, setRemindersEnabled] = useState(item?.remindersEnabled ?? true);
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo<RegimenItem>(
    () => ({
      id: 'preview',
      name: name || 'This item',
      kind,
      doseAmount: doseAmount ? Number(doseAmount) : null,
      doseForm,
      scheduleKind,
      weekdays,
      intervalDays: Number(intervalDays) || 1,
      anchorDate: item?.anchorDate ?? today(),
      times,
      foodRule,
      courseStart: isCourse ? courseStart : null,
      courseEnd: isCourse ? courseEnd : null,
      supplyCount: countSupply && supplyCount ? Number(supplyCount) : null,
      remindersEnabled,
      notes: notes || null,
      archivedAt: null,
    }),
    [name, kind, doseAmount, doseForm, scheduleKind, weekdays, intervalDays, times, foodRule, isCourse, courseStart, courseEnd, countSupply, supplyCount, remindersEnabled, notes, item],
  );

  const submit = async () => {
    setError(null);
    if (!name.trim()) return setError('Give it a name.');
    if (scheduleKind === 'weekdays' && weekdays.length === 0) return setError('Pick at least one day.');
    if (scheduleKind !== 'as_needed' && times.length === 0) return setError('Add at least one time of day.');

    const input: RegimenItemInput & { id?: string } = {
      id: item?.id,
      name: name.trim(),
      kind,
      doseAmount: doseAmount ? Number(doseAmount) : null,
      doseForm,
      scheduleKind,
      weekdays,
      intervalDays: Number(intervalDays) || 1,
      anchorDate: item?.anchorDate ?? today(),
      times,
      foodRule,
      courseStart: isCourse ? courseStart : null,
      courseEnd: isCourse ? courseEnd : null,
      supplyCount: countSupply && supplyCount ? Number(supplyCount) : null,
      remindersEnabled,
      notes: notes.trim() || null,
    };

    try {
      await save.mutateAsync(input);
      onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save that.');
    }
  };

  const absorption = absorptionNotes({ name, notes });

  return (
    <div className="flex flex-col gap-5 pt-1">
      <header>
        <Eyebrow>{item ? 'Edit' : 'Add'}</Eyebrow>
        <h1 className="mt-1 text-4xl" style={{ fontWeight: 780 }}>
          {item ? item.name : 'Something new'}
        </h1>
      </header>

      <Card>
        <div className="flex flex-col gap-3.5">
          <Field label="Name">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Vitamin D, Amoxicillin, creatine" />
          </Field>

          <div>
            <span className="eyebrow">What is it</span>
            <div className="mt-1.5">
              <Choices
                value={[kind]}
                onChange={([v]) => v && setKind(v)}
                options={[
                  { value: 'supplement' as const, label: 'Supplement', hint: 'Reminded once, never nagged.' },
                  {
                    value: 'medicine' as const,
                    label: 'Medicine',
                    hint: 'A second nudge if it stays unticked, and its name stays off your lock screen.',
                  },
                ]}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <Field label="How much" hint="Optional">
              <TextInput
                type="number"
                inputMode="decimal"
                value={doseAmount}
                onChange={(e) => setDoseAmount(e.target.value)}
                placeholder="1"
              />
            </Field>
            <Field label="Form">
              <select
                value={doseForm}
                onChange={(e) => setDoseForm(e.target.value as DoseForm)}
                className="tap w-full rounded-xl border border-line bg-paper px-3 outline-none focus:border-run"
              >
                {DOSE_FORMS.map((form) => (
                  <option key={form} value={form}>
                    {form}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <Eyebrow>When</Eyebrow>
        <div className="mt-2.5 flex flex-col gap-3.5">
          <Choices value={[scheduleKind]} onChange={([v]) => v && setScheduleKind(v)} options={SCHEDULE_OPTIONS} />

          {scheduleKind === 'weekdays' && (
            <div>
              <span className="eyebrow">Days</span>
              <div className="mt-1.5 flex gap-1.5">
                {DAY_LETTERS.map((letter, index) => {
                  const active = weekdays.includes(index);
                  return (
                    <button
                      key={index}
                      type="button"
                      aria-pressed={active}
                      aria-label={DAY_NAMES[index]}
                      onClick={() =>
                        setWeekdays((current) =>
                          current.includes(index) ? current.filter((d) => d !== index) : [...current, index].sort(),
                        )
                      }
                      className={`tap flex-1 rounded-xl border text-[0.875rem] transition-colors ${
                        active ? 'border-ink bg-ink text-chalk' : 'border-line bg-paper hover:border-ink-faint'
                      }`}
                    >
                      {letter}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {scheduleKind === 'interval' && (
            <Field label="Every how many days">
              <TextInput
                type="number"
                inputMode="numeric"
                value={intervalDays}
                onChange={(e) => setIntervalDays(e.target.value)}
              />
            </Field>
          )}

          {scheduleKind !== 'as_needed' && (
            <div>
              <span className="eyebrow">Times of day</span>
              <ul className="mt-1.5 flex flex-col gap-2">
                {times.map((time, index) => (
                  <li key={index} className="flex items-center gap-2.5">
                    <TextInput
                      type="time"
                      value={time}
                      onChange={(e) =>
                        setTimes((current) => current.map((t, i) => (i === index ? e.target.value : t)))
                      }
                    />
                    {times.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Remove ${time}`}
                        onClick={() => setTimes((current) => current.filter((_, i) => i !== index))}
                        className="tap rounded-lg px-2 text-ink-faint hover:text-alert"
                      >
                        ×
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {times.length < 6 && (
                <Button variant="quiet" className="mt-1.5 px-2" onClick={() => setTimes((c) => [...c, '20:00'])}>
                  Add another time
                </Button>
              )}
            </div>
          )}

          <div>
            <span className="eyebrow">With food</span>
            <div className="mt-1.5">
              <Choices columns={2} value={[foodRule]} onChange={([v]) => v && setFoodRule(v)} options={FOOD_OPTIONS} />
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <label className="flex items-center justify-between gap-4 py-1">
          <span>
            <span className="block">This is a course</span>
            <span className="block text-[0.8125rem] leading-snug text-ink-soft">
              It ends on its own date, and counts down until it does.
            </span>
          </span>
          <input
            type="checkbox"
            checked={isCourse}
            onChange={(e) => setIsCourse(e.target.checked)}
            className="h-6 w-6 shrink-0 accent-[#1b3fd8]"
          />
        </label>
        {isCourse && (
          <div className="mt-2 grid grid-cols-2 gap-2.5">
            <Field label="Starts">
              <TextInput type="date" value={courseStart} onChange={(e) => setCourseStart(e.target.value)} />
            </Field>
            <Field label="Ends">
              <TextInput type="date" value={courseEnd} onChange={(e) => setCourseEnd(e.target.value)} />
            </Field>
          </div>
        )}
      </Card>

      <Card>
        <label className="flex items-center justify-between gap-4 py-1">
          <span>
            <span className="block">Count what is left</span>
            <span className="block text-[0.8125rem] leading-snug text-ink-soft">
              Every tick takes one off, so a refill is never a surprise.
            </span>
          </span>
          <input
            type="checkbox"
            checked={countSupply}
            onChange={(e) => setCountSupply(e.target.checked)}
            className="h-6 w-6 shrink-0 accent-[#1b3fd8]"
          />
        </label>
        {countSupply && (
          <div className="mt-2">
            <Field label="Doses in the packet">
              <TextInput
                type="number"
                inputMode="numeric"
                value={supplyCount}
                onChange={(e) => setSupplyCount(e.target.value)}
              />
            </Field>
          </div>
        )}
      </Card>

      <Card>
        <label className="flex items-center justify-between gap-4 py-1">
          <span>
            <span className="block">Remind me about this one</span>
            <span className="block text-[0.8125rem] leading-snug text-ink-soft">
              It still appears on Today either way.
            </span>
          </span>
          <input
            type="checkbox"
            checked={remindersEnabled}
            onChange={(e) => setRemindersEnabled(e.target.checked)}
            className="h-6 w-6 shrink-0 accent-[#1b3fd8]"
          />
        </label>
        <div className="mt-2">
          <Field label="Notes" hint="Optional — what it is for, what the packet says">
            <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
      </Card>

      {absorption.length > 0 && (
        <Card>
          <Eyebrow>Worth knowing</Eyebrow>
          <ul className="mt-2 flex flex-col gap-2">
            {absorption.map((note) => (
              <li key={note.id} className="flex gap-2.5 text-[0.9375rem] leading-snug text-ink-soft">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-walk" />
                {note.text}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {name && (
        <Note tone="neutral">
          {preview.name} — {[doseLabel(preview), scheduleSummary(preview)].filter(Boolean).join(', ')}.
        </Note>
      )}

      {error && <Note tone="alert">{error}</Note>}

      <div className="flex gap-2.5">
        <Button full disabled={save.isPending} onClick={submit}>
          {item ? 'Save changes' : 'Add it'}
        </Button>
        <Button variant="quiet" onClick={onDone}>
          Cancel
        </Button>
      </div>

      {item && (
        <Button
          variant="quiet"
          full
          className="py-3 !text-alert"
          onClick={async () => {
            await archive.mutateAsync({ id: item.id });
            onDone();
          }}
        >
          Stop taking this
        </Button>
      )}
    </div>
  );
}
