import type { Profile, ScreeningFlag, StopReason } from '@goodform/shared';

/**
 * Scoped per user: on a shared device an unscoped draft would hand one
 * person's half-finished health answers to whoever signs in next.
 */
const key = (userId: string) => `goodform:onboarding:${userId}`;
const LEGACY_KEY = 'goodform:onboarding';

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
export function loadDraft(userId: string): Partial<OnboardingDraft> | null {
  try {
    localStorage.removeItem(LEGACY_KEY);
    const raw = localStorage.getItem(key(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OnboardingDraft>;
    // The reveal needs a freshly generated plan in memory, so resume before it.
    if (parsed.step === 'reveal') parsed.step = 'baseline';
    return parsed;
  } catch {
    return null;
  }
}

export function saveDraft(userId: string, draft: OnboardingDraft): void {
  try {
    localStorage.setItem(key(userId), JSON.stringify(draft));
  } catch {
    // Private browsing or a full quota: the wizard still works, just without resume.
  }
}

export function clearDraft(userId: string): void {
  try {
    localStorage.removeItem(key(userId));
  } catch {
    // Nothing to do.
  }
}
