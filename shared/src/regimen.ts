import { addDays, daysBetween, minutesOfDay, weekdayOf } from './dates.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A missed protein shake is nothing; a missed course of antibiotics is not.
 * Every difference in urgency and tone in this module keys off this one field.
 */
export const ITEM_KINDS = ['supplement', 'medicine'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const DOSE_FORMS = ['tablet', 'capsule', 'scoop', 'ml', 'drops', 'sachet', 'other'] as const;
export type DoseForm = (typeof DOSE_FORMS)[number];

export const SCHEDULE_KINDS = ['daily', 'weekdays', 'interval', 'as_needed'] as const;
export type ScheduleKind = (typeof SCHEDULE_KINDS)[number];

export const FOOD_RULES = ['none', 'with_food', 'empty_stomach', 'before_bed'] as const;
export type FoodRule = (typeof FOOD_RULES)[number];

export const FOOD_RULE_LABELS: Record<FoodRule, string> = {
  none: '',
  with_food: 'With food',
  empty_stomach: 'Empty stomach',
  before_bed: 'Before bed',
};

export const DOSE_STATUSES = ['taken', 'skipped'] as const;
/** There is no third state. An untouched dose is a gap, and gaps stay visible. */
export type DoseStatus = (typeof DOSE_STATUSES)[number];

export interface RegimenItem {
  id: string;
  name: string;
  kind: ItemKind;
  /** Null when the amount is on the packet and not worth retyping. */
  doseAmount: number | null;
  doseForm: DoseForm;
  scheduleKind: ScheduleKind;
  /** 0 = Sunday … 6 = Saturday. Used by `weekdays` schedules. */
  weekdays: number[];
  /** Every N days, for `interval` schedules. */
  intervalDays: number;
  /** The day the schedule counts from, and the first day anything is due. */
  anchorDate: string;
  /** Local `HH:MM`, one per dose in a day. Empty for as-needed items. */
  times: string[];
  foodRule: FoodRule;
  /** A course ends on its own date rather than waiting to be turned off. */
  courseStart: string | null;
  courseEnd: string | null;
  /** Doses left in the packet. Null means nobody is counting. */
  supplyCount: number | null;
  remindersEnabled: boolean;
  notes: string | null;
  archivedAt: string | null;
}

export interface DoseEvent {
  id: string;
  itemId: string;
  /** The day the dose was due — not necessarily the day it was taken. */
  dueDate: string;
  /** `HH:MM` of the scheduled dose, or null for an as-needed dose. */
  dueTime: string | null;
  status: DoseStatus;
  /** When the tick actually happened. The whole point of a separate field. */
  recordedAt: string;
}

/** One scheduled dose on one day: what the "due now" list is made of. */
export interface DueDose {
  item: RegimenItem;
  dueDate: string;
  dueTime: string;
  band: TimeBandId;
}

// ---------------------------------------------------------------------------
// Times of day
// ---------------------------------------------------------------------------

export type TimeBandId = 'morning' | 'midday' | 'evening' | 'night';

/**
 * Doses are grouped by the part of the day they belong to rather than listed
 * against clock times, because that is how anybody actually holds a routine.
 */
export const TIME_BANDS: { id: TimeBandId; label: string; from: number }[] = [
  { id: 'morning', label: 'Morning', from: 4 * 60 },
  { id: 'midday', label: 'Midday', from: 11 * 60 + 30 },
  { id: 'evening', label: 'Evening', from: 16 * 60 },
  { id: 'night', label: 'Before bed', from: 21 * 60 },
];

export function bandFor(time: string): TimeBandId {
  const minutes = minutesOfDay(time);
  // Anything before 04:00 belongs to the night that has not ended yet.
  if (minutes < (TIME_BANDS[0]?.from ?? 0)) return 'night';
  let band: TimeBandId = 'morning';
  for (const candidate of TIME_BANDS) if (minutes >= candidate.from) band = candidate.id;
  return band;
}

export function bandLabel(id: TimeBandId): string {
  return TIME_BANDS.find((b) => b.id === id)?.label ?? '';
}

/** Sorts bands as the day runs, with the pre-dawn tail of `night` kept last. */
export function bandOrder(id: TimeBandId): number {
  return TIME_BANDS.findIndex((b) => b.id === id);
}

// ---------------------------------------------------------------------------
// Schedule evaluation
// ---------------------------------------------------------------------------

/** True when a scheduled item wants a dose on this calendar day. */
export function isDueOn(item: RegimenItem, date: string): boolean {
  // Archiving stops an item from here on; it does not unmake the weeks it was
  // being taken. Returning false for every date meant "stop taking this" also
  // erased its whole adherence history — last week's finished review went from
  // "9 of 14 ticked" to nothing, and past calendar days read "2 taken out of 0
  // due". The route's own comment promises the opposite.
  if (item.archivedAt && date >= item.archivedAt.slice(0, 10)) return false;
  // As-needed items are logged when taken; they are never overdue.
  if (item.scheduleKind === 'as_needed') return false;
  if (date < item.anchorDate) return false;
  if (item.courseStart && date < item.courseStart) return false;
  if (item.courseEnd && date > item.courseEnd) return false;

  switch (item.scheduleKind) {
    case 'daily':
      return true;
    case 'weekdays':
      return item.weekdays.includes(weekdayOf(date));
    case 'interval': {
      const step = Math.max(1, item.intervalDays);
      const start =
        item.courseStart && item.courseStart > item.anchorDate ? item.courseStart : item.anchorDate;
      return daysBetween(start, date) % step === 0;
    }
  }
}

/** Every scheduled dose on one day, in clock order. */
export function dosesOn(items: RegimenItem[], date: string): DueDose[] {
  const doses: DueDose[] = [];
  for (const item of items) {
    if (!isDueOn(item, date)) continue;
    for (const time of item.times) {
      doses.push({ item, dueDate: date, dueTime: time, band: bandFor(time) });
    }
  }
  return doses.sort(
    (a, b) =>
      minutesOfDay(a.dueTime) - minutesOfDay(b.dueTime) || a.item.name.localeCompare(b.item.name),
  );
}

export interface DoseState extends DueDose {
  status: DoseStatus | null;
  /** Past its time and still untouched. Stated, never scolded about. */
  overdue: boolean;
}

function eventKey(itemId: string, date: string, time: string | null): string {
  return `${itemId}|${date}|${time ?? ''}`;
}

/**
 * Today's doses with what has been logged against each, plus which are already
 * past. `nowTime` is the user's local clock, so this is honest while travelling.
 */
export function doseStates(
  items: RegimenItem[],
  events: DoseEvent[],
  date: string,
  nowTime: string,
): DoseState[] {
  const logged = new Map(events.map((e) => [eventKey(e.itemId, e.dueDate, e.dueTime), e.status]));
  const now = minutesOfDay(nowTime);
  return dosesOn(items, date).map((dose) => {
    const status = logged.get(eventKey(dose.item.id, dose.dueDate, dose.dueTime)) ?? null;
    return { ...dose, status, overdue: status === null && minutesOfDay(dose.dueTime) < now };
  });
}

/** Grouped for display: bands in day order, each with its doses. */
export function groupByBand(
  doses: DoseState[],
): { band: TimeBandId; label: string; doses: DoseState[] }[] {
  const groups = new Map<TimeBandId, DoseState[]>();
  for (const dose of doses) {
    const list = groups.get(dose.band) ?? [];
    list.push(dose);
    groups.set(dose.band, list);
  }
  return [...groups.entries()]
    .sort((a, b) => bandOrder(a[0]) - bandOrder(b[0]))
    .map(([band, list]) => ({ band, label: bandLabel(band), doses: list }));
}

// ---------------------------------------------------------------------------
// Courses and supply
// ---------------------------------------------------------------------------

/** Days left on a course, counting today. Null when the item is not a course. */
export function courseDaysRemaining(item: RegimenItem, today: string): number | null {
  if (!item.courseEnd) return null;
  return Math.max(0, daysBetween(today, item.courseEnd) + 1);
}

export function courseFinished(item: RegimenItem, today: string): boolean {
  return Boolean(item.courseEnd && today > item.courseEnd);
}

/** Doses this item consumes in a normal week — the basis for days of supply. */
export function dosesPerWeek(item: RegimenItem): number {
  const perDay = item.times.length;
  switch (item.scheduleKind) {
    case 'daily':
      return perDay * 7;
    case 'weekdays':
      return perDay * item.weekdays.length;
    case 'interval':
      return (perDay * 7) / Math.max(1, item.intervalDays);
    case 'as_needed':
      return 0;
  }
}

/** Whole days the packet lasts at the current schedule. Null when uncounted. */
export function daysOfSupply(item: RegimenItem): number | null {
  if (item.supplyCount === null) return null;
  const perDay = dosesPerWeek(item) / 7;
  if (perDay <= 0) return null;
  return Math.floor(item.supplyCount / perDay);
}

/** A refill should never be a surprise: a week's warning, or five doses. */
export function needsRefill(item: RegimenItem): boolean {
  if (item.supplyCount === null) return false;
  const days = daysOfSupply(item);
  return item.supplyCount <= 5 || (days !== null && days <= 7);
}

// ---------------------------------------------------------------------------
// Absorption notes
// ---------------------------------------------------------------------------

export interface AbsorptionNote {
  id: string;
  text: string;
}

/**
 * Deliberately three notes and no more. Anything resembling general drug
 * interaction checking is a medical device claim, and a half-right one is worse
 * than saying nothing — so this stays at the handful of absorption facts that
 * change what a person does in the next five minutes.
 */
const ABSORPTION_RULES: { id: string; match: RegExp; text: string }[] = [
  {
    id: 'iron-tea-coffee',
    match: /\b(iron|ferrous|fumarate|bisglycinate)\b/i,
    text: 'Tea and coffee within an hour of iron cut how much of it you absorb. Water or something with vitamin C works better.',
  },
  {
    id: 'calcium-blocks-iron',
    match: /\b(calcium|cal-?mag|coral calcium)\b/i,
    text: 'Calcium blocks iron. If you take both, keep them about two hours apart.',
  },
  {
    id: 'caffeine-near-session',
    match: /\b(caffeine|pre-?workout|guarana)\b/i,
    text: 'Caffeine close to a session lifts resting heart rate, which makes your effort readings and weekly check harder to trust.',
  },
];

/** Notes worth surfacing at logging time for this item. Usually none. */
export function absorptionNotes(item: Pick<RegimenItem, 'name' | 'notes'>): AbsorptionNote[] {
  const haystack = `${item.name} ${item.notes ?? ''}`;
  return ABSORPTION_RULES.filter((rule) => rule.match.test(haystack)).map(({ id, text }) => ({
    id,
    text,
  }));
}

// ---------------------------------------------------------------------------
// Adherence
// ---------------------------------------------------------------------------

export interface Adherence {
  due: number;
  taken: number;
  skipped: number;
  /** Neither ticked nor explicitly skipped. */
  missed: number;
  /** Taken as a share of due, 0–1. Null when nothing was due in the window. */
  rate: number | null;
}

/**
 * Adherence over a window, counting only days the item was actually scheduled
 * — a course that ended on Tuesday is not failing for the rest of the week.
 */
export function adherenceFor(
  item: RegimenItem,
  events: DoseEvent[],
  from: string,
  to: string,
): Adherence {
  const mine = events.filter((e) => e.itemId === item.id);
  const logged = new Map(mine.map((e) => [eventKey(e.itemId, e.dueDate, e.dueTime), e.status]));

  /**
   * What was ticked on a given day, whatever time it was ticked *for*.
   *
   * Adherence is rebuilt from the item's schedule as it is now, and events are
   * matched on `itemId|date|time`. Move a supplement from 08:00 to 09:00 and
   * every past tick stops matching, so a history of nine doses out of fourteen
   * silently became zero out of fourteen — while the calendar, which counts by
   * date alone, still showed them. Two screens, contradictory numbers, same
   * rows. Falling back to the day means a schedule change no longer rewrites
   * the past.
   */
  const byDate = new Map<string, string[]>();
  for (const event of mine) {
    byDate.set(event.dueDate, [...(byDate.get(event.dueDate) ?? []), event.status]);
  }

  let due = 0;
  let taken = 0;
  let skipped = 0;

  for (let date = from; date <= to; date = addDays(date, 1)) {
    if (!isDueOn(item, date)) continue;

    const exact: string[] = [];
    for (const time of item.times) {
      const status = logged.get(eventKey(item.id, date, time));
      if (status) exact.push(status);
    }
    // Exact slot matches when the schedule has not moved; otherwise the day's
    // events, capped at what the day actually asks for.
    const statuses = exact.length ? exact : (byDate.get(date) ?? []).slice(0, item.times.length);

    due += item.times.length;
    for (const status of statuses) {
      if (status === 'taken') taken += 1;
      else if (status === 'skipped') skipped += 1;
    }
  }

  return {
    due,
    taken,
    skipped,
    missed: due - taken - skipped,
    rate: due === 0 ? null : taken / due,
  };
}

/** How an item is described in a list, without repeating its name. */
export function scheduleSummary(item: RegimenItem): string {
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const times = item.times.join(', ');
  switch (item.scheduleKind) {
    case 'daily':
      return times ? `Every day · ${times}` : 'Every day';
    case 'weekdays': {
      const days = [...item.weekdays]
        .sort()
        .map((d) => DAY_NAMES[d])
        .join(' ');
      return times ? `${days} · ${times}` : days;
    }
    case 'interval': {
      const every = item.intervalDays === 1 ? 'Every day' : `Every ${item.intervalDays} days`;
      return times ? `${every} · ${times}` : every;
    }
    case 'as_needed':
      return 'As needed';
  }
}

export function doseLabel(item: Pick<RegimenItem, 'doseAmount' | 'doseForm'>): string {
  if (item.doseAmount === null) return '';
  const unit =
    item.doseForm === 'ml' || item.doseForm === 'other'
      ? item.doseForm === 'ml'
        ? 'ml'
        : ''
      : item.doseAmount === 1
        ? item.doseForm
        : `${item.doseForm}s`;
  return unit ? `${item.doseAmount} ${unit}` : String(item.doseAmount);
}
