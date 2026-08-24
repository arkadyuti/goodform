/**
 * Audio and haptic cues for phase changes.
 *
 * On iOS the page must own an audio session to survive backgrounding, and
 * that stops the user's music. There is no setting that gives both, so the
 * choice is the user's and is stated plainly in Settings (PRD §5.3).
 */
export type AudioMode = 'transient' | 'playback';

interface AudioSessionCapableNavigator extends Navigator {
  audioSession?: { type: string };
}

export class Cues {
  private ctx: AudioContext | null = null;
  private silence: OscillatorNode | null = null;

  constructor(
    private options: { sound: boolean; haptics: boolean; mode: AudioMode },
  ) {}

  update(options: Partial<{ sound: boolean; haptics: boolean; mode: AudioMode }>): void {
    this.options = { ...this.options, ...options };
  }

  /** Must be called from a user gesture — browsers will not start audio otherwise. */
  async arm(): Promise<void> {
    if (!this.options.sound) return;
    const nav = navigator as AudioSessionCapableNavigator;
    if (nav.audioSession) nav.audioSession.type = this.options.mode;

    this.ctx ??= new AudioContext();
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    // 'playback' holds the audio session open with an inaudible tone, which is
    // what keeps cues firing when the screen locks.
    if (this.options.mode === 'playback' && !this.silence) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      gain.gain.value = 0.0001;
      osc.frequency.value = 30;
      osc.connect(gain).connect(this.ctx.destination);
      osc.start();
      this.silence = osc;
    }
  }

  private tone(frequency: number, durationMs: number, gainValue = 0.22): void {
    if (!this.options.sound || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(gainValue, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + durationMs / 1000 + 0.05);
  }

  private buzz(pattern: number | number[]): void {
    if (!this.options.haptics || !hapticsSupported()) return;
    navigator.vibrate(pattern);
  }

  /** Rising pair — the run is starting. */
  runCue(): void {
    this.tone(660, 220);
    setTimeout(() => this.tone(880, 320), 200);
    this.buzz([120, 80, 200]);
  }

  /** Falling pair — walk and recover. */
  walkCue(): void {
    this.tone(440, 260);
    setTimeout(() => this.tone(330, 380), 240);
    this.buzz(180);
  }

  countdown(): void {
    this.tone(520, 90, 0.14);
    this.buzz(40);
  }

  finish(): void {
    [523, 659, 784].forEach((f, i) => setTimeout(() => this.tone(f, 400), i * 180));
    this.buzz([200, 100, 200, 100, 400]);
  }

  release(): void {
    this.silence?.stop();
    this.silence = null;
    void this.ctx?.close();
    this.ctx = null;
  }
}

/**
 * Every iOS browser runs on WebKit, and WebKit has no Vibration API. The
 * setting is hidden rather than shown doing nothing (PRD §5.1).
 */
export function hapticsSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

export function audioSessionSupported(): boolean {
  return typeof navigator !== 'undefined' && 'audioSession' in navigator;
}
