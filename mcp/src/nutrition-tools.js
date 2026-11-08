/* Nutrition (docs/NUTRITION.md): three read tools and log_food.

   The numbers are the app's own (frontend/src/lib/nutrition.js): a log entry carries the
   nutrients of its grams as they were when it was logged, so these tools read entries back as
   stored and never recompute history from a food that may have changed since.

   Like every read tool here they answer whatever the Nutrition module says (docs/MODULES.md:
   hiding is about the screen); `module_on` tells the client when the app does not show it.
   log_food writes through the user's own openGym server the way log_workout does
   (write-tools.js): read the document, add the entry, PUT it with the revision it was read at,
   and on a 409 do it again on the document the server sent back. */
import { z } from 'zod'
import { getState, invalidate } from './state.js'
import { isoDate } from './tools.js'
import { apiConfig, apiFetch } from './api-client.js'
import { assertProfile, fail, WRITE_LIMIT } from './write-tools.js'
import { isOn } from '../../frontend/src/lib/modules.js'
import {
  MEALS, NUTRIENTS, GRAMS_MAX, NAME_MAX, addDays, cleanFood, cleanGrams, dailySeries, dailyTotals, entriesOn,
  foodProblems, makeLogEntry, per100, progress, round1, searchFoods, targetsOf, averageDay,
} from '../../frontend/src/lib/nutrition.js'
import { starterFoodsToAdd } from '../../frontend/src/lib/nutrition-seed.js'

const localIso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
const todayIso = () => localIso(new Date())
// Long enough for "how did my month go" and a quarter; a year of days is a chart, not an answer.
export const RANGE_MAX_DAYS = 92
// The most foods a search answers with.
export const SEARCH_MAX = 25
// Within this long, the same food, grams, meal and day logged again is the same request twice
// (a client retrying), not a second portion. allow_duplicate says otherwise.
export const DUPLICATE_MS = 10 * 60000
const MAX_ATTEMPTS = 3
const WINDOW_MS = 60 * 60000
let saves = []
export const _resetFoodWriteWindow = () => { saves = [] }

const noState = () => ({ error: 'no synced state yet — sign in at least once from a device so the openGym api can save a state file for this profile' })
const nutrientsOut = n => Object.fromEntries(NUTRIENTS.map(k => [k, k === 'kcal' ? Math.round(Number(n?.[k]) || 0) : round1(n?.[k])]))
// A starter food nobody changed the numbers of is the seed's approximate USDA value.
const approximate = f => !!f.seed && !NUTRIENTS.some(k => f._f?.[k])

function foodOut(f, inLibrary = true) {
  return {
    id: f.id,
    name: f.name,
    per_100g: nutrientsOut(per100(f)),
    ...(Array.isArray(f.servings) && f.servings.length ? { servings: f.servings.map(s => ({ label: s.label, grams: s.g })) } : {}),
    favourite: !!f.favourite,
    custom: f.isCustom !== false,
    ...(approximate(f) ? { approximate: true } : {}),
    ...(inLibrary ? {} : { in_library: false }),
  }
}

function entryOut(e) {
  return {
    id: e.id,
    name: e.name,
    grams: e.grams,
    meal: e.meal,
    ...(e.source && e.source !== 'manual' ? { source: e.source } : {}),
    nutrients: nutrientsOut(e.n),
  }
}

function dayOut(S, d) {
  const totals = dailyTotals(S.foodLog, d)
  const targets = targetsOf(S)
  const p = progress(totals, targets)
  const entries = entriesOn(S.foodLog, d)
  return {
    date: d,
    module_on: isOn(S, 'nutrition'),
    targets,
    totals: nutrientsOut(totals),
    // left: what is still to eat for each target (negative once past it); pct: share eaten.
    vs_targets: Object.fromEntries(NUTRIENTS.map(k => [k, { left: k === 'kcal' ? Math.round(p[k].left) : p[k].left, pct: p[k].pct }])),
    entries: entries.length,
    meals: Object.fromEntries(MEALS.map(m => [m, entries.filter(e => (MEALS.includes(e.meal) ? e.meal : 'snack') === m).map(entryOut)])),
  }
}

