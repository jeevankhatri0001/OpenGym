// The nutrition coach: after food is added, a few lines like a coach looking at your day would say.
// Local rules, instant and offline, the counterpart of the set check-in (lib/set-checkin.js). The AI
// Coach is a button away for anything more (it already reads the daily totals).
//
// Pure: everything it needs comes in as arguments (the caller says whether you trained today), so
// it can be tested and, later, shared. It returns ids and numbers; the screen words them.
//
// What it looks at, in the order the tips are ranked:
//   1. calories over the day's target
//   2. the balance of the meal just added (all carbs, all fat, little protein)
//   3. protein still to eat, spread over the meals left, with a food from your own list
//   4. calories: eating ahead of the day's pace, or little room left for the meals to come
//   5. fibre low late in the day
//   6. training day or rest day: the targets the advice used, moved a little
//   7. calories left, when nothing else needs saying
import { NUTRIENTS, MEALS, entriesOn, sumNutrients, round1 } from './nutrition.js'

// Training days eat a little more, rest days a little less. Small on purpose: the targets are the
// person's own, the coach only leans on them.
export const TRAINING_DAY = { kcal: 1.1, protein: 1.1, carbs: 1.2 }
export const REST_DAY = { kcal: 0.95, carbs: 0.9 }

// A main meal is still to come until this hour (local time) when nothing is logged in it yet.
export const MEAL_ENDS = { breakfast: 10, lunch: 15, dinner: 21 }
// Past this hour no meal is left to plan for; the advice only says where the day stands.
export const DAY_ENDS = 22

// A meal under this many kcal is a snack, too small to judge its balance.
export const MEAL_MIN_KCAL = 200
// Below this much room per meal left, the next meal needs to be a light one.
export const TIGHT_KCAL = 350
// A protein gap under this many grams is close enough.
export const PROTEIN_SLACK = 10

/** The targets the coach works with today: the profile's own, leaned on for training or rest. */
export function coachTargets(targets, { trained = false } = {}) {
  const lean = trained ? TRAINING_DAY : REST_DAY
  const out = {}
  for (const k of NUTRIENTS) out[k] = Math.round((Number(targets?.[k]) || 0) * (lean[k] ?? 1))
  return out
}

/** How many main meals are still to come at `hour`, given what is logged on the day. */
export function mealsLeft(entries, hour) {
  if (hour >= DAY_ENDS) return 0
  const logged = new Set((entries || []).map(e => e?.meal))
  const left = Object.entries(MEAL_ENDS).filter(([m, end]) => hour < end && !logged.has(m)).length
  // Every meal eaten or past, but the evening is not over: there is still room for a snack.
  return left || 1
}

const energy = n => ({ protein: (n.protein || 0) * 4, carbs: (n.carbs || 0) * 4, fat: (n.fat || 0) * 9 })
const roundTo = (v, step) => Math.round(v / step) * step

/** A meal's balance problem, if it has one: 'mealFat', 'mealCarbs', 'mealProtein' or null. */
export function mealBalance(n) {
  if (!n || (n.kcal || 0) < MEAL_MIN_KCAL) return null
  const e = energy(n)
  const all = e.protein + e.carbs + e.fat
  if (all <= 0) return null
  if (e.fat / all > 0.6) return 'mealFat'
  if (e.carbs / all > 0.7) return 'mealCarbs'
  if (e.protein / all < 0.12) return 'mealProtein'
  return null
}

// Foods worth suggesting, favourites and recent ones first, then by protein for the calories.
function ranked(foods, recentIds = []) {
  const recent = new Map(recentIds.map((id, i) => [id, i]))
  const score = f => (f.favourite ? 2 : 0) + (recent.has(f.id) ? 1 : 0)
  return (foods || []).filter(f => f && f.name && (Number(f.kcal) || 0) > 0)
    .sort((a, b) => score(b) - score(a) || (b.protein / b.kcal) - (a.protein / a.kcal))
}

/** A food from the list that covers `grams` of protein in a sensible amount, or null. */
export function proteinFood(foods, grams, recentIds) {
  const f = ranked(foods, recentIds).find(x => (Number(x.protein) || 0) >= 10 && x.protein / x.kcal >= 0.08)
  if (!f) return null
  const g = Math.min(400, Math.max(50, roundTo(grams / f.protein * 100, 10)))
  return { id: f.id, name: f.name, grams: g, protein: round1(f.protein * g / 100) }
}

