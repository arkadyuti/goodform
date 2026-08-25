import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  WEEKDAY_NAMES,
  daysFor,
  hasBackToBackRuns,
  listDays,
  minutesOfDay,
  timeFromMinutes,
  withinWindow,
} from '@goodform/shared';
import {
  useDeleteAccount,
  useResetData,
  useProfile,
  useRegimenItems,
  useRestoreTargets,
  useSaveSettings,
  type Settings,
} from '../api/hooks.ts';
import { signOut, useSession } from '../lib/auth.ts';
import { clearDraft } from '../lib/onboardingDraft.ts';
import { useInstallState } from '../lib/install.ts';
import {
  browserTimezone,
  currentSubscription,
  pushSupport,
  sendTestPush,
  subscribeToPush,
  unsubscribeFromPush,
} from '../lib/push.ts';
import { audioSessionSupported, hapticsSupported } from '../timer/cues.ts';
import { ScreenWakeLock } from '../timer/wakeLock.ts';
import { ExportCard } from './Progress.tsx';
import { Button, Card, Choices, Eyebrow, Field, Note, TextInput } from '../components/ui.tsx';

const HABITS = [
  { key: 'water', label: 'Water' },
  { key: 'cigarettes', label: 'Cigarettes' },
  { key: 'beer', label: 'Beer' },
  { key: 'alcohol', label: 'Other alcohol' },
  { key: 'sleep', label: 'Sleep' },
];

