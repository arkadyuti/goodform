import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REMINDER_PREFS,
  dueReminders,
  reminderCopy,
  type ReminderContext,
  type ReminderPrefs,
  type ReminderRecord,
} from './reminders.js';
import { doseStates, type RegimenItem } from './regimen.js';

function item(over: Partial<RegimenItem> = {}): RegimenItem {
  return {
    id: 'i1',
    name: 'Amoxicillin',
    kind: 'medicine',
    doseAmount: 1,
    doseForm: 'capsule',
    scheduleKind: 'daily',
    weekdays: [],
    intervalDays: 1,
    anchorDate: '2026-08-01',
    times: ['08:00'],
    foodRule: 'none',
    courseStart: null,
    courseEnd: null,
    supplyCount: null,
    remindersEnabled: true,
    notes: null,
    archivedAt: null,
    ...over,
  };
}

function context(over: Partial<ReminderContext> = {}, prefs: Partial<ReminderPrefs> = {}): ReminderContext {
  const items = over.doses ? [] : [item()];
  const localDate = over.localDate ?? '2026-08-24';
  const localTime = over.localTime ?? '08:05';
  return {
    prefs: { ...DEFAULT_REMINDER_PREFS, remindersEnabled: true, ...prefs },
    localDate,
    localTime,
    doses: doseStates(items, [], localDate, localTime),
    sessionDue: false,
    sessionKind: null,
    weeklyCheckDue: false,
    records: new Map(),
    ...over,
  };
}

function record(over: Partial<ReminderRecord> = {}): ReminderRecord {
  return {
    kind: 'regimen',
    key: 'i1:2026-08-24:08:00',
    attempts: 1,
    lastSentMinutes: 8 * 60,
    lastSentDate: '2026-08-24',
    snoozedUntilMinutes: null,
    snoozedUntilDate: null,
    resolved: false,
    ...over,
  };
}

const KEY = 'regimen:i1:2026-08-24:08:00';

describe('dose reminders', () => {
  it('nudges once when a dose comes due', () => {
    const due = dueReminders(context());
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ kind: 'regimen', attempt: 1, urgent: true });
  });

  it('sends nothing before the dose time', () => {
    expect(dueReminders(context({ localTime: '07:30' }))).toEqual([]);
  });

  it('gives up rather than nagging hours later', () => {
    expect(dueReminders(context({ localTime: '10:00' }))).toEqual([]);
  });

  it('sends nothing once the dose is ticked or skipped', () => {
    const items = [item()];
    for (const status of ['taken', 'skipped'] as const) {
      const doses = doseStates(
        items,
        [{ id: 'e', itemId: 'i1', dueDate: '2026-08-24', dueTime: '08:00', status, recordedAt: '' }],
        '2026-08-24',
        '08:05',
      );
      expect(dueReminders(context({ doses }))).toEqual([]);
    }
  });

  it('honours the per-item reminder toggle', () => {
    const doses = doseStates([item({ remindersEnabled: false })], [], '2026-08-24', '08:05');
    expect(dueReminders(context({ doses }))).toEqual([]);
  });

  it('sends nothing at all when reminders are off', () => {
    expect(dueReminders(context({}, { remindersEnabled: false }))).toEqual([]);
  });
});

describe('escalation', () => {
  const escalationContext = (over: Partial<ReminderContext> = {}) =>
    context({ localTime: '08:35', records: new Map([[KEY, record()]]), ...over });

  it('gives a medicine one more nudge when it is still unticked', () => {
    const due = dueReminders(escalationContext());
    expect(due).toHaveLength(1);
    expect(due[0]!.attempt).toBe(2);
  });

  it('never escalates a supplement — supplements do not nag', () => {
    const doses = doseStates([item({ kind: 'supplement' })], [], '2026-08-24', '08:35');
    expect(dueReminders(escalationContext({ doses }))).toEqual([]);
  });

  it('stops at two attempts', () => {
    const records = new Map([[KEY, record({ attempts: 2, lastSentMinutes: 8 * 60 + 30 })]]);
    expect(dueReminders(context({ localTime: '09:10', records }))).toEqual([]);
  });

  it('does not escalate before the delay has passed', () => {
    expect(dueReminders(escalationContext({ localTime: '08:20' }))).toEqual([]);
  });

  it('can be turned off', () => {
    expect(dueReminders(escalationContext())).toHaveLength(1);
    const off = context(
      { localTime: '08:35', records: new Map([[KEY, record()]]) },
      { medicineEscalation: false },
    );
    expect(dueReminders(off)).toEqual([]);
  });
});