/** A light food for a meal of about `kcal`: lean, filling, from the list. */
export function lightFood(foods, kcal, recentIds) {
  const f = ranked(foods, recentIds).find(x => x.kcal <= 150 && (Number(x.protein) || 0) >= 8)
  if (!f) return null
  const g = Math.min(400, Math.max(50, roundTo(Math.min(kcal, 300) / f.kcal * 100, 10)))
  return { id: f.id, name: f.name, grams: g, kcal: Math.round(f.kcal * g / 100) }
}

/**
 * The coach's read of a day. `hour` is the local hour now (only today's advice plans ahead; pass
 * 24 for a past day), `lastMeal` the meal of the food just added, `trained` whether a workout was
 * logged or is running today, `recentIds` from nutrition.js recentFoodIds.
 *
 * Returns { targets, totals, tips }, tips ranked, each { id, ...numbers }.
 */
export function nutritionCoach({ log, d, targets, foods = [], hour = 12, trained = false, lastMeal = null, recentIds = [] } = {}) {
  const entries = entriesOn(log, d)
  const totals = sumNutrients(entries)
  const goal = coachTargets(targets, { trained })
  const meals = mealsLeft(entries, hour)
  const tips = []
  if (!entries.length) return { targets: goal, totals, tips: [{ id: 'empty', kcal: goal.kcal, protein: goal.protein }] }

  const kcalLeft = Math.round(goal.kcal - totals.kcal)
  const proteinLeft = Math.round(goal.protein - totals.protein)

  // 1. Over.
  if (goal.kcal > 0 && kcalLeft < 0) tips.push({ id: 'kcalOver', over: -kcalLeft })

  // 2. The meal just added.
  if (lastMeal && MEALS.includes(lastMeal)) {
    const n = sumNutrients(entries.filter(e => e.meal === lastMeal))
    const b = mealBalance(n)
    if (b) tips.push({ id: b, meal: lastMeal })
  }

  // 3. Protein.
  if (goal.protein > 0) {
    if (proteinLeft <= PROTEIN_SLACK) tips.push({ id: 'proteinDone', eaten: Math.round(totals.protein) })
    else if (meals > 0) {
      const perMeal = Math.ceil(proteinLeft / meals)
      tips.push({ id: 'proteinPace', left: proteinLeft, perMeal, meals, food: proteinFood(foods, perMeal, recentIds) })
    } else tips.push({ id: 'proteinShort', left: proteinLeft })
  }

  // 4. Calories ahead of the day, or tight for what is left.
  if (kcalLeft >= 0 && goal.kcal > 0 && meals > 0) {
    const share = Math.min(1, Math.max(0.1, (hour - 7) / 14))
    if (hour >= 12 && totals.kcal > goal.kcal * share * 1.25 + 200) tips.push({ id: 'kcalPace', left: kcalLeft })
    else if (kcalLeft / meals < TIGHT_KCAL) {
      const perMeal = Math.round(kcalLeft / meals)
      tips.push({ id: 'kcalTight', left: kcalLeft, perMeal, food: lightFood(foods, perMeal, recentIds) })
    }
  }

  // 5. Fibre, once the day is mostly eaten.
  if (goal.fibre > 0 && hour >= 17 && totals.fibre < goal.fibre * 0.6) tips.push({ id: 'fibreLow', left: Math.round(goal.fibre - totals.fibre) })

  // 6. Training or rest.
  tips.push(trained
    ? { id: 'trainingDay', kcal: goal.kcal, protein: goal.protein, carbs: goal.carbs }
    : { id: 'restDay', kcal: goal.kcal })

  // 7. Where the day stands.
  if (kcalLeft >= 0 && !tips.some(x => x.id === 'kcalPace' || x.id === 'kcalTight')) tips.push({ id: 'kcalLeft', left: kcalLeft })

  return { targets: goal, totals, tips }
}

/** The day as one question for the AI Coach: what was eaten, against which targets. */
export function coachQuestion({ log, d, targets, trained = false }) {
  const entries = entriesOn(log, d)
  const totals = sumNutrients(entries)
  const goal = coachTargets(targets, { trained })
  const ate = entries.map(e => `${e.name} ${round1(e.grams)} g (${e.meal})`).join(', ')
  return {
    d, trained, ate,
    totals: { kcal: Math.round(totals.kcal), protein: Math.round(totals.protein), carbs: Math.round(totals.carbs), fat: Math.round(totals.fat), fibre: Math.round(totals.fibre) },
    targets: goal,
  }
}
