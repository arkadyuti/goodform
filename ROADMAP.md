# GoodForm Roadmap

Feature checklist. ✅ built · 🔨 in progress · ⬜ remaining

## P1 — Core loop + habits (current)

- ✅ Monorepo scaffold (Vite PWA · Hono API · Drizzle · Postgres)
- ✅ Auth: Google login + dev email/password fallback
- ✅ Onboarding: profile capture (FR-1.2)
- ✅ Pre-exercise screening PAR-Q (FR-1.3, SR-1)
- ✅ Baseline assessment session (FR-1.4)
- ✅ Plan engine: run-walk block generation, ≤10%/week, conservatism modifiers (FR-2.x)
- ✅ Adaptive gating: advance / repeat / pause on discomfort (FR-3.2), user override (FR-3.3)
- ✅ Deload week (FR-3.4) + return-from-break step-back (FR-3.5)
- ✅ Session player: warm-up → interval timer → cool-down (FR-4.x)
- ✅ Wall-clock timer, wake lock, audio cues, stop-rules card
- ✅ Post-session log: completion, effort, discomfort (FR-3.1)
- ✅ Strength programme: equipment tiers, tempo, priority, substitutions (FR-5.x)
- ✅ Daily habit log: water, sleep, alcohol, cigarettes, custom habits (FR-7.1)
- ✅ Quit support: days-since-last + weekly trend + money saved (smoking/alcohol)
- ✅ Nutrition: protein target, food library (Indian + Western), one-tap logging
- ✅ Dietary pattern guidance (iron, B12, omega-3 notes) on the food screen
- ✅ Weekly check-in: weight, waist, resting HR, capability (FR-7.2)
- ✅ Today dashboard: session card + all daily logging in one screen
- ✅ Progress: adherence view + basic trends (FR-8.1)
- ✅ PWA: installable, offline session delivery, offline log queue + sync (NFR-2, FR-4.6)

## P2 — Insight

- ⬜ Trend charts: longest run, resting HR, waist, strength capability (FR-8.2)
- ⬜ Discomfort history chart (FR-8.3)
- ⬜ Session history detail view (FR-8.4)
- ⬜ CSV + JSON export (FR-8.5)
- ⬜ Weekly review summary

## P3 — Lifecycle

- ⬜ Block completion → reassessment → next block toward 5K/10K
- ⬜ Session + weekly check-in reminders, no-guilt policy
- ⬜ Pre/post-session fuelling tied to session times
- ⬜ Nutrition guardrails: disordered-pattern detection → withdraw targets
- ⬜ GDPR self-serve: account deletion + full data export

## P3.1 — Supplements and medicines

A daily "what am I meant to take" list, and reminders that actually arrive.
Medicines are the higher-stakes half: a missed protein shake is nothing, a
missed course of antibiotics is not. That difference should show in the design.

Groundwork already in place: `daily_logs.supplements` is a jsonb map of
item id → taken, so a day's ticks have somewhere to live without a migration.

### Tracking

- ⬜ User-defined items: name, dose, form (tablet / capsule / scoop / ml / drops)
- ⬜ Type on each item: supplement or medicine — drives urgency and tone
- ⬜ Schedule per item: daily, chosen weekdays, every N days, or as-needed
- ⬜ Times of day per item, with "with food" / "empty stomach" / "before bed" flags
- ⬜ Course medicines: start date, end date, days remaining, ends on its own
- ⬜ One-tap "taken", with an explicit "skipped" that is not a silent gap
- ⬜ Timestamp what was actually taken, not just the day it was due
- ⬜ Interactions worth surfacing at logging time — iron with tea or coffee,
      calcium blocking iron, caffeine near a session
- ⬜ Supply count: doses left, so a refill is not a surprise
- ⬜ History view and adherence over time, per item
- ⬜ Include in CSV/JSON export (P2)

### Reminders

- ⬜ Due-now card on Today, grouped by time of day — works everywhere, no
      permission needed, and is the baseline everything else falls back to
- ⬜ On-open catch-up: opening the app shows what is due or overdue today
- ⬜ Web Push for scheduled times: needs permission, a push subscription and a
      server-side scheduler; a service worker alone cannot wake itself
- ⬜ Permission asked in context — after the first item is added, never on load
- ⬜ Per-item reminder toggle, plus a global quiet-hours window
- ⬜ Snooze ("remind me in 30 minutes") and "already took it" straight from the
      notification
- ⬜ Escalation for medicines only: a second nudge if still unmarked. Supplements
      never nag — matches the no-guilt rule used for sessions

### Constraints to design around

- ⬜ iOS delivers Web Push only when the app has been added to the home screen
      (16.4+), so an install prompt is a prerequisite, not a nicety
- ⬜ Notifications are best-effort on every platform: the app must never imply a
      dose was missed because a notification did not arrive
- ⬜ Times are local and must survive travel and DST without shifting a schedule
- ⬜ Medicine names are sensitive health data: never in a notification preview by
      default, and an explicit setting to keep it that way

### Explicitly not doing

- ⬜ No drug interaction checking beyond the handful of absorption notes above —
      that is a medical device claim, and being half-right is worse than silent
- ⬜ No dosage advice, and no suggesting anyone start, stop or change a medicine
- ⬜ Reminders assist an existing routine; they are not a clinical adherence tool

## P4 — Expansion

- ⬜ Gym module: equipment-based strength programming
- ⬜ Swimming module
- ⬜ Sports / play session logging
- ⬜ Regional food libraries beyond IN + Western (NFR-18)
- ⬜ i18n / string externalisation (NFR-19)
- ⬜ Watch companion for interval cues (v2.1)
- ⬜ Health platform import: heart rate, distance (v2.1)
