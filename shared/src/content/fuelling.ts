import { minutesOfDay } from '../dates.js';
import type { DietaryPattern, SessionType } from '../types.js';

export type FuellingWindow = 'meal' | 'top_up' | 'imminent' | 'recovery';

export interface FuellingGuidance {
  window: FuellingWindow;
  /** Positive before the session, negative after it. */
  minutesToSession: number;
  headline: string;
  points: string[];
  /** Two or three concrete things, chosen to fit how the runner eats. */
  examples: string[];
}

const CARB_EXAMPLES = ['banana', 'two slices of toast with jam', 'a handful of dates', 'poha', 'idli'];

const RECOVERY_EXAMPLES: Record<DietaryPattern, string[]> = {
  omnivore: ['eggs on toast', 'chicken and rice', 'curd with fruit'],
  no_red_meat: ['eggs on toast', 'chicken and rice', 'curd with fruit'],
  pescatarian: ['tuna on toast', 'curd with fruit', 'eggs and rice'],
  vegetarian: ['paneer bhurji with roti', 'curd with fruit', 'rajma and rice'],
  eggetarian: ['eggs on toast', 'curd with fruit', 'chana and rice'],
  vegan: ['tofu and rice', 'soy milk with oats and fruit', 'chana chaat'],
};

/**
 * P3: fuelling tied to the actual session time rather than to meal names.
 * Nothing here is a calorie target — it is what to eat and roughly when, so a
 * session is not run on nothing and the hours after it are not wasted.
 *
 * Returns null outside the windows that matter, so the card simply is not there
 * for most of the day.
 */
export function fuellingFor(params: {
  sessionTime: string;
  nowTime: string;
  sessionType: SessionType;
  dietaryPattern: DietaryPattern;
  /** True once the session has been logged — recovery advice, not preparation. */
  sessionDone: boolean;
}): FuellingGuidance | null {
  const minutesToSession = minutesOfDay(params.sessionTime) - minutesOfDay(params.nowTime);
  const examples = RECOVERY_EXAMPLES[params.dietaryPattern];

  if (params.sessionDone) {
    // The window is generous on purpose: "within two hours" is the real
    // finding, and a stopwatch on it helps nobody.
    if (minutesToSession < -180) return null;
    return {
      window: 'recovery',
      minutesToSession,
      headline: 'Eat within the next couple of hours',
      points: [
        'Protein plus carbohydrate together. Protein gives the repair its materials; carbohydrate puts back what the run spent.',
        'This matters more than anything you ate beforehand — the hours after a session are when the adaptation gets paid for.',
      ],
      examples,
    };
  }

  if (minutesToSession > 180 || minutesToSession < 0) return null;

  if (minutesToSession > 90) {
    return {
      window: 'meal',
      minutesToSession,
      headline: `A proper meal now, ${Math.round(minutesToSession / 30) / 2} hours out`,
      points: [
        'Carbohydrate-led, and go easy on fat and fibre — both sit in the stomach and neither helps you run.',
        'Drink water now rather than in the last ten minutes.',
      ],
      examples: ['rice and dal', 'oats with fruit', 'sandwich and a banana'],
    };
  }

  if (minutesToSession > 30) {
    return {
      window: 'top_up',
      minutesToSession,
      headline: `Something small, about ${minutesToSession} minutes out`,
      points: [
        'A light carbohydrate top-up is enough. A full meal this close usually turns into a stitch.',
        params.sessionType === 'strength'
          ? 'Strength work tolerates a fuller stomach than running does, but not by much.'
          : 'If you ran fasted before and felt fine, that is also a perfectly good answer at this distance.',
      ],
      examples: CARB_EXAMPLES.slice(0, 3),
    };
  }

  return {
    window: 'imminent',
    minutesToSession,
    headline: 'Too close to eat properly — and that is fine',
    points: [
      'A session of this length runs perfectly well on nothing. Sip water and go.',
      'If you are genuinely empty, something small and sweet sits better than anything solid.',
    ],
    examples: ['a few sips of juice', 'a date or two'],
  };
}
