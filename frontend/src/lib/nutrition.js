// Nutrition (docs/NUTRITION.md): foods with their nutrients per 100 g, a log of what was eaten,
// and daily targets. Pure, no imports, so the MCP server and the Coach can read it as the app does.
//
// THE SHAPES (in S, merged by lib/sync-merge.js like custom exercises: union by id, field by field,
// a removal on record in `deleted.foods` / `deleted.foodLog` stays removed)
//   S.foods     [{ id, name, kcal, protein, carbs, fat, fibre, servings?: [{ label, g }],
//                  isCustom, favourite, seed? }]                every nutrient per 100 g
//   S.foodLog   [{ id, foodId, name, d, grams, meal, loggedAt, source, n: { kcal, protein, … } }]
//                  `n` is the nutrients of those grams as they were when logged: editing or
//                  deleting the food later never changes what was eaten. `name` is kept for the
//                  same reason. `d` is the local day (YYYY-MM-DD) the entry counts on.
//   S.nutritionTargets { kcal, protein, carbs, fat, fibre }    per day; merged per key
//
// Numbers: grams to 0.1 g (a kitchen scale reads that fine). A log entry's nutrients are kept to
// 0.1 so that changing its grams later scales them without visible drift; screens show kcal whole.

export const NUTRIENTS = ['kcal', 'protein', 'carbs', 'fat', 'fibre']
export const MACROS = ['protein', 'carbs', 'fat', 'fibre']
export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack']
// Where the grams of an entry came from. 'scale' and 'barcode' are reserved for the kitchen scale
// and a barcode lookup (docs/NUTRITION.md "A kitchen scale"); the app logs 'manual' today.
export const SOURCES = ['manual', 'scale', 'barcode']
export const DEFAULT_TARGETS = Object.freeze({ kcal: 2200, protein: 140, carbs: 250, fat: 70, fibre: 30 })

// The bounds of one entry and of a food's numbers: a whole tub of yoghurt is fine, a typo of
// 50000 g is not; nothing has more than 900 kcal or 100 g of anything per 100 g (pure fat is 884).
export const GRAMS_MAX = 5000
export const KCAL_MAX = 900
export const NAME_MAX = 80
export const SERVINGS_MAX = 8
export const TARGET_MAX = { kcal: 10000, protein: 500, carbs: 1500, fat: 500, fibre: 150 }

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)
const list = v => (Array.isArray(v) ? v : [])
const num = v => (v == null || v === '' ? NaN : Number(v))
export const round1 = v => Math.round((Number(v) || 0) * 10) / 10
const zero = () => ({ kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 })

/** Grams as an entry stores them (0.1 g), or null when they are not a usable amount. */
export function cleanGrams(g) {
  const v = num(g)
  if (!Number.isFinite(v) || v <= 0 || v > GRAMS_MAX) return null
  const r = round1(v)
  return r > 0 ? r : null
}

/** A food's nutrients per 100 g, every one a finite number from 0 (a missing one counts as 0). */
export function per100(food) {
  const out = zero()
  for (const k of NUTRIENTS) {
    const v = num(food?.[k])
    out[k] = Number.isFinite(v) && v > 0 ? v : 0
  }
  return out
}

/** Every nutrient rounded to 0.1. */
export function roundNutrients(n) {
  const out = zero()
  for (const k of NUTRIENTS) out[k] = round1(n?.[k])
  return out
}

/** The nutrients of `grams` of `food` (per 100 g values), to 0.1. Zero for no or bad grams. */
export function nutrientsFor(food, grams) {
  const g = cleanGrams(grams)
  if (g == null) return zero()
  const p = per100(food)
  const out = zero()
  for (const k of NUTRIENTS) out[k] = round1(p[k] * g / 100)
  return out
}

/** The sum of several nutrient sets (log entries' `n`, or plain sets), to 0.1. */
export function sumNutrients(items) {
  const out = zero()
  for (const x of list(items)) {
    const n = isMap(x?.n) ? x.n : x
    if (!isMap(n)) continue
    for (const k of NUTRIENTS) {
      const v = num(n[k])
      if (Number.isFinite(v) && v > 0) out[k] += v
    }
  }
  return roundNutrients(out)
}

