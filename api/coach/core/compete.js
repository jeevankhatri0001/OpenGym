/* The competitor's side of the Coach's intake (frontend views/CoachIntake.jsx, goal "compete"):
 * the show, the athlete and their food, kept in S.coach.profile.compete. Pure, no imports.
 *
 * One copy for both sides: the app imports it (frontend lib/coach-compete.js re-exports it, the
 * way lib/coach-local.js runs the rest of core/), and payload.js cleans the profile with it on the
 * way to the model, so what the intake stores and what the Coach reads cannot drift.
 *
 *   compete: { division, federation, showDate, posing, age, heightCm, weight, trainingYears,
 *              bodyFat, diet, meals, foodNotes }
 *   `weight` is in the profile's unit (S.unit), like every weight the Coach reads.
 */

export const DIVISIONS = ['classic', 'mensphysique', 'bodybuilding', 'other']
export const POSING = ['never', 'practised', 'competed']
export const DIETS = ['omni', 'egg', 'veg', 'vegan']
export const COMPETE_BOUNDS = {
  age: [14, 90], heightCm: [120, 230], weight: [30, 500], trainingYears: [0, 60], bodyFat: [3, 50], meals: [2, 8],
}
export const FEDERATION_MAX = 60
export const FOOD_NOTES_MAX = 300

const DAY = /^\d{4}-\d{2}-\d{2}$/
const pick = (v, list) => (list.includes(v) ? v : null)
// A number inside its bounds, to one decimal; anything else is not an answer.
const within = (v, [lo, hi]) => {
  const n = v == null || v === '' ? NaN : Number(v)
  return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n * 10) / 10 : null
}

/** The competitor's answers as they are stored: known words, numbers in range, text cut. */
export function cleanCompete(c) {
  if (!c || typeof c !== 'object') return null
  const out = {
    division: pick(c.division, DIVISIONS),
    federation: typeof c.federation === 'string' ? c.federation.trim().slice(0, FEDERATION_MAX) : '',
    showDate: typeof c.showDate === 'string' && DAY.test(c.showDate) ? c.showDate : null,
    posing: pick(c.posing, POSING),
    diet: pick(c.diet, DIETS),
    foodNotes: typeof c.foodNotes === 'string' ? c.foodNotes.trim().slice(0, FOOD_NOTES_MAX) : '',
  }
  for (const k of Object.keys(COMPETE_BOUNDS)) out[k] = within(c[k], COMPETE_BOUNDS[k])
  if (out.meals != null) out.meals = Math.round(out.meals)
  if (out.age != null) out.age = Math.round(out.age)
  return out
}

/** Whole weeks from `today` to the show (0 in show week, negative once it has passed), or null. */
export function weeksOut(showDate, today) {
  if (!DAY.test(showDate || '') || !DAY.test(today || '')) return null
  const days = Math.round((Date.parse(showDate + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 86400000)
  return Math.floor(days / 7)
}
