import { minutesOfDay, weekdayOf, withinWindow } from './dates.js';
import { doseLabel, type DoseState, type RegimenItem } from './regimen.js';

export type ReminderKind = 'regimen' | 'session' | 'weekly_check';

export interface ReminderPrefs {
  /** IANA zone. Times are local and must survive travel and DST unshifted. */
  timezone: string;
  remindersEnabled: boolean;
  regimenReminders: boolean;
  sessionReminders: boolean;
  sessionReminderTime: string;
  weeklyCheckReminders: boolean;
  /** 0 = Sunday … 6 = Saturday. */
  weeklyCheckDay: number;
  weeklyCheckTime: string;
  quietHoursStart: string;
  quietHoursEnd: string;
  /** Medicine names are sensitive health data — off the lock screen by default. */
  hideNamesInNotifications: boolean;
  /** A second nudge for medicines only. Supplements never nag. */
  medicineEscalation: boolean;
}

export const DEFAULT_REMINDER_PREFS: ReminderPrefs = {
  timezone: 'UTC',
  remindersEnabled: false,
  regimenReminders: true,
  sessionReminders: true,
  sessionReminderTime: '07:30',
  weeklyCheckReminders: true,
  weeklyCheckDay: 0,
  weeklyCheckTime: '09:30',
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  hideNamesInNotifications: true,
  medicineEscalation: true,
};

/** What the scheduler has already done about one occurrence. */
export interface ReminderRecord {
  kind: ReminderKind;
  key: string;
  attempts: number;
  /** Minutes since local midnight when the last nudge went out, same day only. */
  lastSentMinutes: number | null;
  lastSentDate: string | null;
  snoozedUntilMinutes: number | null;
  snoozedUntilDate: string | null;
  resolved: boolean;
}

export interface DueReminder {
  kind: ReminderKind;
  key: string;
  itemId: string | null;
  dueDate: string;
  dueTime: string;
  /** 1 = the nudge; 2 = the single escalation a medicine is allowed. */
  attempt: number;
  urgent: boolean;
  title: string;
  body: string;
  url: string;
}

/** How late a nudge may still be worth sending. Wider than the tick, so a
 *  restarted server does not silently swallow the window. */
export const SEND_WINDOW_MINUTES = 15;
/**
 * How late a *first* nudge may still go out.
 *
 * Not a licence to nag: once a nudge has been sent and ignored, nothing else
 * follows, and that rule is unchanged. This covers the different case where the
 * nudge was never delivered at all — the fifteen minute send window depended on
 * a tick landing inside it, so a deploy, a restart or a busy minute silently
 * lost the reminder with nothing to retry it. Forty-five minutes survives all
 * of those and still leaves the app quiet hours later, which is the point.
 */
export const CATCH_UP_MINUTES = 45;
/** A medicine still unmarked this long after its nudge gets one more. */
export const ESCALATION_DELAY_MINUTES = 30;

export interface ReminderContext {
  prefs: ReminderPrefs;
  /** The user's local day and clock, already converted from their timezone. */
  localDate: string;
  localTime: string;
  /** Today's scheduled doses with what has been logged against each. */
  doses: DoseState[];
  /** True when today asks for a run or strength session and none is logged. */
  sessionDue: boolean;
  sessionKind: 'run' | 'strength' | null;
  /** True when the weekly check-in has not been taken in the last seven days. */
  weeklyCheckDue: boolean;
  /** Prior deliveries, keyed `${kind}:${key}`. */
  records: Map<string, ReminderRecord>;
}

function recordFor(
  context: ReminderContext,
  kind: ReminderKind,
  key: string,
): ReminderRecord | undefined {
  return context.records.get(`${kind}:${key}`);
}

/** True when the scheduled minute has passed but not by more than `limit`. */
function inWindow(scheduled: string, now: string, limit: number = SEND_WINDOW_MINUTES): boolean {
  const delta = minutesOfDay(now) - minutesOfDay(scheduled);
  return delta >= 0 && delta <= limit;
}

function quiet(prefs: ReminderPrefs, time: string): boolean {
  return withinWindow(time, prefs.quietHoursStart, prefs.quietHoursEnd);
}

function snoozeReady(record: ReminderRecord | undefined, context: ReminderContext): boolean {
  if (!record?.snoozedUntilDate || record.snoozedUntilMinutes === null) return false;
  if (record.snoozedUntilDate !== context.localDate)
    return record.snoozedUntilDate < context.localDate;
  return minutesOfDay(context.localTime) >= record.snoozedUntilMinutes;
}

