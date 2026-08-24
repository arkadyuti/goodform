import { useState } from 'react';
import { DIETARY_NOTES, proteinTarget } from '@goodform/shared';
import {
  useAddFoodEntry,
  useCreateFood,
  useFoods,
  useNutrition,
  useProfile,
  useRemoveFoodEntry,
} from '../api/hooks.ts';
import { today } from '../lib/date.ts';
import { Button, Card, Eyebrow, Field, Note, TextInput } from '../components/ui.tsx';

export function FoodLog() {
  const date = today();
  const { data: profileData } = useProfile();
  const { data: nutrition } = useNutrition(date);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const profile = profileData?.profile;
  const { data: foodData } = useFoods(query, profile?.dietaryPattern);
  const addEntry = useAddFoodEntry(date);
  const removeEntry = useRemoveFoodEntry(date);

  // P3: with targets withdrawn, food still logs — it is simply not scored.
  const targetsWithdrawn = Boolean(profileData?.settings?.targetsWithdrawnAt);
  const target = profile && !targetsWithdrawn ? proteinTarget(profile.weightKg) : null;
  const total = nutrition?.proteinTotal ?? 0;
  const notes = profile ? DIETARY_NOTES[profile.dietaryPattern] : [];

  return (
    <div className="flex flex-col gap-5 pt-1">
      <header>
        <Eyebrow>{targetsWithdrawn ? 'Food today' : 'Protein today'}</Eyebrow>
        {targetsWithdrawn ? (
          <p className="mt-2 text-[1.0625rem] leading-snug">
            Keep logging what you eat. Nothing is being counted against a target at the moment.
          </p>
        ) : (
          <p className="mt-1 flex items-baseline gap-2">
            <span className="tabular text-6xl leading-none" style={{ fontWeight: 800 }}>
              {total}
            </span>
            {target && <span className="text-xl text-ink-soft">/ {target.targetG} g</span>}
          </p>
        )}
        {target && (
          <>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-chalk-deep">
              <div
                className="h-full rounded-full bg-run"
                style={{ width: `${Math.min(100, (total / target.targetG) * 100)}%`, transition: 'width 300ms ease' }}
              />
            </div>
            <p className="mt-2 text-[0.875rem] text-ink-soft">
              {total >= target.minG
                ? 'Enough to build with today.'
                : `${target.minG - total} g to go. Protein is the one number here — no calorie counting.`}
            </p>
          </>
        )}
      </header>

      {nutrition && nutrition.entries.length > 0 && (
        <Card>
          <Eyebrow>Logged</Eyebrow>
          <ul className="mt-1 divide-y divide-line">
            {nutrition.entries.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate">{entry.name}</p>
                  <p className="text-[0.8125rem] text-ink-faint">
                    {entry.servings > 1 ? `${entry.servings} × ` : ''}
                    {entry.servingLabel}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {!targetsWithdrawn && (
                    <span className="tabular font-semibold">{Math.round(entry.proteinG * entry.servings)}g</span>
                  )}
                  <button
                    onClick={() => removeEntry.mutate(entry.id)}
                    aria-label={`Remove ${entry.name}`}
                    className="tap rounded-lg px-2 text-ink-faint transition-colors hover:text-alert"
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div>
        <Eyebrow>Add food</Eyebrow>
        <TextInput
          className="mt-1.5"
          type="search"
          placeholder="Search dal, paneer, eggs, chicken…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {!query && !targetsWithdrawn && (
          <p className="mt-2 text-[0.8125rem] text-ink-faint">Highest protein first. Search for anything else.</p>
        )}
        <ul className="mt-2.5 flex flex-col gap-1.5">
          {(query
            ? (foodData?.foods ?? []).slice(0, 40)
            : // With no search term, lead with the foods that actually move the number.
              [...(foodData?.foods ?? [])].sort((a, b) => b.proteinG - a.proteinG).slice(0, 14)
          ).map((food) => (
            <li key={food.id}>
              <button
                onClick={() => addEntry.mutate({ foodItemId: food.id, servings: 1, food })}
                className="tap flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-paper px-3.5 text-left transition-colors hover:border-ink-faint"
              >
                <span className="min-w-0">
                  <span className="block truncate">{food.name}</span>
                  <span className="block text-[0.8125rem] text-ink-faint">{food.servingLabel}</span>
                </span>
                {!targetsWithdrawn && <span className="tabular shrink-0 font-semibold">{food.proteinG}g</span>}
              </button>
            </li>
          ))}
        </ul>
        {foodData?.foods.length === 0 && (
          <p className="mt-3 text-[0.9375rem] text-ink-soft">
            Nothing matching "{query}" that fits how you eat.
          </p>
        )}

        {!adding ? (
          <Button variant="quiet" full className="mt-3 py-3" onClick={() => setAdding(true)}>
            Add a food that isn't here
          </Button>
        ) : (
          <CustomFood onDone={() => setAdding(false)} />
        )}
      </div>

      {notes.length > 0 && (
        <Card>
          <Eyebrow>For how you eat</Eyebrow>
          <ul className="mt-2 flex flex-col gap-2">
            {notes.map((note) => (
              <li key={note} className="flex gap-2.5 text-[0.9375rem] leading-snug text-ink-soft">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-walk" />
                {note}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Note>
        {targetsWithdrawn
          ? 'GoodForm has never counted calories and is not counting anything at all right now. You can turn your protein target back on from Settings whenever you want it.'
          : 'GoodForm tracks protein and nothing else. No calorie targets, no deficits — you are building tissue, and that does not happen in a hole.'}
      </Note>
    </div>
  );
}

function CustomFood({ onDone }: { onDone: () => void }) {
  const create = useCreateFood();
  const [name, setName] = useState('');
  const [serving, setServing] = useState('');
  const [protein, setProtein] = useState('');

  return (
    <Card className="mt-3">
      <div className="flex flex-col gap-3">
        <Field label="Name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Ragi porridge" />
        </Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Serving">
            <TextInput value={serving} onChange={(e) => setServing(e.target.value)} placeholder="1 bowl" />
          </Field>
          <Field label="Protein g">
            <TextInput
              type="number"
              inputMode="decimal"
              value={protein}
              onChange={(e) => setProtein(e.target.value)}
            />
          </Field>
        </div>
        <div className="flex gap-2.5">
          <Button
            full
            disabled={!name || !serving || !protein || create.isPending}
            onClick={async () => {
              await create.mutateAsync({ name, servingLabel: serving, proteinG: Number(protein) });
              onDone();
            }}
          >
            Save food
          </Button>
          <Button variant="quiet" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </div>
    </Card>
  );
}
