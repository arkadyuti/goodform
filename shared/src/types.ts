// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export const SEXES = ['male', 'female', 'intersex'] as const;
export type Sex = (typeof SEXES)[number];

export const UNITS = ['metric', 'imperial'] as const;
export type Units = (typeof UNITS)[number];

export const DIETARY_PATTERNS = [
  'omnivore',
  'no_red_meat',
  'pescatarian',
  'vegetarian',
  'eggetarian',
  'vegan',
] as const;
export type DietaryPattern = (typeof DIETARY_PATTERNS)[number];

export const ACTIVITY_LEVELS = [
  'none',
  'occasional_sport',
  'regular_sport',
  'other_cardio',
] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

export const SMOKING_STATUSES = ['never', 'current', 'quitting', 'former'] as const;
export type SmokingStatus = (typeof SMOKING_STATUSES)[number];

export const ALCOHOL_FREQUENCIES = ['never', 'occasional', 'weekly', 'more'] as const;
export type AlcoholFrequency = (typeof ALCOHOL_FREQUENCIES)[number];

export const INJURY_SITES = ['knee', 'shin', 'ankle', 'achilles', 'hip', 'back', 'foot'] as const;
export type InjurySite = (typeof INJURY_SITES)[number];

export const EQUIPMENT = ['none', 'pull_up_bar', 'resistance_bands', 'dumbbells', 'step'] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export const GOALS = [
  'first_continuous_run',
  'five_k',
  'ten_k',
  'general_fitness',
  'return_after_break',
] as const;
export type Goal = (typeof GOALS)[number];

export interface Profile {
  age: number;
  sexAtBirth: Sex;
  heightCm: number;
  weightKg: number;
  units: Units;
  dietaryPattern: DietaryPattern;
  exclusions: string[];
  activityLevel: ActivityLevel;
  smokingStatus: SmokingStatus;
  alcoholFrequency: AlcoholFrequency;
  injuryHistory: InjurySite[];
  injuryNotes?: string;
  equipment: Equipment[];
  goal: Goal;
}

// ---------------------------------------------------------------------------
// Screening (PAR-Q+)
// ---------------------------------------------------------------------------

export const SCREENING_FLAGS = [
  'heart_condition',
  'chest_pain',
  'dizziness',
  'bone_or_joint_problem',
  'bp_or_heart_medication',
  'pregnancy',
  'other_reason',
] as const;
export type ScreeningFlag = (typeof SCREENING_FLAGS)[number];

export interface Screening {
  flags: ScreeningFlag[];
  completedAt: string;
  acknowledgedAt: string | null;
}

// ---------------------------------------------------------------------------
// Baseline assessment
// ---------------------------------------------------------------------------

export const STOP_REASONS = ['breath', 'legs', 'choice'] as const;
/** Why the baseline run ended. `legs` signals a tissue limit → more conservative plan. */
export type StopReason = (typeof STOP_REASONS)[number];

