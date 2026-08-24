import { Hono } from 'hono';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { z } from 'zod';
import {
  DOSE_FORMS,
  DOSE_STATUSES,
  FOOD_RULES,
  ITEM_KINDS,
  SCHEDULE_KINDS,
  addDays,
  adherenceFor,
  courseFinished,
  doseStates,
  isDueOn,
  isTimeString,
  type DoseEvent,
  type RegimenItem,
} from '@goodform/shared';
import { db, schema } from '../db/index.js';
import { dateRangeFrom, limitFrom, requireAuth, todayFrom, type AppEnv } from '../middleware.js';
import { adjustSupply, loadActiveItems, loadAllItems, loadEvents, resolveReminder, toEvent, toItem } from '../regimen-store.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const itemSchema = z.object({
  name: z.string().min(1).max(80),
  kind: z.enum(ITEM_KINDS),
  doseAmount: z.number().min(0).max(10_000).nullish(),
  doseForm: z.enum(DOSE_FORMS).default('tablet'),
  scheduleKind: z.enum(SCHEDULE_KINDS).default('daily'),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  intervalDays: z.number().int().min(1).max(90).default(1),
  anchorDate: z.string().regex(DATE),
  times: z.array(z.string().refine(isTimeString, 'Expected HH:MM')).max(6).default([]),
  foodRule: z.enum(FOOD_RULES).default('none'),
  courseStart: z.string().regex(DATE).nullish(),
  courseEnd: z.string().regex(DATE).nullish(),
  supplyCount: z.number().int().min(0).max(10_000).nullish(),
  remindersEnabled: z.boolean().default(true),
  notes: z.string().max(500).nullish(),
});

/** Rules the shape alone cannot express, kept in one place for both routes. */
function validate(input: z.infer<typeof itemSchema>): string | null {
  if (input.scheduleKind === 'weekdays' && input.weekdays.length === 0) {
    return 'Pick at least one day of the week';
  }
  if (input.scheduleKind !== 'as_needed' && input.times.length === 0) {
    return 'Add at least one time of day';
  }
  if (input.courseStart && input.courseEnd && input.courseEnd < input.courseStart) {
    return 'A course cannot end before it starts';
  }
  return null;
}

function values(input: z.infer<typeof itemSchema>, userId: string) {
  return {
    userId,
    name: input.name.trim(),
    kind: input.kind,
    doseAmount: input.doseAmount ?? null,
    doseForm: input.doseForm,
    scheduleKind: input.scheduleKind,
    weekdays: input.scheduleKind === 'weekdays' ? [...new Set(input.weekdays)].sort() : [],
    intervalDays: input.intervalDays,
    anchorDate: input.anchorDate,
    times: input.scheduleKind === 'as_needed' ? [] : [...new Set(input.times)].sort(),
    foodRule: input.foodRule,
    courseStart: input.courseStart ?? null,
    courseEnd: input.courseEnd ?? null,
    supplyCount: input.supplyCount ?? null,
    remindersEnabled: input.remindersEnabled,
    notes: input.notes ?? null,
    updatedAt: new Date(),
  };
}

