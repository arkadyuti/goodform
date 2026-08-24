import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { toggleChoice } from '../lib/choices.ts';

type Variant = 'primary' | 'secondary' | 'quiet' | 'alert';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-ink text-chalk hover:bg-ink/90 active:bg-ink/80 disabled:bg-transparent disabled:text-ink-faint disabled:ring-1 disabled:ring-line',
  secondary: 'bg-paper text-ink border border-line hover:border-ink-faint active:bg-chalk-deep',
  quiet: 'text-ink-soft hover:text-ink hover:bg-chalk-deep',
  alert: 'bg-alert text-white hover:bg-alert/90',
};

export function Button({
  variant = 'primary',
  className = '',
  full,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; full?: boolean }) {
  return (
    <button
      {...props}
      className={`tap inline-flex items-center justify-center gap-2 rounded-xl px-5 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${VARIANTS[variant]} ${full ? 'w-full' : ''} ${className}`}
    />
  );
}

export function Card({
  children,
  className = '',
  as: Tag = 'section',
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'article';
}) {
  return <Tag className={`card p-4 ${className}`}>{children}</Tag>;
}

export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`eyebrow ${className}`}>{children}</p>;
}

/** One-tap counters for the daily habits. No keyboards, no dialogs. */
export function Stepper({
  label,
  value,
  unit,
  step = 1,
  min = 0,
  max = 999,
  onChange,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  onChange: (next: number) => void;
  tone?: 'neutral' | 'watch';
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Number(n.toFixed(2))));
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-[0.9375rem]">{label}</p>
        <p className="tabular text-2xl leading-tight" style={{ fontWeight: 600 }}>
          <span className={tone === 'watch' && value > 0 ? 'text-alert' : ''}>{value}</span>
          {unit && <span className="ml-1 text-sm font-normal text-ink-faint">{unit}</span>}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          aria-label={`Remove one from ${label}`}
          onClick={() => onChange(clamp(value - step))}
          disabled={value <= min}
          className="tap rounded-xl border border-line bg-paper text-xl leading-none transition-colors hover:border-ink-faint disabled:opacity-35"
        >
          −
        </button>
        <button
          type="button"
          aria-label={`Add one to ${label}`}
          onClick={() => onChange(clamp(value + step))}
          className="tap rounded-xl bg-ink px-4 text-xl leading-none text-chalk transition-colors hover:bg-ink/90"
        >
          +
        </button>
      </div>
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      {hint && <span className="mt-0.5 block text-[0.8125rem] text-ink-soft">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`tap w-full rounded-xl border border-line bg-paper px-3.5 outline-none transition-colors focus:border-run ${props.className ?? ''}`}
    />
  );
}

/** Chip group — the whole of onboarding is built from these. */
export function Choices<T extends string>({
  options,
  value,
  onChange,
  multiple = false,
  columns = 1,
  exclusive,
}: {
  options: { value: T; label: string; hint?: string }[];
  value: T[] | T;
  onChange: (next: T[]) => void;
  multiple?: boolean;
  columns?: 1 | 2;
  /**
   * An option that cannot coexist with the others — "Nothing", "None of these".
   * Choosing it clears the rest; choosing anything else clears it.
   */
  exclusive?: T;
}) {
  const selected = Array.isArray(value) ? value : [value];
  const toggle = (option: T) => {
    if (!multiple) return onChange([option]);
    onChange(toggleChoice(selected, option, exclusive));
  };
  return (
    <div className={`grid gap-2 ${columns === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {options.map((option) => {
        const active = selected.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => toggle(option.value)}
            className={`tap rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
              active ? 'border-ink bg-ink text-chalk' : 'border-line bg-paper hover:border-ink-faint'
            }`}
          >
            <span className="block text-[0.9375rem] leading-snug">{option.label}</span>
            {option.hint && (
              <span className={`mt-0.5 block text-[0.8125rem] leading-snug ${active ? 'text-chalk/70' : 'text-ink-soft'}`}>
                {option.hint}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Note({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'alert' | 'run' }) {
  const tones = {
    neutral: 'bg-chalk-deep text-ink-soft',
    alert: 'bg-alert-wash text-alert',
    run: 'bg-run-wash text-run-deep',
  };
  return <p className={`rounded-xl px-3.5 py-3 text-[0.875rem] leading-relaxed ${tones[tone]}`}>{children}</p>;
}