const validEntry = e => isMap(e) && typeof e.d === 'string' && e.d.length === 10

/** The log entries of one day, in the order they were logged. */
export function entriesOn(log, d) {
  return list(log).filter(e => validEntry(e) && e.d === d)
    .sort((a, b) => (Number(a.loggedAt) || 0) - (Number(b.loggedAt) || 0))
}

/** What was eaten on day `d`. */
export const dailyTotals = (log, d) => sumNutrients(entriesOn(log, d))

/** Day `d`'s entries by meal: { breakfast: [..], lunch: [..], dinner: [..], snack: [..] }. */
export function entriesByMeal(log, d) {
  const out = Object.fromEntries(MEALS.map(m => [m, []]))
  for (const e of entriesOn(log, d)) out[MEALS.includes(e.meal) ? e.meal : 'snack'].push(e)
  return out
}

/** The targets of a profile: its own where they are valid numbers, the defaults elsewhere. */
export function targetsOf(S) {
  const t = isMap(S?.nutritionTargets) ? S.nutritionTargets : {}
  const out = {}
  for (const k of NUTRIENTS) {
    const v = num(t[k])
    out[k] = Number.isFinite(v) && v >= 0 && v <= TARGET_MAX[k] ? Math.round(v) : DEFAULT_TARGETS[k]
  }
  return out
}

/**
 * Per nutrient, the day's progress against its target: { eaten, target, left, pct }. `left` goes
 * below zero once the target is passed; `pct` is eaten / target in percent (rounded, uncapped),
 * null for a target of 0 (no target set: nothing to be a share of).
 */
export function progress(totals, targets) {
  const out = {}
  for (const k of NUTRIENTS) {
    const eaten = round1(totals?.[k])
    const target = Math.max(0, Number(targets?.[k]) || 0)
    out[k] = { eaten, target, left: round1(target - eaten), pct: target > 0 ? Math.round(eaten / target * 100) : null }
  }
  return out
}

// Days as local calendar dates. Noon UTC is used only to step from one date string to the next,
// so neither a time zone nor a summer-time change can skip or repeat a day.
export const addDays = (d, by) => {
  const t = new Date(d + 'T12:00:00Z')
  t.setUTCDate(t.getUTCDate() + by)
  return t.toISOString().slice(0, 10)
}

/** The local date of a time, YYYY-MM-DD. */
export const dayOf = (at = Date.now()) => {
  const t = new Date(at)
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0')
}

/**
 * Daily totals for the `days` days up to and including `end`, oldest first, a day with nothing
 * logged included as zeros (`entries: 0`), so a chart's x axis is the calendar.
 */
export function dailySeries(log, end, days = 7) {
  const byDay = new Map()
  for (const e of list(log)) if (validEntry(e)) byDay.set(e.d, [...(byDay.get(e.d) || []), e])
  const out = []
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(end, -i)
    const es = byDay.get(d) || []
    out.push({ d, entries: es.length, ...sumNutrients(es) })
  }
  return out
}

/** The 7-day series ending on `end` (dailySeries). */
export const weeklySeries = (log, end) => dailySeries(log, end, 7)

/**
 * The average day of a series, over the days that have anything logged (a day not tracked is not
 * a day of eating nothing). Null when no day has an entry.
 */
export function averageDay(series) {
  const logged = list(series).filter(x => x.entries > 0)
  if (!logged.length) return null
  const sum = sumNutrients(logged)
  const out = {}
  for (const k of NUTRIENTS) out[k] = round1(sum[k] / logged.length)
  return { ...out, days: logged.length }
}

/**
 * A new log entry for `grams` of `food`, its nutrients taken now. `source` defaults to 'manual';
 * an unknown meal or source falls back to the default. Null when the grams are not usable.
 */
export function makeLogEntry({ food, grams, meal, d, source = 'manual', at = Date.now(), id }) {
  const g = cleanGrams(grams)
  if (g == null || !food || !id || typeof d !== 'string') return null
  return {
    id,
    foodId: food.id ?? null,
    name: String(food.name || '').slice(0, NAME_MAX),
    d,
    grams: g,
    meal: MEALS.includes(meal) ? meal : 'snack',
    loggedAt: at,
    source: SOURCES.includes(source) ? source : 'manual',
    n: nutrientsFor(food, g),
  }
}

