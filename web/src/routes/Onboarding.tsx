import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import type { Profile, ScreeningFlag, StopReason } from '@goodform/shared';
import { daysFor, listDays, proteinTarget } from '@goodform/shared';
import {
  useGeneratePlan,
  useProfile,
  useSaveBaseline,
  useSaveProfile,
  useSaveScreening,
} from '../api/hooks.ts';
import { clearDraft, loadDraft, saveDraft } from '../lib/onboardingDraft.ts';
import { useSession } from '../lib/auth.ts';
import { Button, Choices, Eyebrow, Field, Note, TextInput } from '../components/ui.tsx';
import { IntervalRibbon } from '../components/IntervalRibbon.tsx';
import { BaselineRun, StopReasonChoice } from '../components/BaselineRun.tsx';

const SCREENING_QUESTIONS: { flag: ScreeningFlag; question: string }[] = [
  {
    flag: 'heart_condition',
    question:
      'Has a doctor ever said you have a heart condition, or that you should only do physical activity supervised by a doctor?',
  },
  {
    flag: 'chest_pain',
    question: 'Do you get chest pain at rest, during daily activity, or when you exert yourself?',
  },
  {
    flag: 'dizziness',
    question:
      'Do you lose balance from dizziness, or have you lost consciousness in the last 12 months?',
  },
  {
    flag: 'bone_or_joint_problem',
    question: 'Do you have a bone or joint problem that could be made worse by running?',
  },
  {
    flag: 'bp_or_heart_medication',
    question: 'Are you currently prescribed medication for blood pressure or a heart condition?',
  },
  {
    flag: 'pregnancy',
    question: 'Are you pregnant, or have you given birth in the last six months?',
  },
  {
    flag: 'other_reason',
    question: 'Do you know of any other reason why you should not do physical activity?',
  },
];

type Step = 'about' | 'body' | 'habits' | 'history' | 'goal' | 'screening' | 'baseline' | 'reveal';
const ORDER: Step[] = [
  'about',
  'body',
  'habits',
  'history',
  'goal',
  'screening',
  'baseline',
  'reveal',
];
const STEP_NAMES: Record<Step, string> = {
  about: 'About you',
  body: 'Body',
  habits: 'Where you are',
  history: 'Injuries',
  goal: 'Goal',
  screening: 'Health check',
  baseline: 'Starting point',
  reveal: 'Your plan',
};

const EMPTY_PROFILE: Partial<Profile> = {
  units: 'metric',
  exclusions: [],
  injuryHistory: [],
  equipment: ['none'],
  alcoholFrequency: 'never',
};

/** True once every field the plan generator needs has an answer. */
function isComplete(draft: Partial<Profile>): draft is Profile {
  return Boolean(
    draft.age &&
    draft.sexAtBirth &&
    draft.heightCm &&
    draft.weightKg &&
    draft.dietaryPattern &&
    draft.activityLevel &&
    draft.smokingStatus &&
    draft.goal,
  );
}

