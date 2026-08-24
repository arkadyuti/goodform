import { NavLink } from 'react-router';
import { ConnectionState } from './ConnectionState.tsx';

const LINKS = [
  { to: '/', label: 'Today' },
  { to: '/plan', label: 'Plan' },
  { to: '/food', label: 'Food' },
  { to: '/progress', label: 'Progress' },
];

/**
 * Sticky at the top, never fixed to the bottom: mobile browser chrome overlaps
 * bottom bars even with safe-area insets applied (PRD §5.4).
 */
export function Nav() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-chalk/92 backdrop-blur-sm">
      <ConnectionState />
      <div className="mx-auto flex w-full max-w-2xl items-center gap-1 px-2">
        <NavLink to="/" className="tap flex items-center gap-2 px-2" aria-label="GoodForm home">
          <span className="flex h-3.5 w-9 overflow-hidden rounded-full">
            <span className="h-full flex-[3] bg-run" />
            <span className="h-full flex-[1] bg-walk" />
          </span>
        </NavLink>
        <nav className="flex flex-1 items-center justify-end gap-0.5">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              className={({ isActive }) =>
                `tap flex items-center rounded-lg px-2.5 text-[0.875rem] transition-colors ${
                  isActive ? 'font-semibold text-ink' : 'text-ink-faint hover:text-ink'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
          <NavLink
            to="/settings"
            aria-label="Settings"
            className={({ isActive }) =>
              `tap flex items-center justify-center rounded-lg transition-colors ${
                isActive ? 'text-ink' : 'text-ink-faint hover:text-ink'
              }`
            }
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <circle cx="12" cy="12" r="3.2" />
              <path d="M12 2.5v2.6M12 18.9v2.6M4.2 4.2l1.9 1.9M17.9 17.9l1.9 1.9M2.5 12h2.6M18.9 12h2.6M4.2 19.8l1.9-1.9M17.9 6.1l1.9-1.9" />
            </svg>
          </NavLink>
        </nav>
      </div>
    </header>
  );
}
