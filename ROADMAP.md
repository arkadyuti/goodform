# GoodForm Roadmap

Feature checklist. ✅ built · 🔨 in progress · ⬜ remaining

## P1 — Core loop + habits (shipped)

**Setup**

- ✅ Monorepo scaffold (Vite PWA · Hono API · Drizzle · Postgres)
- ✅ Auth: Google login + dev email/password fallback
- ✅ Onboarding: profile capture across seven steps
- ✅ Pre-exercise screening, with a medical referral on any positive answer
- ✅ Answers persist per user — a reload or a closed tab resumes where you left
- ✅ Steps are navigable: any finished step is reachable, edits save on the way
- ✅ Editing an existing profile saves and closes without regenerating the plan
- ✅ Starting point, three ways in: guided timed run, manual entry, or
      never-run-before (no numbers asked)

**Plan**

- ✅ Plan engine: run-walk block generation, ≤10% weekly growth, conservatism modifiers
- ✅ Adaptive gating: advance / repeat / step back / pause on discomfort
- ✅ User override on any gate, with the risk stated once
- ✅ Deload week after four weeks of building, return-from-break step-back
- ✅ Whole block visible from day one, ribbons on one shared time scale

**Sessions**

- ✅ Session player: warm-up → interval timer → cool-down
- ✅ Wall-clock timer surviving tab suspension, wake lock, audio cues
- ✅ Stop-rules card reachable at any point in a session
- ✅ Cool-down: walk first, then stretches in any order
- ✅ Post-session log: completion, effort, discomfort location and severity
- ✅ Strength programme: equipment tiers, tempo, priority marking, injury substitutions

**Daily tracking**

- ✅ Daily habit log: water, sleep, beer, other alcohol, cigarettes, custom habits
- ✅ Quit support: days clear, four-week totals, money not spent
- ✅ Nutrition: protein target, food library (Indian + Western), one-tap logging
- ✅ Dietary pattern guidance (iron, B12, omega-3 notes) on the food screen
- ✅ Weekly check-in: weight, waist, resting HR
- ✅ Today dashboard: session card plus every daily log in one screen
- ✅ Progress: adherence, longest run, discomfort history, four-week habit totals

**Platform**

- ✅ PWA: installable, offline session delivery, offline write queue synced on reconnect
- ✅ Offline and syncing states shown rather than left to guesswork
- ✅ Lighthouse 100 for accessibility, best practices and SEO

## P2 — Insight (shipped)

- ✅ Trend charts: longest run, resting HR, waist, weight, strength capability —
      small multiples, one measure per plot, each with a table view
- ✅ Discomfort history chart, severity 4 and above in the alert colour
- ✅ Session history list and detail, with the day around each session
- ✅ CSV per dataset + one JSON file holding the whole account
- ✅ Weekly review summary, any week, with deltas against the week before

## P3 — Lifecycle (shipped)

- ✅ Block completion → reassessment → next block toward 5K/10K, continuing from
      what was reached rather than restarting; holding where you are is offered
      with equal weight, and a long gap asks for a fresh baseline instead
- ✅ Session + weekly check-in reminders, one nudge each, never chased
- ✅ Pre/post-session fuelling tied to the time you actually train
- ✅ Nutrition guardrails: four signals → targets withdrawn, restored only by you
- ✅ GDPR self-serve: full export and account deletion behind a typed confirmation

## P3.1 — Supplements and medicines (shipped)

A daily "what am I meant to take" list, and reminders that actually arrive.
Medicines are the higher-stakes half: a missed protein shake is nothing, a
missed course of antibiotics is not. That difference should show in the design.

Built on `regimen_items` and `regimen_events` rather than the `daily_logs`
`supplements` map that was pencilled in: a map of booleans cannot timestamp a
dose or tell an explicit skip from a silent gap, and both turned out to be the
point. That column is now unused and can be dropped whenever convenient.

### Tracking

- ✅ User-defined items: name, dose, form (tablet / capsule / scoop / ml / drops)
- ✅ Type on each item: supplement or medicine — drives urgency and tone
- ✅ Schedule per item: daily, chosen weekdays, every N days, or as-needed
- ✅ Times of day per item, with "with food" / "empty stomach" / "before bed" flags
- ✅ Course medicines: start date, end date, days remaining, ends on its own
- ✅ One-tap "taken", with an explicit "skipped" that is not a silent gap
- ✅ Timestamp what was actually taken, not just the day it was due
- ✅ Interactions worth surfacing at logging time — iron with tea or coffee,
      calcium blocking iron, caffeine near a session
- ✅ Supply count: doses left, so a refill is not a surprise
- ✅ History view and adherence over time, per item
- ✅ Include in CSV/JSON export (P2)

### Reminders

- ✅ Due-now card on Today, grouped by time of day — works everywhere, no
      permission needed, and is the baseline everything else falls back to
- ✅ On-open catch-up: opening the app shows what is due or overdue today
- ✅ Web Push for scheduled times, with VAPID keys and an in-process scheduler
      ticking every minute against each user's own timezone
- ✅ Permission asked in context — from the switch in Settings, never on load
- ✅ Per-item reminder toggle, plus a global quiet-hours window
- ✅ Snooze ("remind me in 30 minutes") and "Taken" straight from the notification
- ✅ Escalation for medicines only: a second nudge if still unmarked. Supplements
      never nag — matches the no-guilt rule used for sessions

### Constraints designed around

- ✅ iOS delivers Web Push only when the app has been added to the home screen
      (16.4+) — detected, explained, and an install prompt offered in its place
- ✅ Notifications are best-effort on every platform: nothing in the app reads as
      a missed dose, and the due-now card says so in as many words
- ✅ Times are local and survive travel and DST — the scheduler resolves each
      user's wall clock through their IANA zone on every tick
- ✅ Medicine names are off the notification by default, with an explicit setting

### Explicitly not doing — held to

- ✅ No drug interaction checking beyond the three absorption notes above — that
      is a medical device claim, and being half-right is worse than silent
- ✅ No dosage advice, and no suggesting anyone start, stop or change a medicine
- ✅ Reminders assist an existing routine; they are not a clinical adherence tool

## P4 — Expansion

- ⬜ Gym module: equipment-based strength programming
- ⬜ Swimming module
- ⬜ Sports / play session logging
- ⬜ Regional food libraries beyond IN + Western
- ⬜ i18n / string externalisation
- ⬜ Watch companion for interval cues
- ⬜ Health platform import: heart rate, distance
