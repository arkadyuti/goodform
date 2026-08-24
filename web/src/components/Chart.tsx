import { useEffect, useMemo, useRef, useState } from 'react';
import { shortDate } from '../lib/date.ts';

export interface Point {
  date: string;
  value: number;
}

/** Fills the card it sits in, and redraws when the phone turns. */
function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    observer.observe(element);
    setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** Axis ticks land on round numbers, or they are noise pretending to be data. */
function ticksFor(min: number, max: number, count = 3): number[] {
  if (max === min) return [min];
  const rough = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? magnitude * 10;
  const first = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let t = first; t <= max + 1e-9; t += step) out.push(Number(t.toFixed(6)));
  return out;
}

function formatValue(value: number, unit: string): string {
  const rounded = Number.isInteger(value) ? value : Number(value.toFixed(1));
  return unit ? `${rounded} ${unit}` : String(rounded);
}

const PADDING = { top: 14, right: 46, bottom: 22, left: 4 };
const HEIGHT = 132;

interface TrendChartProps {
  title: string;
  points: Point[];
  unit?: string;
  /** Text under the title. One sentence on what the movement means. */
  caption?: string;
  /** Down is the good direction for waist and resting heart rate. */
  goodDirection?: 'up' | 'down';
  /** Draw from zero rather than from the lowest reading. */
  zeroBased?: boolean;
  empty?: string;
}

/**
 * One measure, one line, one axis. Weight, waist and resting heart rate each
 * get their own chart rather than sharing a plot: two y-scales on one set of
 * axes invent a relationship that is not in the data.
 */
