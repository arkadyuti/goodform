import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Better Auth tables
// ---------------------------------------------------------------------------

/*
 * Every timestamp column is `timestamptz`.
 *
 * These all hold instants — when a row was written, when a session expires,
 * when a dose was ticked — and an instant without an offset is only meaningful
 * if you also know which clock recorded it. It worked while the one box ran on
 * UTC and would have started lying the moment that changed. Wall-clock values
 * that genuinely have no offset, like a dose's `08:00` or a log's date, are
 * stored as text and date columns on purpose, and are untouched by this.
 */
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  /** Provider issuer URL, written by Better Auth for OIDC providers. */
  issuer: text('issuer'),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Profile, screening, settings
// ---------------------------------------------------------------------------

export const profiles = pgTable('profiles', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  age: integer('age').notNull(),
  sexAtBirth: text('sex_at_birth').notNull(),
  heightCm: real('height_cm').notNull(),
  weightKg: real('weight_kg').notNull(),
  units: text('units').notNull().default('metric'),
  dietaryPattern: text('dietary_pattern').notNull(),
  exclusions: jsonb('exclusions').$type<string[]>().notNull().default([]),
  activityLevel: text('activity_level').notNull(),
  smokingStatus: text('smoking_status').notNull(),
  alcoholFrequency: text('alcohol_frequency').notNull().default('never'),
  injuryHistory: jsonb('injury_history').$type<string[]>().notNull().default([]),
  injuryNotes: text('injury_notes'),
  equipment: jsonb('equipment').$type<string[]>().notNull().default(['none']),
  goal: text('goal').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const screenings = pgTable('screenings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  flags: jsonb('flags').$type<string[]>().notNull().default([]),
  completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
});

export const settings = pgTable('settings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  /** 'transient' ducks music but may not survive backgrounding; 'playback' owns audio. */
  audioMode: text('audio_mode').notNull().default('transient'),
  soundEnabled: boolean('sound_enabled').notNull().default(true),
  hapticsEnabled: boolean('haptics_enabled').notNull().default(true),
  trackedHabits: jsonb('tracked_habits')
    .$type<string[]>()
    .notNull()
    .default(['water', 'sleep', 'alcohol', 'beer', 'cigarettes']),
  customHabits: jsonb('custom_habits').$type<{ key: string; label: string; unit: string }[]>().notNull().default([]),
  /** For the quit-support cards: typical daily count and unit cost before starting. */
  smokingBaselinePerDay: real('smoking_baseline_per_day'),
  cigaretteCost: real('cigarette_cost'),
  alcoholBaselinePerWeek: real('alcohol_baseline_per_week'),
  alcoholUnitCost: real('alcohol_unit_cost'),
  currency: text('currency').notNull().default('INR'),

  // --- Reminders (P3, P3.1) ---------------------------------------------
  /** IANA zone, set from the browser. Schedules are local and must survive
   *  travel and DST without shifting, so the scheduler converts per user. */
  timezone: text('timezone').notNull().default('UTC'),
  remindersEnabled: boolean('reminders_enabled').notNull().default(false),
  regimenReminders: boolean('regimen_reminders').notNull().default(true),
  sessionReminders: boolean('session_reminders').notNull().default(true),
  weeklyCheckReminders: boolean('weekly_check_reminders').notNull().default(true),
  /** 0 = Sunday. */
  weeklyCheckDay: integer('weekly_check_day').notNull().default(0),
  weeklyCheckTime: text('weekly_check_time').notNull().default('09:30'),
  quietHoursStart: text('quiet_hours_start').notNull().default('22:00'),
  quietHoursEnd: text('quiet_hours_end').notNull().default('07:00'),
  /** Medicine names are sensitive health data — off the lock screen by default. */
  hideNamesInNotifications: boolean('hide_names_in_notifications').notNull().default(true),
  /** A second nudge for medicines only. Supplements never nag. */
  medicineEscalation: boolean('medicine_escalation').notNull().default(true),

  /**
   * When the runner usually trains: drives fuelling guidance and the nudge,
   * which lands an hour earlier. Defaulted to 08:00 rather than 07:00 so that
   * derived 07:00 nudge clears the default quiet window's 07:00 end — at 07:00
   * the reminder would have been suppressed every single day, in silence.
   */
  sessionTime: text('session_time').notNull().default('08:00'),
  fuellingTips: boolean('fuelling_tips').notNull().default(true),

  // --- Nutrition guardrails (P3) -----------------------------------------
  /** Set when a disordered pattern was detected and the numeric targets were
   *  put away. Cleared only by the user, from Settings. */
  targetsWithdrawnAt: timestamp('targets_withdrawn_at', { withTimezone: true }),
  targetsRestoredAt: timestamp('targets_restored_at', { withTimezone: true }),
  guardrailSignals: jsonb('guardrail_signals')
    .$type<{ id: string; label: string; detail: string }[]>()
    .notNull()
    .default([]),

  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

export const baselines = pgTable('baselines', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  minutesRun: real('minutes_run').notNull(),
  stopReason: text('stop_reason').notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
});

