import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useProfile, useSaveSettings } from '../api/hooks.ts';
import { signOut, useSession } from '../lib/auth.ts';
import { clearDraft } from '../lib/onboardingDraft.ts';
import { audioSessionSupported, hapticsSupported } from '../timer/cues.ts';
import { ScreenWakeLock } from '../timer/wakeLock.ts';
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
        <Eyebrow>During a session</Eyebrow>
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
            <strong className="text-ink">No vibration on this device.</strong> Every browser on iPhone runs on
            WebKit, which has no vibration support — so sound and the on-screen colour are your cues.
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
              This browser does not expose the audio session, so the choice may have no effect here. It matters
              on iOS Safari 16.4 and later.
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
        <Eyebrow>What you track</Eyebrow>
        <p className="mt-1.5 text-[0.875rem] leading-snug text-ink-soft">
          Turn off anything you do not want to see. Tracking nothing but sessions is a perfectly good way to use
          this.
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
              <li key={habit.key} className="flex items-center justify-between gap-3 text-[0.9375rem]">
                {habit.label}
                <button
                  onClick={() =>
                    save.mutate({ customHabits: settings.customHabits.filter((h) => h.key !== habit.key) })
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
                  { key: habitLabel.toLowerCase().replace(/\W+/g, '-'), label: habitLabel.trim(), unit: '' },
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
          <Eyebrow>Quit support</Eyebrow>
          <p className="mt-1.5 text-[0.875rem] leading-snug text-ink-soft">
            Tell GoodForm what a normal day looked like before, and Today will show what you have not smoked and
            what that is worth.
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

      <Card>
        <Eyebrow>Your profile</Eyebrow>
        <p className="mt-1.5 text-[0.9375rem] leading-snug text-ink-soft">
          Changing your weight recalculates protein. Changing your equipment reselects your strength work.
        </p>
        <Button variant="secondary" className="mt-3" onClick={() => navigate('/onboarding')}>
          Edit profile
        </Button>
      </Card>

      <Note>
        Your health data stays on your own server and is never sold or shared. GoodForm gives general fitness
        guidance — it is not medical advice and does not replace a doctor or physiotherapist.
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
    </div>
  );
}