export function TrendChart({
  title,
  points,
  unit = '',
  caption,
  goodDirection,
  zeroBased = false,
  empty = 'Nothing logged yet.',
}: TrendChartProps) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState<number | null>(null);

  const sorted = useMemo(() => [...points].sort((a, b) => (a.date < b.date ? -1 : 1)), [points]);

  const geometry = useMemo(() => {
    if (!width || sorted.length === 0) return null;
    const values = sorted.map((p) => p.value);
    const rawMin = zeroBased ? 0 : Math.min(...values);
    const rawMax = Math.max(...values);
    // A flat line should sit in the middle of the plot rather than on its floor.
    const pad = rawMax === rawMin ? Math.max(1, Math.abs(rawMax) * 0.1) : (rawMax - rawMin) * 0.18;
    const min = zeroBased ? 0 : rawMin - pad;
    const max = rawMax + pad;

    const plotWidth = Math.max(1, width - PADDING.left - PADDING.right);
    const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
    const x = (i: number) =>
      PADDING.left + (sorted.length === 1 ? plotWidth / 2 : (i / (sorted.length - 1)) * plotWidth);
    const y = (value: number) => PADDING.top + plotHeight - ((value - min) / (max - min || 1)) * plotHeight;

    return { min, max, x, y, plotHeight, ticks: ticksFor(min, max) };
  }, [sorted, width, zeroBased]);

  const last = sorted[sorted.length - 1];
  const first = sorted[0];
  const change = last && first && sorted.length > 1 ? last.value - first.value : null;
  const direction = change === null || change === 0 ? null : change > 0 ? 'up' : 'down';
  const good = goodDirection && direction ? direction === goodDirection : null;

  const summary = last
    ? `${title}: ${formatValue(last.value, unit)} on ${shortDate(last.date)}${
        change !== null ? `, ${change > 0 ? 'up' : 'down'} ${formatValue(Math.abs(change), unit)} across ${sorted.length} readings` : ''
      }.`
    : `${title}: ${empty}`;

  return (
    <figure className="m-0">
      <figcaption>
        <div className="flex items-baseline justify-between gap-3">
          <p className="eyebrow">{title}</p>
          {last && (
            <p className="tabular text-[0.8125rem] text-ink-soft">
              {formatValue(last.value, unit)}
              {change !== null && change !== 0 && (
                <span className={good === null ? 'text-ink-faint' : good ? 'text-good' : 'text-walk-deep'}>
                  {' '}
                  {change > 0 ? '↑' : '↓'} {formatValue(Math.abs(change), '')}
                </span>
              )}
            </p>
          )}
        </div>
        {caption && <p className="mt-1 text-[0.8125rem] leading-snug text-ink-soft">{caption}</p>}
      </figcaption>

      <div ref={ref} className="mt-2 w-full">
        {sorted.length === 0 ? (
          <p className="py-6 text-[0.875rem] text-ink-faint">{empty}</p>
        ) : (
          geometry && (
            <svg
              width={width}
              height={HEIGHT}
              role="img"
              aria-label={summary}
              className="touch-pan-y"
              onPointerMove={(event) => {
                const box = event.currentTarget.getBoundingClientRect();
                const px = event.clientX - box.left;
                let nearest = 0;
                for (let i = 1; i < sorted.length; i++) {
                  if (Math.abs(geometry.x(i) - px) < Math.abs(geometry.x(nearest) - px)) nearest = i;
                }
                setActive(nearest);
              }}
              onPointerLeave={() => setActive(null)}
            >
              {geometry.ticks.map((tick) => (
                <g key={tick}>
                  {/* Hairline, solid, one step off the surface — never dashed. */}
                  <line
                    x1={PADDING.left}
                    x2={width - PADDING.right}
                    y1={geometry.y(tick)}
                    y2={geometry.y(tick)}
                    stroke="var(--color-line)"
                    strokeWidth="1"
                  />
                  <text
                    x={width - PADDING.right + 6}
                    y={geometry.y(tick) + 4}
                    className="tabular"
                    fontSize="11"
                    fill="var(--color-ink-faint)"
                  >
                    {Number.isInteger(tick) ? tick : tick.toFixed(1)}
                  </text>
                </g>
              ))}

              {sorted.length > 1 && (
                <>
                  <path
                    d={`M ${geometry.x(0)} ${geometry.y(sorted[0]!.value)} ${sorted
                      .slice(1)
                      .map((p, i) => `L ${geometry.x(i + 1)} ${geometry.y(p.value)}`)
                      .join(' ')} L ${geometry.x(sorted.length - 1)} ${PADDING.top + geometry.plotHeight} L ${geometry.x(0)} ${PADDING.top + geometry.plotHeight} Z`}
                    fill="var(--color-run)"
                    opacity="0.1"
                  />
                  <path
                    d={`M ${geometry.x(0)} ${geometry.y(sorted[0]!.value)} ${sorted
                      .slice(1)
                      .map((p, i) => `L ${geometry.x(i + 1)} ${geometry.y(p.value)}`)
                      .join(' ')}`}
                    fill="none"
                    stroke="var(--color-run)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </>
              )}

              {/* The end marker carries a surface ring so it stays legible
                  wherever the line crosses it. */}
              {last && (
                <circle
                  cx={geometry.x(sorted.length - 1)}
                  cy={geometry.y(last.value)}
                  r="4"
                  fill="var(--color-run)"
                  stroke="var(--color-paper)"
                  strokeWidth="2"
                />
              )}

              {active !== null && sorted[active] && (
                <g>
                  <line
                    x1={geometry.x(active)}
                    x2={geometry.x(active)}
                    y1={PADDING.top}
                    y2={PADDING.top + geometry.plotHeight}
                    stroke="var(--color-ink-faint)"
                    strokeWidth="1"
                  />
                  <circle
                    cx={geometry.x(active)}
                    cy={geometry.y(sorted[active]!.value)}
                    r="4"
                    fill="var(--color-run)"
                    stroke="var(--color-paper)"
                    strokeWidth="2"
                  />
                  <text
                    x={Math.min(width - PADDING.right, Math.max(PADDING.left, geometry.x(active)))}
                    y={PADDING.top - 3}
                    fontSize="11"
                    textAnchor={active > sorted.length / 2 ? 'end' : 'start'}
                    fill="var(--color-ink)"
                  >
                    {formatValue(sorted[active]!.value, unit)} · {shortDate(sorted[active]!.date)}
                  </text>
                </g>
              )}

              {first && last && (
                <>
                  <text x={PADDING.left} y={HEIGHT - 6} fontSize="11" fill="var(--color-ink-faint)">
                    {shortDate(first.date)}
                  </text>
                  {sorted.length > 1 && (
                    <text
                      x={width - PADDING.right}
                      y={HEIGHT - 6}
                      fontSize="11"
                      textAnchor="end"
                      fill="var(--color-ink-faint)"
                    >
                      {shortDate(last.date)}
                    </text>
                  )}
                </>
              )}
            </svg>
          )
        )}
      </div>

      {sorted.length > 0 && <DataTable title={title} unit={unit} points={sorted} />}
    </figure>
  );
}

