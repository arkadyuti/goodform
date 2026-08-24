import { useState } from 'react';
import { useProgress, useSaveWeeklyCheck } from '../api/hooks.ts';
import { today } from '../lib/date.ts';
import { Button, Card, Eyebrow, Field, Note, TextInput } from './ui.tsx';

/**
 * FR-7.2/7.3. Prompted weekly, and framed so a steady weight with a shrinking
 * waist reads as the win it is.
 */
export function WeeklyCheckIn() {
  const date = today();
  const { data, isPending } = useProgress();
  const save = useSaveWeeklyCheck(date);
  const [open, setOpen] = useState(false);
  const [weight, setWeight] = useState('');
  const [waist, setWaist] = useState('');
  const [hr, setHr] = useState('');

  const last = data?.checks?.[0];
  const daysSince = last
    ? Math.floor((new Date(`${date}T12:00:00`).getTime() - new Date(`${last.date}T12:00:00`).getTime()) / 86_400_000)
    : Infinity;

  // Nothing until the history has loaded — a prompt that appears and then
  // vanishes is worse than one that arrives a moment late.
  if (isPending) return null;
  if (daysSince < 7 && !open) return null;

  if (!open) {
    return (
      <Card>
        <Eyebrow>Weekly check-in</Eyebrow>
        <p className="mt-1.5 leading-snug">
          {last ? 'A week since your last measurements.' : 'Take your first measurements to track what changes.'}
        </p>
        <Button variant="secondary" className="mt-3" onClick={() => setOpen(true)}>
          Take measurements
        </Button>
      </Card>
    );
  }

  return (
    <Card>
      <Eyebrow>Weekly check-in</Eyebrow>
      <div className="mt-3 flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-2.5">
          <Field label="Weight kg">
            <TextInput type="number" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </Field>
          <Field label="Waist cm">
            <TextInput type="number" inputMode="decimal" value={waist} onChange={(e) => setWaist(e.target.value)} />
          </Field>
          <Field label="Rest HR">
            <TextInput type="number" inputMode="numeric" value={hr} onChange={(e) => setHr(e.target.value)} />
          </Field>
        </div>
        <Note>
          Waist and resting heart rate move first. Weight holding steady while your waist comes down is exactly
          what building muscle while losing fat looks like — it is the outcome to want, not a stall.
        </Note>
        <div className="flex gap-2.5">
          <Button
            full
            disabled={save.isPending}
            onClick={async () => {
              await save.mutateAsync({
                weightKg: weight ? Number(weight) : null,
                waistCm: waist ? Number(waist) : null,
                restingHr: hr ? Number(hr) : null,
              });
              setOpen(false);
            }}
          >
            Save
          </Button>
          <Button variant="quiet" onClick={() => setOpen(false)}>
            Later
          </Button>
        </div>
      </div>
    </Card>
  );
}