/**
 * `entry` with new grams, its nutrients scaled from its own snapshot (never from the food as it is
 * now). An entry logged at 0 g has nothing to scale from and keeps its nutrients at zero. Returns
 * a new entry, or null when the grams are not usable.
 */
export function regram(entry, grams) {
  const g = cleanGrams(grams)
  if (g == null || !isMap(entry)) return null
  const was = Number(entry.grams) || 0
  const n = zero()
  if (was > 0) for (const k of NUTRIENTS) n[k] = round1((Number(entry.n?.[k]) || 0) * g / was)
  return { ...entry, grams: g, n }
}

/** The ids of the foods logged most recently, newest first, each once. */
export function recentFoodIds(log, max = 8) {
  const out = []
  const seen = new Set()
  const sorted = list(log).filter(e => isMap(e) && e.foodId != null)
    .sort((a, b) => (Number(b.loggedAt) || 0) - (Number(a.loggedAt) || 0))
  for (const e of sorted) {
    if (seen.has(e.foodId)) continue
    seen.add(e.foodId)
    out.push(e.foodId)
    if (out.length >= max) break
  }
  return out
}

/**
 * What is wrong with a food as typed (custom food form, MCP), as a list of codes, empty when it
 * can be saved: 'name', '<nutrient>' for a value that is missing, negative or too large, 'sum'
 * for protein, carbs and fat together over 100 g per 100 g, 'servings'.
 */
export function foodProblems(f) {
  const out = []
  const name = String(f?.name ?? '').trim()
  if (!name || name.length > NAME_MAX) out.push('name')
  for (const k of NUTRIENTS) {
    const v = num(f?.[k])
    if (!Number.isFinite(v) || v < 0 || v > (k === 'kcal' ? KCAL_MAX : 100)) out.push(k)
  }
  // Fibre is left out of the sum: US labels count it inside carbohydrates, EU labels apart. Half
  // a gram of slack for values rounded on the label.
  const sum = ['protein', 'carbs', 'fat'].reduce((s, k) => s + (Number(f?.[k]) || 0), 0)
  if (!out.some(k => MACROS.includes(k)) && sum > 100.5) out.push('sum')
  const sv = f?.servings
  if (sv != null && (!Array.isArray(sv) || sv.length > SERVINGS_MAX ||
    sv.some(s => !isMap(s) || !String(s.label ?? '').trim() || cleanGrams(s.g) == null))) out.push('servings')
  return out
}

/** A food as it is stored: trimmed name, nutrients to 0.1, clean servings, the flags as booleans. */
export function cleanFood(f) {
  const out = { id: f.id, name: String(f.name ?? '').trim().slice(0, NAME_MAX) }
  for (const k of NUTRIENTS) out[k] = round1(Math.max(0, Number(f[k]) || 0))
  const servings = list(f.servings).filter(s => isMap(s) && String(s.label ?? '').trim() && cleanGrams(s.g) != null)
    .slice(0, SERVINGS_MAX).map(s => ({ label: String(s.label).trim().slice(0, 40), g: cleanGrams(s.g) }))
  if (servings.length) out.servings = servings
  out.isCustom = f.isCustom !== false
  out.favourite = !!f.favourite
  if (f.seed) out.seed = true
  return out
}

const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * The foods matching `query`, best first: a name that starts with it, then one with a word that
 * starts with it, then any that contain it; favourites first within each, then by name. Every
 * word of the query has to be found. An empty query gives every food, favourites first.
 */
export function searchFoods(foods, query, max = 50) {
  const words = fold(query).split(/[\s,/]+/).filter(Boolean)
  const scored = []
  for (const f of list(foods)) {
    if (!isMap(f) || !f.name) continue
    const name = fold(f.name)
    if (!words.every(w => name.includes(w))) continue
    const q = words.join(' ')
    const rank = !q ? 0 : name.startsWith(q) ? 0 : name.split(/[\s,/()-]+/).some(p => p.startsWith(words[0])) ? 1 : 2
    scored.push([rank, f.favourite ? 0 : 1, name, f])
  }
  scored.sort((a, b) => a[0] - b[0] || a[1] - b[1] || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0))
  return scored.slice(0, max).map(x => x[3])
}