export const plans = pgTable(
  'plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    goal: text('goal').notNull(),
    conservatism: integer('conservatism').notNull(),
    conservatismReasons: jsonb('conservatism_reasons').$type<string[]>().notNull().default([]),
    startDate: date('start_date').notNull(),
    currentWeek: integer('current_week').notNull().default(1),
    /** active | paused | completed | abandoned */
    status: text('status').notNull().default('active'),
    /** Set when a gate paused progression; cleared on acknowledgement. */
    pausedReason: text('paused_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('plans_user_idx').on(t.userId)],
);

export const planWeeks = pgTable(
  'plan_weeks',
  {
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),
    index: integer('index').notNull(),
    runSec: integer('run_sec').notNull(),
    walkSec: integer('walk_sec').notNull(),
    reps: integer('reps').notNull(),
    sessionsPerWeek: integer('sessions_per_week').notNull(),
    isDeload: boolean('is_deload').notNull().default(false),
    totalRunSec: integer('total_run_sec').notNull(),
    /** How many times this week has been repeated. */
    repeats: integer('repeats').notNull().default(0),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.planId, t.index] })],
);

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export const workoutSessions = pgTable(
  'workout_sessions',
  {
    /** Client-generated so an offline log replays idempotently. */
    id: uuid('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id').references(() => plans.id, { onDelete: 'set null' }),
    date: date('date').notNull(),
    /** run | strength | baseline */
    type: text('type').notNull(),
    planWeek: integer('plan_week'),
    prescription: jsonb('prescription'),
    /** full | partial | skipped */
    completion: text('completion').notNull(),
    effort: integer('effort'),
    discomfortLocation: text('discomfort_location'),
    discomfortSeverity: integer('discomfort_severity'),
    intervalsCompleted: integer('intervals_completed'),
    durationSec: integer('duration_sec'),
    /** Per-exercise sets done, for strength sessions. */
    exerciseLog: jsonb('exercise_log').$type<Record<string, number>>(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sessions_user_date_idx').on(t.userId, t.date)],
);

// ---------------------------------------------------------------------------
// Daily logs, nutrition, weekly checks
// ---------------------------------------------------------------------------

export const dailyLogs = pgTable(
  'daily_logs',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    waterMl: integer('water_ml').notNull().default(0),
    sleepHours: real('sleep_hours'),
    alcoholUnits: real('alcohol_units').notNull().default(0),
    /** Beers counted as drinks, so nobody has to convert to units in their head. */
    beers: integer('beers').notNull().default(0),
    cigarettes: integer('cigarettes').notNull().default(0),
    customHabits: jsonb('custom_habits').$type<Record<string, number>>().notNull().default({}),
    /**
     * Superseded by `regimen_events`, which timestamps what was actually taken
     * and can tell an explicit skip from a silent gap — neither of which a map
     * of booleans can do. Kept only so no existing row is dropped; nothing
     * reads or writes it. Safe to remove in a later migration.
     */
    supplements: jsonb('supplements').$type<Record<string, boolean>>().notNull().default({}),
    notes: text('notes'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.date] })],
);

export const foodItems = pgTable(
  'food_items',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    locale: text('locale').notNull().default('GLOBAL'),
    dietaryTags: jsonb('dietary_tags').$type<string[]>().notNull().default([]),
    servingLabel: text('serving_label').notNull(),
    proteinG: real('protein_g').notNull(),
    /** User-created foods belong to one user; seeded foods are shared (null). */
    ownerId: text('owner_id').references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [index('food_owner_idx').on(t.ownerId)],
);

