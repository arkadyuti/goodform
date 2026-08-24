interface Props {
  runSec: number;
  walkSec: number;
  reps: number;
  /** 0–1. Draws the part of the session already done. */
  progress?: number;
  height?: number;
  label?: boolean;
  /** For use on a phase-coloured background, where cobalt and amber vanish. */
  onColor?: boolean;
  /**
   * Longest session in the set, in seconds. Given this, ribbons across a whole
   * block share one time scale, so a shorter session actually looks shorter.
   */
  scaleToSec?: number;
}

/**
 * The shape of a session, drawn to scale: cobalt run blocks against amber
 * walks. The same ribbon runs across the plan so a runner can see the block
 * change shape week by week — intervals lengthening, walks staying put.
 */
export function IntervalRibbon({
  runSec,
  walkSec,
  reps,
  progress,
  height = 12,
  label = false,
  onColor = false,
  scaleToSec,
}: Props) {
  const segments: { phase: 'run' | 'walk'; seconds: number }[] = [];
  for (let i = 0; i < reps; i++) {
    segments.push({ phase: 'run', seconds: runSec });
    segments.push({ phase: 'walk', seconds: walkSec });
  }
  const total = segments.reduce((sum, s) => sum + s.seconds, 0);
  const widthPercent = scaleToSec ? (total / scaleToSec) * 100 : 100;

  return (
    <div>
      <div
        className="w-full"
        style={scaleToSec ? { paddingRight: `${100 - widthPercent}%` } : undefined}
      >
      <div
        className={`relative flex w-full gap-px overflow-hidden rounded-full ${onColor ? 'bg-white/15' : ''}`}
        style={{ height }}
        role="img"
        aria-label={`${reps} repetitions of ${Math.round(runSec / 60)} minutes running and ${Math.round(walkSec / 60)} minutes walking`}
      >
        {segments.map((segment, i) => (
          <div
            key={i}
            className={
              onColor
                ? segment.phase === 'run'
                  ? 'bg-white/45'
                  : 'bg-white/20'
                : segment.phase === 'run'
                  ? 'bg-run'
                  : 'bg-walk'
            }
            style={{ width: `${(segment.seconds / total) * 100}%` }}
          />
        ))}
        {progress !== undefined && (
          <div
            className={`pointer-events-none absolute inset-y-0 left-0 ${onColor ? 'bg-white/85' : 'bg-ink/12'}`}
            style={{
              width: `${Math.min(100, progress * 100)}%`,
              transition: 'width 240ms linear',
              mixBlendMode: onColor ? 'normal' : 'multiply',
            }}
          />
        )}
      </div>
      </div>
      {label && (
        <div className="mt-1.5 flex items-center gap-3 text-[0.7rem] text-ink-soft">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-run" /> run {formatMinutes(runSec)}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-walk" /> walk {formatMinutes(walkSec)}
          </span>
          <span className="text-ink-faint">× {reps}</span>
        </div>
      )}
    </div>
  );
}

export function formatMinutes(seconds: number): string {
  const minutes = seconds / 60;
  return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} min`;
}
