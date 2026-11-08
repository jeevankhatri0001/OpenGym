// The nutrition tools (src/nutrition-tools.js): the three reads over a seeded state, and log_food
// against a stand-in for the api (the same shape as write-tools.test.js's). The arithmetic is
// frontend/src/lib/nutrition.test.js's; here the JSON shape, the food matching and the write.
import { describe, test, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest'
import http from 'node:http'
import { _seedStateForTests } from '../src/state.js'
import { NUTRITION_TOOLS, logFood, resolveFood, RANGE_MAX_DAYS, _resetFoodWriteWindow } from '../src/nutrition-tools.js'

const TODAY = '2026-07-27'
const TOKEN = 'tok.secret-value'
const byName = Object.fromEntries(NUTRITION_TOOLS.map(t => [t.name, t.handler]))
const call = (name, p = {}) => byName[name](p)

const OATS = { id: 'oats', name: 'Oats', kcal: 380, protein: 13, carbs: 66, fat: 7, fibre: 10, isCustom: true, favourite: true }
const RICE = { id: 'seed:rice-white', name: 'Rice, white, cooked', kcal: 130, protein: 2.7, carbs: 28.2, fat: 0.3, fibre: 0.4, servings: [{ label: '1 cup', g: 158 }], isCustom: false, favourite: false, seed: true }
const entry = (over = {}) => ({ id: 'e1', foodId: 'oats', name: 'Oats', d: TODAY, grams: 50, meal: 'breakfast', loggedAt: 1, source: 'manual', n: { kcal: 190, protein: 6.5, carbs: 33, fat: 3.5, fibre: 5 }, ...over })
const STATE = () => ({
  unit: 'kg',
  foods: [OATS, RICE],
  foodLog: [entry(), entry({ id: 'e2', meal: 'dinner', grams: 200, foodId: 'seed:rice-white', name: 'Rice, white, cooked', n: { kcal: 260, protein: 5.4, carbs: 56.4, fat: 0.6, fibre: 0.8 } }),
    entry({ id: 'e3', d: '2026-07-24', n: { kcal: 1000, protein: 80, carbs: 100, fat: 30, fibre: 20 } })],
  nutritionTargets: { kcal: 2000, protein: 150 },
  deleted: { foods: { 'seed:paneer': 5 } },
})

beforeAll(() => vi.useFakeTimers({ now: new Date(TODAY + 'T12:00:00'), toFake: ['Date'] }))
afterAll(() => vi.useRealTimers())

describe('reading nutrition', () => {
  beforeEach(() => _seedStateForTests(STATE()))

  test('get_nutrition_day: entries by meal, totals and what is left of each target', () => {
    const r = call('get_nutrition_day', { date: TODAY })
    expect(r).toMatchObject({ date: TODAY, module_on: true, entries: 2, totals: { kcal: 450, protein: 11.9, carbs: 89.4, fat: 4.1, fibre: 5.8 } })
    expect(r.targets).toMatchObject({ kcal: 2000, protein: 150, carbs: 250 })
    expect(r.vs_targets.kcal).toEqual({ left: 1550, pct: 23 })
    expect(r.meals.breakfast).toEqual([{ id: 'e1', name: 'Oats', grams: 50, meal: 'breakfast', nutrients: { kcal: 190, protein: 6.5, carbs: 33, fat: 3.5, fibre: 5 } }])
    expect(r.meals.dinner[0].name).toBe('Rice, white, cooked')
    expect(r.meals.lunch).toEqual([])
    expect(call('get_nutrition_day').date).toBe(TODAY)
  })

  test('the reads answer whatever the module says, and say when it is off', () => {
    _seedStateForTests({ ...STATE(), modules: { nutrition: false } })
    expect(call('get_nutrition_day', { date: TODAY })).toMatchObject({ module_on: false, entries: 2 })
  })

  test('get_nutrition_range: every day of the span, the average over the logged ones', () => {
    const r = call('get_nutrition_range', { from: '2026-07-21', to: TODAY })
    expect(r.days).toHaveLength(7)
    expect(r.days_logged).toBe(2)
    expect(r.days.find(x => x.date === '2026-07-25')).toMatchObject({ entries: 0, kcal: 0 })
    expect(r.average_logged_day).toMatchObject({ kcal: 725, days: 2 })
    expect(call('get_nutrition_range').from).toBe('2026-07-21')   // a week by default
  })

  test('get_nutrition_range refuses a backwards or overlong span', () => {
    expect(() => call('get_nutrition_range', { from: TODAY, to: '2026-07-01' })).toThrow(/after/)
    expect(() => call('get_nutrition_range', { from: '2026-01-01', to: TODAY })).toThrow(new RegExp(String(RANGE_MAX_DAYS)))
  })

  test('search_foods: by words, favourites first, starter foods not yet added marked, deleted ones never', () => {
    const r = call('search_foods', { query: 'rice' })
    // equally good matches by name: brown before white
    expect(r.foods.map(f => f.id)).toEqual(['seed:rice-brown', 'seed:rice-white'])
    expect(r.foods[1]).toMatchObject({ per_100g: { kcal: 130 }, servings: [{ label: '1 cup', grams: 158 }], approximate: true, custom: false })
    expect(r.foods[1].in_library).toBeUndefined()
    expect(r.foods[0].in_library).toBe(false)
    expect(call('search_foods', { query: 'paneer' }).count).toBe(0)
    expect(call('search_foods', { limit: 3 }).foods[0].id).toBe('oats')
  })

  test('the food a name means: an id, one exact name, one hit, or candidates', () => {
    const S = STATE()
    expect(resolveFood(S, 'seed:rice-white').food.id).toBe('seed:rice-white')
    expect(resolveFood(S, 'OATS').food.id).toBe('oats')
    expect(resolveFood(S, 'banana').food.id).toBe('seed:banana')
    const several = resolveFood(S, 'rice')
    expect(several.problem.candidates.map(c => c.id)).toEqual(['seed:rice-brown', 'seed:rice-white'])
    expect(resolveFood(S, 'dragon fruit').problem.issue).toMatch(/new_food/)
  })
})

/* ---------- log_food against a stand-in api ---------- */

let api
function stubApi(doc, script = {}) {
  const s = { doc: structuredClone(doc), rev: 7, puts: [], script }
  const server = http.createServer(async (req, res) => {
    const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }
    if (req.headers.authorization !== 'Bearer ' + TOKEN) return send(401, { error: 'not signed in' })
    if (req.url === '/api/me') return send(200, { user: { id: script.uid || 'test-uid', name: 'Matt' } })
    if (req.url === '/api/data' && req.method === 'GET') return send(200, { state: s.doc, rev: s.rev })
    if (req.url === '/api/data' && req.method === 'PUT') {
      let raw = ''
      for await (const c of req) raw += c
      const body = JSON.parse(raw)
      s.puts.push(body)
      const next = (script.put || [])[s.puts.length - 1]
      if (next) return next(send, s)
      if (body.baseRev !== s.rev) return send(409, { error: 'conflict', rev: s.rev, state: s.doc })
      s.doc = body.state
      s.rev++
      return send(200, { ok: true, rev: s.rev })
    }
    send(404, { error: 'not found' })
  })
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => {
    s.server = server
    s.env = { OPENGYM_URL: `http://127.0.0.1:${server.address().port}`, OPENGYM_TOKEN: TOKEN }
    resolve(s)
  }))
}
const log = (p, env = api.env) => logFood.handler(p, { env })

