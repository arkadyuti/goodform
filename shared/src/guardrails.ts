import { daysBetween } from './dates.js';
import { bmi } from './plan-engine/conservatism.js';

export interface GuardrailCheck {
  date: string;
  weightKg: number | null;
}

export interface GuardrailInput {
  heightCm: number;
  /** Weekly checks, newest first. */
  checks: GuardrailCheck[];
  /** Protein grams by date over the last four weeks; days with no log omitted. */
  proteinByDate: Record<string, number>;
  proteinTargetG: number;
  /** Dates of every logged session over the last four weeks. */
  sessionDates: string[];
  today: string;
}

export interface GuardrailSignal {
  id: 'rapid_loss' | 'low_bmi' | 'sustained_undereating' | 'compulsive_training';
  label: string;
  detail: string;
}

export interface GuardrailAssessment {
  triggered: boolean;
  signals: GuardrailSignal[];
  /** Shown once when targets are withdrawn. Describes, never diagnoses. */
  message: string;
}

/**
 * The message that replaces the numbers. It says what changed and why, offers a
 * way back, and stops well short of telling anyone what is wrong with them —
 * this app is not equipped to do that and should not pretend otherwise.
 */
export const WITHDRAWAL_MESSAGE =
  'GoodForm has put your protein target and weight figures away for now. Not because something is wrong with you — because when the last few weeks look like this, a number on a screen usually makes eating harder rather than easier. You can still log food; it just will not be scored against anything. You can bring the targets back yourself in Settings whenever you want. If any of this rings true, a doctor or a dietitian is the right person to talk to, and an app is not.';

/**
 * FR: disordered-pattern detection. Four signals, each one a pattern in data
 * the app already holds, and each deliberately conservative — a false positive
 * costs a person their targets for a week, which is survivable; a threshold set
 * so high it never fires costs the feature its entire purpose.
 *
 * This is not a screening tool and gives no diagnosis. It changes what GoodForm
 * displays, and nothing else.
 */
export function assessNutritionRisk(input: GuardrailInput): GuardrailAssessment {
  const signals: GuardrailSignal[] = [];
  const checks = [...input.checks]
    .filter((c) => c.weightKg !== null)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const latest = checks[0];
  const weights = checks.filter((c) => daysBetween(c.date, input.today) <= 35);

  // --- 1. Weight coming off faster than tissue can be spared ---------------
  const newest = weights[0];
  const oldest = weights[weights.length - 1];
  if (weights.length >= 2 && newest && oldest) {
    const days = daysBetween(oldest.date, newest.date);
    if (days >= 14) {
      const lost = oldest.weightKg! - newest.weightKg!;
      const weeklyPercent = (lost / oldest.weightKg!) * 100 * (7 / days);
      if (weeklyPercent >= 1) {
        signals.push({
          id: 'rapid_loss',
          label: 'Weight is coming off quickly',
          detail: `About ${weeklyPercent.toFixed(1)}% of body weight a week over the last ${days} days. Above roughly 1% a week, most of what goes is muscle rather than fat — and muscle is what carries you when you run.`,
        });
      }
    }
  }

  // --- 2. Body mass low enough that a deficit is the wrong direction -------
  if (latest?.weightKg) {
    const index = bmi({ heightCm: input.heightCm, weightKg: latest.weightKg });
    if (index < 18.5) {
      signals.push({
        id: 'low_bmi',
        label: 'Body mass is on the low side',
        detail:
          'At this weight for your height, training adds load your body has little spare tissue to absorb. Targets that push intake down are the wrong tool here.',
      });
    }
  }

  // --- 3. Intake far under target, sustained, while weight falls ----------
  const proteinDays = Object.entries(input.proteinByDate)
    .filter(([date]) => daysBetween(date, input.today) <= 14)
    .map(([, grams]) => grams);
  const wayUnder = proteinDays.filter((g) => g > 0 && g < input.proteinTargetG * 0.5).length;
  const losing = weights.length >= 2 && (newest?.weightKg ?? 0) < (oldest?.weightKg ?? 0);
  if (proteinDays.length >= 8 && wayUnder >= 8 && losing) {
    signals.push({
      id: 'sustained_undereating',
      label: 'Intake has stayed well under target',
      detail: `Protein came in under half of target on ${wayUnder} of the last ${proteinDays.length} logged days while weight was falling. That combination stops being a deficit and starts being a hole.`,
    });
  }

  // --- 4. Training every day, with no rest to adapt in --------------------
  const recentSessions = new Set(
    input.sessionDates.filter((date) => daysBetween(date, input.today) <= 14),
  );
  if (recentSessions.size >= 13) {
    signals.push({
      id: 'compulsive_training',
      label: 'Sessions almost every day',
      detail: `${recentSessions.size} of the last 14 days had a session logged. The plan asks for five at most, and rest is where the adaptation actually happens.`,
    });
  }

  return { triggered: signals.length > 0, signals, message: WITHDRAWAL_MESSAGE };
}