/** Every chart has a readable version — colour and shape are never the only route in. */
function DataTable({ title, unit, points }: { title: string; unit: string; points: Point[] }) {
  return (
    <details className="mt-1">
      <summary className="tap inline-flex cursor-pointer items-center text-[0.8125rem] text-ink-faint hover:text-ink">
        See the numbers
      </summary>
      <table className="mt-1.5 w-full text-[0.875rem]">
        <caption className="sr-only">{title}</caption>
        <thead>
          <tr className="text-left text-[0.75rem] tracking-wide text-ink-faint uppercase">
            <th className="pb-1 font-medium">Date</th>
            <th className="pb-1 text-right font-medium">{unit || 'Value'}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {[...points].reverse().map((point) => (
            <tr key={point.date}>
              <td className="py-1">{shortDate(point.date)}</td>
              <td className="tabular py-1 text-right">{point.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

export interface DiscomfortPoint {
  date: string;
  location: string;
  severity: number;
}

/**
 * Discomfort over time. Severity is a state rather than a series, so it wears
 * the status colours the rest of the app uses — amber up to 3, alert at 4 and
 * above, where the plan pauses — with the level always written out beside it.
 */
export function DiscomfortChart({ points }: { points: DiscomfortPoint[] }) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState<number | null>(null);

  const sorted = useMemo(() => [...points].sort((a, b) => (a.date < b.date ? -1 : 1)), [points]);

  if (sorted.length === 0) {
    return (
      <figure className="m-0">
        <figcaption className="eyebrow">Discomfort</figcaption>
        <p className="mt-2 leading-snug text-ink-soft">Nothing logged. That is the outcome we are after.</p>
      </figure>
    );
  }

  const plotWidth = Math.max(1, width - PADDING.left - PADDING.right);
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const firstDate = sorted[0]!.date;
  const lastDate = sorted[sorted.length - 1]!.date;
  const span = Date.parse(`${lastDate}T12:00:00Z`) - Date.parse(`${firstDate}T12:00:00Z`);
  // Everything on one day has no span to spread across; centre it rather than
  // stacking it all on the left edge.
  const x = (date: string) =>
    span === 0
      ? PADDING.left + plotWidth / 2
      : PADDING.left + ((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${firstDate}T12:00:00Z`)) / span) * plotWidth;
  const y = (severity: number) => PADDING.top + plotHeight - ((severity - 0.5) / 5) * plotHeight;

  return (
    <figure className="m-0">
      <figcaption>
        <p className="eyebrow">Discomfort</p>
        <p className="mt-1 text-[0.8125rem] leading-snug text-ink-soft">
          The same place appearing repeatedly is the earliest warning of an overuse injury — earlier than pain
          that stops you.
        </p>
      </figcaption>

      <div ref={ref} className="mt-2 w-full">
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-label={`${sorted.length} discomfort entries between ${shortDate(firstDate)} and ${shortDate(lastDate)}, worst severity ${Math.max(...sorted.map((p) => p.severity))} of 5.`}
            onPointerLeave={() => setActive(null)}
          >
            {[1, 2, 3, 4, 5].map((level) => (
              <g key={level}>
                <line
                  x1={PADDING.left}
                  x2={width - PADDING.right}
                  y1={y(level)}
                  y2={y(level)}
                  stroke="var(--color-line)"
                  strokeWidth="1"
                />
                <text
                  x={width - PADDING.right + 6}
                  y={y(level) + 4}
                  className="tabular"
                  fontSize="11"
                  fill={level >= 4 ? 'var(--color-alert)' : 'var(--color-ink-faint)'}
                >
                  {level}
                </text>
              </g>
            ))}

            {sorted.map((point, i) => (
              <circle
                key={`${point.date}-${i}`}
                cx={x(point.date)}
                cy={y(point.severity)}
                r="5"
                fill={point.severity >= 4 ? 'var(--color-alert)' : 'var(--color-walk)'}
                stroke="var(--color-paper)"
                strokeWidth="2"
                onPointerEnter={() => setActive(i)}
                style={{ cursor: 'pointer' }}
              />
            ))}

            {active !== null && sorted[active] && (
              <text
                x={Math.min(width - PADDING.right, Math.max(PADDING.left, x(sorted[active]!.date)))}
                y={PADDING.top - 3}
                fontSize="11"
                textAnchor={x(sorted[active]!.date) > width / 2 ? 'end' : 'start'}
                fill="var(--color-ink)"
              >
                {sorted[active]!.location} · {sorted[active]!.severity} of 5 · {shortDate(sorted[active]!.date)}
              </text>
            )}

            <text x={PADDING.left} y={HEIGHT - 6} fontSize="11" fill="var(--color-ink-faint)">
              {shortDate(firstDate)}
            </text>
            <text x={width - PADDING.right} y={HEIGHT - 6} fontSize="11" textAnchor="end" fill="var(--color-ink-faint)">
              {shortDate(lastDate)}
            </text>
          </svg>
        )}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.75rem] text-ink-soft">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-walk" /> mild to moderate
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-alert" /> 4 or above — progression pauses
        </span>
      </div>

      <details className="mt-1">
        <summary className="tap inline-flex cursor-pointer items-center text-[0.8125rem] text-ink-faint hover:text-ink">
          See the entries
        </summary>
        <ul className="mt-1.5 flex flex-col gap-1.5">
          {[...sorted].reverse().map((entry, i) => (
            <li key={i} className="flex items-center gap-3 text-[0.875rem]">
              <span className="w-14 shrink-0 text-[0.8125rem] text-ink-faint">{shortDate(entry.date)}</span>
              <span className="w-16 shrink-0 capitalize">{entry.location}</span>
              <span className={entry.severity >= 4 ? 'text-alert' : 'text-walk-deep'}>{entry.severity} of 5</span>
            </li>
          ))}
        </ul>
      </details>
    </figure>
  );
}

/**
 * A row of days as a strip: taken, skipped, or a gap. Used for dose adherence,
 * where thirty small marks say more than a percentage does.
 */
export function AdherenceStrip({
  days,
  label,
}: {
  days: { date: string; taken: number; skipped: number; missed: number }[];
  label: string;
}) {
  return (
    <div className="flex items-end gap-[2px]" role="img" aria-label={label}>
      {days.map((day) => {
        const tone =
          day.taken > 0 && day.missed === 0 && day.skipped === 0
            ? 'bg-good'
            : day.taken > 0
              ? 'bg-good/45'
              : day.skipped > 0
                ? 'bg-walk/50'
                : 'bg-chalk-deep';
        return <span key={day.date} className={`h-5 flex-1 rounded-[2px] ${tone}`} title={day.date} />;
      })}
    </div>
  );
}
