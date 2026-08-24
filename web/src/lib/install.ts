import { useEffect, useState } from 'react';
import { isStandalone } from './push.ts';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function announce() {
  for (const listener of listeners) listener();
}

/**
 * Chromium fires this instead of showing its own prompt, and only fires it
 * once. Captured at module load so the offer survives navigating between
 * screens before anyone acts on it.
 */
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    announce();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    announce();
  });
}

export type InstallState =
  | { kind: 'installed' }
  | { kind: 'prompt'; install: () => Promise<boolean> }
  /** Safari has no install API — the steps have to be described instead. */
  | { kind: 'manual'; steps: string }
  | { kind: 'unavailable' };

function manualSteps(): string {
  const agent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(agent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    return 'Tap Share, then "Add to Home Screen". On iPhone and iPad that is what makes notifications possible at all.';
  }
  if (/Firefox/.test(agent)) return 'Open the browser menu and choose "Install" or "Add to Home Screen".';
  return 'Open the browser menu and choose "Install app" or "Add to Home Screen".';
}

export function useInstallState(): InstallState {
  const [, bump] = useState(0);

  useEffect(() => {
    const listener = () => bump((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  if (isStandalone()) return { kind: 'installed' };

  if (deferred) {
    return {
      kind: 'prompt',
      install: async () => {
        const event = deferred;
        if (!event) return false;
        await event.prompt();
        const { outcome } = await event.userChoice;
        // The event is single-use: a dismissal cannot be re-prompted.
        deferred = null;
        announce();
        return outcome === 'accepted';
      },
    };
  }

  return { kind: 'manual', steps: manualSteps() };
}
