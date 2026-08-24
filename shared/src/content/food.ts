import type { DietaryPattern, FoodItem } from '../types.js';

// Who can eat what. Listed once so the library stays readable.
const VEGAN: DietaryPattern[] = ['omnivore', 'no_red_meat', 'pescatarian', 'vegetarian', 'eggetarian', 'vegan'];
const DAIRY: DietaryPattern[] = ['omnivore', 'no_red_meat', 'pescatarian', 'vegetarian', 'eggetarian'];
const EGG: DietaryPattern[] = ['omnivore', 'no_red_meat', 'pescatarian', 'eggetarian'];
const FISH: DietaryPattern[] = ['omnivore', 'no_red_meat', 'pescatarian'];
const WHITE_MEAT: DietaryPattern[] = ['omnivore', 'no_red_meat'];
const RED_MEAT: DietaryPattern[] = ['omnivore'];

type Row = [id: string, name: string, serving: string, proteinG: number, tags: DietaryPattern[], locale: string];

const ROWS: Row[] = [
  // --- Indian staples: pulses and legumes ---------------------------------
  ['dal-toor', 'Toor dal (cooked)', '1 katori / 150 g', 9, VEGAN, 'IN'],
  ['dal-moong', 'Moong dal (cooked)', '1 katori / 150 g', 10, VEGAN, 'IN'],
  ['dal-masoor', 'Masoor dal (cooked)', '1 katori / 150 g', 10, VEGAN, 'IN'],
  ['dal-chana', 'Chana dal (cooked)', '1 katori / 150 g', 11, VEGAN, 'IN'],
  ['rajma', 'Rajma (cooked)', '1 katori / 150 g', 12, VEGAN, 'IN'],
  ['chole', 'Chole / chickpeas (cooked)', '1 katori / 150 g', 11, VEGAN, 'IN'],
  ['sprouts-moong', 'Moong sprouts', '1 cup / 100 g', 7, VEGAN, 'IN'],
  ['soya-chunks', 'Soya chunks (cooked)', '1 katori / 100 g', 26, VEGAN, 'IN'],
  ['peanuts', 'Peanuts, roasted', 'small handful / 30 g', 8, VEGAN, 'IN'],
  ['peanut-butter', 'Peanut butter', '2 tbsp / 32 g', 8, VEGAN, 'IN'],

  // --- Indian staples: dairy ---------------------------------------------
  ['paneer', 'Paneer', '100 g', 18, DAIRY, 'IN'],
  ['curd', 'Curd / dahi', '1 katori / 150 g', 6, DAIRY, 'IN'],
  ['greek-yogurt', 'Greek yoghurt', '150 g pot', 15, DAIRY, 'IN'],
  ['milk-full', 'Milk, full fat', '1 glass / 250 ml', 8, DAIRY, 'IN'],
  ['milk-toned', 'Milk, toned', '1 glass / 250 ml', 8, DAIRY, 'IN'],
  ['buttermilk', 'Chaas / buttermilk', '1 glass / 250 ml', 3, DAIRY, 'IN'],
  ['lassi', 'Lassi, plain', '1 glass / 250 ml', 8, DAIRY, 'IN'],
  ['cheese-slice', 'Cheese slice', '1 slice / 20 g', 5, DAIRY, 'IN'],
  ['khoya', 'Khoya / mawa', '50 g', 10, DAIRY, 'IN'],

  // --- Indian staples: grains and breads ---------------------------------
  ['roti', 'Roti / chapati', '1 medium', 3, VEGAN, 'IN'],
  ['bajra-roti', 'Bajra roti', '1 medium', 4, VEGAN, 'IN'],
  ['jowar-roti', 'Jowar roti', '1 medium', 3, VEGAN, 'IN'],
  ['rice-cooked', 'Rice, cooked', '1 katori / 150 g', 4, VEGAN, 'IN'],
  ['poha', 'Poha (prepared)', '1 plate / 200 g', 5, VEGAN, 'IN'],
  ['upma', 'Upma', '1 plate / 200 g', 6, VEGAN, 'IN'],
  ['idli', 'Idli', '2 pieces', 4, VEGAN, 'IN'],
  ['dosa', 'Dosa, plain', '1 medium', 4, VEGAN, 'IN'],
  ['besan-chilla', 'Besan chilla', '2 pieces', 12, VEGAN, 'IN'],
  ['dhokla', 'Dhokla', '4 pieces / 100 g', 6, VEGAN, 'IN'],

  // --- Indian: eggs, fish, meat ------------------------------------------
  ['egg-boiled', 'Egg, boiled', '1 large', 6, EGG, 'IN'],
  ['egg-whites', 'Egg whites', '3 whites', 11, EGG, 'IN'],
  ['egg-bhurji', 'Egg bhurji (2 eggs)', '1 plate', 13, EGG, 'IN'],
  ['fish-rohu', 'Rohu / freshwater fish, cooked', '100 g', 19, FISH, 'IN'],
  ['fish-pomfret', 'Pomfret, cooked', '100 g', 20, FISH, 'IN'],
  ['prawns', 'Prawns, cooked', '100 g', 20, FISH, 'IN'],
  ['chicken-curry', 'Chicken curry (with bone)', '1 katori / 150 g', 20, WHITE_MEAT, 'IN'],
  ['chicken-tandoori', 'Tandoori chicken', '2 pieces / 150 g', 30, WHITE_MEAT, 'IN'],
  ['mutton-curry', 'Mutton curry', '1 katori / 150 g', 20, RED_MEAT, 'IN'],

  // --- Western: dairy and eggs -------------------------------------------
  ['cottage-cheese', 'Cottage cheese', '100 g', 11, DAIRY, 'GLOBAL'],
  ['cheddar', 'Cheddar cheese', '30 g', 7, DAIRY, 'GLOBAL'],
  ['skyr', 'Skyr', '150 g pot', 17, DAIRY, 'GLOBAL'],
  ['egg-fried', 'Egg, fried', '1 large', 6, EGG, 'GLOBAL'],
  ['omelette', 'Omelette (2 eggs)', '1 serving', 13, EGG, 'GLOBAL'],

  // --- Western: meat and fish --------------------------------------------
  ['chicken-breast', 'Chicken breast, cooked', '100 g', 31, WHITE_MEAT, 'GLOBAL'],
  ['chicken-thigh', 'Chicken thigh, cooked', '100 g', 26, WHITE_MEAT, 'GLOBAL'],
  ['turkey', 'Turkey breast, cooked', '100 g', 29, WHITE_MEAT, 'GLOBAL'],
  ['salmon', 'Salmon, cooked', '100 g', 25, FISH, 'GLOBAL'],
  ['tuna-tin', 'Tinned tuna, drained', '1 tin / 100 g', 25, FISH, 'GLOBAL'],
  ['sardines', 'Sardines, tinned', '1 tin / 90 g', 21, FISH, 'GLOBAL'],
  ['beef-mince', 'Beef mince, cooked', '100 g', 26, RED_MEAT, 'GLOBAL'],
  ['pork-chop', 'Pork chop, cooked', '100 g', 27, RED_MEAT, 'GLOBAL'],

  // --- Plant proteins -----------------------------------------------------
  ['tofu', 'Tofu, firm', '100 g', 15, VEGAN, 'GLOBAL'],
  ['tempeh', 'Tempeh', '100 g', 19, VEGAN, 'GLOBAL'],
  ['lentils', 'Lentils, cooked', '1 cup / 200 g', 18, VEGAN, 'GLOBAL'],
  ['black-beans', 'Black beans, cooked', '1 cup / 170 g', 15, VEGAN, 'GLOBAL'],
  ['edamame', 'Edamame', '1 cup / 155 g', 18, VEGAN, 'GLOBAL'],
  ['quinoa', 'Quinoa, cooked', '1 cup / 185 g', 8, VEGAN, 'GLOBAL'],
  ['oats', 'Oats, dry', '50 g', 7, VEGAN, 'GLOBAL'],
  ['almonds', 'Almonds', 'handful / 30 g', 6, VEGAN, 'GLOBAL'],
  ['walnuts', 'Walnuts', 'handful / 30 g', 5, VEGAN, 'GLOBAL'],
  ['chia', 'Chia seeds', '2 tbsp / 25 g', 4, VEGAN, 'GLOBAL'],
  ['pumpkin-seeds', 'Pumpkin seeds', '30 g', 9, VEGAN, 'GLOBAL'],
  ['hummus', 'Hummus', '2 tbsp / 60 g', 5, VEGAN, 'GLOBAL'],
  ['soy-milk', 'Soy milk', '1 glass / 250 ml', 8, VEGAN, 'GLOBAL'],
  ['bread-wholemeal', 'Wholemeal bread', '2 slices', 8, VEGAN, 'GLOBAL'],
  ['pasta-cooked', 'Pasta, cooked', '1 cup / 200 g', 8, VEGAN, 'GLOBAL'],
  ['potato', 'Potato, boiled', '1 medium / 150 g', 3, VEGAN, 'GLOBAL'],
  ['sweet-potato', 'Sweet potato', '1 medium / 150 g', 3, VEGAN, 'GLOBAL'],
  ['banana', 'Banana', '1 medium', 1, VEGAN, 'GLOBAL'],
  ['spinach-cooked', 'Palak / spinach, cooked', '1 katori / 150 g', 4, VEGAN, 'IN'],
  ['mixed-veg', 'Mixed vegetable sabzi', '1 katori / 150 g', 3, VEGAN, 'IN'],

  // --- Supplements and shakes ---------------------------------------------
  ['whey-scoop', 'Whey protein', '1 scoop / 30 g', 24, DAIRY, 'GLOBAL'],
  ['plant-protein', 'Plant protein powder', '1 scoop / 30 g', 22, VEGAN, 'GLOBAL'],
  ['protein-bar', 'Protein bar', '1 bar', 20, DAIRY, 'GLOBAL'],
];

export const FOOD_LIBRARY: FoodItem[] = ROWS.map(([id, name, servingLabel, proteinG, dietaryTags, locale]) => ({
  id,
  name,
  servingLabel,
  proteinG,
  dietaryTags,
  locale,
}));

export function foodsFor(pattern: DietaryPattern, exclusions: string[] = []): FoodItem[] {
  const blocked = exclusions.map((e) => e.toLowerCase().trim()).filter(Boolean);
  return FOOD_LIBRARY.filter(
    (f) =>
      f.dietaryTags.includes(pattern) &&
      !blocked.some((b) => f.name.toLowerCase().includes(b)),
  );
}
