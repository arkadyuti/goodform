import type { Profile } from './types.js';

export interface ProteinTarget {
  minG: number;
  maxG: number;
  /** Midpoint, used as the headline daily number. */
  targetG: number;
}

/** PRD FR-6.1: 1.4–1.6 g per kg body weight. No calorie targets, ever. */
export function proteinTarget(weightKg: number): ProteinTarget {
  const minG = Math.round(weightKg * 1.4);
  const maxG = Math.round(weightKg * 1.6);
  return { minG, maxG, targetG: Math.round((minG + maxG) / 2) };
}

/** Litres of water per day, a simple weight-derived guide. */
export function hydrationTargetMl(weightKg: number): number {
  return Math.round((weightKg * 33) / 100) * 100;
}

/** FR-6.4: pattern-specific guidance, surfaced contextually rather than as a wall of text. */
export const DIETARY_NOTES: Record<Profile['dietaryPattern'], string[]> = {
  omnivore: [],
  no_red_meat: ['Watch iron — pair pulses and greens with vitamin C (lemon, tomato, citrus).'],
  pescatarian: ['Oily fish twice a week covers omega-3 without a supplement.'],
  vegetarian: [
    'Pair iron sources with vitamin C; keep tea and coffee away from meals — they block absorption.',
    'B12 comes only from dairy and fortified foods here. A supplement is usually sensible.',
  ],
  eggetarian: [
    'Eggs cover B12 well. Iron still absorbs better with vitamin C alongside.',
  ],
  vegan: [
    'B12 must be supplemented — there is no reliable plant source.',
    'Pair iron with vitamin C; avoid tea and coffee near meals.',
    'Algae-based omega-3 replaces what fish would provide.',
  ],
};