export function SettingsView() {
  const navigate = useNavigate();
  const { data } = useProfile();
  const { data: session } = useSession();
  const save = useSaveSettings();
  const settings = data?.settings;
  const profile = data?.profile;

  const [habitLabel, setHabitLabel] = useState('');
  const [smokeBaseline, setSmokeBaseline] = useState(String(settings?.smokingBaselinePerDay ?? ''));
  const [smokeCost, setSmokeCost] = useState(String(settings?.cigaretteCost ?? ''));

  if (!settings) return <p className="eyebrow pt-6">Loading</p>;

  return (
    <div className="flex flex-col gap-5 pt-1">
      <header>
        <Eyebrow>Settings</Eyebrow>
        <h1 className="mt-1 text-4xl" style={{ fontWeight: 780 }}>
          How GoodForm behaves
        </h1>
      </header>

      <Card>
        <Eyebrow as="h2">During a session</Eyebrow>
        <label className="flex items-center justify-between gap-4 border-b border-line py-3">
          <span>Sound cues</span>
          <input
            type="checkbox"
            checked={settings.soundEnabled}
            onChange={(e) => save.mutate({ soundEnabled: e.target.checked })}
            className="h-6 w-6 accent-[#1b3fd8]"
          />
        </label>

        {hapticsSupported() ? (
          <label className="flex items-center justify-between gap-4 border-b border-line py-3">
            <span>Vibration cues</span>
            <input
              type="checkbox"
              checked={settings.hapticsEnabled}
              onChange={(e) => save.mutate({ hapticsEnabled: e.target.checked })}
              className="h-6 w-6 accent-[#1b3fd8]"
            />
          </label>
        ) : (
          <p className="border-b border-line py-3 text-[0.875rem] leading-snug text-ink-soft">
            <strong className="text-ink">No vibration on this device.</strong> Every browser on
            iPhone runs on WebKit, which has no vibration support — so sound and the on-screen
            colour are your cues.
          </p>
        )}

        <div className="py-3">
          <p className="mb-2">Audio while you run</p>
          <Choices
            value={[settings.audioMode]}
            onChange={([v]) => v && save.mutate({ audioMode: v })}
            options={[
              {
                value: 'transient' as const,
                label: 'Keep my music playing',
                hint: 'Cues duck the music. Cues may stop if the screen locks.',
              },
              {
                value: 'playback' as const,
                label: 'Cues survive a locked screen',
                hint: 'GoodForm owns the audio, so your music stops.',
              },
            ]}
          />
          {!audioSessionSupported() && (
            <p className="mt-2 text-[0.8125rem] leading-snug text-ink-faint">
              This browser does not expose the audio session, so the choice may have no effect here.
              It matters on iOS Safari 16.4 and later.
            </p>
          )}
        </div>

        <p className="pt-1 text-[0.8125rem] leading-snug text-ink-faint">
          {ScreenWakeLock.supported()
            ? 'The screen is held awake for the length of a session.'
            : 'This browser cannot hold the screen awake — keep the phone unlocked during a session.'}
        </p>
      </Card>

      <Card>
        <Eyebrow as="h2">What you track</Eyebrow>
        <p className="mt-1.5 text-[0.875rem] leading-snug text-ink-soft">
          Turn off anything you do not want to see. Tracking nothing but sessions is a perfectly
          good way to use this.
        </p>
        <div className="mt-3">
          <Choices
            multiple
            columns={2}
            value={settings.trackedHabits}
            onChange={(trackedHabits) => save.mutate({ trackedHabits })}
            options={HABITS.map((h) => ({ value: h.key, label: h.label }))}
          />
        </div>

        {settings.customHabits.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5">
            {settings.customHabits.map((habit) => (
              <li
                key={habit.key}
                className="flex items-center justify-between gap-3 text-[0.9375rem]"
              >
                {habit.label}
                <button
                  onClick={() =>
                    save.mutate({
                      customHabits: settings.customHabits.filter((h) => h.key !== habit.key),
                    })
                  }
                  className="tap px-2 text-ink-faint hover:text-alert"
                  aria-label={`Remove ${habit.label}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex gap-2.5">
          <TextInput
            placeholder="Add your own — nicotine patch, meditation"
            value={habitLabel}
            onChange={(e) => setHabitLabel(e.target.value)}
          />
          <Button
            variant="secondary"
            disabled={!habitLabel.trim()}
            onClick={() => {
              save.mutate({
                customHabits: [
                  ...settings.customHabits,
                  {
                    key: habitLabel.toLowerCase().replace(/\W+/g, '-'),
                    label: habitLabel.trim(),
                    unit: '',
                  },
                ],
              });
              setHabitLabel('');
            }}
          >
            Add
          </Button>
        </div>
      </Card>

      {(profile?.smokingStatus === 'current' || profile?.smokingStatus === 'quitting') && (
        <Card>
          <Eyebrow as="h2">Quit support</Eyebrow>
          <p className="mt-1.5 text-[0.875rem] leading-snug text-ink-soft">
            Tell GoodForm what a normal day looked like before, and Today will show what you have
            not smoked and what that is worth.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <Field label="Cigarettes a day">
              <TextInput
                type="number"
                inputMode="numeric"
                value={smokeBaseline}
                onChange={(e) => setSmokeBaseline(e.target.value)}
              />
            </Field>
            <Field label={`Cost each (${settings.currency})`}>
              <TextInput
                type="number"
                inputMode="decimal"
                value={smokeCost}
                onChange={(e) => setSmokeCost(e.target.value)}
              />
            </Field>
          </div>
          <Button
            variant="secondary"
            className="mt-3"
            onClick={() =>
              save.mutate({
                smokingBaselinePerDay: smokeBaseline ? Number(smokeBaseline) : null,
                cigaretteCost: smokeCost ? Number(smokeCost) : null,
              })
            }
          >
            Save
          </Button>
        </Card>
      )}

      <RemindersCard settings={settings} />

      <TrainingDaysCard settings={settings} onSave={(next) => save.mutate(next)} />

      <Card>
        <Eyebrow as="h2">Around a session</Eyebrow>
        <div className="mt-2">
          <Field
            label="When you usually train"
            hint="Drives the fuelling notes, and the nudge an hour before."
          >
            <TextInput
              type="time"
              value={settings.sessionTime}
              onChange={(e) => save.mutate({ sessionTime: e.target.value })}
            />
          </Field>
        </div>
        <label className="mt-3 flex items-center justify-between gap-4 border-t border-line pt-3">
          <span>
            <span className="block">Fuelling notes</span>
            <span className="block text-[0.8125rem] leading-snug text-ink-soft">
              What to eat before and after, timed to the session rather than to meal names.
            </span>
          </span>
          <input
            type="checkbox"
            checked={settings.fuellingTips}
            onChange={(e) => save.mutate({ fuellingTips: e.target.checked })}
            className="h-6 w-6 shrink-0 accent-[#1b3fd8]"
          />
        </label>
      </Card>

      {settings.targetsWithdrawnAt && <RestoreTargetsCard />}

      <Card>
        <Eyebrow as="h2">Your profile</Eyebrow>
        <p className="mt-1.5 text-[0.9375rem] leading-snug text-ink-soft">
          Changing your weight recalculates protein. Changing your equipment reselects your strength
          work.
        </p>
        <Button variant="secondary" className="mt-3" onClick={() => navigate('/onboarding')}>
          Edit profile
        </Button>
      </Card>

      <ExportCard />

      <Note>
        Your health data stays on your own server and is never sold or shared. GoodForm gives
        general fitness guidance — it is not medical advice and does not replace a doctor or
        physiotherapist.
      </Note>

      <Button
        variant="quiet"
        full
        className="py-3"
        onClick={() => {
          if (session?.user?.id) clearDraft(session.user.id);
          void signOut();
        }}
      >
        Sign out
      </Button>

      <ResetDataCard email={session?.user?.email ?? ''} />
      <DeleteAccountCard email={session?.user?.email ?? ''} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reminders (P3, P3.1)
// ---------------------------------------------------------------------------

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Permission is asked for here, from a switch the user has just reached for —
 * never on load. A notification prompt that arrives before anyone knows what it
 * is for gets denied, and a denied permission cannot be asked for twice.
 */
function RemindersCard({ settings }: { settings: Settings }) {
  const save = useSaveSettings();
  const { data: regimenData } = useRegimenItems();
  const install = useInstallState();

  const [support] = useState(pushSupport);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void currentSubscription().then((subscription) => setSubscribed(Boolean(subscription)));
  }, []);

  /** On only when the account wants them *and* this browser can receive them. */
  const on = settings.remindersEnabled && subscribed === true;
  const hasItems = (regimenData?.items ?? []).length > 0;

  // The session nudge is derived, an hour before training, so it can land
  // inside quiet hours without the runner ever choosing that. Quiet hours win
  // — but silently losing a reminder is worse than the conflict itself.
  const sessionNudge = timeFromMinutes(minutesOfDay(settings.sessionTime) - 60);
  const nudgeIsSilenced = withinWindow(
    sessionNudge,
    settings.quietHoursStart,
    settings.quietHoursEnd,
  );
  // The weekly check-in time is chosen outright rather than derived, but it is
  // dropped by quiet hours in exactly the same way and said so nowhere.
  const checkIsSilenced = withinWindow(
    settings.weeklyCheckTime,
    settings.quietHoursStart,
    settings.quietHoursEnd,
  );

  const enable = async () => {
    setBusy(true);
    setMessage(null);
    const result = await subscribeToPush();
    if (result.ok) {
      // Read it back rather than assuming: the browser is the authority on
      // whether a subscription exists, not the call that just made one.
      setSubscribed(Boolean(await currentSubscription()));
      // The timezone is captured here rather than guessed on the server: the
      // schedule is written in local time and has to stay local.
      await save.mutateAsync({ remindersEnabled: true, timezone: browserTimezone() });
      const delivered = await sendTestPush();
      setMessage(
        delivered > 0
          ? 'Reminders are on. A test notification has just gone out.'
          : 'Reminders are on, though the test notification did not arrive. They are best-effort on every phone.',
      );
    } else {
      setMessage(result.reason ?? 'Could not turn reminders on.');
    }
    setBusy(false);
  };

  const disable = async () => {
    setBusy(true);
    await unsubscribeFromPush();
    await save.mutateAsync({ remindersEnabled: false });
    setSubscribed(false);
    setMessage(null);
    setBusy(false);
  };

  return (
    <Card>
      <Eyebrow as="h2">Reminders</Eyebrow>
      <p className="mt-1.5 text-[0.9375rem] leading-snug text-ink-soft">
        Everything due already shows on Today, with no permission needed. Notifications add a nudge
        at the time itself — useful, and never something the app relies on.
      </p>

      {support.state === 'needs_install' && (
        <div className="mt-3">
          <Note tone="alert">{support.reason}</Note>
          {install.kind === 'prompt' ? (
            <Button className="mt-2.5" onClick={() => void install.install()}>
              Install GoodForm
            </Button>
          ) : install.kind === 'manual' ? (
            <p className="mt-2.5 text-[0.875rem] leading-relaxed text-ink-soft">{install.steps}</p>
          ) : null}
        </div>
      )}

      {(support.state === 'unsupported' || support.state === 'denied') && (
        <div className="mt-3">
          <Note tone="alert">{support.reason}</Note>
        </div>
      )}

      {support.state === 'ready' && (
        <>
          {!hasItems && !settings.remindersEnabled && (
            <p className="mt-3 rounded-xl bg-chalk-deep px-3.5 py-3 text-[0.875rem] leading-relaxed text-ink-soft">
              You can turn these on now, but they are most useful once there is something on your
              list. Sessions and the weekly check-in are covered either way.
            </p>
          )}

          <div className="mt-3">
            {on ? (
              <Button variant="secondary" full disabled={busy} onClick={disable}>
                Turn reminders off
              </Button>
            ) : (
              <Button full disabled={busy} onClick={enable}>
                {busy ? 'Setting up…' : 'Turn on reminders'}
              </Button>
            )}
          </div>

          {/*
            Two things have to be true, and they can disagree: the account wants
            reminders, and *this browser* is registered to receive them. Signing
            in on a second device leaves the first true and the second false, so
            say which it is rather than showing one switch for both.
          */}
          {subscribed !== null && (
            <p className="mt-2.5 text-[0.875rem] leading-relaxed text-ink-soft">
              {on
                ? 'This browser is set up to receive them.'
                : settings.remindersEnabled && !subscribed
                  ? 'Reminders are on for your account, but this browser is not registered for them yet. Turning them on here adds this device.'
                  : 'Not set up on this browser.'}
            </p>
          )}

          {message && (
            <p className="mt-2.5 text-[0.875rem] leading-relaxed text-ink-soft">{message}</p>
          )}

          {settings.remindersEnabled && (
            <div className="mt-3.5 border-t border-line pt-1">
              <Toggle
                label="Doses"
                hint="What is on your list, at the times you set."
                checked={settings.regimenReminders}
                onChange={(regimenReminders) => save.mutate({ regimenReminders })}
              />
              <Toggle
                label="Sessions"
                hint={`One nudge at ${sessionNudge}, an hour before you train. Never repeated — a missed session is not chased.`}
                checked={settings.sessionReminders}
                onChange={(sessionReminders) => save.mutate({ sessionReminders })}
              />
              {settings.sessionReminders && nudgeIsSilenced && (
                <p className="border-b border-line py-3 text-[0.875rem] leading-relaxed text-walk-deep">
                  That {sessionNudge} nudge falls inside your quiet hours, so it will not arrive.
                  Train later, or move quiet hours to end before {sessionNudge}.
                </p>
              )}
              <Toggle
                label="Weekly check-in"
                hint="Weight, waist and resting heart rate."
                checked={settings.weeklyCheckReminders}
                onChange={(weeklyCheckReminders) => save.mutate({ weeklyCheckReminders })}
              />

              {settings.weeklyCheckReminders && (
                <div className="border-b border-line py-3">
                  <span className="eyebrow">Check-in day</span>
                  <div className="mt-1.5 flex gap-1.5">
                    {DAY_LETTERS.map((letter, index) => (
                      <button
                        key={index}
                        type="button"
                        aria-pressed={settings.weeklyCheckDay === index}
                        aria-label={DAY_NAMES[index]}
                        onClick={() => save.mutate({ weeklyCheckDay: index })}
                        className={`tap flex-1 rounded-xl border text-[0.875rem] transition-colors ${
                          settings.weeklyCheckDay === index
                            ? 'border-ink bg-ink text-chalk'
                            : 'border-line bg-paper hover:border-ink-faint'
                        }`}
                      >
                        {letter}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2.5">
                    <Field label="Time">
                      <TextInput
                        type="time"
                        value={settings.weeklyCheckTime}
                        onChange={(e) => save.mutate({ weeklyCheckTime: e.target.value })}
                      />
                    </Field>
                    {checkIsSilenced && (
                      <div className="mt-2">
                        <Note tone="alert">
                          {settings.weeklyCheckTime} falls inside your quiet hours, so this reminder
                          will not arrive. Pick a time outside {settings.quietHoursStart}–
                          {settings.quietHoursEnd}, or move quiet hours below.
                        </Note>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="border-b border-line py-3">
                <span className="eyebrow">Quiet hours</span>
                <p className="mt-0.5 text-[0.8125rem] leading-snug text-ink-soft">
                  Nothing arrives in this window — except a medicine you deliberately scheduled
                  inside it.
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2.5">
                  <Field label="From">
                    <TextInput
                      type="time"
                      value={settings.quietHoursStart}
                      onChange={(e) => save.mutate({ quietHoursStart: e.target.value })}
                    />
                  </Field>
                  <Field label="Until">
                    <TextInput
                      type="time"
                      value={settings.quietHoursEnd}
                      onChange={(e) => save.mutate({ quietHoursEnd: e.target.value })}
                    />
                  </Field>
                </div>
              </div>

              <Toggle
                label="Keep names off the lock screen"
                hint="A medicine name is health data. With this on, a notification says only that something is due."
                checked={settings.hideNamesInNotifications}
                onChange={(hideNamesInNotifications) => save.mutate({ hideNamesInNotifications })}
              />
              <Toggle
                label="Second nudge for medicines"
                hint="One more, half an hour later, if a medicine is still unticked. Supplements never get this."
                checked={settings.medicineEscalation}
                onChange={(medicineEscalation) => save.mutate({ medicineEscalation })}
              />

              <p className="pt-3 text-[0.8125rem] leading-relaxed text-ink-faint">
                Times are read in {settings.timezone}. They stay put across time zones and clock
                changes — 08:00 is 08:00 wherever you are.
              </p>
            </div>
          )}
        </>
      )}

      {install.kind !== 'installed' && support.state === 'ready' && install.kind === 'prompt' && (
        <Button variant="quiet" full className="mt-3 py-3" onClick={() => void install.install()}>
          Install GoodForm on this device
        </Button>
      )}
    </Card>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 border-b border-line py-3">
      <span>
        <span className="block">{label}</span>
        {hint && <span className="block text-[0.8125rem] leading-snug text-ink-soft">{hint}</span>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-6 w-6 shrink-0 accent-[#1b3fd8]"
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Guardrails and account (P3)
// ---------------------------------------------------------------------------

function RestoreTargetsCard() {
  const restore = useRestoreTargets();
  const [confirming, setConfirming] = useState(false);

  return (
    <Card className="border-walk">
      <Eyebrow as="h2" className="!text-walk-deep">
        Your targets
      </Eyebrow>
      <p className="mt-1.5 leading-relaxed text-ink-soft">
        GoodForm put your protein target and weight figures away because of the pattern in the last
        few weeks. You can have them back — it is your call, and asking twice would just be an app
        arguing with you.
      </p>
      {confirming ? (
        <div className="mt-3 flex gap-2.5">
          <Button full disabled={restore.isPending} onClick={() => restore.mutate()}>
            Yes, show them again
          </Button>
          <Button variant="quiet" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button variant="secondary" className="mt-3" onClick={() => setConfirming(true)}>
          Show my targets again
        </Button>
      )}
    </Card>
  );
}

/** P3: GDPR self-serve deletion. Deliberately hard to reach by accident. */
/**
 * Start over, keeping the account.
 *
 * Sits above the delete control on purpose: someone who wants a clean slate
 * almost always wants this one, and deleting the account is only the right
 * answer if they are leaving.
 */
function ResetDataCard({ email }: { email: string }) {
  const reset = useResetData();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <Note tone="run">
        Cleared. Your profile and settings are as they were — build a new plan whenever you are
        ready.
      </Note>
    );
  }

  if (!open) {
    return (
      <Button variant="quiet" full className="py-3" onClick={() => setOpen(true)}>
        Start over with a clean slate
      </Button>
    );
  }

  return (
    <Card>
      <Eyebrow as="h2">Start over</Eyebrow>
      <p className="mt-1.5 leading-relaxed">
        Clears your plan, every logged session, your habit and food logs, measurements and dose
        history — then puts you back at the start so you can build a fresh plan.
      </p>
      <p className="mt-2 leading-relaxed text-ink-soft">
        Your account, profile, settings and your list of supplements and medicines all stay. This
        cannot be undone, so download your data first if any of it matters.
      </p>
      <div className="mt-3">
        <Field label={`Type ${email} to confirm`}>
          <TextInput
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            placeholder={email}
          />
        </Field>
      </div>
      {error && (
        <div className="mt-2.5">
          <Note tone="alert">{error}</Note>
        </div>
      )}
      <div className="mt-3 flex gap-2.5">
        <Button variant="secondary" full onClick={() => setOpen(false)}>
          Keep everything
        </Button>
        <Button
          disabled={reset.isPending || typed.trim().toLowerCase() !== email.toLowerCase()}
          onClick={() => {
            setError(null);
            reset.mutate(typed, {
              onSuccess: () => setDone(true),
              onError: () => setError('That did not work. Nothing has been cleared.'),
            });
          }}
        >
          {reset.isPending ? 'Clearing' : 'Clear it'}
        </Button>
      </div>
    </Card>
  );
}

function DeleteAccountCard({ email }: { email: string }) {
  const remove = useDeleteAccount();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button variant="quiet" full className="py-3 !text-alert" onClick={() => setOpen(true)}>
        Delete my account
      </Button>
    );
  }

  return (
    <Card className="border-alert bg-alert-wash">
      <Eyebrow as="h2" className="!text-alert">
        Delete everything
      </Eyebrow>
      <p className="mt-1.5 leading-relaxed">
        This removes your profile, plans, every session, every log, your list and the foods you
        added. It happens immediately and cannot be undone. Download your data first if you want to
        keep it.
      </p>
      <div className="mt-3">
        <Field label="Type your email address to confirm" hint={email}>
          <TextInput value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </Field>
      </div>
      {error && <p className="mt-2 text-[0.875rem] text-alert">{error}</p>}
      <div className="mt-3 flex gap-2.5">
        <Button
          variant="alert"
          full
          disabled={remove.isPending || typed.trim().toLowerCase() !== email.toLowerCase()}
          onClick={async () => {
            setError(null);
            try {
              await remove.mutateAsync(typed.trim());
              // The session row went with the user row, so this only clears
              // the cookie the browser is still holding.
              await signOut().catch(() => {});
              window.location.href = '/';
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : 'Could not delete the account.');
            }
          }}
        >
          Delete my account
        </Button>
        <Button variant="quiet" onClick={() => setOpen(false)}>
          Keep it
        </Button>
      </div>
    </Card>
  );
}

/**
 * Which days the week is built around.
 *
 * The rhythm used to be fixed at Mon/Wed/Sat and Tue/Fri, stated nowhere and
 * changeable nowhere — so someone who works Saturdays had an app that called
 * their training days rest days and their rest days training days, for ever.
 */
function TrainingDaysCard({
  settings,
  onSave,
}: {
  settings: Settings;
  onSave: (next: Partial<Settings>) => void;
}) {
  const runDays = settings.runDays;
  const strengthDays = settings.strengthDays;

  // The plan engine builds three runs a week, and the weekly gate counts a
  // shortfall against that number — so picking two run days would report a
  // missed session every week for ever. The count is fixed; which days are not.
  const toggleRun = (day: number) => {
    if (runDays.includes(day)) return;
    // Replace the oldest choice, so tapping always does something.
    const next = [...runDays.slice(1), day].sort((a, b) => a - b);
    onSave({ runDays: next, strengthDays: strengthDays.filter((d) => !next.includes(d)) });
  };

  const toggleStrength = (day: number) => {
    if (runDays.includes(day)) return; // one thing per day
    const next = strengthDays.includes(day)
      ? strengthDays.filter((d) => d !== day)
      : [...strengthDays, day].sort((a, b) => a - b);
    onSave({ strengthDays: next });
  };

  const consecutive = hasBackToBackRuns({ run: runDays, strength: strengthDays });

  const row = (
    selected: number[],
    onPick: (day: number) => void,
    tone: 'run' | 'walk',
    label: string,
  ) => (
    <div className="mt-1.5 flex gap-1.5" role="group" aria-label={label}>
      {WEEKDAY_NAMES.map((name, day) => {
        const on = selected.includes(day);
        const blocked = tone === 'walk' && runDays.includes(day);
        return (
          <button
            key={name}
            type="button"
            aria-pressed={on}
            aria-label={name}
            disabled={blocked}
            onClick={() => onPick(day)}
            className={`tap !min-w-0 flex-1 rounded-xl border text-[0.9375rem] transition-colors ${
              on
                ? tone === 'run'
                  ? 'border-run bg-run text-white'
                  : 'border-walk bg-walk text-ink'
                : blocked
                  ? 'border-line bg-chalk-deep text-ink-faint'
                  : 'border-line bg-paper hover:border-ink-faint'
            }`}
          >
            {name.slice(0, 1)}
          </button>
        );
      })}
    </div>
  );

  return (
    <Card>
      <Eyebrow as="h2">Your training days</Eyebrow>
      <p className="mt-1.5 leading-relaxed text-ink-soft">
        Three runs a week, on the days that fit your life. Strength work is optional and never
        shares a day with a run.
      </p>

      <div className="mt-3">
        <span className="eyebrow">Runs</span>
        {row(runDays, toggleRun, 'run', 'Days you run')}
        <p className="mt-1.5 text-[0.8125rem] leading-snug text-ink-faint">
          {listDays(daysFor('run', { run: runDays, strength: strengthDays }))}. Tap another day to
          move the earliest one.
        </p>
      </div>

      <div className="mt-3">
        <span className="eyebrow">Strength</span>
        {row(strengthDays, toggleStrength, 'walk', 'Days you do strength work')}
        <p className="mt-1.5 text-[0.8125rem] leading-snug text-ink-faint">
          {strengthDays.length
            ? listDays(daysFor('strength', { run: runDays, strength: strengthDays }))
            : 'None — the plan will not ask for any.'}
        </p>
      </div>

      {consecutive && (
        <div className="mt-3">
          <Note tone="alert">
            Two of your runs fall on consecutive days. That is the arrangement most likely to hurt a
            beginner — the second run lands on tissue that has not finished repairing. It is
            allowed; it is just worth knowing.
          </Note>
        </div>
      )}
    </Card>
  );
}