export const nutritionEntries = pgTable(
  'nutrition_entries',
  {
    id: uuid('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    foodItemId: text('food_item_id')
      .notNull()
      .references(() => foodItems.id, { onDelete: 'cascade' }),
    servings: numeric('servings', { precision: 5, scale: 2 }).notNull().default('1'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('nutrition_user_date_idx').on(t.userId, t.date)],
);

export const weeklyChecks = pgTable(
  'weekly_checks',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    weightKg: real('weight_kg'),
    waistCm: real('waist_cm'),
    restingHr: integer('resting_hr'),
    capability: jsonb('capability').$type<Record<string, number>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.date] })],
);

export const strengthProgress = pgTable(
  'strength_progress',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    exerciseId: text('exercise_id').notNull(),
    sessionsCompleted: integer('sessions_completed').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.exerciseId] })],
);

// ---------------------------------------------------------------------------
// Supplements and medicines (P3.1)
// ---------------------------------------------------------------------------

export const regimenItems = pgTable(
  'regimen_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** supplement | medicine — drives urgency, escalation and tone throughout. */
    kind: text('kind').notNull().default('supplement'),
    doseAmount: real('dose_amount'),
    /** tablet | capsule | scoop | ml | drops | sachet | other */
    doseForm: text('dose_form').notNull().default('tablet'),
    /** daily | weekdays | interval | as_needed */
    scheduleKind: text('schedule_kind').notNull().default('daily'),
    /** 0 = Sunday … 6 = Saturday. */
    weekdays: jsonb('weekdays').$type<number[]>().notNull().default([]),
    intervalDays: integer('interval_days').notNull().default(1),
    /** The day the schedule counts from, and the first day anything is due. */
    anchorDate: date('anchor_date').notNull(),
    /** Local 'HH:MM', one per dose in a day. */
    times: jsonb('times').$type<string[]>().notNull().default([]),
    /** none | with_food | empty_stomach | before_bed */
    foodRule: text('food_rule').notNull().default('none'),
    courseStart: date('course_start'),
    /** A course ends on its own rather than waiting to be switched off. */
    courseEnd: date('course_end'),
    /** Doses left in the packet, decremented as they are ticked. */
    supplyCount: integer('supply_count'),
    remindersEnabled: boolean('reminders_enabled').notNull().default(true),
    notes: text('notes'),
    /** Archived rather than deleted, so history and adherence survive. */
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('regimen_items_user_idx').on(t.userId)],
);

export const regimenEvents = pgTable(
  'regimen_events',
  {
    /** Client-generated so an offline tick replays idempotently. */
    id: uuid('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => regimenItems.id, { onDelete: 'cascade' }),
    /** The day the dose was due — not necessarily the day it was taken. */
    dueDate: date('due_date').notNull(),
    /** 'HH:MM' of the scheduled dose; null for an as-needed dose. */
    dueTime: text('due_time'),
    /** taken | skipped. There is no third value: a gap stays a gap. */
    status: text('status').notNull(),
    /** When the tick actually happened, which is the point of a separate row. */
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('regimen_events_user_date_idx').on(t.userId, t.dueDate),
    // One row per scheduled dose, so replaying a queued write cannot double-log.
    uniqueIndex('regimen_events_occurrence_idx').on(t.itemId, t.dueDate, t.dueTime),
  ],
);

// ---------------------------------------------------------------------------
// Push delivery (P3, P3.1)
// ---------------------------------------------------------------------------

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('push_subs_user_idx').on(t.userId)],
);

/**
 * One row per reminder occurrence. Exists so a restarted scheduler cannot send
 * the same nudge twice, so escalation can be counted, and so "remind me in 30
 * minutes" has somewhere to live.
 */
export const reminders = pgTable(
  'reminders',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** regimen | session | weekly_check */
    kind: text('kind').notNull(),
    /** Identifies the occurrence within its kind. */
    key: text('key').notNull(),
    attempts: integer('attempts').notNull().default(0),
    lastSentAt: timestamp('last_sent_at', { withTimezone: true }),
    snoozedUntil: timestamp('snoozed_until', { withTimezone: true }),
    /** Set when the user acted from the notification — stop nudging. */
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.kind, t.key] })],
);
