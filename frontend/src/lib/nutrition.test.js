import { describe, expect, it } from 'vitest'
import {
  NUTRIENTS, DEFAULT_TARGETS, GRAMS_MAX, cleanGrams, per100, nutrientsFor, sumNutrients, entriesOn,
  dailyTotals, entriesByMeal, targetsOf, progress, addDays, dayOf, dailySeries, weeklySeries,
  averageDay, makeLogEntry, regram, recentFoodIds, foodProblems, cleanFood, searchFoods,
} from './nutrition.js'

const RICE = { id: 'rice', name: 'White rice, cooked', kcal: 130, protein: 2.7, carbs: 28.2, fat: 0.3, fibre: 0.4 }
const EGG = { id: 'egg', name: 'Egg, whole', kcal: 143, protein: 12.6, carbs: 0.7, fat: 9.5, fibre: 0, servings: [{ label: '1 egg', g: 50 }] }
const ZERO = { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 }
let n = 0
const entry = (food, grams, d, meal = 'lunch', at = 1000 + n) => makeLogEntry({ food, grams, meal, d, at, id: 'e' + (++n) })

describe('cleanGrams', () => {
  it('keeps a tenth of a gram, the way a kitchen scale reads', () => {
    expect(cleanGrams(152.36)).toBe(152.4)
    expect(cleanGrams('80')).toBe(80)
  })
  it('refuses nothing, zero, negatives, text and the absurd', () => {
    for (const g of [null, undefined, '', 0, -5, 'abc', NaN, Infinity, GRAMS_MAX + 1, 0.04]) expect(cleanGrams(g)).toBeNull()
    expect(cleanGrams(GRAMS_MAX)).toBe(GRAMS_MAX)
  })
})

describe('nutrientsFor', () => {
  it('scales per 100 g to the grams', () => {
    expect(nutrientsFor(RICE, 200)).toEqual({ kcal: 260, protein: 5.4, carbs: 56.4, fat: 0.6, fibre: 0.8 })
    expect(nutrientsFor(EGG, 50)).toEqual({ kcal: 71.5, protein: 6.3, carbs: 0.4, fat: 4.8, fibre: 0 })
  })
  it('rounds every nutrient to 0.1, half up', () => {
    // 0.3 fat × 15 g = 0.045 → 0.0; 130 kcal × 33.3 g = 43.29 → 43.3
    expect(nutrientsFor(RICE, 15).fat).toBe(0)
    expect(nutrientsFor(RICE, 33.3).kcal).toBe(43.3)
    expect(nutrientsFor({ protein: 25 }, 1).protein).toBe(0.3) // 0.25 → 0.3
  })
  it('is all zeros for no grams, bad grams or no food', () => {
    expect(nutrientsFor(RICE, 0)).toEqual(ZERO)
    expect(nutrientsFor(RICE, -10)).toEqual(ZERO)
    expect(nutrientsFor(null, 100)).toEqual(ZERO)
  })
  it('counts a missing, negative or non-numeric nutrient as 0', () => {
    expect(per100({ kcal: '52', protein: -1, carbs: 'x' })).toEqual({ ...ZERO, kcal: 52 })
  })
})

describe('sums and days', () => {
  const log = [
    entry(RICE, 200, '2026-11-08', 'lunch', 3000),
    entry(EGG, 100, '2026-11-08', 'breakfast', 1000),
    entry(RICE, 100, '2026-11-07', 'dinner', 500),
    { id: 'junk' }, null,
  ]
  it('sums snapshots without floating-point dust', () => {
    expect(sumNutrients([{ n: { kcal: 0.1, protein: 0.2 } }, { n: { kcal: 0.2, protein: 0.1 } }])).toEqual({ ...ZERO, kcal: 0.3, protein: 0.3 })
    expect(sumNutrients([])).toEqual(ZERO)
    expect(sumNutrients(null)).toEqual(ZERO)
  })
  it('totals one day, in logging order, skipping broken entries', () => {
    expect(entriesOn(log, '2026-11-08').map(e => e.meal)).toEqual(['breakfast', 'lunch'])
    expect(dailyTotals(log, '2026-11-08')).toEqual({ kcal: 403, protein: 18, carbs: 57.1, fat: 10.1, fibre: 0.8 })
    expect(dailyTotals(log, '2026-11-01')).toEqual(ZERO)
  })
  it('groups a day by meal, an unknown meal as a snack', () => {
    const by = entriesByMeal([...log, { ...log[0], id: 'x', meal: 'brunch' }], '2026-11-08')
    expect(Object.keys(by)).toEqual(['breakfast', 'lunch', 'dinner', 'snack'])
    expect(by.breakfast).toHaveLength(1)
    expect(by.dinner).toEqual([])
    expect(by.snack.map(e => e.id)).toEqual(['x'])
  })
})

