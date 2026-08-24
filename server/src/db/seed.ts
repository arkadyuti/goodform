import { FOOD_LIBRARY } from '@goodform/shared/content';
import { db, pool, schema } from './index.js';

const rows = FOOD_LIBRARY.map((f) => ({
  id: f.id,
  name: f.name,
  locale: f.locale,
  dietaryTags: f.dietaryTags as string[],
  servingLabel: f.servingLabel,
  proteinG: f.proteinG,
  ownerId: null,
}));

for (const row of rows) {
  await db
    .insert(schema.foodItems)
    .values(row)
    .onConflictDoUpdate({ target: schema.foodItems.id, set: row });
}

console.log(`Seeded ${rows.length} foods.`);
await pool.end();
