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
    archivedOn: null,
    ...over,
  };
}

function context(
  over: Partial<ReminderContext> = {},
  prefs: Partial<ReminderPrefs> = {},
): ReminderContext {
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

  it('still delivers a first nudge when the tick that should have sent it was late', () => {
    // The scheduler ticks once a minute, so a restart or a slow minute can put
    // the first tick after a dose outside the send window. That used to drop
    // the reminder with nothing to retry it — for a medicine, silently.
    const late = dueReminders(context({ localTime: '08:40' }));
    expect(late).toHaveLength(1);
    expect(late[0]!.attempt).toBe(1);
  });

  it('sends nothing once the dose is ticked or skipped', () => {
    const items = [item()];
    for (const status of ['taken', 'skipped'] as const) {
      const doses = doseStates(
        items,
        [
          {
            id: 'e',
            itemId: 'i1',
            dueDate: '2026-08-24',
            dueTime: '08:00',
            status,
            recordedAt: '',
          },
        ],
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
  it('delivers anything the runner deliberately scheduled there', () => {
    // Both kinds. A time chosen inside your own quiet hours is a request, not
    // an interruption — and holding supplements meant a 22:30 vitamin produced
    // nothing at all, on any day, with nothing saying why.
    for (const kind of ['supplement', 'medicine'] as const) {
      const doses = doseStates([item({ kind, times: ['23:00'] })], [], '2026-08-24', '23:05');
      expect(dueReminders(context({ doses, localTime: '23:05' })), kind).toHaveLength(1);
    }
  });

  it('still holds a dose whose time falls outside quiet hours when the tick is inside them', () => {
    // Scheduled for 21:50, quiet hours from 22:00, and the tick lands at 22:20.
    // Nothing was asked of this moment, so nothing arrives in it.
    const doses = doseStates(
      [item({ kind: 'supplement', times: ['21:50'] })],
      [],
      '2026-08-24',
      '22:20',
    );
    expect(dueReminders(context({ doses, localTime: '22:20' }))).toEqual([]);
  });

  it('never escalates inside quiet hours', () => {
    const doses = doseStates([item({ times: ['23:00'] })], [], '2026-08-24', '23:35');
    const records = new Map([
      [
        'regimen:i1:2026-08-24:23:00',
        record({ key: 'i1:2026-08-24:23:00', lastSentMinutes: 23 * 60 }),
      ],
    ]);
    expect(dueReminders(context({ doses, localTime: '23:35', records }))).toEqual([]);
  });

  it('suppresses the session nudge', () => {
    const quiet = context(
      { sessionDue: true, sessionKind: 'run', localTime: '06:00', doses: [] },
      { sessionReminderTime: '06:00' },
    );
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
    const records = new Map([
      ['session:2026-08-24', record({ kind: 'session', key: '2026-08-24' })],
    ]);
    expect(
      dueReminders(
        context({ ...noDoses, sessionDue: true, sessionKind: 'run', localTime: '09:00', records }),
      ),
    ).toEqual([]);
  });

  it('says nothing about a session already logged', () => {
    expect(dueReminders(context({ ...noDoses, sessionDue: false, localTime: '07:35' }))).toEqual(
      [],
    );
  });

  it('asks for the weekly check only on the chosen day', () => {
    // 2026-08-23 is a Sunday, 2026-08-24 a Monday.
    const sunday = context({
      ...noDoses,
      weeklyCheckDue: true,
      localDate: '2026-08-23',
      localTime: '09:35',
    });
    expect(dueReminders(sunday)).toHaveLength(1);
    const monday = context({
      ...noDoses,
      weeklyCheckDue: true,
      localDate: '2026-08-24',
      localTime: '09:35',
    });
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
    const copy = reminderCopy(
      item(),
      { ...DEFAULT_REMINDER_PREFS, hideNamesInNotifications: false },
      1,
    );
    expect(copy.title).toBe('Amoxicillin');
    expect(copy.body).toContain('1 capsule');
  });

  it('never phrases anything as a missed dose', () => {
    for (const attempt of [1, 2]) {
      for (const hide of [true, false]) {
        const copy = reminderCopy(
          item(),
          { ...DEFAULT_REMINDER_PREFS, hideNamesInNotifications: hide },
          attempt,
        );
        expect(`${copy.title} ${copy.body}`.toLowerCase()).not.toMatch(/missed|forgot|failed/);
      }
    }
  });
});

describe('daylight saving', () => {
  // The scheduler resolves a wall clock through the user's zone every tick, so
  // on a spring-forward day the local clock jumps 01:59 → 03:00 and a dose set
  // for 02:30 has no minute of its own to fire in. The catch-up window is what
  // rescues it; without one the dose is skipped in silence, on a day nobody
  // remembers is different.
  function localTimesOn(date: string, timezone: string): string[] {
    const times: string[] = [];
    const [y, m, d] = date.split('-').map(Number);
    const start = Date.UTC(y!, m! - 1, d! - 1, 0, 0, 0);
    for (let i = 0; i < 60 * 48; i++) {
      const instant = new Date(start + i * 60_000);
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(instant);
      if (parts !== date) continue;
      times.push(
        new Intl.DateTimeFormat('en-GB', {
          timeZone: timezone,
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        }).format(instant),
      );
    }
    return times;
  }

  it('still delivers a dose set for an hour the clock skips', () => {
    const date = '2026-03-08'; // America/New_York springs forward, 02:00 → 03:00
    const clock = localTimesOn(date, 'America/New_York');
    expect(clock).not.toContain('02:30'); // the hour genuinely does not exist

    const records = new Map<string, ReminderRecord>();
    const fired = clock.filter((localTime) => {
      const doses = doseStates(
        [item({ times: ['02:30'], anchorDate: '2026-01-01' })],
        [],
        date,
        localTime,
      );
      const due = dueReminders(context({ doses, localDate: date, localTime, records }));
      for (const reminder of due) {
        records.set(`${reminder.kind}:${reminder.key}`, {
          kind: reminder.kind,
          key: reminder.key,
          attempts: reminder.attempt,
          lastSentDate: date,
          lastSentMinutes: 0,
          snoozedUntilDate: null,
          snoozedUntilMinutes: null,
          resolved: false,
        });
      }
      return due.length > 0;
    });

    expect(fired.length).toBeGreaterThan(0);
  });
});

describe('a snooze that crosses midnight', () => {
  // Snoozing a 23:50 dose for half an hour sets it to resume at 00:20, by which
  // time the dose belongs to the previous day. The scheduler is what has to
  // hand yesterday's dose back in; this pins the half that decides what to do
  // with it once it arrives.
  const yesterday = '2026-08-24';
  const today = '2026-08-25';
  const key = `i1:${yesterday}:23:50`;

  const snoozed = () =>
    new Map<string, ReminderRecord>([
      [
        `regimen:${key}`,
        {
          kind: 'regimen',
          key,
          attempts: 1,
          lastSentDate: yesterday,
          lastSentMinutes: 23 * 60 + 50,
          snoozedUntilDate: today,
          snoozedUntilMinutes: 20,
          resolved: false,
        },
      ],
    ]);

  it('resumes once yesterday’s dose is in the context', () => {
    const doses = doseStates([item({ times: ['23:50'] })], [], yesterday, '23:59');
    const due = dueReminders(
      context({ doses, localDate: today, localTime: '00:20', records: snoozed() }),
    );
    expect(due).toHaveLength(1);
    expect(due[0]!.key).toBe(key);
  });

  it('stays quiet before the snooze is up', () => {
    const doses = doseStates([item({ times: ['23:50'] })], [], yesterday, '23:59');
    const due = dueReminders(
      context({ doses, localDate: today, localTime: '00:05', records: snoozed() }),
    );
    expect(due).toEqual([]);
  });

  it('does not turn a stale dose into a fresh nudge', () => {
    // Nothing snoozed, yesterday's dose simply never ticked. Handing it in must
    // not produce a first nudge the morning after.
    const doses = doseStates([item({ times: ['23:50'] })], [], yesterday, '23:59');
    const due = dueReminders(context({ doses, localDate: today, localTime: '09:00' }));
    expect(due).toEqual([]);
  });
});

describe('a snooze that expires inside quiet hours', () => {
  // The most likely thing to be snoozed is an evening medicine, and the
  // thirty-minute default from a 21:40 nudge lands inside the default quiet
  // window. It used to be dropped — and because dropping it never cleared
  // `snoozedUntil`, it never came back on any later tick either.
  const key = 'i1:2026-08-24:21:30';
  const snoozedTo = (minutes: number): Map<string, ReminderRecord> =>
    new Map([
      [
        `regimen:${key}`,
        {
          kind: 'regimen',
          key,
          attempts: 1,
          lastSentDate: '2026-08-24',
          lastSentMinutes: 21 * 60 + 40,
          snoozedUntilDate: '2026-08-24',
          snoozedUntilMinutes: minutes,
          resolved: false,
        },
      ],
    ]);

  const doses = () => doseStates([item({ times: ['21:30'] })], [], '2026-08-24', '22:10');

  it('resumes, because the runner asked for it', () => {
    const due = dueReminders(
      context({ doses: doses(), localTime: '22:10', records: snoozedTo(22 * 60 + 10) }),
    );
    expect(due).toHaveLength(1);
    expect(due[0]!.key).toBe(key);
  });

  it('still refuses a first nudge that nobody asked for, in the same window', () => {
    // 21:50 is outside quiet hours as a dose time, so a tick at 22:10 with no
    // snooze on record must stay silent.
    const fresh = doseStates([item({ times: ['21:50'] })], [], '2026-08-24', '22:10');
    expect(dueReminders(context({ doses: fresh, localTime: '22:10' }))).toEqual([]);
  });
});