describe('targets and progress', () => {
  it('falls back to the defaults for what is missing or invalid', () => {
    expect(targetsOf({})).toEqual(DEFAULT_TARGETS)
    expect(targetsOf({ nutritionTargets: { kcal: 1800.4, protein: -1, carbs: 'x', fat: 0, fibre: 99999 } }))
      .toEqual({ ...DEFAULT_TARGETS, kcal: 1800, fat: 0 })
  })
  it('gives what is left, going negative past the target', () => {
    const p = progress({ kcal: 2500, protein: 70, carbs: 0, fat: 0, fibre: 0 }, { kcal: 2000, protein: 140, carbs: 250, fat: 0, fibre: 30 })
    expect(p.kcal).toEqual({ eaten: 2500, target: 2000, left: -500, pct: 125 })
    expect(p.protein).toEqual({ eaten: 70, target: 140, left: 70, pct: 50 })
    expect(p.carbs.pct).toBe(0)
  })
  it('has no percentage for a target of zero', () => {
    expect(progress({ fat: 10 }, { fat: 0 }).fat).toEqual({ eaten: 10, target: 0, left: -10, pct: null })
    expect(progress(null, null).kcal).toEqual({ eaten: 0, target: 0, left: 0, pct: null })
  })
})

describe('dates and series', () => {
  it('steps over month, year and leap day', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
  it('names the local day of a time', () => {
    expect(dayOf(new Date(2026, 10, 8, 23, 59).getTime())).toBe('2026-11-08')
  })
  it('gives seven days oldest first, zeros where nothing was logged', () => {
    const log = [entry(RICE, 100, '2026-11-08'), entry(RICE, 100, '2026-11-08'), entry(EGG, 100, '2026-11-03'), entry(RICE, 100, '2026-11-01')]
    const s = weeklySeries(log, '2026-11-08')
    expect(s.map(x => x.d)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'])
    expect(s[6]).toMatchObject({ entries: 2, kcal: 260 })
    expect(s[1]).toMatchObject({ entries: 1, kcal: 143 })
    expect(s[0]).toEqual({ d: '2026-11-02', entries: 0, ...ZERO })
    expect(dailySeries([], '2026-11-08', 3)).toHaveLength(3)
  })
  it('averages only the days with anything logged', () => {
    const s = weeklySeries([entry(RICE, 100, '2026-11-08'), entry(RICE, 300, '2026-11-06')], '2026-11-08')
    expect(averageDay(s)).toMatchObject({ kcal: 260, days: 2 })
    expect(averageDay(weeklySeries([], '2026-11-08'))).toBeNull()
  })
})

describe('log entries', () => {
  it('keep a snapshot of the food as it was', () => {
    const food = { ...EGG }
    const e = makeLogEntry({ food, grams: 50, meal: 'breakfast', d: '2026-11-08', at: 5, id: 'a' })
    expect(e).toEqual({ id: 'a', foodId: 'egg', name: 'Egg, whole', d: '2026-11-08', grams: 50, meal: 'breakfast', loggedAt: 5, source: 'manual', n: nutrientsFor(EGG, 50) })
    food.kcal = 999
    food.name = 'Changed'
    expect(e.n.kcal).toBe(71.5)
    expect(e.name).toBe('Egg, whole')
  })
  it('take a scale or barcode source, and default anything else', () => {
    expect(makeLogEntry({ food: RICE, grams: 1, d: '2026-11-08', id: 'a', source: 'scale' }).source).toBe('scale')
    expect(makeLogEntry({ food: RICE, grams: 1, d: '2026-11-08', id: 'a', source: 'psychic' }).source).toBe('manual')
    expect(makeLogEntry({ food: RICE, grams: 1, d: '2026-11-08', id: 'a', meal: 'brunch' }).meal).toBe('snack')
  })
  it('are not made for unusable grams', () => {
    expect(makeLogEntry({ food: RICE, grams: 0, d: '2026-11-08', id: 'a' })).toBeNull()
    expect(makeLogEntry({ food: RICE, grams: 10, d: '2026-11-08' })).toBeNull()
  })
  it('rescale from their own snapshot, not the food now', () => {
    const e = makeLogEntry({ food: RICE, grams: 150, d: '2026-11-08', id: 'a' })
    const r = regram(e, 300)
    expect(r.grams).toBe(300)
    // From the snapshot of 150 g (protein 4.1, fat 0.5), so a tenth can differ from the food's own
    // numbers at 300 g (8.1, 0.9): the snapshot is what was logged.
    expect(r.n).toEqual({ kcal: 390, protein: 8.2, carbs: 84.6, fat: 1, fibre: 1.2 })
    expect(r.id).toBe('a')
    expect(e.grams).toBe(150)
    expect(regram(e, 0)).toBeNull()
    expect(regram({ ...e, grams: 0 }, 100).n).toEqual(ZERO)
  })
  it('list recent foods newest first, once each', () => {
    const log = [{ foodId: 'a', loggedAt: 1 }, { foodId: 'b', loggedAt: 3 }, { foodId: 'a', loggedAt: 5 }, { loggedAt: 9 }]
    expect(recentFoodIds(log)).toEqual(['a', 'b'])
    expect(recentFoodIds(log, 1)).toEqual(['a'])
  })
})

describe('foodProblems', () => {
  it('accepts a sensible food', () => {
    expect(foodProblems(EGG)).toEqual([])
    expect(foodProblems({ name: 'Water', kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 })).toEqual([])
  })
  it('names each problem', () => {
    expect(foodProblems({ name: ' ', kcal: 1000, protein: -1, carbs: 'x', fat: '', fibre: 101 }))
      .toEqual(['name', 'kcal', 'protein', 'carbs', 'fat', 'fibre'])
    expect(foodProblems({ ...RICE, protein: 50, carbs: 40, fat: 20 })).toEqual(['sum'])
    expect(foodProblems({ ...RICE, protein: 50, carbs: 40, fat: 10.5 })).toEqual([])
    expect(foodProblems({ ...RICE, servings: [{ label: '', g: 10 }] })).toEqual(['servings'])
    expect(foodProblems({ ...RICE, servings: [{ label: 'cup', g: 0 }] })).toEqual(['servings'])
  })
})

describe('cleanFood', () => {
  it('trims, rounds and drops broken servings', () => {
    const f = cleanFood({ id: 'x', name: '  Oats  ', kcal: '389.04', protein: 16.89, carbs: 66.3, fat: 6.9, fibre: 10.6,
      servings: [{ label: ' 1 cup ', g: '80' }, { label: '', g: 3 }], favourite: 1 })
    expect(f).toEqual({ id: 'x', name: 'Oats', kcal: 389, protein: 16.9, carbs: 66.3, fat: 6.9, fibre: 10.6,
      servings: [{ label: '1 cup', g: 80 }], isCustom: true, favourite: true })
  })
})

describe('searchFoods', () => {
  const foods = [
    { id: 1, name: 'Brown rice, cooked' }, { id: 2, name: 'White rice, cooked' }, { id: 3, name: 'Rice cake', favourite: true },
    { id: 4, name: 'Licorice' }, { id: 5, name: 'Crème fraîche' }, { id: 6 },
  ]
  it('puts a name starting with the query first, then a word, then anywhere', () => {
    expect(searchFoods(foods, 'rice').map(f => f.id)).toEqual([3, 1, 2, 4])
  })
  it('needs every word, ignoring case and accents', () => {
    expect(searchFoods(foods, 'RICE brown').map(f => f.id)).toEqual([1])
    expect(searchFoods(foods, 'creme').map(f => f.id)).toEqual([5])
  })
  it('lists everything, favourites first, for an empty query', () => {
    expect(searchFoods(foods, '').map(f => f.id)).toEqual([3, 1, 5, 4, 2])
    expect(searchFoods(foods, '', 2)).toHaveLength(2)
  })
})

it('names the five nutrients in a fixed order', () => {
  expect(NUTRIENTS).toEqual(['kcal', 'protein', 'carbs', 'fat', 'fibre'])
})