export function Onboarding() {
  const navigate = useNavigate();
  const saveProfile = useSaveProfile();
  const saveScreening = useSaveScreening();
  const saveBaseline = useSaveBaseline();
  const generatePlan = useGeneratePlan();

  const { data: profileData } = useProfile();
  const { data: session } = useSession();
  const userId = session?.user?.id ?? '';
  // Read once, lazily: the draft belongs to the first render and must not be
  // re-read on every one. The ref beside it is only a latch recording whether
  // the form has already been populated, so the effect below cannot clobber
  // answers the runner has started typing.
  const [saved] = useState(() => loadDraft(userId));
  const restored = useRef(Boolean(saved));
  const lastSaved = useRef<string | null>(null);
  /** Whether a profile already existed when this screen opened. */
  const [editingExisting, setEditingExisting] = useState<boolean | null>(null);

  const [step, setStep] = useState<Step>((saved?.step as Step) ?? 'about');
  const [draft, setDraft] = useState<Partial<Profile>>(saved?.profile ?? EMPTY_PROFILE);
  const [flags, setFlags] = useState<ScreeningFlag[]>(saved?.flags ?? []);
  const [acknowledged, setAcknowledged] = useState(saved?.acknowledged ?? false);
  const [minutesRun, setMinutesRun] = useState(saved?.minutesRun ?? '');
  const [stopReason, setStopReason] = useState<StopReason | null>(saved?.stopReason ?? null);
  /** How the runner chose to give us their starting point. */
  const [baselineMode, setBaselineMode] = useState<'guided' | 'manual' | 'none' | null>(
    saved?.baselineMode ?? null,
  );
  /** Furthest step reached, so finished steps stay reachable from the stepper. */
  const [furthest, setFurthest] = useState(saved?.furthest ?? 0);
  const [plan, setPlan] = useState<{
    weeks: { index: number; runSec: number; walkSec: number; reps: number; isDeload: boolean }[];
    reasons: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stepIndex = ORDER.indexOf(step);

  // Someone editing an existing profile must see their current answers, not a
  // blank form that would overwrite them.
  useEffect(() => {
    if (!profileData) return;
    // Latching a fact about the server's answer the first time it arrives is
    // exactly the external-system sync effects are for; the `was ??` keeps it
    // to a single transition, so there is no cascade to avoid.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditingExisting((was) => was ?? Boolean(profileData.profile));
    if (restored.current) return;
    const server = profileData.profile;
    if (!server) return;
    restored.current = true;
    const { userId: _userId, ...fields } = server as typeof server & { userId?: string };
    const prefilled = { ...EMPTY_PROFILE, ...fields };
    lastSaved.current = JSON.stringify(prefilled);
    setDraft(prefilled);
    setFurthest(ORDER.length - 2);
  }, [profileData]);

  useEffect(() => {
    if (step === 'reveal') return;
    if (!userId) return;
    saveDraft(userId, {
      step,
      furthest,
      profile: draft,
      flags,
      acknowledged,
      minutesRun,
      stopReason,
      baselineMode,
    });
  }, [userId, step, furthest, draft, flags, acknowledged, minutesRun, stopReason, baselineMode]);

  const set = <K extends keyof Profile>(key: K, value: Profile[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const go = (next: Step) => {
    setError(null);
    setStep(next);
    setFurthest((f) => Math.max(f, ORDER.indexOf(next)));
    window.scrollTo({ top: 0 });
  };

  /** Saves the profile if it is complete and has actually changed. */
  const persistIfChanged = async () => {
    if (!isComplete(draft)) return;
    const serialised = JSON.stringify(draft);
    if (serialised === lastSaved.current) return;
    await saveProfile.mutateAsync(draft);
    lastSaved.current = serialised;
  };

  /**
   * Jumping between finished steps must not lose an edit made on the way, so
   * a changed profile is saved whenever the wizard is navigated.
   */
  const jumpTo = (target: Step) => {
    void persistIfChanged();
    go(target);
  };

  /**
   * Editing an existing profile should not drag anyone back through the
   * baseline — regenerating a plan would throw away the one they are on.
   */
  const saveAndClose = async () => {
    await persistIfChanged();
    clearDraft(userId);
    void navigate('/');
  };

  const finishProfile = async () => {
    await persistIfChanged();
    go('screening');
  };

  const finishScreening = async () => {
    await saveScreening.mutateAsync({ flags, acknowledged });
    go('baseline');
  };

  const finishBaseline = async (minutes?: number, reason?: StopReason) => {
    const finalMinutes = minutes ?? Number(minutesRun);
    const finalReason = reason ?? stopReason;
    if (finalReason === null || Number.isNaN(finalMinutes)) return;
    try {
      await saveBaseline.mutateAsync({ minutesRun: finalMinutes, stopReason: finalReason });
      const result = (await generatePlan.mutateAsync()) as {
        plan: { conservatismReasons: string[] };
        weeks: {
          index: number;
          runSec: number;
          walkSec: number;
          reps: number;
          isDeload: boolean;
        }[];
      };
      setPlan({ weeks: result.weeks, reasons: result.plan.conservatismReasons });
      clearDraft(userId);
      go('reveal');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build your plan.');
    }
  };

  return (
    <div className="mx-auto w-full max-w-lg px-1 py-6">
      {step !== 'reveal' && (
        <div className="mb-7">
          <div className="mb-4 flex items-center justify-between">
            <span className="flex h-3.5 w-9 overflow-hidden rounded-full" aria-hidden>
              <span className="h-full flex-[3] bg-run" />
              <span className="h-full flex-[1] bg-walk" />
            </span>
            <span className="flex items-center gap-1">
              {stepIndex > 0 && (
                <button
                  onClick={() => {
                    const back = ORDER[stepIndex - 1];
                    if (back) jumpTo(back);
                  }}
                  className="tap px-2 text-[0.875rem] text-ink-faint hover:text-ink"
                >
                  Back
                </button>
              )}
              {editingExisting && (
                <button
                  onClick={saveAndClose}
                  disabled={saveProfile.isPending}
                  className="tap rounded-lg px-3 text-[0.875rem] font-semibold text-run hover:bg-run-wash"
                >
                  Save and close
                </button>
              )}
            </span>
          </div>
          {/* Finished steps stay reachable — answers are kept, so going back
              to change one costs nothing. */}
          <nav className="mb-3 flex gap-1" aria-label="Setup steps">
            {ORDER.slice(0, -1).map((s, i) => {
              const reachable = i <= furthest;
              return (
                <button
                  key={s}
                  type="button"
                  disabled={!reachable}
                  aria-current={i === stepIndex ? 'step' : undefined}
                  aria-label={`Step ${i + 1} of ${ORDER.length - 1}: ${STEP_NAMES[s]}${reachable ? '' : ' (not yet reached)'}`}
                  onClick={() => jumpTo(s)}
                  className="group flex-1 py-2 disabled:cursor-not-allowed"
                >
                  <span
                    className={`block h-1 rounded-full transition-colors ${
                      i === stepIndex
                        ? 'bg-ink'
                        : reachable
                          ? 'bg-ink/35 group-hover:bg-ink/60'
                          : 'bg-line'
                    }`}
                  />
                </button>
              );
            })}
          </nav>
          <Eyebrow>
            Step {stepIndex + 1} of {ORDER.length - 1} · {STEP_NAMES[step]}
          </Eyebrow>
        </div>
      )}

      {step === 'about' && (
        <Section
          title="Let's start with the basics"
          blurb="These shape how conservatively your plan begins. Nothing here is shared with anyone."
        >
          <Field label="Age">
            <TextInput
              type="number"
              inputMode="numeric"
              min={13}
              max={100}
              value={draft.age ?? ''}
              onChange={(e) => set('age', Number(e.target.value))}
            />
          </Field>
          <Field label="Sex at birth" hint="Used for protein and iron guidance only." group>
            <Choices
              columns={2}
              value={draft.sexAtBirth ?? []}
              onChange={([v]) => v && set('sexAtBirth', v)}
              options={[
                { value: 'male', label: 'Male' },
                { value: 'female', label: 'Female' },
                { value: 'intersex', label: 'Intersex' },
              ]}
            />
          </Field>
          <Next disabled={!draft.age || !draft.sexAtBirth} onClick={() => go('body')} />
        </Section>
      )}

      {step === 'body' && (
        <Section
          title="Height and weight"
          blurb="Weight sets your daily protein target. It is context, never a target we set for you."
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Height (cm)">
              <TextInput
                type="number"
                inputMode="decimal"
                value={draft.heightCm ?? ''}
                onChange={(e) => set('heightCm', Number(e.target.value))}
              />
            </Field>
            <Field label="Weight (kg)">
              <TextInput
                type="number"
                inputMode="decimal"
                value={draft.weightKg ?? ''}
                onChange={(e) => set('weightKg', Number(e.target.value))}
              />
            </Field>
          </div>
          {draft.weightKg ? (
            <Note tone="run">
              Your protein target will be about {proteinTarget(draft.weightKg).targetG} g a day.
              That is the one nutrition number GoodForm tracks — no calorie counting.
            </Note>
          ) : null}
          <Field label="What do you eat?" group>
            <Choices
              value={draft.dietaryPattern ?? []}
              onChange={([v]) => v && set('dietaryPattern', v)}
              options={[
                { value: 'omnivore', label: 'Everything' },
                { value: 'no_red_meat', label: 'No red meat' },
                { value: 'pescatarian', label: 'Fish, no other meat' },
                { value: 'eggetarian', label: 'Vegetarian plus eggs' },
                { value: 'vegetarian', label: 'Vegetarian' },
                { value: 'vegan', label: 'Vegan' },
              ]}
            />
          </Field>
          <Next
            disabled={!draft.heightCm || !draft.weightKg || !draft.dietaryPattern}
            onClick={() => go('habits')}
          />
        </Section>
      )}

      {step === 'habits' && (
        <Section
          title="Where you're starting from"
          blurb="Answer honestly — this changes the plan, and a plan built on a flattering answer is the one that injures you."
        >
          <Field label="Current activity" group>
            <Choices
              value={draft.activityLevel ?? []}
              onChange={([v]) => v && set('activityLevel', v)}
              options={[
                { value: 'none', label: 'Nothing regular' },
                { value: 'occasional_sport', label: 'Sport now and then' },
                { value: 'regular_sport', label: 'Regular sport' },
                { value: 'other_cardio', label: 'Other cardio — cycling, swimming' },
              ]}
            />
          </Field>
          <Field label="Smoking" group>
            <Choices
              columns={2}
              value={draft.smokingStatus ?? []}
              onChange={([v]) => v && set('smokingStatus', v)}
              options={[
                { value: 'never', label: 'Never' },
                { value: 'current', label: 'Currently smoke' },
                { value: 'quitting', label: 'Quitting now' },
                { value: 'former', label: 'Gave up' },
              ]}
            />
          </Field>
          <Field label="Alcohol" group>
            <Choices
              columns={2}
              value={draft.alcoholFrequency ?? []}
              onChange={([v]) => v && set('alcoholFrequency', v)}
              options={[
                { value: 'never', label: 'Never' },
                { value: 'occasional', label: 'Occasionally' },
                { value: 'weekly', label: 'Most weeks' },
                { value: 'more', label: 'More than that' },
              ]}
            />
          </Field>
          <Next
            disabled={!draft.activityLevel || !draft.smokingStatus}
            onClick={() => go('history')}
          />
        </Section>
      )}

      {step === 'history' && (
        <Section
          title="Injuries and equipment"
          blurb="Past injuries change which strength work you get and how fast the running builds."
        >
          <Field
            label="Have any of these given you trouble?"
            hint="Select any that apply, or leave them all unselected if nothing has."
            group
          >
            <Choices
              multiple
              columns={2}
              value={draft.injuryHistory ?? []}
              onChange={(v) => set('injuryHistory', v)}
              options={[
                { value: 'knee', label: 'Knee' },
                { value: 'shin', label: 'Shin' },
                { value: 'ankle', label: 'Ankle' },
                { value: 'achilles', label: 'Achilles' },
                { value: 'hip', label: 'Hip' },
                { value: 'foot', label: 'Foot' },
                { value: 'back', label: 'Back' },
              ]}
            />
          </Field>
          <Field
            label="What do you have at home?"
            hint="Strength work is built from what you actually own."
            group
          >
            <Choices
              multiple
              columns={2}
              exclusive="none"
              value={draft.equipment ?? []}
              onChange={(v) => set('equipment', v.length ? v : ['none'])}
              options={[
                { value: 'none', label: 'Nothing' },
                { value: 'pull_up_bar', label: 'Pull-up bar' },
                { value: 'resistance_bands', label: 'Bands' },
                { value: 'dumbbells', label: 'Dumbbells' },
                { value: 'step', label: 'Step or stairs' },
              ]}
            />
          </Field>
          <Next onClick={() => go('goal')} />
        </Section>
      )}

      {step === 'goal' && (
        <Section
          title="What are you after?"
          blurb="This sets the length and shape of your first block."
        >
          <Choices
            value={draft.goal ?? []}
            onChange={([v]) => v && set('goal', v)}
            options={[
              {
                value: 'first_continuous_run',
                label: 'Run without stopping',
                hint: 'The first real milestone for most beginners',
              },
              // The whole app is measured in minutes; naming a goal in
              // kilometres without saying roughly what that is in minutes
              // leaves the two halves unconnected.
              {
                value: 'five_k',
                label: 'Get to 5K',
                hint: 'Around 30 minutes of continuous running, at a beginner pace',
              },
              {
                value: 'ten_k',
                label: 'Get to 10K',
                hint: 'Around an hour of continuous running — a long way from a standing start',
              },
              {
                value: 'general_fitness',
                label: 'General fitness',
                hint: 'Running as the means, not the end',
              },
              { value: 'return_after_break', label: 'Come back after a break' },
            ]}
          />
          <Next
            disabled={!draft.goal || saveProfile.isPending}
            onClick={finishProfile}
            label="Save and continue"
          />
        </Section>
      )}

      {step === 'screening' && (
        <Section
          title="Before you run"
          blurb="Seven standard questions. They exist because a plan is the wrong answer for some people, and we would rather find that out now."
        >
          <div className="flex flex-col gap-2">
            {SCREENING_QUESTIONS.map((q) => {
              const active = flags.includes(q.flag);
              return (
                <button
                  key={q.flag}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    setFlags(active ? flags.filter((f) => f !== q.flag) : [...flags, q.flag])
                  }
                  className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition-colors ${
                    active
                      ? 'border-alert bg-alert-wash'
                      : 'border-line bg-paper hover:border-ink-faint'
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${
                      active ? 'border-alert bg-alert text-white' : 'border-line'
                    }`}
                    aria-hidden
                  >
                    {active && '✓'}
                  </span>
                  <span className="text-[0.9375rem] leading-snug">{q.question}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[0.8125rem] text-ink-faint">
            Tap any that are true for you. Leave them all untapped if none are.
          </p>

          {flags.length > 0 && (
            <>
              <Note tone="alert">
                <strong className="block">Speak to a doctor before you start.</strong>
                Based on what you've told us, a generated plan is not the right starting point. A
                short conversation with a GP or physiotherapist first is genuinely worth it —
                GoodForm cannot assess you and will not pretend otherwise.
              </Note>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-paper p-3.5">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  className="mt-1 h-5 w-5 accent-[#b5462c]"
                />
                <span className="text-[0.9375rem] leading-snug">
                  I understand, and I take responsibility for deciding to continue.
                </span>
              </label>
            </>
          )}

          <Next
            disabled={(flags.length > 0 && !acknowledged) || saveScreening.isPending}
            onClick={finishScreening}
          />
        </Section>
      )}

      {step === 'baseline' && baselineMode === 'guided' && (
        <BaselineRun
          onCancel={() => setBaselineMode(null)}
          // Straight into the draft, which persists — so a run that ends with
          // the app being closed is still a run that happened.
          onRunStopped={(measured) => setMinutesRun(String(measured))}
          onDone={({ minutesRun: measured, stopReason: reason }) => {
            setMinutesRun(String(measured));
            setStopReason(reason);
            void finishBaseline(measured, reason);
          }}
        />
      )}

      {step === 'baseline' && baselineMode !== 'guided' && (
        <Section
          title="How long can you run right now?"
          blurb="There's no right answer here and nothing to live up to. We just need your starting point, so your first weeks ask for something you can actually do."
        >
          {!baselineMode && (
            <>
              <Choices
                value={[]}
                onChange={([v]) => v && setBaselineMode(v)}
                options={[
                  {
                    value: 'guided' as const,
                    label: 'Time it now — I\u2019ll guide you',
                    hint: 'About 10 minutes outside: 5 walking, then run until you want to stop.',
                  },
                  {
                    value: 'manual' as const,
                    label: 'I already know roughly',
                    hint: 'Type in a number instead.',
                  },
                  {
                    value: 'none' as const,
                    label: 'I\u2019ve never run, or I can\u2019t yet',
                    hint: 'Completely normal. We\u2019ll start you at the gentlest setting.',
                  },
                ]}
              />
              <p className="text-[0.8125rem] leading-relaxed text-ink-faint">
                You can change this later. Guessing low is safe — if the first weeks turn out easy,
                the plan moves you up quickly.
              </p>
            </>
          )}

          {baselineMode === 'manual' && (
            <>
              <Field
                label="Minutes you can run without stopping"
                hint="A rough guess is fine. Most people starting out are somewhere between 1 and 10 minutes."
              >
                <TextInput
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={120}
                  placeholder="e.g. 3"
                  value={minutesRun}
                  onChange={(e) => setMinutesRun(e.target.value)}
                />
              </Field>

              <div>
                <Eyebrow>What makes you stop?</Eyebrow>
                <p className="mt-0.5 mb-1.5 text-[0.8125rem] text-ink-soft">
                  This changes your plan more than the number does.
                </p>
                <StopReasonChoice value={stopReason} onPick={setStopReason} />
              </div>

              {stopReason === 'legs' && (
                <Note tone="run">
                  Legs first means we build slower. Lungs recover in weeks; tendons and bone take
                  months, and they set the pace.
                </Note>
              )}

              {error && <Note tone="alert">{error}</Note>}
              <Next
                disabled={
                  minutesRun === '' ||
                  !stopReason ||
                  saveBaseline.isPending ||
                  generatePlan.isPending
                }
                onClick={() => finishBaseline()}
                label={generatePlan.isPending ? 'Building your plan' : 'Build my plan'}
              />
              <Button variant="quiet" full className="py-3" onClick={() => setBaselineMode(null)}>
                Back
              </Button>
            </>
          )}

          {baselineMode === 'none' && (
            <>
              <Note>
                <strong className="block text-ink">We'll start from walking.</strong>
                Your first sessions are one minute of very slow running at a time, with a longer
                walk in between each one. If that turns out to be easy, the plan moves up on its
                own.
              </Note>
              {error && <Note tone="alert">{error}</Note>}
              <Next
                disabled={saveBaseline.isPending || generatePlan.isPending}
                onClick={() => finishBaseline(0, 'legs')}
                label={generatePlan.isPending ? 'Building your plan' : 'Build my plan'}
              />
              <Button variant="quiet" full className="py-3" onClick={() => setBaselineMode(null)}>
                Back
              </Button>
            </>
          )}
        </Section>
      )}

      {step === 'reveal' && plan && (
        <div className="py-2">
          <Eyebrow>Your first block</Eyebrow>
          <h1 className="mt-2 text-4xl" style={{ fontWeight: 800 }}>
            {plan.weeks.length} weeks, three runs a week
          </h1>
          <p className="mt-3 leading-relaxed text-ink-soft">
            Here is the whole thing, start to finish. Each bar shows one session to scale — cobalt
            is running, amber is walking. Nothing is hidden and nothing gets sprung on you.
          </p>

          {/*
            The week has a fixed shape and the app used to keep it to itself,
            so someone who works Saturdays met an app calling their training
            days rest days and never found out why.
          */}
          <div className="mt-4 rounded-xl border border-line bg-paper p-4">
            <Eyebrow>How the week is laid out</Eyebrow>
            <p className="mt-2 leading-relaxed text-ink-soft">
              Runs land on <span className="text-ink">{listDays(daysFor('run'))}</span>.{' '}
              <span className="text-ink">{listDays(daysFor('strength'))}</span> are short strength
              sessions, about 15 minutes each.{' '}
              <span className="text-ink">{listDays(daysFor('rest'))}</span> are rest — and rest is
              where the adaptation actually happens.
            </p>
            <p className="mt-2 leading-relaxed text-ink-soft">
              Those days are a starting point, not a rule — move them in Settings if your week looks
              different. You can also run on a day the plan did not ask for; it will tell you what
              it thinks and then get out of the way.
            </p>
          </div>

          {plan.reasons.length > 0 && (
            <div className="mt-6 rounded-xl border border-line bg-paper p-4">
              <Eyebrow>Why your plan starts where it does</Eyebrow>
              <ul className="mt-2.5 flex flex-col gap-2">
                {plan.reasons.map((reason) => (
                  <li
                    key={reason}
                    className="flex gap-2.5 text-[0.9375rem] leading-snug text-ink-soft"
                  >
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-walk" />
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ol className="mt-6 flex flex-col gap-3.5">
            {plan.weeks.map((week) => (
              <li key={week.index} className="flex items-center gap-3.5">
                <span className="tabular w-7 shrink-0 text-right text-sm text-ink-faint">
                  {week.index}
                </span>
                <div className="min-w-0 flex-1">
                  <IntervalRibbon
                    runSec={week.runSec}
                    walkSec={week.walkSec}
                    reps={week.reps}
                    height={14}
                    scaleToSec={Math.max(
                      ...plan.weeks.map((w) => (w.runSec + w.walkSec) * w.reps),
                      1,
                    )}
                  />
                  <p className="mt-1 text-[0.8125rem] text-ink-faint">
                    {week.runSec / 60} min run · {week.walkSec / 60} min walk · × {week.reps}
                    {week.isDeload && <span className="ml-1.5 text-walk-deep">· lighter week</span>}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <Note tone="run">
            Tendons and bone take three to six months to adapt — far longer than your lungs. Weeks
            where you repeat rather than progress are the plan working, not you failing.
          </Note>

          <Button
            full
            className="mt-6 py-3.5"
            onClick={() => {
              clearDraft(userId);
              void navigate('/');
            }}
          >
            Start
          </Button>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-3xl" style={{ fontWeight: 750 }}>
          {title}
        </h1>
        <p className="mt-2 leading-relaxed text-ink-soft">{blurb}</p>
      </div>
      {children}
    </div>
  );
}

function Next({
  onClick,
  disabled,
  label = 'Continue',
}: {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <Button full className="mt-1 py-3.5" onClick={onClick} disabled={disabled}>
      {label}
    </Button>
  );
}
