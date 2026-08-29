import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  ACTIVITY_LEVELS,
  ALCOHOL_FREQUENCIES,
  DIETARY_PATTERNS,
  EQUIPMENT,
  GOALS,
  INJURY_SITES,
  SCREENING_FLAGS,
  SEXES,
  SMOKING_STATUSES,
  UNITS,
  LIMITS,
  RUN_DAYS_PER_WEEK,
} from '@goodform/shared';
import { db, schema } from '../db/index.js';
import { requireAuth, type AppEnv } from '../middleware.js';

const profileSchema = z.object({
  age: z.number().int().min(LIMITS.age.min).max(LIMITS.age.max),
  sexAtBirth: z.enum(SEXES),
  heightCm: z.number().min(LIMITS.heightCm.min).max(LIMITS.heightCm.max),
  weightKg: z.number().min(LIMITS.weightKg.min).max(LIMITS.weightKg.max),
  units: z.enum(UNITS),
  dietaryPattern: z.enum(DIETARY_PATTERNS),
  exclusions: z.array(z.string().max(60)).max(30).default([]),
  activityLevel: z.enum(ACTIVITY_LEVELS),
  smokingStatus: z.enum(SMOKING_STATUSES),
  alcoholFrequency: z.enum(ALCOHOL_FREQUENCIES),
  injuryHistory: z.array(z.enum(INJURY_SITES)).default([]),
  injuryNotes: z.string().max(500).nullish(),
  equipment: z.array(z.enum(EQUIPMENT)).default(['none']),
  goal: z.enum(GOALS),
});

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const WEEKDAY = z.number().int().min(0).max(6);

const settingsSchema = z.object({
  // Exactly as many run days as the plan builds sessions for, or the weekly
  // gate would count a shortfall the runner never actually had.
  runDays: z.array(WEEKDAY).length(RUN_DAYS_PER_WEEK).optional(),
  strengthDays: z.array(WEEKDAY).max(4).optional(),
  audioMode: z.enum(['transient', 'playback']).optional(),
  soundEnabled: z.boolean().optional(),
  hapticsEnabled: z.boolean().optional(),
  trackedHabits: z.array(z.string().max(40)).max(40).optional(),
  // Capped because this lands in one settings row: without a bound a single
  // request could store megabytes of text on a 512MB box.
  customHabits: z
    .array(
      z.object({
        key: z.string().min(1).max(40),
        label: z.string().min(1).max(60),
        unit: z.string().max(20),
      }),
    )
    .max(20)
    .optional(),
  smokingBaselinePerDay: z.number().min(0).max(100).nullish(),
  cigaretteCost: z.number().min(0).nullish(),
  alcoholBaselinePerWeek: z.number().min(0).max(200).nullish(),
  alcoholUnitCost: z.number().min(0).nullish(),
  currency: z.string().max(8).optional(),

  // Reminders (P3, P3.1)
  // Rejected rather than stored blindly: an unrecognised zone makes every
  // wall-clock calculation quietly fall back to UTC, so reminders arrive at
  // the wrong hour with nothing anywhere saying why.
  timezone: z
    .string()
    .max(64)
    .refine((zone) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: zone });
        return true;
      } catch {
        return false;
      }
    }, 'Unknown time zone')
    .optional(),
  remindersEnabled: z.boolean().optional(),
  regimenReminders: z.boolean().optional(),
  sessionReminders: z.boolean().optional(),
  weeklyCheckReminders: z.boolean().optional(),
  weeklyCheckDay: z.number().int().min(0).max(6).optional(),
  weeklyCheckTime: z.string().regex(TIME).optional(),
  quietHoursStart: z.string().regex(TIME).optional(),
  quietHoursEnd: z.string().regex(TIME).optional(),
  hideNamesInNotifications: z.boolean().optional(),
  medicineEscalation: z.boolean().optional(),
  sessionTime: z.string().regex(TIME).optional(),
  fuellingTips: z.boolean().optional(),
});

export const profileRoutes = new Hono<AppEnv>()
  .use('*', requireAuth)

  .get('/', async (c) => {
    const userId = c.get('userId');
    const [profile] = await db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, userId));
    const [screening] = await db
      .select()
      .from(schema.screenings)
      .where(eq(schema.screenings.userId, userId));
    const [userSettings] = await db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.userId, userId));
    return c.json({
      profile: profile ?? null,
      screening: screening ?? null,
      settings: userSettings ?? null,
    });
  })

  .put('/', async (c) => {
    const userId = c.get('userId');
    const parsed = profileSchema.safeParse(await c.req.json());
    if (!parsed.success)
      return c.json({ error: 'Invalid profile', issues: parsed.error.issues }, 400);

    const values = { ...parsed.data, userId, updatedAt: new Date() };
    await db
      .insert(schema.profiles)
      .values(values)
      .onConflictDoUpdate({ target: schema.profiles.userId, set: values });

    // Make sure a settings row exists so the client always has defaults.
    await db.insert(schema.settings).values({ userId }).onConflictDoNothing();

    return c.json({ ok: true });
  })

  .put('/settings', async (c) => {
    const userId = c.get('userId');
    const parsed = settingsSchema.safeParse(await c.req.json());
    if (!parsed.success)
      return c.json({ error: 'Invalid settings', issues: parsed.error.issues }, 400);

    const values = { ...parsed.data, userId, updatedAt: new Date() };
    await db
      .insert(schema.settings)
      .values(values)
      .onConflictDoUpdate({ target: schema.settings.userId, set: values });
    return c.json({ ok: true });
  })

  /**
   * P3: brings the numeric targets back after the guardrails put them away.
   * Only the user can do this, and doing it stops the sweep from taking them
   * again — the alternative is an app that argues with somebody every week.
   */
  .post('/restore-targets', async (c) => {
    await db
      .update(schema.settings)
      .set({
        targetsWithdrawnAt: null,
        targetsRestoredAt: new Date(),
        guardrailSignals: [],
        updatedAt: new Date(),
      })
      .where(eq(schema.settings.userId, c.get('userId')));
    return c.json({ ok: true });
  })

  .post('/screening', async (c) => {
    const userId = c.get('userId');
    const parsed = z
      .object({ flags: z.array(z.enum(SCREENING_FLAGS)), acknowledged: z.boolean().default(false) })
      .safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: 'Invalid screening' }, 400);

    const values = {
      userId,
      flags: parsed.data.flags,
      completedAt: new Date(),
      acknowledgedAt: parsed.data.acknowledged ? new Date() : null,
    };
    await db
      .insert(schema.screenings)
      .values(values)
      .onConflictDoUpdate({ target: schema.screenings.userId, set: values });

    return c.json({
      ok: true,
      needsAcknowledgement: parsed.data.flags.length > 0 && !parsed.data.acknowledged,
    });
  });