/** get_nutrition_day — one day's food log, by meal, with totals against the targets. */
export const getNutritionDay = {
  name: 'get_nutrition_day',
  description: 'Get what the user logged eating on one day: each entry by meal (breakfast, lunch, dinner, snack) with its grams and nutrients, the day\'s totals of kcal, protein, carbs, fat and fibre (grams), their daily targets, and how much is left of each. Entries keep the nutrients from when they were logged. `module_on: false` means the Nutrition module is switched off in the app.',
  schema: {
    date: isoDate().optional().describe('The day, YYYY-MM-DD. Defaults to today.'),
  },
  handler: ({ date }) => {
    const S = getState()
    if (!S) return noState()
    return dayOut(S, date || todayIso())
  },
}

/** get_nutrition_range — daily totals over a span, with the average logged day. */
export const getNutritionRange = {
  name: 'get_nutrition_range',
  description: `Get daily nutrition totals (kcal, protein, carbs, fat, fibre in grams) for every day from \`from\` to \`to\`, with how many foods each day has, the targets, and the average over the days that have anything logged (a day with no entries was not tracked, not a day without food). At most ${RANGE_MAX_DAYS} days. Useful for "how is my protein this week?" or "am I eating at my calorie target?".`,
  schema: {
    from: isoDate().optional().describe('Inclusive start YYYY-MM-DD. Defaults to six days before `to` (one week).'),
    to: isoDate().optional().describe('Inclusive end YYYY-MM-DD. Defaults to today.'),
  },
  handler: ({ from, to }) => {
    const S = getState()
    if (!S) return noState()
    const end = to || todayIso()
    const start = from || addDays(end, -6)
    if (start > end) throw fail('ERANGE', '`from` is after `to`')
    let days = 1
    while (addDays(start, days - 1) < end) { days++; if (days > RANGE_MAX_DAYS) throw fail('ERANGE', `at most ${RANGE_MAX_DAYS} days in one call; split the range`) }
    const series = dailySeries(S.foodLog, end, days)
    const avg = averageDay(series)
    return {
      from: start,
      to: end,
      module_on: isOn(S, 'nutrition'),
      targets: targetsOf(S),
      days_logged: series.filter(x => x.entries > 0).length,
      average_logged_day: avg ? { ...nutrientsOut(avg), days: avg.days } : null,
      days: series.map(x => ({ date: x.d, entries: x.entries, ...nutrientsOut(x) })),
    }
  },
}

// The foods a search and log_food choose from: the library, then the starter foods (lib/
// nutrition-seed.js) this profile has not added yet and never deleted. log_food adds such a one to
// the library when it logs it, as the app would have on the first visit.
const poolOf = S => [...(S.foods || []).filter(f => f && f.id != null && f.name), ...starterFoodsToAdd(S)]
const inLibrary = (S, id) => (S.foods || []).some(f => f?.id === id)

/** search_foods — the user's foods by name. */
export const searchFoodsTool = {
  name: 'search_foods',
  description: 'Search the user\'s food library by name (every word must appear; accents and case do not matter). Each food has its nutrients per 100 g, its servings (e.g. "1 egg" = 50 g) and whether it is a favourite. `approximate: true` is a starter food with average USDA values the user has not adjusted. `in_library: false` is a starter food not added yet, which log_food can still log. An empty query lists favourites first. Use the `id` with log_food.',
  schema: {
    query: z.string().max(80).optional().describe('Words of the food\'s name, e.g. "rice" or "chicken breast". Empty for everything.'),
    limit: z.number().int().min(1).max(SEARCH_MAX).optional().describe(`How many to return, at most ${SEARCH_MAX}. Default 10.`),
  },
  handler: ({ query = '', limit = 10 }) => {
    const S = getState()
    if (!S) return noState()
    const hits = searchFoods(poolOf(S), query, limit)
    return { query, count: hits.length, foods: hits.map(f => foodOut(f, inLibrary(S, f.id))) }
  },
}

