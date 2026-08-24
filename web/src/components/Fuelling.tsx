import { useEffect, useState } from 'react';
import type { DietaryPattern, SessionType } from '@goodform/shared';
import { fuellingFor } from '@goodform/shared/content';
import { nowTime } from '../lib/date.ts';
import { Card, Eyebrow } from './ui.tsx';

/**
 * P3: what to eat, tied to when the session actually is. It appears in the
 * three hours before a session and the three after it, and is simply not there
 * the rest of the day — advice nobody needs yet is clutter.
 */
export function Fuelling({
  sessionTime,
  sessionType,
  dietaryPattern,
  sessionDone,
}: {
  sessionTime: string;
  sessionType: SessionType;
  dietaryPattern: DietaryPattern;
  sessionDone: boolean;
}) {
  const [clock, setClock] = useState(nowTime);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(nowTime()), 5 * 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const guidance = fuellingFor({ sessionTime, nowTime: clock, sessionType, dietaryPattern, sessionDone });
  if (!guidance) return null;

  return (
    <Card className={guidance.window === 'recovery' ? 'border-run' : ''}>
      <Eyebrow>{guidance.window === 'recovery' ? 'After the session' : 'Before the session'}</Eyebrow>
      <p className="mt-1.5 text-[1.0625rem] leading-snug">{guidance.headline}</p>
      <ul className="mt-2.5 flex flex-col gap-2">
        {guidance.points.map((point) => (
          <li key={point} className="flex gap-2.5 text-[0.9375rem] leading-snug text-ink-soft">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-walk" />
            {point}
          </li>
        ))}
      </ul>
      <p className="mt-2.5 text-[0.875rem] text-ink-faint">
        For instance: {guidance.examples.join(', ')}.
      </p>
    </Card>
  );
}
