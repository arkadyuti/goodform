import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { buildStrengthSessions, progressReps } from '@goodform/shared';
import {
  useSessions,
  useLogSession,
  useProfile,
  useStrengthProgress,
  useWeekReview,
} from '../api/hooks.ts';
import { today } from '../lib/date.ts';
import { clearSessionId, sessionIdFor } from '../lib/sessionId.ts';
import { Button, Card, Eyebrow, Note } from '../components/ui.tsx';
import { StopRules } from '../components/StopRules.tsx';

export function StrengthSession() {
  const navigate = useNavigate();
  const { data: profileData } = useProfile();
  const { data: progressData } = useStrengthProgress();
  const { data: review } = useWeekReview(true);
  const logSession = useLogSession();

  const profile = profileData?.profile;
  // A repeated week comes with extra strength work — that is what makes the
  // repeat useful rather than just a pause (FR-3.2).
  const emphasis = review?.gate.strengthEmphasis ?? false;

  const sessions = useMemo(
    () =>
      profile
        ? buildStrengthSessions(
            { equipment: profile.equipment, injuryHistory: profile.injuryHistory },
            { emphasis },
          )
        : [],
    [profile, emphasis],
  );

  // Alternate the two sessions across the week.
  const slot = new Date().getDay() >= 4 ? 1 : 0;
  const session = sessions[slot] ?? sessions[0];
  /**
   * Sets already recorded today, read back on mount.
   *
   * The ticks are written as they happen, but the screen did not read them —
   * so a refresh showed 0 of 12 with six already saved, and ticking again
   * wrote them a second time.
   */
  const { data: todaysSessions } = useSessions(today());
  const recorded = todaysSessions?.sessions.find(
    (session) => session.type === 'strength' && session.date === today(),
  );
  // Derived rather than hydrated through an effect: until this screen is
  // touched, what the server already has *is* the state.
  const [edits, setEdits] = useState<Record<string, number> | null>(null);
  const setsDone = edits ?? recorded?.exerciseLog ?? {};
  const setSetsDone = (next: (current: Record<string, number>) => Record<string, number>) =>
    setEdits(next(setsDone));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fixed before the first set, so every write below updates one record.
   *
   * Ticked sets used to live in React state until a final "save" button, so
   * closing the app after twelve sets threw all twelve away. They are written
   * as they are ticked now; the button at the end only leaves the screen.
   */
  const [sessionId] = useState(() => sessionIdFor(today(), 'strength'));

  if (!profile || !session) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Note>Finish your profile and GoodForm will build your strength work.</Note>
      </div>
    );
  }

  const totalSets = session.exercises.reduce((sum, e) => sum + e.sets, 0);
  const doneSets = Object.values(setsDone).reduce((sum, n) => sum + n, 0);

  /** What the session looks like given a set of ticks. */
  const payload = (sets: Record<string, number>) => {
    const done = Object.values(sets).reduce((sum, n) => sum + n, 0);
    return {
      id: sessionId,
      date: today(),
      type: 'strength' as const,
      completion:
        done >= totalSets
          ? ('full' as const)
          : done > 0
            ? ('partial' as const)
            : ('skipped' as const),
      exerciseLog: sets,
      effort: null,
      discomfort: null,
    };
  };

  // Fire-and-forget: a failure here is queued by `api.durable` and drains
  // later, and the explicit save at the end reports anything that is not.
  const record = (sets: Record<string, number>) => logSession.mutate(payload(sets));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await logSession.mutateAsync(payload(setsDone));
      clearSessionId(today(), 'strength');
      void navigate('/');
    } catch {
      // Without this the button stayed on "Saving" for ever and the work was
      // gone, with the failure visible only in a console nobody has open.
      setError('That did not save. Your sets are still here — try again.');
      setSaving(false);
    }
  };

  return (
    <div
      className="mx-auto w-full max-w-2xl px-4 py-5"
      // Routed as immersive, so there is no nav above it to hold the inset —
      // without this the first row sits under the iOS status bar.
      style={{
        paddingTop: 'calc(1.25rem + env(safe-area-inset-top))',
        paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))',
      }}
    >
      <div className="flex items-center justify-between">
        <Eyebrow>Strength · session {session.slot}</Eyebrow>
        <button
          onClick={() => navigate('/')}
          className="tap px-2 text-[0.875rem] text-ink-faint hover:text-ink"
        >
          Not today
        </button>
      </div>
      <h1 className="mt-2 text-3xl" style={{ fontWeight: 780 }}>
        The work that keeps you running
      </h1>
      <p className="mt-2 leading-relaxed text-ink-soft">
        Tempo matters more than weight here. Slow lowering is what builds tendon stiffness, and
        tendon stiffness is what absorbs every step you take.
      </p>

      {emphasis && (
        <Note tone="run">
          Extra work this week while your running holds steady. This is the part that lets the
          tissue catch up.
        </Note>
      )}

      <div className="mt-4 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-chalk-deep">
          <div
            className="h-full rounded-full bg-run"
            style={{ width: `${(doneSets / totalSets) * 100}%`, transition: 'width 200ms ease' }}
          />
        </div>
        <p className="tabular text-sm text-ink-soft">
          {doneSets}/{totalSets} sets
        </p>
      </div>

      <ul className="mt-4 flex flex-col gap-3">
        {session.exercises.map((exercise) => {
          const done = setsDone[exercise.id] ?? 0;
          const completedBefore = progressData?.progress[exercise.id] ?? 0;
          const reps = progressReps(exercise.reps, completedBefore);
          return (
            <li key={exercise.id}>
              <Card>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {exercise.name}
                      {exercise.perSide && (
                        <span className="ml-2 text-[0.875rem] font-normal text-ink-faint">
                          each side
                        </span>
                      )}
                    </p>
                    <p className="text-[0.8125rem] text-ink-faint">{exercise.target}</p>
                  </div>
                  {exercise.priority && (
                    <span className="shrink-0 rounded-md bg-run-wash px-2 py-0.5 text-[0.6875rem] font-semibold tracking-wide text-run-deep uppercase">
                      Keep
                    </span>
                  )}
                </div>

                <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[0.9375rem]">
                  <span>
                    <span className="tabular font-semibold">{exercise.sets}</span> sets
                  </span>
                  <span>
                    <span className="tabular font-semibold">{reps}</span> reps
                    {reps !== exercise.reps && (
                      <span className="ml-1 text-[0.75rem] text-good">progressed</span>
                    )}
                  </span>
                  <span className="text-walk-deep">{exercise.tempo}</span>
                </div>

                <ul className="mt-2 flex flex-col gap-0.5">
                  {exercise.cues.map((cue) => (
                    <li key={cue} className="text-[0.875rem] leading-snug text-ink-soft">
                      {cue}
                    </li>
                  ))}
                </ul>

                <div className="mt-3 flex gap-2">
                  {Array.from({ length: exercise.sets }, (_, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        // Computed outside the updater: React may re-invoke
                        // an updater — it does on every render under
                        // StrictMode — and an updater that posts is not pure.
                        const next = { ...setsDone, [exercise.id]: done > i ? i : i + 1 };
                        setSetsDone(() => next);
                        // Saved on the tick, not at the end. The offline
                        // queue is keyed on the session id, so repeated
                        // writes collapse into one rather than piling up.
                        record(next);
                      }}
                      aria-label={`Set ${i + 1} of ${exercise.name}`}
                      aria-pressed={done > i}
                      className={`tap flex-1 rounded-xl border font-semibold transition-colors ${
                        done > i
                          ? 'border-good bg-good text-white'
                          : 'border-line bg-chalk hover:border-ink-faint'
                      }`}
                    >
                      {done > i ? '✓' : i + 1}
                    </button>
                  ))}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>

      <Button full className="mt-5 py-4 text-[1.0625rem]" disabled={saving} onClick={save}>
        {saving ? 'Saving' : doneSets >= totalSets ? 'Save — all done' : 'Save what I did'}
      </Button>
      {error && (
        <p className="mt-2.5 text-center text-[0.9375rem] text-alert" role="alert">
          {error}
        </p>
      )}
      <StopRules className="mt-4" />
    </div>
  );
}
