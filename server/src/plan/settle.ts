import { and, desc, eq, gte } from 'drizzle-orm';
import { settleWeeks, windowFrom, type SettleAction } from '@goodform/shared';
import { db, schema } from '../db/index.js';
import { toSession } from './store.js';

/**
 * Brings the runner's plan up to `today` before anything reads it.
 *
 * Every closed window decides itself — met, on to the next week; not met, the
 * same week again from Monday — so the plan's dates are always right without
 * anyone tapping anything. Idempotent: run twice, the second call does
 * nothing. The plan row is locked for the duration, because two screens
 * loading at once must not both roll the same week.
 */
export async function settlePlan(userId: string, today: string): Promise<SettleAction[]> {
  return db.transaction(async (tx) => {
    const [plan] = await tx
      .select()
      .from(schema.plans)
      .where(and(eq(schema.plans.userId, userId), eq(schema.plans.status, 'active')))
      .orderBy(desc(schema.plans.createdAt))
      .limit(1)
      .for('update');
    if (!plan) return [];

    const weeks = await tx
      .select()
      .from(schema.planWeeks)
      .where(eq(schema.planWeeks.planId, plan.id))
      .orderBy(schema.planWeeks.index);
    const current = weeks.find((w) => w.index === plan.currentWeek);
    if (!current) return [];

    // The common case — the week is still open — costs nothing more.
    if (today <= windowFrom(current.startedOn ?? plan.startDate).to) return [];

    const rows = await tx
      .select()
      .from(schema.workoutSessions)
      .where(
        and(
          eq(schema.workoutSessions.userId, userId),
          gte(schema.workoutSessions.date, plan.startDate),
        ),
      );

    const settled = settleWeeks(
      { currentWeek: plan.currentWeek, startDate: plan.startDate },
      weeks,
      rows.map(toSession),
      today,
    );
    if (settled.actions.length === 0) return [];

    const finished = new Set(
      settled.actions
        .filter((a) => a.kind === 'advanced' || a.kind === 'completed')
        .map((a) => a.week),
    );
    for (const week of settled.weeks) {
      const before = weeks.find((w) => w.index === week.index);
      const moved = before?.startedOn !== week.startedOn || before?.repeats !== week.repeats;
      if (!moved && !finished.has(week.index)) continue;
      await tx
        .update(schema.planWeeks)
        .set({
          startedOn: week.startedOn,
          repeats: week.repeats,
          ...(finished.has(week.index) ? { completedAt: new Date() } : {}),
        })
        .where(and(eq(schema.planWeeks.planId, plan.id), eq(schema.planWeeks.index, week.index)));
    }

    await tx
      .update(schema.plans)
      .set(
        settled.completed
          ? { status: 'completed' }
          : { currentWeek: settled.currentWeek, pausedReason: null },
      )
      .where(eq(schema.plans.id, plan.id));

    return settled.actions;
  });
}
