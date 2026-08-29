import { describe, expect, it } from 'vitest';
import {
  absorptionNotes,
  adherenceFor,
  bandFor,
  courseDaysRemaining,
  daysOfSupply,
  doseStates,
  dosesOn,
  groupByBand,
  isDueOn,
  needsRefill,
  scheduleSummary,
  type DoseEvent,
  type RegimenItem,
} from './regimen.js';
import { withinWindow } from './dates.js';

function item(over: Partial<RegimenItem> = {}): RegimenItem {
  return {
    id: 'i1',
    name: 'Vitamin D',
    kind: 'supplement',
    doseAmount: 1,
    doseForm: 'tablet',
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

function event(over: Partial<DoseEvent> = {}): DoseEvent {
  return {
    id: 'e1',
    itemId: 'i1',
    dueDate: '2026-08-24',
    dueTime: '08:00',
    status: 'taken',
    recordedAt: '2026-08-24T08:11:00.000Z',
    ...over,
  };
}

describe('isDueOn', () => {
  it('is due every day for a daily item', () => {
    expect(isDueOn(item(), '2026-08-24')).toBe(true);
  });

  it('is not due before the item existed', () => {
    expect(isDueOn(item({ anchorDate: '2026-08-25' }), '2026-08-24')).toBe(false);
  });

  it('respects chosen weekdays', () => {
    // 2026-08-24 is a Monday.
    const weekly = item({ scheduleKind: 'weekdays', weekdays: [1, 4] });
    expect(isDueOn(weekly, '2026-08-24')).toBe(true);
    expect(isDueOn(weekly, '2026-08-25')).toBe(false);
    expect(isDueOn(weekly, '2026-08-27')).toBe(true);
  });

  it('counts an every-N-days schedule from the anchor', () => {
    const every3 = item({ scheduleKind: 'interval', intervalDays: 3, anchorDate: '2026-08-24' });
    expect(isDueOn(every3, '2026-08-24')).toBe(true);
    expect(isDueOn(every3, '2026-08-25')).toBe(false);
    expect(isDueOn(every3, '2026-08-27')).toBe(true);
    expect(isDueOn(every3, '2026-09-02')).toBe(true);
  });

  it('ends a course on its own without being turned off', () => {
    const course = item({ kind: 'medicine', courseStart: '2026-08-20', courseEnd: '2026-08-25' });
    expect(isDueOn(course, '2026-08-25')).toBe(true);
    expect(isDueOn(course, '2026-08-26')).toBe(false);
    expect(isDueOn(course, '2026-08-19')).toBe(false);
  });

  it('never makes an as-needed item due', () => {
    expect(isDueOn(item({ scheduleKind: 'as_needed', times: [] }), '2026-08-24')).toBe(false);
  });

  it('drops an archived item entirely', () => {
    expect(isDueOn(item({ archivedAt: '2026-08-23T00:00:00Z' }), '2026-08-24')).toBe(false);
  });
});

describe('dosesOn', () => {
  it('emits one dose per scheduled time, in clock order', () => {
    const doses = dosesOn([item({ times: ['21:00', '08:00'] })], '2026-08-24');
    expect(doses.map((d) => d.dueTime)).toEqual(['08:00', '21:00']);
  });

  it('bands doses by the part of day people actually think in', () => {
    expect(bandFor('07:30')).toBe('morning');
    expect(bandFor('13:00')).toBe('midday');
    expect(bandFor('18:30')).toBe('evening');
    expect(bandFor('22:30')).toBe('night');
    // The small hours belong to the night that has not ended yet.
    expect(bandFor('02:00')).toBe('night');
  });
});

describe('doseStates', () => {
  const items = [item({ times: ['08:00', '20:00'] })];

  it('marks a dose past its time and untouched as overdue', () => {
    const states = doseStates(items, [], '2026-08-24', '12:00');
    expect(states.map((s) => s.overdue)).toEqual([true, false]);
  });

  it('is never overdue once ticked or explicitly skipped', () => {
    const taken = doseStates(items, [event()], '2026-08-24', '12:00');
    expect(taken[0]!.status).toBe('taken');
    expect(taken[0]!.overdue).toBe(false);

    const skipped = doseStates(items, [event({ status: 'skipped' })], '2026-08-24', '12:00');
    expect(skipped[0]!.status).toBe('skipped');
    expect(skipped[0]!.overdue).toBe(false);
  });

  it('groups into bands in the order the day runs', () => {
    const groups = groupByBand(doseStates(items, [], '2026-08-24', '12:00'));
    expect(groups.map((g) => g.band)).toEqual(['morning', 'evening']);
  });
});

describe('adherence', () => {
  it('counts only the days the item was actually scheduled', () => {
    const course = item({ kind: 'medicine', courseStart: '2026-08-24', courseEnd: '2026-08-26' });
    const result = adherenceFor(course, [event()], '2026-08-24', '2026-08-30');
    // Three course days, one ticked — the four days after the course ended are
    // not failures.
    expect(result.due).toBe(3);
    expect(result.taken).toBe(1);
    expect(result.missed).toBe(2);
  });

  it('separates an explicit skip from a silent gap', () => {
    const result = adherenceFor(
      item(),
      [event({ status: 'skipped' }), event({ id: 'e2', dueDate: '2026-08-25' })],
      '2026-08-24',
      '2026-08-26',
    );
    expect(result).toMatchObject({ due: 3, taken: 1, skipped: 1, missed: 1 });
  });

  it('reports no rate when nothing was due', () => {
    expect(adherenceFor(item({ scheduleKind: 'as_needed', times: [] }), [], '2026-08-24', '2026-08-30').rate).toBeNull();
  });
});

describe('supply', () => {
  it('turns a packet count into days at the current schedule', () => {
    expect(daysOfSupply(item({ supplyCount: 30 }))).toBe(30);
    expect(daysOfSupply(item({ supplyCount: 30, times: ['08:00', '20:00'] }))).toBe(15);
    expect(daysOfSupply(item({ supplyCount: 30, scheduleKind: 'interval', intervalDays: 2 }))).toBe(60);
  });

  it('warns while there is still a week left, not on the last tablet', () => {
    expect(needsRefill(item({ supplyCount: 20 }))).toBe(false);
    expect(needsRefill(item({ supplyCount: 7 }))).toBe(true);
    expect(needsRefill(item({ supplyCount: null }))).toBe(false);
  });

  it('counts course days inclusively', () => {
    expect(courseDaysRemaining(item({ courseEnd: '2026-08-26' }), '2026-08-24')).toBe(3);
    expect(courseDaysRemaining(item(), '2026-08-24')).toBeNull();
  });
});

describe('absorption notes', () => {
  it('surfaces the iron and calcium notes by name', () => {
    expect(absorptionNotes({ name: 'Ferrous fumarate', notes: null }).map((n) => n.id)).toEqual([
      'iron-tea-coffee',
    ]);
    expect(absorptionNotes({ name: 'Calcium + D3', notes: null }).map((n) => n.id)).toEqual([
      'calcium-blocks-iron',
    ]);
  });

  it('says nothing about anything else — no interaction checking beyond these', () => {
    expect(absorptionNotes({ name: 'Amoxicillin', notes: 'three times a day' })).toEqual([]);
    expect(absorptionNotes({ name: 'Warfarin', notes: null })).toEqual([]);
  });
});

describe('scheduleSummary', () => {
  it('describes each schedule kind without repeating the name', () => {
    expect(scheduleSummary(item())).toBe('Every day · 08:00');
    expect(scheduleSummary(item({ scheduleKind: 'weekdays', weekdays: [1, 3] }))).toBe('Mon Wed · 08:00');
    expect(scheduleSummary(item({ scheduleKind: 'interval', intervalDays: 3 }))).toBe('Every 3 days · 08:00');
    expect(scheduleSummary(item({ scheduleKind: 'as_needed', times: [] }))).toBe('As needed');
  });
});

describe('quiet hours', () => {
  it('handles a window that wraps past midnight', () => {
    expect(withinWindow('23:30', '22:00', '07:00')).toBe(true);
    expect(withinWindow('03:00', '22:00', '07:00')).toBe(true);
    expect(withinWindow('07:00', '22:00', '07:00')).toBe(false);
    expect(withinWindow('12:00', '22:00', '07:00')).toBe(false);
  });
});
