import { and, eq, gte, isNull, lte } from 'drizzle-orm';
import type { DoseEvent, RegimenItem } from '@goodform/shared';
import { db, schema } from './db/index.js';

type ItemRow = typeof schema.regimenItems.$inferSelect;
type EventRow = typeof schema.regimenEvents.$inferSelect;

export function toItem(row: ItemRow): RegimenItem {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as RegimenItem['kind'],
    doseAmount: row.doseAmount,
    doseForm: row.doseForm as RegimenItem['doseForm'],
    scheduleKind: row.scheduleKind as RegimenItem['scheduleKind'],
    weekdays: row.weekdays,
    intervalDays: row.intervalDays,
    anchorDate: row.anchorDate,
    times: row.times,
    foodRule: row.foodRule as RegimenItem['foodRule'],
    courseStart: row.courseStart,
    courseEnd: row.courseEnd,
    supplyCount: row.supplyCount,
    remindersEnabled: row.remindersEnabled,
    notes: row.notes,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
  };
}

export function toEvent(row: EventRow): DoseEvent {
  return {
    id: row.id,
    itemId: row.itemId,
    dueDate: row.dueDate,
    dueTime: row.dueTime,
    status: row.status as DoseEvent['status'],
    recordedAt: row.recordedAt.toISOString(),
  };
}

/** Live items only — archived ones are kept for history, never for scheduling. */
export async function loadActiveItems(userId: string): Promise<RegimenItem[]> {
  const rows = await db
    .select()
    .from(schema.regimenItems)
    .where(and(eq(schema.regimenItems.userId, userId), isNull(schema.regimenItems.archivedAt)))
    .orderBy(schema.regimenItems.name);
  return rows.map(toItem);
}

export async function loadAllItems(userId: string): Promise<RegimenItem[]> {
  const rows = await db
    .select()
    .from(schema.regimenItems)
    .where(eq(schema.regimenItems.userId, userId))
    .orderBy(schema.regimenItems.name);
  return rows.map(toItem);
}

export async function loadEvents(userId: string, from: string, to: string): Promise<DoseEvent[]> {
  const rows = await db
    .select()
    .from(schema.regimenEvents)
    .where(
      and(
        eq(schema.regimenEvents.userId, userId),
        gte(schema.regimenEvents.dueDate, from),
        lte(schema.regimenEvents.dueDate, to),
      ),
    );
  return rows.map(toEvent);
}

/**
 * Every user the scheduler should look at: reminders switched on, and at least
 * one registered device. Without a device there is nothing to deliver to, and
 * the due-now card on Today covers them anyway.
 */
export async function usersAwaitingReminders() {
  const rows = await db
    .select({ settings: schema.settings })
    .from(schema.settings)
    .innerJoin(schema.pushSubscriptions, eq(schema.pushSubscriptions.userId, schema.settings.userId))
    .where(eq(schema.settings.remindersEnabled, true));

  // The join fans out per device; one row per user is what the caller wants.
  const unique = new Map<string, (typeof rows)[number]['settings']>();
  for (const row of rows) unique.set(row.settings.userId, row.settings);
  return [...unique.values()];
}

/** Adjusts the packet count when a dose is ticked off or a tick is undone. */
export async function adjustSupply(itemId: string, delta: number): Promise<void> {
  const [item] = await db.select().from(schema.regimenItems).where(eq(schema.regimenItems.id, itemId));
  if (!item || item.supplyCount === null) return;
  await db
    .update(schema.regimenItems)
    .set({ supplyCount: Math.max(0, item.supplyCount + delta), updatedAt: new Date() })
    .where(eq(schema.regimenItems.id, itemId));
}

/** Clears any pending nudge for an occurrence the user has now acted on. */
export async function resolveReminder(userId: string, kind: string, key: string): Promise<void> {
  await db
    .insert(schema.reminders)
    .values({ userId, kind, key, attempts: 0, resolvedAt: new Date() })
    .onConflictDoUpdate({
      target: [schema.reminders.userId, schema.reminders.kind, schema.reminders.key],
      set: { resolvedAt: new Date(), snoozedUntil: null },
    });
}