const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

/** The food `food` names (an id, or a name), or { problem } with candidates. */
export function resolveFood(S, food) {
  const pool = poolOf(S)
  const byId = pool.find(f => String(f.id) === String(food))
  if (byId) return { food: byId }
  const hits = searchFoods(pool, food, 50)
  const exact = hits.filter(f => fold(f.name) === fold(food))
  if (exact.length === 1) return { food: exact[0] }
  if (!exact.length && hits.length === 1) return { food: hits[0] }
  const candidates = (exact.length ? exact : hits).slice(0, 8).map(f => ({ id: f.id, name: f.name, kcal_per_100g: Math.round(per100(f).kcal) }))
  return candidates.length
    ? { problem: { food, issue: 'several foods match; ask the user which one and call again with its id', candidates } }
    : { problem: { food, issue: 'no food by that name; ask the user for its values per 100 g (from the label) and call again with new_food', candidates: [] } }
}

const sameRequest = (e, entry, now) => e && e.d === entry.d && e.foodId === entry.foodId && e.grams === entry.grams &&
  e.meal === entry.meal && Math.abs((Number(e.loggedAt) || 0) - now) < DUPLICATE_MS

const newFoodSchema = z.object({
  name: z.string().min(1).max(NAME_MAX),
  kcal: z.number().min(0).max(900),
  protein: z.number().min(0).max(100),
  carbs: z.number().min(0).max(100),
  fat: z.number().min(0).max(100),
  fibre: z.number().min(0).max(100).optional(),
}).describe('A food the library does not have, with its values per 100 g from the label. Added to the user\'s foods and logged. Only after the user confirms the numbers.')

