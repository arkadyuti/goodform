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

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
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
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
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
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const screenings = pgTable('screenings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  flags: jsonb('flags').$type<string[]>().notNull().default([]),
  completedAt: timestamp('completed_at').notNull().defaultNow(),
  acknowledgedAt: timestamp('acknowledged_at'),
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
    .default(['water', 'sleep', 'alcohol', 'cigarettes']),
  customHabits: jsonb('custom_habits').$type<{ key: string; label: string; unit: string }[]>().notNull().default([]),
  /** For the quit-support cards: typical daily count and unit cost before starting. */
  smokingBaselinePerDay: real('smoking_baseline_per_day'),
  cigaretteCost: real('cigarette_cost'),
  alcoholBaselinePerWeek: real('alcohol_baseline_per_week'),
  alcoholUnitCost: real('alcohol_unit_cost'),
  currency: text('currency').notNull().default('INR'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
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
  recordedAt: timestamp('recorded_at').notNull().defaultNow(),
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
    createdAt: timestamp('created_at').notNull().defaultNow(),
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
    completedAt: timestamp('completed_at'),
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
    createdAt: timestamp('created_at').notNull().defaultNow(),
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
    cigarettes: integer('cigarettes').notNull().default(0),
    customHabits: jsonb('custom_habits').$type<Record<string, number>>().notNull().default({}),
    supplements: jsonb('supplements').$type<Record<string, boolean>>().notNull().default({}),
    notes: text('notes'),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
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
    createdAt: timestamp('created_at').notNull().defaultNow(),
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
    createdAt: timestamp('created_at').notNull().defaultNow(),
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
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.exerciseId] })],
);