export const regimenRoutes = new Hono<AppEnv>()
  .use('*', requireAuth)

  .get('/items', async (c) => {
    const includeArchived = c.req.query('all') === 'true';
    const userId = c.get('userId');
    const items = includeArchived ? await loadAllItems(userId) : await loadActiveItems(userId);
    return c.json({ items });
  })

  .post('/items', async (c) => {
    const parsed = itemSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: 'Invalid item', issues: parsed.error.issues }, 400);
    const problem = validate(parsed.data);
    if (problem) return c.json({ error: problem }, 400);

    const [row] = await db.insert(schema.regimenItems).values(values(parsed.data, c.get('userId'))).returning();
    return c.json({ item: toItem(row!) });
  })

  .put('/items/:id', async (c) => {
    const parsed = itemSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: 'Invalid item', issues: parsed.error.issues }, 400);
    const problem = validate(parsed.data);
    if (problem) return c.json({ error: problem }, 400);

    const [row] = await db
      .update(schema.regimenItems)
      .set(values(parsed.data, c.get('userId')))
      .where(and(eq(schema.regimenItems.userId, c.get('userId')), eq(schema.regimenItems.id, c.req.param('id'))))
      .returning();
    if (!row) return c.json({ error: 'Not found' }, 404);
    return c.json({ item: toItem(row) });
  })

  /** Adds doses back to the packet, so a refill is one tap rather than a form. */
  .post('/items/:id/refill', async (c) => {
    const parsed = z.object({ doses: z.number().int().min(0).max(10_000) }).safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: 'Invalid refill' }, 400);
    const [row] = await db
      .update(schema.regimenItems)
      .set({ supplyCount: parsed.data.doses, updatedAt: new Date() })
      .where(and(eq(schema.regimenItems.userId, c.get('userId')), eq(schema.regimenItems.id, c.req.param('id'))))
      .returning();
    if (!row) return c.json({ error: 'Not found' }, 404);
    return c.json({ item: toItem(row) });
  })

  /**
   * Stopping an item archives it. History and adherence are the point of
   * having logged any of this, so nothing is destroyed by ordinary use — a
   * real delete lives on the account screen, where it says so plainly.
   */
  .delete('/items/:id', async (c) => {
    const permanent = c.req.query('permanent') === 'true';
    const where = and(
      eq(schema.regimenItems.userId, c.get('userId')),
      eq(schema.regimenItems.id, c.req.param('id')),
    );
    if (permanent) {
      await db.delete(schema.regimenItems).where(where);
      return c.json({ ok: true, deleted: true });
    }
    const [row] = await db.update(schema.regimenItems).set({ archivedAt: new Date() }).where(where).returning();
    if (!row) return c.json({ error: 'Not found' }, 404);
    return c.json({ ok: true, item: toItem(row) });
  })

  .post('/items/:id/restore', async (c) => {
    const [row] = await db
      .update(schema.regimenItems)
      .set({ archivedAt: null, updatedAt: new Date() })
      .where(and(eq(schema.regimenItems.userId, c.get('userId')), eq(schema.regimenItems.id, c.req.param('id'))))
      .returning();
    if (!row) return c.json({ error: 'Not found' }, 404);
    return c.json({ item: toItem(row) });
  })

  /** Everything due on a day, with what has already been logged against it. */
  .get('/due', async (c) => {
    const userId = c.get('userId');
    const date = await todayFrom(c);
    const nowTime = c.req.query('time');
    const items = await loadActiveItems(userId);
    const events = await loadEvents(userId, date, date);

    // With no clock supplied, assume the start of the day: the alternative
    // marks a whole list overdue for someone who is simply up early.
    const doses = doseStates(items, events, date, isTimeString(nowTime ?? '') ? nowTime! : '00:00');
    // As-needed items never appear as due, but should still be one tap away.
    const asNeeded = items.filter((i) => i.scheduleKind === 'as_needed');
    // A course that has just run out is worth saying once, then dropping.
    const finishedCourses = items.filter(
      (i) => courseFinished(i, date) && i.courseEnd! >= addDays(date, -7),
    );

    return c.json({ date, doses, asNeeded, finishedCourses, items });
  })

  /**
   * One tap: taken or skipped. The row carries both the day the dose was due
   * and the instant it was actually ticked, and an explicit skip is stored as
   * a skip rather than left to look like a gap.
   */
  .post('/events', async (c) => {
    const userId = c.get('userId');
    const parsed = z
      .object({
        id: z.string().uuid(),
        itemId: z.string().uuid(),
        dueDate: z.string().regex(DATE),
        dueTime: z.string().refine(isTimeString, 'Expected HH:MM').nullish(),
        status: z.enum(DOSE_STATUSES),
        reminderKey: z.string().max(200).optional(),
      })
      .safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: 'Invalid dose', issues: parsed.error.issues }, 400);
    const input = parsed.data;

    const [item] = await db
      .select()
      .from(schema.regimenItems)
      .where(and(eq(schema.regimenItems.userId, userId), eq(schema.regimenItems.id, input.itemId)));
    if (!item) return c.json({ error: 'Not found' }, 404);

    const existing = await db
      .select()
      .from(schema.regimenEvents)
      .where(
        and(
          eq(schema.regimenEvents.userId, userId),
          eq(schema.regimenEvents.itemId, input.itemId),
          eq(schema.regimenEvents.dueDate, input.dueDate),
          input.dueTime
            ? eq(schema.regimenEvents.dueTime, input.dueTime)
            : eq(schema.regimenEvents.id, input.id),
        ),
      );
    const previous = existing[0];

    const row = {
      id: previous?.id ?? input.id,
      userId,
      itemId: input.itemId,
      dueDate: input.dueDate,
      dueTime: input.dueTime ?? null,
      status: input.status,
      recordedAt: new Date(),
    };

    // Client-supplied id again, and the same boundary: without setWhere a tick
    // naming another account's event id would rewrite their dose history.
    const [written] = await db
      .insert(schema.regimenEvents)
      .values(row)
      .onConflictDoUpdate({
        target: schema.regimenEvents.id,
        set: { status: row.status, recordedAt: row.recordedAt },
        setWhere: eq(schema.regimenEvents.userId, userId),
      })
      .returning({ id: schema.regimenEvents.id });
    if (!written) return c.json({ error: 'Not found' }, 404);

    // Supply follows the ticks, so the count on screen is the count in the box.
    const wasTaken = previous?.status === 'taken';
    const nowTaken = input.status === 'taken';
    if (nowTaken && !wasTaken) await adjustSupply(input.itemId, -1);
    else if (!nowTaken && wasTaken) await adjustSupply(input.itemId, 1);

    await resolveReminder(userId, 'regimen', input.reminderKey ?? `${input.itemId}:${input.dueDate}:${input.dueTime ?? ''}`);

    return c.json({ ok: true, id: row.id });
  })

  /** Undo — removes a tick entirely rather than recording a contradiction. */
  .delete('/events/:id', async (c) => {
    const userId = c.get('userId');
    const [row] = await db
      .select()
      .from(schema.regimenEvents)
      .where(and(eq(schema.regimenEvents.userId, userId), eq(schema.regimenEvents.id, c.req.param('id'))));
    if (!row) return c.json({ ok: true });
    if (row.status === 'taken') await adjustSupply(row.itemId, 1);
    await db.delete(schema.regimenEvents).where(eq(schema.regimenEvents.id, row.id));
    return c.json({ ok: true });
  })

  /** "Remind me in 30 minutes", straight from the notification. */
  .post('/snooze', async (c) => {
    const parsed = z
      .object({ reminderKey: z.string().max(200), minutes: z.number().int().min(5).max(240).default(30) })
      .safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: 'Invalid snooze' }, 400);

    const until = new Date(Date.now() + parsed.data.minutes * 60_000);
    await db
      .insert(schema.reminders)
      .values({ userId: c.get('userId'), kind: 'regimen', key: parsed.data.reminderKey, snoozedUntil: until })
      .onConflictDoUpdate({
        target: [schema.reminders.userId, schema.reminders.kind, schema.reminders.key],
        set: { snoozedUntil: until, resolvedAt: null },
      });
    return c.json({ ok: true, until: until.toISOString() });
  })

  /** Per-item history and adherence over a window. */
  .get('/history', async (c) => {
    const userId = c.get('userId');
    const { from, to } = await dateRangeFrom(c, { defaultDays: 27, maxDays: 366 });

    const items = await loadAllItems(userId);
    const events = await loadEvents(userId, from, to);

    const perItem = items.map((item) => ({
      item,
      adherence: adherenceFor(item, events, from, to),
      lastTaken:
        events
          .filter((e) => e.itemId === item.id && e.status === 'taken')
          .sort((a, b) => (a.recordedAt < b.recordedAt ? 1 : -1))[0]?.recordedAt ?? null,
      /** One entry per scheduled day, for the strip on the history screen. */
      days: dayStrip(item, events, from, to),
    }));

    return c.json({ from, to, items: perItem });
  })

  .get('/events', async (c) => {
    const userId = c.get('userId');
    const { from, to } = await dateRangeFrom(c, { defaultDays: 365, maxDays: 1830 });
    const rows = await db
      .select()
      .from(schema.regimenEvents)
      .where(
        and(
          eq(schema.regimenEvents.userId, userId),
          gte(schema.regimenEvents.dueDate, from),
          lte(schema.regimenEvents.dueDate, to),
        ),
      )
      .orderBy(desc(schema.regimenEvents.dueDate))
      .limit(limitFrom(c, 500, 2000));
    return c.json({ events: rows.map(toEvent) });
  });

type DayMark = { date: string; taken: number; skipped: number; missed: number };

function dayStrip(item: RegimenItem, events: DoseEvent[], from: string, to: string): DayMark[] {
  const marks: DayMark[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    if (!isDueOn(item, date)) continue;
    const onDay = events.filter((e) => e.itemId === item.id && e.dueDate === date);
    const taken = onDay.filter((e) => e.status === 'taken').length;
    const skipped = onDay.filter((e) => e.status === 'skipped').length;
    marks.push({ date, taken, skipped, missed: Math.max(0, item.times.length - taken - skipped) });
  }
  return marks;
}