export interface Baseline {
  minutesRun: number;
  stopReason: StopReason;
  recordedAt: string;
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

export interface PlanWeek {
  /** 1-based week number within the block. */
  index: number;
  runSec: number;
  walkSec: number;
  reps: number;
  sessionsPerWeek: number;
  isDeload: boolean;
  /** Total running seconds across the week: runSec * reps * sessionsPerWeek. */
  totalRunSec: number;
}

export interface Plan {
  goal: Goal;
  /** 0 = standard progression, higher = slower and shorter starting intervals. */
  conservatism: number;
  conservatismReasons: string[];
  startDate: string;
  weeks: PlanWeek[];
}

export type PlanStatus = 'active' | 'paused' | 'completed' | 'abandoned';

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export type SessionType = 'run' | 'strength' | 'baseline';
export type Completion = 'full' | 'partial' | 'skipped';

export const DISCOMFORT_LOCATIONS = [
  'shin',
  'calf',
  'knee',
  'achilles',
  'hip',
  'foot',
  'back',
  'other',
] as const;
export type DiscomfortLocation = (typeof DISCOMFORT_LOCATIONS)[number];

/**
 * Perceived effort, 1–5, recorded after a session.
 *
 * Nothing in the plan engine keys off it: gates move on completion and
 * discomfort alone. It exists so a runner can look back over a block and see
 * that the same prescription got easier — which is the adaptation, and is
 * otherwise invisible.
 */
/**
 * Discomfort severity, 1–5, recorded after a session.
 *
 * Unlike effort, this moves the plan: 3 twice in a week repeats it, 4 or above
 * pauses progression. It carried a single line of explanation for the whole
 * scale while effort — which changes nothing — had five named anchors, so the
 * one number a beginner had to get right was the one they had no way to
 * calibrate. Under-reporting is how people get hurt; over-reporting stalls
 * them for no reason.
 */
export const SEVERITY_LEVELS = [
  { value: 1, label: 'Noticed it', hint: 'You would not have mentioned it if nobody asked' },
  { value: 2, label: 'Aware of it', hint: 'There while you ran, gone soon after' },
  {
    value: 3,
    label: 'It changed how you ran',
    hint: 'You shortened your stride or slowed down for it',
  },
  { value: 4, label: 'It made you stop, or want to', hint: 'Still there after the run' },
  { value: 5, label: 'Sharp', hint: 'You could not have carried on' },
] as const;

export function severityLabel(value: number | null): string {
  return SEVERITY_LEVELS.find((level) => level.value === value)?.label ?? '';
}

export function severityHint(value: number | null): string {
  return SEVERITY_LEVELS.find((level) => level.value === value)?.hint ?? '';
}

export const EFFORT_LEVELS = [
  { value: 1, label: 'Easy', hint: 'Full sentences throughout, could have gone much longer' },
  { value: 2, label: 'Comfortable', hint: 'Talking was fine, never laboured' },
  { value: 3, label: 'Steady', hint: 'Working, but in control the whole way' },
  { value: 4, label: 'Hard', hint: 'Short phrases only, glad when it ended' },
  { value: 5, label: 'All out', hint: 'As hard as you could go, nothing left' },
] as const;

export function effortLabel(value: number | null): string {
  return EFFORT_LEVELS.find((level) => level.value === value)?.label ?? '';
}

export function effortHint(value: number | null): string {
  return EFFORT_LEVELS.find((level) => level.value === value)?.hint ?? '';
}

export interface Discomfort {
  location: DiscomfortLocation;
  severity: 1 | 2 | 3 | 4 | 5;
}

/**
 * What a session asked for, recorded alongside what happened.
 *
 * Three fields, not a whole `PlanWeek` — the type said `PlanWeek` while every
 * writer in the app sent exactly these three, so anything reading `index` or
 * `isDeload` off a stored prescription was reading a field that was never
 * written. Narrowing the type to what is actually stored makes that a compile
 * error instead of an `undefined` at runtime.
 */
/**
 * What the app will accept for the numbers onboarding asks for.
 *
 * One source, used by the server's validation and by the buttons that let you
 * move on. The inputs carried `min`/`max` attributes that browsers do not
 * enforce on a non-submitted form, so an age of 5 or a 999-minute baseline got
 * all the way to "Build my plan" before anything objected.
 */
export const LIMITS = {
  age: { min: 13, max: 100, unit: 'years' },
  heightCm: { min: 90, max: 250, unit: 'cm' },
  weightKg: { min: 25, max: 300, unit: 'kg' },
  minutesRun: { min: 0, max: 120, unit: 'minutes' },
} as const;

/** True when a value is present and inside its limit. */
export function withinLimit(field: keyof typeof LIMITS, value: number | null | undefined): boolean {
  if (value === null || value === undefined || Number.isNaN(value)) return false;
  const { min, max } = LIMITS[field];
  return value >= min && value <= max;
}

export interface Prescription {
  runSec: number;
  walkSec: number;
  reps: number;
}

/**
 * Whether a session actually reached the interval it was prescribed.
 *
 * The headline "longest unbroken interval" was a plain max over every session's
 * prescription, including ones the runner marked `skipped` — so backfilling a
 * skipped 50-minute session made the Progress screen claim fifty minutes
 * unbroken, directly above a chart that said four. Three call sites computed
 * this differently; this is the one rule.
 */
export function reachedTheInterval(session: {
  completion: Completion;
  intervalsCompleted: number | null;
}): boolean {
  if (session.completion === 'skipped') return false;
  return session.completion === 'full' || (session.intervalsCompleted ?? 0) > 0;
}

export interface WorkoutSession {
  id: string;
  date: string;
  type: SessionType;
  planWeek: number | null;
  prescription: Prescription | null;
  completion: Completion;
  effort: number | null;
  discomfort: Discomfort | null;
  intervalsCompleted: number | null;
  durationSec: number | null;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Gating
// ---------------------------------------------------------------------------

export type GateDecision =
  | 'advance'
  | 'offer_repeat'
  | 'repeat'
  | 'step_back'
  | 'pause_medical'
  /**
   * Make the week smaller.
   *
   * The plan could only go up or sideways. Someone finishing three of eight
   * intervals every session got the same week, and the same sentence, for ever
   * — the app repeating itself while claiming to adapt. This is the way down.
   */
  | 'ease';

export interface GateResult {
  decision: GateDecision;
  /** Plain-language reason shown to the user. Never framed as failure. */
  reason: string;
  /** True when the user may override with a single risk explanation. */
  overridable: boolean;
  /** Extra strength emphasis recommended for the repeated week. */
  strengthEmphasis: boolean;
  /** For `ease`: what the week should become. */
  easeTo?: { runSec: number; reps: number };
}

// ---------------------------------------------------------------------------
// Daily logs
// ---------------------------------------------------------------------------

export interface DailyLog {
  date: string;
  waterMl: number;
  sleepHours: number | null;
  alcoholUnits: number;
  /** Beers as drinks — counting units is a conversion nobody does honestly. */
  beers: number;
  cigarettes: number;
  customHabits: Record<string, number>;
  notes: string | null;
}

export interface FoodItem {
  id: string;
  name: string;
  locale: string;
  dietaryTags: DietaryPattern[];
  servingLabel: string;
  proteinG: number;
}

export interface NutritionEntry {
  id: string;
  date: string;
  foodItemId: string;
  servings: number;
}

export interface WeeklyCheck {
  date: string;
  weightKg: number | null;
  waistCm: number | null;
  restingHr: number | null;
  capability: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Strength
// ---------------------------------------------------------------------------

export type EquipmentTier = 'bodyweight' | 'bar' | 'loaded';

export interface StrengthExercise {
  id: string;
  name: string;
  /** Kept as a label. Selection is decided by `requires`, below. */
  tier: EquipmentTier;
  /**
   * What this needs to be possible at all. Empty means nothing but a floor.
   *
   * Equipment used to be a ladder — bodyweight ⊂ bar ⊂ loaded — which is not
   * how owning things works: a pull-up bar does not give you dumbbells, and a
   * step is not on the ladder at all. Two consequences, both real: saying you
   * had a pull-up bar changed nothing about what you were asked to do, and the
   * step-down, which needs a step, was handed to people who said they owned
   * nothing. Any one of the listed items is enough.
   */
  requires?: Equipment[];
  /** Muscle/tissue target, e.g. "calf + Achilles". */
  target: string;
  sets: number;
  reps: string;
  /** Explicit tempo, e.g. "3s down, 1s up" — slow eccentrics build tendon stiffness. */
  tempo: string;
  perSide: boolean;
  /** Critical to running tolerance — users short on time keep these. */
  priority: boolean;
  cues: string[];
  /** Injury sites for which this exercise is contraindicated. */
  contraindicatedFor: InjurySite[];
  /** Exercise id to swap in when contraindicated. */
  substituteId?: string;
}

export interface MobilityItem {
  id: string;
  name: string;
  /** Reps for dynamic warm-up items, seconds for static cool-down holds. */
  amount: number;
  unit: 'reps' | 'seconds';
  perSide: boolean;
  cue: string;
}
