import { describe, expect, it } from 'vitest';
import {
  addDays,
  dateRange,
  daysBetween,
  isDateString,
  isTimeString,
  minutesOfDay,
  startOfWeek,
  timeFromMinutes,
  weekdayOf,
  withinWindow,
} from './dates.js';

/**
 * This module is imported by the scheduler, five route files, the range
 * validator and most of the web app, and had no tests of its own. The
 * UTC-noon parsing it is built on is a deliberate defence against DST and
 * host timezone, and nothing proved it worked.
 */
describe('calendar arithmetic', () => {
  it('adds and subtracts days across month and year boundaries', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29'); // leap year
    expect(addDays('2026-08-24', 0)).toBe('2026-08-24');
  });

  it('counts whole days, signed', () => {
    expect(daysBetween('2026-08-24', '2026-08-25')).toBe(1);
    expect(daysBetween('2026-08-25', '2026-08-24')).toBe(-1);
    expect(daysBetween('2026-08-24', '2026-08-24')).toBe(0);
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1);
  });

  it('survives a DST transition in the host timezone', () => {
    // The whole point of parsing at UTC noon. Run under a zone that springs
    // forward on 2026-03-08; a naive local-midnight implementation returns 0
    // or 2 for one of these.
    const original = process.env.TZ;
    process.env.TZ = 'America/Los_Angeles';
    try {
      expect(daysBetween('2026-03-07', '2026-03-08')).toBe(1);
      expect(daysBetween('2026-03-08', '2026-03-09')).toBe(1);
      expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
      // And the autumn transition, where a day is 25 hours long.
      expect(daysBetween('2026-11-01', '2026-11-02')).toBe(1);
      expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
    } finally {
      process.env.TZ = original;
    }
  });

  it('names weekdays with Sunday as 0', () => {
    expect(weekdayOf('2026-08-23')).toBe(0); // Sunday
    expect(weekdayOf('2026-08-24')).toBe(1); // Monday
    expect(weekdayOf('2026-08-29')).toBe(6); // Saturday
  });

  it('starts the week on Monday, including from a Sunday', () => {
    // Sunday belongs to the week that is ending, not the one about to start —
    // every weekly review and trend bucket depends on this one case.
    expect(startOfWeek('2026-08-23')).toBe('2026-08-17'); // Sunday → previous Monday
    expect(startOfWeek('2026-08-24')).toBe('2026-08-24'); // Monday → itself
    expect(startOfWeek('2026-08-29')).toBe('2026-08-24'); // Saturday → that Monday
  });

  it('builds an inclusive range, and nothing when it runs backwards', () => {
    expect(dateRange('2026-08-24', '2026-08-26')).toEqual([
      '2026-08-24',
      '2026-08-25',
      '2026-08-26',
    ]);
    expect(dateRange('2026-08-24', '2026-08-24')).toEqual(['2026-08-24']);
    expect(dateRange('2026-08-26', '2026-08-24')).toEqual([]);
  });

  it('recognises a date shape without judging the date', () => {
    expect(isDateString('2026-08-24')).toBe(true);
    expect(isDateString('2026-8-24')).toBe(false);
    expect(isDateString('not a date')).toBe(false);
    // Known limitation: this checks shape, not validity.
    expect(isDateString('2026-13-45')).toBe(true);
  });
});

describe('times of day', () => {
  it('converts to minutes and back', () => {
    expect(minutesOfDay('00:00')).toBe(0);
    expect(minutesOfDay('08:30')).toBe(510);
    expect(minutesOfDay('23:59')).toBe(1439);
    expect(timeFromMinutes(510)).toBe('08:30');
    expect(timeFromMinutes(0)).toBe('00:00');
  });

  it('wraps rather than overflowing, which is how the session nudge is derived', () => {
    // sessionTime 00:30 minus an hour is 23:30 the day before, not -30.
    expect(timeFromMinutes(minutesOfDay('00:30') - 60)).toBe('23:30');
    expect(timeFromMinutes(1440)).toBe('00:00');
    expect(timeFromMinutes(-1)).toBe('23:59');
  });

  it('validates the shape', () => {
    expect(isTimeString('08:00')).toBe(true);
    expect(isTimeString('24:00')).toBe(false);
    expect(isTimeString('08:60')).toBe(false);
    expect(isTimeString('8:00')).toBe(false);
  });

  it('handles a window that wraps past midnight — which quiet hours nearly always do', () => {
    expect(withinWindow('23:00', '22:00', '07:00')).toBe(true);
    expect(withinWindow('03:00', '22:00', '07:00')).toBe(true);
    expect(withinWindow('12:00', '22:00', '07:00')).toBe(false);
    // The boundaries: start is inside, end is not.
    expect(withinWindow('22:00', '22:00', '07:00')).toBe(true);
    expect(withinWindow('07:00', '22:00', '07:00')).toBe(false);
  });

  it('handles a window that does not wrap', () => {
    expect(withinWindow('12:00', '09:00', '17:00')).toBe(true);
    expect(withinWindow('08:00', '09:00', '17:00')).toBe(false);
    expect(withinWindow('17:00', '09:00', '17:00')).toBe(false);
  });

  it('treats an empty window as covering nothing', () => {
    // Quiet hours set to the same start and end mean "off", not "always".
    expect(withinWindow('12:00', '22:00', '22:00')).toBe(false);
    expect(withinWindow('22:00', '22:00', '22:00')).toBe(false);
  });
});
