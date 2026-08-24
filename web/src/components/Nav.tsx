import { NavLink } from 'react-router';
import { ConnectionState } from './ConnectionState.tsx';

const LINKS = [
  { to: '/', label: 'Today' },
  { to: '/plan', label: 'Plan' },
  { to: '/food', label: 'Food' },
  { to: '/regimen', label: 'List' },
  { to: '/progress', label: 'Progress' },
];

/**
 * Sticky at the top, never fixed to the bottom: mobile browser chrome overlaps
 * bottom bars even with safe-area insets applied (PRD §5.4).
 */
export function Nav() {
  return (
    <header
      className="sticky top-0 z-30 border-b border-line bg-chalk/92 backdrop-blur-sm"
      // Installed on iOS the page runs under the status bar, because index.html
      // asks for viewport-fit=cover. This is the sticky element, so the inset
      // belongs here rather than on body — without it the clock and battery sit
      // on top of the offline banner, which is the one message a runner with no
      // signal actually needs to read.
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <ConnectionState />
      <div className="mx-auto flex w-full max-w-2xl items-center gap-1 px-2">
        {/*
          Seven destinations have a hard floor of 7 × 44px, which with the mark
          alongside overflows a 375px screen and scrolls the page sideways. The
          mark is brand rather than navigation — it points at "/", which Today
          already does — so it stands down on phones and returns above 640px.
        */}
        <NavLink
          to="/"
          className="tap hidden items-center gap-2 px-2 sm:flex"
          aria-label="GoodForm home"
        >
          <span className="flex h-3.5 w-9 overflow-hidden rounded-full">
            <span className="h-full flex-[3] bg-run" />
            <span className="h-full flex-[1] bg-walk" />
          </span>
        </NavLink>
        {/*
          Wraps rather than shrinks. Seven destinations have a hard floor of
          7 × 44px, which does not fit a 320px screen — and 44px is the tap
          target the whole app is built to (NFR-4), so it is the one thing that
          must not give. A second row on the narrowest phones costs 44px of
          height and hides nothing.
        */}
        <nav className="flex flex-1 flex-wrap items-center justify-end">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              className={({ isActive }) =>
                `tap flex shrink-0 items-center rounded-lg px-1.5 text-[0.875rem] whitespace-nowrap transition-colors ${
                  isActive ? 'font-semibold text-ink' : 'text-ink-faint hover:text-ink'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
          {/*
            Six text labels overflow a 375px screen, so the two destinations
            that are reached occasionally rather than daily wear icons. Both
            keep an accessible name — the label is gone from the screen, not
            from the accessibility tree.
          */}
          <NavLink
            to="/calendar"
            aria-label="Calendar"
            title="Calendar"
            className={({ isActive }) =>
              `tap flex shrink-0 items-center justify-center rounded-lg transition-colors ${
                isActive ? 'text-ink' : 'text-ink-faint hover:text-ink'
              }`
            }
          >
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden
            >
              <rect x="3.2" y="5.2" width="17.6" height="15.6" rx="2.6" />
              <path d="M3.2 10.2h17.6M8.4 2.8v4.2M15.6 2.8v4.2" />
            </svg>
          </NavLink>

          <NavLink
            to="/settings"
            aria-label="Settings"
            className={({ isActive }) =>
              `tap flex shrink-0 items-center justify-center rounded-lg transition-colors ${
                isActive ? 'text-ink' : 'text-ink-faint hover:text-ink'
              }`
            }
          >
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden
            >
              <circle cx="12" cy="12" r="3.2" />
              <path d="M12 2.5v2.6M12 18.9v2.6M4.2 4.2l1.9 1.9M17.9 17.9l1.9 1.9M2.5 12h2.6M18.9 12h2.6M4.2 19.8l1.9-1.9M17.9 6.1l1.9-1.9" />
            </svg>
          </NavLink>
        </nav>
      </div>
    </header>
  );
}
