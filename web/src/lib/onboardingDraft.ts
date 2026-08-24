import type { Profile, ScreeningFlag, StopReason } from '@goodform/shared';

const KEY = 'goodform:onboarding';

export interface OnboardingDraft {
  step: string;
  furthest: number;
  profile: Partial<Profile>;
  flags: ScreeningFlag[];
  acknowledged: boolean;
  minutesRun: string;
  stopReason: StopReason | null;
  baselineMode: 'guided' | 'manual' | 'none' | null;
}

/**
 * Onboarding asks a lot of questions before it saves anything, so a reload or
 * a closed tab halfway through would otherwise throw all of it away.
 */
export function loadDraft(): Partial<OnboardingDraft> | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OnboardingDraft>;
    // The reveal needs a freshly generated plan in memory, so resume before it.
    if (parsed.step === 'reveal') parsed.step = 'baseline';
    return parsed;
  } catch {
    return null;
  }
}

export function saveDraft(draft: OnboardingDraft): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Private browsing or a full quota: the wizard still works, just without resume.
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to do.
  }
}