/** True when a snoozed reminder has not been re-sent since the snooze expired. */
function snoozeUnsent(record: ReminderRecord): boolean {
  if (record.lastSentDate !== record.snoozedUntilDate) return true;
  return (record.lastSentMinutes ?? -1) < (record.snoozedUntilMinutes ?? 0);
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

/**
 * Notification text. Two rules run through all of it: a medicine name never
 * reaches a lock screen unless the user has asked for it, and nothing is ever
 * phrased as a failure — a notification that did not arrive must not become
 * "you missed a dose" (P3.1 constraints, and the no-guilt rule from P3).
 */
export function reminderCopy(
  item: Pick<RegimenItem, 'name' | 'kind' | 'doseAmount' | 'doseForm' | 'foodRule'>,
  prefs: ReminderPrefs,
  attempt: number,
): { title: string; body: string } {
  const medicine = item.kind === 'medicine';
  if (prefs.hideNamesInNotifications) {
    return {
      title: 'GoodForm',
      body: medicine
        ? attempt > 1
          ? 'A medicine is still due. Open to tick it off.'
          : 'A medicine is due.'
        : 'Something on your list is due.',
    };
  }
  const dose = doseLabel(item);
  const withFood =
    item.foodRule === 'with_food'
      ? ' — with food'
      : item.foodRule === 'empty_stomach'
        ? ' — empty stomach'
        : '';
  return {
    title: item.name,
    body: `${dose ? `${dose}${withFood}` : `Due now${withFood}`}${attempt > 1 ? ' · still unticked' : ''}`,
  };
}

const SESSION_COPY: Record<'run' | 'strength', { title: string; body: string }> = {
  run: { title: 'Running day', body: 'Your session is ready whenever it suits you.' },
  strength: {
    title: 'Strength day',
    body: 'About fifteen minutes of calves, shins and single-leg work.',
  },
};

// ---------------------------------------------------------------------------
// The scheduler's decision
// ---------------------------------------------------------------------------

/**
 * Everything that should be pushed to one user on this tick. Pure, so the
 * whole reminder policy — quiet hours, escalation, no-guilt, the never-nag rule
 * for supplements — is testable without a clock or a network.
 */
export function dueReminders(context: ReminderContext): DueReminder[] {
  const { prefs, localDate, localTime } = context;
  if (!prefs.remindersEnabled) return [];
  const out: DueReminder[] = [];
  const nowQuiet = quiet(prefs, localTime);

  // --- Doses --------------------------------------------------------------
  if (prefs.regimenReminders) {
    for (const dose of context.doses) {
      if (!dose.item.remindersEnabled) continue;
      if (dose.status !== null) continue; // already ticked or explicitly skipped

      const key = `${dose.item.id}:${dose.dueDate}:${dose.dueTime}`;
      const record = recordFor(context, 'regimen', key);
      if (record?.resolved) continue;

      const medicine = dose.item.kind === 'medicine';
      /**
       * Quiet hours exist to stop the app interrupting unbidden. A dose whose
       * time the runner deliberately set inside them is not an interruption —
       * it is the thing they asked to be reminded about, and the app told them
       * where it fell when they chose it.
       *
       * This used to be granted to medicines only, which meant a supplement at
       * 22:30 with quiet hours from 22:00 produced nothing, ever, with no way
       * to find out why. Medicines still get more than supplements: the second
       * nudge below is theirs alone, and that one is still never sent inside
       * quiet hours.
       */
      const scheduledInQuiet = quiet(prefs, dose.dueTime);
      const mayInterrupt = !nowQuiet || scheduledInQuiet;

      const resumingSnooze =
        snoozeReady(record, context) && record !== undefined && snoozeUnsent(record);
      // A dose that has never been nudged stays eligible past the send window,
      // so a tick that arrives late still delivers rather than dropping it.
      const firstNudge =
        (record?.attempts ?? 0) === 0 && inWindow(dose.dueTime, localTime, CATCH_UP_MINUTES);

      if ((firstNudge || resumingSnooze) && mayInterrupt) {
        const attempt = resumingSnooze ? Math.max(1, record.attempts) : 1;
        out.push({
          kind: 'regimen',
          key,
          itemId: dose.item.id,
          dueDate: dose.dueDate,
          dueTime: dose.dueTime,
          attempt,
          urgent: medicine,
          url: '/regimen',
          ...reminderCopy(dose.item, prefs, attempt),
        });
        continue;
      }

      // Escalation: medicines only, once, and never inside quiet hours.
      if (
        medicine &&
        prefs.medicineEscalation &&
        record &&
        record.attempts === 1 &&
        record.lastSentDate === localDate &&
        record.lastSentMinutes !== null &&
        !record.snoozedUntilDate &&
        !nowQuiet &&
        minutesOfDay(localTime) - record.lastSentMinutes >= ESCALATION_DELAY_MINUTES
      ) {
        out.push({
          kind: 'regimen',
          key,
          itemId: dose.item.id,
          dueDate: dose.dueDate,
          dueTime: dose.dueTime,
          attempt: 2,
          urgent: true,
          url: '/regimen',
          ...reminderCopy(dose.item, prefs, 2),
        });
      }
    }
  }

  // --- Session ------------------------------------------------------------
  // One nudge, never repeated, never escalated: a missed session is a normal
  // part of training and the app does not chase it.
  if (prefs.sessionReminders && context.sessionDue && context.sessionKind && !nowQuiet) {
    const key = localDate;
    const record = recordFor(context, 'session', key);
    if (!record?.attempts && !record?.resolved && inWindow(prefs.sessionReminderTime, localTime)) {
      out.push({
        kind: 'session',
        key,
        itemId: null,
        dueDate: localDate,
        dueTime: prefs.sessionReminderTime,
        attempt: 1,
        urgent: false,
        url: '/',
        ...SESSION_COPY[context.sessionKind],
      });
    }
  }

  // --- Weekly check-in ----------------------------------------------------
  if (
    prefs.weeklyCheckReminders &&
    context.weeklyCheckDue &&
    !nowQuiet &&
    weekdayOf(localDate) === prefs.weeklyCheckDay
  ) {
    const key = localDate;
    const record = recordFor(context, 'weekly_check', key);
    if (!record?.attempts && !record?.resolved && inWindow(prefs.weeklyCheckTime, localTime)) {
      out.push({
        kind: 'weekly_check',
        key,
        itemId: null,
        dueDate: localDate,
        dueTime: prefs.weeklyCheckTime,
        attempt: 1,
        urgent: false,
        url: '/',
        title: 'Weekly check-in',
        body: 'Weight, waist and resting heart rate — about a minute.',
      });
    }
  }

  return out;
}
