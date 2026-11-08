// Starter foods for Nutrition (docs/NUTRITION.md), so the food list is not empty on day one.
//
// APPROXIMATE SEED DATA. Values per 100 g from USDA FoodData Central (SR Legacy, and FNDDS where SR
// Legacy has no entry), rounded to 0.1. They are averages: a real product, a recipe or a brand can
// differ a lot, so every one of them can be edited or deleted like a food of your own. The ones
// that vary most (marked VARIES below) are worth checking against the packaging.
//
// THE RULES
//   - Fixed ids, `seed:<slug>`: two devices that add the starter foods add the same foods, and the
//     merge (lib/sync-merge.js) keeps one of each.
//   - `seed: true`, `isCustom: false`. A starter food nobody edited counts as older than any
//     removal (sync-merge DEL_TIME), so one deleted on any device stays deleted.
//   - Added once, by starterFoodsToAdd: never a food already there, and never one whose removal is
//     on record unless someone asks for them back (Foods → Add starter foods).
//   - Pure, no imports beyond lib/nutrition.js, so the MCP server can read it as the app does.
import { cleanFood } from './nutrition.js'

const food = (slug, name, kcal, protein, carbs, fat, fibre, servings) =>
  cleanFood({ id: 'seed:' + slug, name, kcal, protein, carbs, fat, fibre, servings, isCustom: false, favourite: false, seed: true })

export const STARTER_FOODS = Object.freeze([
  //    slug               name                          kcal   P     C     F     fibre  servings
  food('rice-white',      'Rice, white, cooked',          130,  2.7, 28.2,  0.3,  0.4, [{ label: '1 cup', g: 158 }]),   // FDC 168878
  food('rice-brown',      'Rice, brown, cooked',          123,  2.7, 25.6,  1.0,  1.6, [{ label: '1 cup', g: 202 }]),   // FDC 168880
  // VARIES: with or without oil or ghee, and the flour.
  food('roti',            'Roti / chapati',               297,  9.8, 46.4,  9.2,  4.9, [{ label: '1 roti', g: 40 }]),   // FNDDS chapati, whole wheat
  food('dal',             'Lentils (dal), cooked',        116,  9.0, 20.1,  0.4,  7.9, [{ label: '1 bowl', g: 200 }]),  // FDC 172421, plain boiled
  food('chickpeas',       'Chickpeas, cooked',            164,  8.9, 27.4,  2.6,  7.6, [{ label: '1 cup', g: 164 }]),   // FDC 173757
  food('egg-whole',       'Egg, whole',                   143, 12.6,  0.7,  9.5,  0,   [{ label: '1 egg', g: 50 }]),    // FDC 171287
  food('egg-white',       'Egg white',                     52, 10.9,  0.7,  0.2,  0,   [{ label: '1 egg white', g: 33 }]), // FDC 172183
  food('chicken-breast',  'Chicken breast, cooked',       165, 31.0,  0,    3.6,  0,   [{ label: '1 breast', g: 120 }]), // FDC 171477, roasted, no skin
  // VARIES: home-made and full-fat or low-fat brands are far apart.
  food('paneer',          'Paneer',                       321, 25.0,  3.6, 25.0,  0,   [{ label: '1 cube', g: 20 }]),
  food('milk-whole',      'Milk, whole',                   61,  3.2,  4.8,  3.3,  0,   [{ label: '1 glass', g: 250 }]), // FDC 171265, 3.25 % fat
  food('yogurt',          'Curd / yogurt, plain',          61,  3.5,  4.7,  3.3,  0,   [{ label: '1 bowl', g: 150 }]),  // FDC 171284, whole milk
  food('oats',            'Oats, dry',                    379, 13.2, 67.7,  6.5, 10.1, [{ label: '1 serving', g: 40 }]), // FDC 173904
  food('banana',          'Banana',                        89,  1.1, 22.8,  0.3,  2.6, [{ label: '1 medium', g: 118 }]), // FDC 173944
  food('apple',           'Apple',                         52,  0.3, 13.8,  0.2,  2.4, [{ label: '1 medium', g: 182 }]), // FDC 171688, with skin
  food('potato-boiled',   'Potato, boiled',                86,  1.7, 20.0,  0.1,  1.8, [{ label: '1 medium', g: 150 }]), // FDC 170438, no skin
  food('peanut-butter',   'Peanut butter',                588, 25.1, 20.0, 50.4,  6.0, [{ label: '1 tbsp', g: 16 }]),  // FDC 172470, smooth
  food('almonds',         'Almonds',                      579, 21.2, 21.6, 49.9, 12.5, [{ label: '10 almonds', g: 12 }]), // FDC 170567
  food('olive-oil',       'Olive oil',                    884,  0,    0,  100,    0,   [{ label: '1 tbsp', g: 13.5 }]), // FDC 171413
  // VARIES: every brand and flavour is different; copy your tub's label.
  food('whey',            'Whey protein',                 400, 78.0,  8.0,  6.0,  0,   [{ label: '1 scoop', g: 30 }]),
  // VARIES: silken, soft and firm tofu are far apart.
  food('tofu',            'Tofu, firm',                   144, 17.3,  2.8,  8.7,  2.3, [{ label: '1 block slice', g: 85 }]), // FDC 172475
  // VARIES: textured soy protein, by brand.
  food('soya-chunks',     'Soya chunks, dry',             345, 52.0, 33.0,  0.5, 13.0, [{ label: '1 serving', g: 30 }]),
])

export const STARTER_IDS = STARTER_FOODS.map(f => f.id)
// The ones worth checking against the packaging (docs/NUTRITION.md lists them too).
export const STARTER_VARIES = ['seed:roti', 'seed:paneer', 'seed:whey', 'seed:tofu', 'seed:soya-chunks']

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * The starter foods `S` does not have yet, as new objects. A starter food whose removal is on
 * record (`deleted.foods`) is left out, unless `restoreDeleted` (someone asked for them back).
 */
export function starterFoodsToAdd(S, { restoreDeleted = false } = {}) {
  const have = new Set((Array.isArray(S?.foods) ? S.foods : []).map(f => f?.id))
  const gone = isMap(S?.deleted?.foods) ? S.deleted.foods : {}
  return STARTER_FOODS
    .filter(f => !have.has(f.id) && (restoreDeleted || !(Number(gone[f.id]) > 0)))
    .map(f => ({ ...f, servings: f.servings?.map(s => ({ ...s })) }))
}

/**
 * Whether the starter foods go in by themselves: a profile with no foods at all that never removed
 * a starter food. Someone who deleted them all keeps an empty list.
 */
export function shouldSeed(S) {
  if (Array.isArray(S?.foods) && S.foods.length) return false
  const gone = isMap(S?.deleted?.foods) ? S.deleted.foods : {}
  return !STARTER_IDS.some(id => Number(gone[id]) > 0)
}