describe('log_food writes through the server', () => {
  beforeEach(async () => { _seedStateForTests(STATE()); _resetFoodWriteWindow(); api = await stubApi({ ...STATE(), _wid: 'w-abc', _ts: 1 }) })
  afterEach(() => api?.server.close())

  test('a food by name and its grams: one entry with its nutrients taken now, the day after it', async () => {
    const r = await log({ food: 'oats', grams: 80, meal: 'breakfast' })
    expect(r.logged).toBe(true)
    expect(r.entry).toMatchObject({ date: TODAY, name: 'Oats', grams: 80, meal: 'breakfast', nutrients: { kcal: 304, protein: 10.4 } })
    expect(r.day_after.totals.kcal).toBe(754)
    expect(api.puts).toHaveLength(1)
    expect(api.puts[0]).toMatchObject({ baseRev: 7, baseWid: 'w-abc' })
    const added = api.doc.foodLog.at(-1)
    expect(added).toMatchObject({ foodId: 'oats', d: TODAY, grams: 80, source: 'manual', n: { kcal: 304 } })
    // nothing but the entry: the foods and the rest of the document as the server sent them
    expect(api.doc.foods).toEqual(STATE().foods)
  })

  test('a starter food not in the library yet is added with it', async () => {
    const r = await log({ food: 'seed:banana', grams: 118 })
    expect(r.adds_food).toMatchObject({ id: 'seed:banana', approximate: true })
    expect(api.doc.foods.map(f => f.id)).toContain('seed:banana')
  })

  test('a new food with its label values is added and logged; one that does not add up is refused', async () => {
    const bad = await log({ new_food: { name: 'Typo bar', kcal: 400, protein: 60, carbs: 60, fat: 10 }, grams: 40 })
    expect(bad).toMatchObject({ logged: false, problem: { fields: ['sum'] } })
    const r = await log({ new_food: { name: 'Protein bar', kcal: 360, protein: 33, carbs: 35, fat: 12, fibre: 8 }, grams: 60, meal: 'snack' })
    expect(r.logged).toBe(true)
    expect(r.entry.nutrients).toEqual({ kcal: 216, protein: 19.8, carbs: 21, fat: 7.2, fibre: 4.8 })
    expect(api.doc.foods.find(f => f.name === 'Protein bar')).toMatchObject({ isCustom: true, kcal: 360 })
    expect(api.puts).toHaveLength(1)
  })

  test('an unclear name saves nothing and says what to ask', async () => {
    const r = await log({ food: 'rice', grams: 150 })
    expect(r.logged).toBe(false)
    expect(r.problem.candidates.length).toBe(2)
    expect(api.puts).toHaveLength(0)
  })

  test('dry_run previews and writes nothing; the same call twice logs once', async () => {
    expect(await log({ food: 'oats', grams: 50, meal: 'lunch', dry_run: true })).toMatchObject({ logged: false, dry_run: true, entry: { grams: 50 } })
    expect(api.puts).toHaveLength(0)
    expect((await log({ food: 'oats', grams: 50, meal: 'lunch' })).logged).toBe(true)
    expect(await log({ food: 'oats', grams: 50, meal: 'lunch' })).toMatchObject({ logged: false, duplicate: true })
    expect((await log({ food: 'oats', grams: 50, meal: 'lunch', allow_duplicate: true })).logged).toBe(true)
    expect(api.doc.foodLog.filter(e => e.meal === 'lunch')).toHaveLength(2)
  })

  test('a 409 is answered by adding the entry to the document it carries, once', async () => {
    api.script.put = [(send, s) => {
      s.doc = { ...s.doc, foodLog: [...s.doc.foodLog, entry({ id: 'phone', meal: 'snack' })], _wid: 'w-phone' }
      s.rev = 8
      send(409, { error: 'conflict', rev: s.rev, state: s.doc })
    }]
    const r = await log({ food: 'oats', grams: 30 })
    expect(r.logged).toBe(true)
    expect(api.puts[1]).toMatchObject({ baseRev: 8, baseWid: 'w-phone' })
    expect(api.doc.foodLog.map(e => e.id)).toContain('phone')
    expect(api.puts[1].state.foodLog.at(-1).id).toBe(api.puts[0].state.foodLog.at(-1).id)
  })

  test('refuses a future day, a token for another profile, and both or neither of food and new_food', async () => {
    await expect(log({ food: 'oats', grams: 50, date: '2026-07-30' })).rejects.toMatchObject({ code: 'EDATE' })
    await expect(log({ grams: 50 })).rejects.toMatchObject({ code: 'EINPUT' })
    api.script.uid = 'someone-else'
    await expect(log({ food: 'oats', grams: 50 })).rejects.toMatchObject({ code: 'EPROFILE' })
    expect(api.puts).toHaveLength(0)
  })
})
