import { useState } from 'react';
import { STOP_RULES } from '@goodform/shared/content';

/**
 * SR-2. Reachable at any point in a session — collapsed so it never competes
 * with the timer, but never more than one tap away.
 */
export function StopRules({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={className}>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="tap flex w-full items-center justify-between rounded-xl border border-alert/35 bg-alert-wash px-3.5 text-left"
      >
        <span className="text-[0.9375rem] font-medium text-alert">When to stop</span>
        <span className="text-alert" aria-hidden>
          {open ? '−' : '+'}
        </span>
      </button>
      {open && (
        <div className="mt-2 rounded-xl border border-line bg-paper p-3.5">
          <p className="text-[0.8125rem] font-semibold tracking-wide text-alert uppercase">Stop</p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {STOP_RULES.stop.map((rule) => (
              <li key={rule} className="flex gap-2 text-[0.9375rem] leading-snug">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-alert" />
                {rule}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[0.8125rem] font-semibold tracking-wide text-good uppercase">Normal</p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {STOP_RULES.normal.map((rule) => (
              <li key={rule} className="flex gap-2 text-[0.9375rem] leading-snug text-ink-soft">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-good" />
                {rule}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
