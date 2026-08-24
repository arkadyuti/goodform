import type { Baseline, Profile } from '../types.js';

export interface ConservatismResult {
  /** 0 = standard progression. Higher = shorter starting intervals, slower growth. */
  score: number;
  reasons: string[];
}

const RUNNING_RELEVANT_SITES = ['knee', 'shin', 'ankle', 'achilles', 'hip', 'foot'] as const;

export function bmi(profile: Pick<Profile, 'heightCm' | 'weightKg'>): number {
  const m = profile.heightCm / 100;
  return profile.weightKg / (m * m);
}

/**
 * PRD FR-2.3. The starting interval and rate of progression are reduced when
 * the runner has a reason to adapt more slowly than their lungs allow.
 */
export function assessConservatism(profile: Profile, baseline: Baseline): ConservatismResult {
  const reasons: string[] = [];
  let score = 0;

  if (baseline.minutesRun === 0) {
    // Nobody who has not run yet should be told what their baseline run showed.
    score += 2;
    reasons.push('You are starting from no running at all, so the plan begins as gently as it can.');
  } else if (baseline.stopReason === 'legs') {
    score += 2;
    reasons.push('Your run ended on your legs, not your breath — tissue needs the slower ramp.');
  }
  if (profile.smokingStatus === 'current' || profile.smokingStatus === 'quitting') {
    score += 1;
    reasons.push('Smoking slows tissue recovery, so the plan builds more gradually.');
  }
  if (profile.injuryHistory.some((site) => (RUNNING_RELEVANT_SITES as readonly string[]).includes(site))) {
    score += 1;
    reasons.push('Previous injury at a running-relevant site — starting lower protects it.');
  }
  if (profile.age > 45) {
    score += 1;
    reasons.push('Tendon adaptation takes longer past 45, so progression is gentler.');
  }
  if (bmi(profile) > 30) {
    score += 1;
    reasons.push('Higher load per step means shorter run intervals to start.');
  }
  if (profile.activityLevel === 'none') {
    score += 1;
    reasons.push('Starting from no regular activity — the first weeks stay conservative.');
  }

  return { score: Math.min(score, 5), reasons };
}
