import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { Goal, StopReason } from '@goodform/shared';
import { useBlockOutcome, useReassess } from '../api/hooks.ts';
import { BaselineRun } from '../components/BaselineRun.tsx';
import { Button, Card, Choices, Eyebrow, Field, Note, TextInput } from '../components/ui.tsx';

/**
 * P3: what happens when a block ends. It states what the last one delivered,
 * then offers the next — including holding where you are, which is given the
 * same weight as moving up, because it is often the right answer.
 */
export function Reassess() {
  const navigate = useNavigate();
  const { data, isPending, isError } = useBlockOutcome(true);
  const reassess = useReassess();

  const [goal, setGoal] = useState<Goal | null>(null);
  const [mode, setMode] = useState<'guided' | 'manual' | null>(null);
  const [minutes, setMinutes] = useState('');
  const [stopReason, setStopReason] = useState<StopReason | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (isPending)
    return <div className="min-h-[60dvh]" aria-busy="true" aria-label="Loading your block" />;
  if (isError || !data) {
    return (
      <div className="pt-6">
        <Note>No finished block to review yet.</Note>
      </div>
    );
  }

  const { outcome, options, needsBaseline, daysSinceLastRun } = data;
  const chosen = goal ?? options.find((o) => o.recommended)?.goal ?? options[0]?.goal ?? null;
  const baselineReady = !needsBaseline || (minutes !== '' && stopReason !== null);

  const start = async () => {
    if (!chosen) return;
    setError(null);
    try {
      await reassess.mutateAsync({
        goal: chosen,
        baseline: needsBaseline ? { minutesRun: Number(minutes), stopReason: stopReason! } : null,
      });
      void navigate('/plan');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not build the next block.');
    }
  };

  return (
    <div className="flex flex-col gap-5 pt-1">
      <header>
        <Eyebrow>Block complete</Eyebrow>
        <h1 className="mt-1 text-4xl" style={{ fontWeight: 780 }}>
          What you actually did
        </h1>
      </header>

      <Card>
        <div className="grid grid-cols-2 gap-4">
          <Stat value={outcome.achievedMinutes} label="minutes unbroken, at your longest" />
          <Stat value={outcome.runsCompleted} label="runs finished" />
          <Stat value={outcome.weeksCompleted} label={`of ${outcome.weeksPlanned} weeks`} />
          {outcome.totalRepeats > 0 && (
            <Stat
              value={outcome.totalRepeats}
              label={outcome.totalRepeats === 1 ? 'week repeated' : 'weeks repeated'}
            />
          )}
        </div>
        {outcome.totalRepeats > 0 && (
          <p className="mt-3 text-[0.875rem] leading-relaxed text-ink-soft">
            Repeating is the plan waiting for your legs, which is what it is for. It counts as
            progress, not as time lost.
          </p>
        )}
      </Card>

      {outcome.worstDiscomfort >= 4 && (
        <Note tone="alert">
          You logged discomfort at 4 or above during this block. Holding at the same distance for
          another block is the recommendation here — and it is still your call.
        </Note>
      )}

      <section>
        <Eyebrow>What comes next</Eyebrow>
        <div className="mt-2">
          <Choices
            value={chosen ? [chosen] : []}
            onChange={([v]) => v && setGoal(v)}
            options={options.map((option) => ({
              value: option.goal,
              label: option.recommended ? `${option.label} — suggested` : option.label,
              hint: option.hint,
            }))}
          />
        </div>
      </section>

      {needsBaseline ? (
        <Card>
          <Eyebrow as="h2">A fresh starting point</Eyebrow>
          <p className="mt-1.5 leading-snug text-ink-soft">
            {daysSinceLastRun && daysSinceLastRun >= 56
              ? `It has been about ${Math.round(daysSinceLastRun / 7)} weeks since your last run. Carrying the old block forward would build a plan for someone who no longer exists.`
              : 'There is nothing logged to carry forward, so the next block needs a starting point.'}
          </p>

          {mode === null && (
            <div className="mt-3 flex flex-col gap-2.5">
              <Button onClick={() => setMode('guided')}>Time a run now</Button>
              <Button variant="secondary" onClick={() => setMode('manual')}>
                I already know my number
              </Button>
            </div>
          )}

          {mode === 'guided' && (
            <div className="mt-3">
              <BaselineRun
                onDone={(result) => {
                  setMinutes(String(result.minutesRun));
                  setStopReason(result.stopReason);
                  setMode('manual');
                }}
                onCancel={() => setMode(null)}
              />
            </div>
          )}

          {mode === 'manual' && (
            <div className="mt-3 flex flex-col gap-3">
              <Field label="Minutes you can run unbroken">
                <TextInput
                  type="number"
                  inputMode="decimal"
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                />
              </Field>
              <div>
                <span className="eyebrow">What made you stop</span>
                <div className="mt-1.5">
                  <Choices
                    value={stopReason ? [stopReason] : []}
                    onChange={([v]) => v && setStopReason(v)}
                    options={[
                      {
                        value: 'breath' as const,
                        label: 'Out of breath',
                        hint: 'Lungs adapt in weeks.',
                      },
                      {
                        value: 'legs' as const,
                        label: 'Legs gave out',
                        hint: 'Tissue adapts in months — the plan slows down.',
                      },
                      {
                        value: 'choice' as const,
                        label: 'I chose to stop',
                        hint: 'There was more in the tank.',
                      },
                    ]}
                  />
                </div>
              </div>
            </div>
          )}
        </Card>
      ) : (
        <Note>
          The next block picks up from the {outcome.achievedMinutes}-minute interval you finished
          on, not from scratch. Nothing you built is thrown away.
        </Note>
      )}

      {error && <Note tone="alert">{error}</Note>}

      <Button
        full
        className="py-3.5"
        disabled={!chosen || !baselineReady || reassess.isPending}
        onClick={start}
      >
        Build the next block
      </Button>

      <Button variant="quiet" full className="py-3" onClick={() => navigate('/')}>
        Not now
      </Button>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="tabular text-3xl leading-none" style={{ fontWeight: 800 }}>
        {value}
      </p>
      <p className="mt-1 text-[0.8125rem] leading-snug text-ink-soft">{label}</p>
    </div>
  );
}