describe('quiet hours', () => {
  it('holds a supplement scheduled inside quiet hours', () => {
    const doses = doseStates([item({ kind: 'supplement', times: ['23:00'] })], [], '2026-08-24', '23:05');
    expect(dueReminders(context({ doses, localTime: '23:05' }))).toEqual([]);
  });

  it('still delivers a medicine the user deliberately scheduled there', () => {
    const doses = doseStates([item({ times: ['23:00'] })], [], '2026-08-24', '23:05');
    expect(dueReminders(context({ doses, localTime: '23:05' }))).toHaveLength(1);
  });

  it('never escalates inside quiet hours', () => {
    const doses = doseStates([item({ times: ['23:00'] })], [], '2026-08-24', '23:35');
    const records = new Map([['regimen:i1:2026-08-24:23:00', record({ key: 'i1:2026-08-24:23:00', lastSentMinutes: 23 * 60 })]]);
    expect(dueReminders(context({ doses, localTime: '23:35', records }))).toEqual([]);
  });

  it('suppresses the session nudge', () => {
    const quiet = context({ sessionDue: true, sessionKind: 'run', localTime: '06:00', doses: [] }, { sessionReminderTime: '06:00' });
    expect(dueReminders(quiet)).toEqual([]);
  });
});

describe('snooze', () => {
  it('comes back when the snooze expires and not before', () => {
    const records = new Map([
      [KEY, record({ snoozedUntilDate: '2026-08-24', snoozedUntilMinutes: 9 * 60 })],
    ]);
    expect(dueReminders(context({ localTime: '08:50', records }))).toEqual([]);
    expect(dueReminders(context({ localTime: '09:00', records }))).toHaveLength(1);
  });

  it('does not re-fire once the snoozed nudge has gone out', () => {
    const records = new Map([
      [
        KEY,
        record({
          snoozedUntilDate: '2026-08-24',
          snoozedUntilMinutes: 9 * 60,
          lastSentMinutes: 9 * 60,
        }),
      ],
    ]);
    expect(dueReminders(context({ localTime: '09:05', records }))).toEqual([]);
  });

  it('stays silent once the user has marked it done from the notification', () => {
    const records = new Map([[KEY, record({ resolved: true })]]);
    expect(dueReminders(context({ localTime: '08:35', records }))).toEqual([]);
  });
});

describe('session and weekly check reminders', () => {
  const noDoses = { doses: [] };

  it('nudges once about a session and never chases it', () => {
    const due = dueReminders(
      context({ ...noDoses, sessionDue: true, sessionKind: 'run', localTime: '07:35' }),
    );
    expect(due).toHaveLength(1);
    expect(due[0]!.title).toBe('Running day');
    // No escalation path exists for a session, at any later time.
    const records = new Map([['session:2026-08-24', record({ kind: 'session', key: '2026-08-24' })]]);
    expect(
      dueReminders(context({ ...noDoses, sessionDue: true, sessionKind: 'run', localTime: '09:00', records })),
    ).toEqual([]);
  });

  it('says nothing about a session already logged', () => {
    expect(dueReminders(context({ ...noDoses, sessionDue: false, localTime: '07:35' }))).toEqual([]);
  });

  it('asks for the weekly check only on the chosen day', () => {
    // 2026-08-23 is a Sunday, 2026-08-24 a Monday.
    const sunday = context({ ...noDoses, weeklyCheckDue: true, localDate: '2026-08-23', localTime: '09:35' });
    expect(dueReminders(sunday)).toHaveLength(1);
    const monday = context({ ...noDoses, weeklyCheckDue: true, localDate: '2026-08-24', localTime: '09:35' });
    expect(dueReminders(monday)).toEqual([]);
  });
});

describe('notification copy', () => {
  it('keeps a medicine name off the lock screen by default', () => {
    const copy = reminderCopy(item(), DEFAULT_REMINDER_PREFS, 1);
    expect(copy.title).toBe('GoodForm');
    expect(copy.body).not.toContain('Amoxicillin');
  });

  it('shows the name only when explicitly asked to', () => {
    const copy = reminderCopy(item(), { ...DEFAULT_REMINDER_PREFS, hideNamesInNotifications: false }, 1);
    expect(copy.title).toBe('Amoxicillin');
    expect(copy.body).toContain('1 capsule');
  });

  it('never phrases anything as a missed dose', () => {
    for (const attempt of [1, 2]) {
      for (const hide of [true, false]) {
        const copy = reminderCopy(item(), { ...DEFAULT_REMINDER_PREFS, hideNamesInNotifications: hide }, attempt);
        expect(`${copy.title} ${copy.body}`.toLowerCase()).not.toMatch(/missed|forgot|failed/);
      }
    }
  });
});
