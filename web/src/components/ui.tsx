import { useEffect, useId, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
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
  // Explicit, because a <button> inside a <form> defaults to submit, and
  // several of these sit inside one. Any caller that wants to submit says so.
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  full?: boolean;
  // React 19 passes `ref` as an ordinary prop, so callers that need to move
  // focus to a button can just ask for it.
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      type={type}
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

/**
 * The small capitalised label above a section.
 *
 * Rendered as a paragraph by default, because plenty of these name a control
 * rather than a section. Where one genuinely titles a card, pass `as="h2"`:
 * the app had nineteen `<h1>`s and no other heading level at all, so heading
 * navigation landed on the page title and then found nothing on screens with
 * eight sections.
 */
export function Eyebrow({
  children,
  className = '',
  as: Tag = 'p',
}: {
  children: ReactNode;
  className?: string;
  as?: 'p' | 'h2' | 'h3';
}) {
  return <Tag className={`eyebrow ${className}`}>{children}</Tag>;
}

/** One-tap counters for the daily habits. No keyboards, no dialogs. */
export function Stepper({
  label,
  hint,
  value,
  unit,
  step = 1,
  min = 0,
  max = 999,
  onChange,
  tone = 'neutral',
}: {
  label: string;
  /** One line under the label, for a unit that is not self-explanatory. */
  hint?: string;
  value: number;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  onChange: (next: number) => void;
  /**
   * `watch` reddened the number as soon as it went above zero, which meant a
   * smoker who logged one cigarette honestly was shown the same colour as a
   * severity-4 injury. The accurate count is the win; it is not coloured like
   * a warning any more. Kept because the tone is still the right idea for a
   * threshold — it just needs a threshold, not "greater than nothing".
   */
  tone?: 'neutral' | 'watch';
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Number(n.toFixed(2))));

  /**
   * What this stepper is showing, accumulated locally.
   *
   * The next value used to be computed from the `value` prop, which only
   * catches up after the write lands. Ten quick taps therefore all read the
   * same number and all wrote the same increment, so nine were lost — and
   * sleep, at half-hour steps, needs fifteen taps for a normal night. Counting
   * here is synchronous, so every tap lands. React's documented pattern for
   * resyncing when the server does come back with something different.
   */
  const [shownFor, setShownFor] = useState(value);
  const [shown, setShown] = useState(value);
  if (shownFor !== value) {
    setShownFor(value);
    setShown(value);
  }

  // A functional update, so a burst of taps accumulates instead of every one of
  // them reading the same render's number. Ten quick presses become 2500ml, and
  // one write rather than ten.
  const step_ = (delta: number) => setShown((current) => clamp(current + delta));

  // Report the settled figure once React has folded the burst together.
  const reported = useRef(value);
  useEffect(() => {
    if (shown === reported.current) return;
    reported.current = shown;
    onChange(shown);
  }, [shown, onChange]);

  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-[0.9375rem]">{label}</p>
        {hint && <p className="text-[0.75rem] leading-snug text-ink-faint">{hint}</p>}
        <p className="tabular text-2xl leading-tight" style={{ fontWeight: 600 }}>
          <span className={tone === 'watch' && shown > 0 ? 'text-alert' : ''}>{shown}</span>
          {unit && <span className="ml-1 text-sm font-normal text-ink-faint"> {unit}</span>}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          aria-label={`Remove one from ${label}`}
          onClick={() => step_(-step)}
          disabled={shown <= min}
          className="tap rounded-xl border border-line bg-paper text-xl leading-none transition-colors hover:border-ink-faint disabled:opacity-35"
        >
          −
        </button>
        <button
          type="button"
          aria-label={`Add one to ${label}`}
          onClick={() => step_(step)}
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
  /**
   * Set when the field holds a set of controls rather than one input — a chip
   * group, say. A `<label>` may only name a single control, so wrapping several
   * buttons in one makes the browser hand the whole label, hint and all, to
   * whichever button comes first: the first chip in the sex question was
   * announced as "Sex at birth Used for protein and iron guidance only. Female
   * Intersex". A named group says it correctly instead.
   */
  group = false,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  group?: boolean;
}) {
  const id = useId();
  const body = (
    <>
      <span className="eyebrow" id={group ? id : undefined}>
        {label}
      </span>
      {hint && (
        <span
          className="mt-0.5 block text-[0.8125rem] text-ink-soft"
          id={group ? `${id}-hint` : undefined}
        >
          {hint}
        </span>
      )}
    </>
  );

  if (group) {
    return (
      <div className="block">
        {body}
        <div className="mt-1.5" role="group" aria-labelledby={hint ? `${id} ${id}-hint` : id}>
          {children}
        </div>
      </div>
    );
  }

  return (
    <label className="block">
      {body}
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
  /**
   * Single-select is a radio group, not a row of independent toggles.
   *
   * All of onboarding is built from this. As toggle buttons it announced each
   * option on its own, with no "3 of 5" position and no arrow keys — so a
   * six-option question was six tab stops and no sense of being one choice.
   * `aria-pressed` stays for multi-select, where it is the right thing.
   */
  const single = !multiple;

  const move = (from: number, delta: number) => {
    const next = (from + delta + options.length) % options.length;
    const target = options[next];
    if (target) toggle(target.value);
  };

  return (
    <div
      className={`grid gap-2 ${columns === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}
      role={single ? 'radiogroup' : undefined}
    >
      {options.map((option, index) => {
        const active = selected.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            role={single ? 'radio' : undefined}
            aria-checked={single ? active : undefined}
            aria-pressed={single ? undefined : active}
            // Arrow keys move between radios, and only the selected one is a
            // tab stop — the behaviour a native radio group has for free.
            tabIndex={single ? (active || selected.length === 0 ? 0 : -1) : undefined}
            onKeyDown={
              single
                ? (event) => {
                    const step =
                      event.key === 'ArrowDown' || event.key === 'ArrowRight'
                        ? 1
                        : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
                          ? -1
                          : 0;
                    if (!step) return;
                    event.preventDefault();
                    move(index, step);
                    const group = event.currentTarget.parentElement;
                    const next = group?.children[
                      (index + step + options.length) % options.length
                    ] as HTMLElement | undefined;
                    next?.focus();
                  }
                : undefined
            }
            onClick={() => toggle(option.value)}
            className={`tap rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
              active
                ? 'border-ink bg-ink text-chalk'
                : 'border-line bg-paper hover:border-ink-faint'
            }`}
          >
            <span className="block text-[0.9375rem] leading-snug">{option.label}</span>
            {option.hint && (
              <span
                className={`mt-0.5 block text-[0.8125rem] leading-snug ${active ? 'text-chalk/70' : 'text-ink-soft'}`}
              >
                {option.hint}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Note({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'alert' | 'run';
}) {
  const tones = {
    neutral: 'bg-chalk-deep text-ink-soft',
    alert: 'bg-alert-wash text-alert',
    run: 'bg-run-wash text-run-deep',
  };
  return (
    <p
      // An alert-toned note is how the app reports a wrong password, a refused
      // save, a paused plan. As a plain paragraph a screen reader said nothing
      // at all when one appeared, so the message existed only for people who
      // could see it.
      role={tone === 'alert' ? 'alert' : undefined}
      className={`rounded-xl px-3.5 py-3 text-[0.875rem] leading-relaxed ${tones[tone]}`}
    >
      {children}
    </p>
  );
}

/**
 * What a screen shows when its data could not be fetched.
 *
 * The alternative, and what these screens used to do, is render the empty
 * state: a server error told the runner "you haven't started yet", which is
 * indistinguishable from having lost everything. Saying the request failed is
 * both true and far less alarming.
 */
export function LoadFailed({
  what,
  onRetry,
  retrying = false,
}: {
  what: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <Card>
      <Eyebrow as="h2">Could not load {what}</Eyebrow>
      <p className="mt-2 leading-snug">
        Nothing is lost — this is a problem reaching the server, not a problem with your data.
      </p>
      {onRetry && (
        <Button variant="secondary" className="mt-3" disabled={retrying} onClick={onRetry}>
          {retrying ? 'Trying' : 'Try again'}
        </Button>
      )}
    </Card>
  );
}
