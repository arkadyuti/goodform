/**
 * Holds the screen awake for the length of a session and re-acquires it when
 * the tab comes back, since the lock is dropped on every visibility change.
 */
export class ScreenWakeLock {
  private sentinel: WakeLockSentinel | null = null;
  private wanted = false;

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
  }

  static supported(): boolean {
    return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  }

  async acquire(): Promise<void> {
    this.wanted = true;
    if (!ScreenWakeLock.supported() || this.sentinel) return;
    try {
      this.sentinel = await navigator.wakeLock.request('screen');
      this.sentinel.addEventListener('release', () => {
        this.sentinel = null;
      });
    } catch {
      // Denied (low battery, unsupported) — the session still runs.
      this.sentinel = null;
    }
  }

  async release(): Promise<void> {
    this.wanted = false;
    await this.sentinel?.release().catch(() => undefined);
    this.sentinel = null;
  }

  destroy(): void {
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    void this.release();
  }

  private onVisibilityChange = (): void => {
    if (this.wanted && document.visibilityState === 'visible') void this.acquire();
  };
}