export const logFood = {
  name: 'log_food',
  description: [
    'Log a food the user ate into their openGym nutrition log (it syncs to all their devices). Give the food by id (from search_foods) or by name, and the grams eaten.',
    'Turn portions into grams with the food\'s servings when it has them ("2 eggs" with "1 egg" = 50 g is 100 g); otherwise ask the user rather than guess a weight.',
    'If the name matches several foods or none, nothing is saved and `problem` says what to ask. For a food not in the library, ask the user for its label values per 100 g and pass new_food.',
    'The nutrients are taken from the food now and kept with the entry. Calling again with the same food, grams, meal and day within ten minutes does not log it twice; pass allow_duplicate for a genuine second portion.',
    'Call with dry_run: true to preview without saving.',
  ].join(' '),
  schema: {
    food: z.string().min(1).max(120).optional().describe('The food\'s id from search_foods, or its name as the user said it. Not with new_food.'),
    new_food: newFoodSchema.optional(),
    grams: z.number().gt(0).max(GRAMS_MAX).describe('Grams eaten.'),
    meal: z.enum(MEALS).optional().describe('breakfast, lunch, dinner or snack. Defaults by the time of day it is logged for.'),
    date: isoDate().optional().describe('The day it was eaten, YYYY-MM-DD; defaults to today. Not in the future.'),
    dry_run: z.boolean().optional().describe('Build and return the entry without saving anything.'),
    allow_duplicate: z.boolean().optional().describe('Log it even though the same food, grams and meal were just logged for that day.'),
  },
  handler: async (params, { env = process.env, fetchImpl } = {}) => {
    const cfg = apiConfig(env)
    const opts = fetchImpl ? { fetchImpl } : {}
    const now = Date.now()
    const today = localIso(new Date(now))
    const d = params.date || today
    if (d > today) throw fail('EDATE', 'that day is in the future; nothing was saved')
    if (!params.food === !params.new_food) throw fail('EINPUT', 'give either `food` (an id or a name) or `new_food`, not both and not neither')
    const grams = cleanGrams(params.grams)
    if (grams == null) throw fail('EINPUT', `grams must be more than 0 and at most ${GRAMS_MAX}`)
    let custom = null
    if (params.new_food) {
      const draft = { ...params.new_food, fibre: params.new_food.fibre ?? 0 }
      const problems = foodProblems(draft)
      if (problems.length) return { logged: false, problem: { issue: 'new_food does not add up', fields: problems } }
      custom = cleanFood({ ...draft, id: 'f' + now.toString(36) + Math.random().toString(36).slice(2, 7), isCustom: true })
    }
    saves = saves.filter(t => now - t < WINDOW_MS)
    if (!params.dry_run && saves.length >= WRITE_LIMIT) {
      throw fail('ERATE', `log_food already saved ${WRITE_LIMIT} entries in the last hour, the most it takes in one go; nothing was saved. Log the rest in the app.`)
    }
    const h = new Date(now).getHours()
    const meal = params.meal || (d !== today ? 'snack' : h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 18 ? 'snack' : 'dinner')
    const id = 'n' + now.toString(36) + Math.random().toString(36).slice(2, 7)

    await assertProfile(cfg, opts)
    let got = await apiFetch(cfg, '/api/data', opts)
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const doc = got.body?.state
      if (!doc || typeof doc !== 'object') throw fail('ENOSTATE', 'this profile has no synced data on the server yet: open openGym and sign in on a device once, then try again')
      // The document as the server sent it, plus the entry (and the food it needed): anything else
      // in the PUT would be stamped as an edit made now and land on every device.
      const S = structuredClone(doc)
      let food = custom
      if (!food) {
        const r = resolveFood(S, params.food)
        if (r.problem) return { logged: false, problem: r.problem, next: 'Nothing was saved. Settle this with the user and call again.' }
        food = r.food
      }
      const entry = makeLogEntry({ food, grams, meal, d, id, at: now })
      const addsFood = !inLibrary(S, food.id)
      const after = { ...S, foodLog: [...(S.foodLog || []), entry] }
      const preview = { entry: { date: d, ...entryOut(entry) }, ...(addsFood ? { adds_food: foodOut(food) } : {}), day_after: dayOut(after, d) }
      if (params.dry_run) return { logged: false, dry_run: true, ...preview }
      const dup = (S.foodLog || []).find(e => sameRequest(e, entry, now))
      if (dup && !params.allow_duplicate) {
        return { logged: false, duplicate: true, entry_id: dup.id, message: 'The same food, grams and meal were just logged for that day; nothing was added. If it really was a second portion, call again with allow_duplicate: true.' }
      }
      if (addsFood) S.foods = [...(S.foods || []), food]
      S.foodLog = [...(S.foodLog || []), entry]
      const put = await apiFetch(cfg, '/api/data', { ...opts, method: 'PUT', body: { state: S, baseRev: got.body.rev ?? 0, ...(typeof doc._wid === 'string' ? { baseWid: doc._wid } : {}) } })
      if (put.status !== 409) {
        invalidate()
        saves.push(now)
        console.error(`[opengym-mcp] log_food saved ${entry.id} for ${d} (${grams} g), rev ${put.body?.rev ?? '?'}`)
        return { logged: true, ...preview, revision: put.body?.rev ?? null }
      }
      if (!put.body?.state || typeof put.body.state !== 'object' || typeof put.body.rev !== 'number') {
        throw fail('EAPI', 'the openGym server answered 409 without the current profile; nothing was saved')
      }
      got = { status: 200, body: { state: put.body.state, rev: put.body.rev } }
    }
    throw fail('ECONFLICT', `the profile kept changing on the server (${MAX_ATTEMPTS} attempts); nothing was saved, try again in a moment`)
  },
}

export const NUTRITION_TOOLS = [getNutritionDay, getNutritionRange, searchFoodsTool]
export const NUTRITION_WRITE_TOOLS = [logFood]
