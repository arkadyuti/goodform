import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { buildStrengthSessions, progressReps } from '@goodform/shared';
import { useLogSession, useProfile, useStrengthProgress, useWeekReview } from '../api/hooks.ts';
import { today } from '../lib/date.ts';
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
        ? buildStrengthSessions({ equipment: profile.equipment, injuryHistory: profile.injuryHistory }, { emphasis })
        : [],
    [profile, emphasis],
  );

  // Alternate the two sessions across the week.
  const slot = new Date().getDay() >= 4 ? 1 : 0;
  const session = sessions[slot] ?? sessions[0];
  const [setsDone, setSetsDone] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  if (!profile || !session) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Note>Finish your profile and GoodForm will build your strength work.</Note>
      </div>
    );
  }

  const totalSets = session.exercises.reduce((sum, e) => sum + e.sets, 0);
  const doneSets = Object.values(setsDone).reduce((sum, n) => sum + n, 0);

  const save = async () => {
    setSaving(true);
    await logSession.mutateAsync({
      id: crypto.randomUUID(),
      date: today(),
      type: 'strength',
      completion: doneSets >= totalSets ? 'full' : doneSets > 0 ? 'partial' : 'skipped',
      exerciseLog: setsDone,
      effort: null,
      discomfort: null,
    });
    navigate('/');
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-5">
      <div className="flex items-center justify-between">
        <Eyebrow>Strength · session {session.slot}</Eyebrow>
        <button onClick={() => navigate('/')} className="tap px-2 text-[0.875rem] text-ink-faint hover:text-ink">
          Not today
        </button>
      </div>
      <h1 className="mt-2 text-3xl" style={{ fontWeight: 780 }}>
        The work that keeps you running
      </h1>
      <p className="mt-2 leading-relaxed text-ink-soft">
        Tempo matters more than weight here. Slow lowering is what builds tendon stiffness, and tendon stiffness
        is what absorbs every step you take.
      </p>

      {emphasis && (
        <Note tone="run">
          Extra work this week while your running holds steady. This is the part that lets the tissue catch up.
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
                      {exercise.perSide && <span className="ml-2 text-[0.875rem] font-normal text-ink-faint">each side</span>}
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
                    {reps !== exercise.reps && <span className="ml-1 text-[0.75rem] text-good">progressed</span>}
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
                      onClick={() => setSetsDone((s) => ({ ...s, [exercise.id]: done > i ? i : i + 1 }))}
                      aria-label={`Set ${i + 1} of ${exercise.name}`}
                      aria-pressed={done > i}
                      className={`tap flex-1 rounded-xl border font-semibold transition-colors ${
                        done > i ? 'border-good bg-good text-white' : 'border-line bg-chalk hover:border-ink-faint'
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
      <StopRules className="mt-4" />
    </div>
  );
}
