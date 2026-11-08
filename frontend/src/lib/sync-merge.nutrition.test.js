/* Nutrition's data (lib/nutrition.js) through the sync: foods and the food log are merged by id and
   field like custom exercises, a removal stays removed, the targets merge per nutrient. And the
   server's half (api/sync-stamps.js) treats them the same for a writer that does not stamp. */
import { describe, expect, it } from 'vitest'
import * as Server from '../../../api/sync-stamps.js'
import { mergeStates, stampChange, resetIdsOf, stampRestore } from './sync-merge.js'
import { makeLogEntry, regram } from './nutrition.js'

const clone = v => JSON.parse(JSON.stringify(v))
const T = 1_800_000_000_000
// One change on a device, stamped the way the store's update() stamps it.
const change = (prev, wall, mut) => { const n = clone(prev); mut(n); n._ts = stampChange(prev, n, wall); return n }

const RICE = { id: 'f-rice', name: 'Rice', kcal: 130, protein: 2.7, carbs: 28.2, fat: 0.3, fibre: 0.4, isCustom: true, favourite: false }
const SEED_EGG = { id: 'seed:egg-whole', name: 'Egg, whole', kcal: 143, protein: 12.6, carbs: 0.7, fat: 9.5, fibre: 0, isCustom: false, favourite: false, seed: true }
const log = (id, grams, d = '2026-11-08', meal = 'lunch') => makeLogEntry({ food: RICE, grams, meal, d, at: T, id })

// The copy both devices last synced.
const base = () => change({ _ts: T - 10, unit: 'kg', workouts: [], routines: [], foods: [], foodLog: [] }, T - 5, s => {
  s.foods.push(clone(RICE), clone(SEED_EGG))
  s.foodLog.push(log('e1', 100))
})
const ids = xs => (xs || []).map(x => x.id).sort()

describe('the food log on two devices', () => {
  it('keeps what each device logged', () => {
    const b0 = base()
    const A = change(b0, T + 10, s => { s.foodLog.push(log('a1', 50, '2026-11-08', 'dinner')) })
    const B = change(b0, T + 20, s => { s.foodLog.push(log('b1', 80, '2026-11-08', 'snack')) })
    expect(ids(mergeStates(A, B).foodLog)).toEqual(['a1', 'b1', 'e1'])
    expect(ids(mergeStates(B, A).foodLog)).toEqual(['a1', 'b1', 'e1'])
  })

  it('keeps an entry deleted on one device deleted, whichever copy is newer', () => {
    const b0 = base()
    const A = change(b0, T + 10, s => { s.foodLog = s.foodLog.filter(e => e.id !== 'e1') })
    // The other device changes something else, later.
    const B = change(b0, T + 50, s => { s.foodLog.push(log('b1', 80)) })
    for (const m of [mergeStates(A, B), mergeStates(B, A)]) {
      expect(ids(m.foodLog)).toEqual(['b1'])
      expect(m.deleted.foodLog.e1).toBeGreaterThan(0)
    }
  })

  it('takes each field of an entry from the device that changed it last', () => {
    const b0 = base()
    const A = change(b0, T + 10, s => { s.foodLog[0] = regram(s.foodLog[0], 250) })
    const B = change(b0, T + 20, s => { s.foodLog[0].meal = 'dinner' })
    for (const m of [mergeStates(A, B), mergeStates(B, A)]) {
      const e = m.foodLog.find(x => x.id === 'e1')
      expect(e.grams).toBe(250)
      expect(e.n.kcal).toBe(325)
      expect(e.meal).toBe('dinner')
    }
  })

  it('a grams edit and its nutrients travel together', () => {
    const b0 = base()
    const A = change(b0, T + 10, s => { s.foodLog[0] = regram(s.foodLog[0], 200) })
    const B = change(b0, T + 20, s => { s.foodLog[0] = regram(s.foodLog[0], 300) })
    const e = mergeStates(A, B).foodLog.find(x => x.id === 'e1')
    expect([e.grams, e.n.kcal]).toEqual([300, 390])
  })
})

describe('foods', () => {
  it('keeps a renamed food and its changed nutrients from two devices', () => {
    const b0 = base()
    const A = change(b0, T + 10, s => { s.foods.find(f => f.id === 'f-rice').name = 'Basmati rice' })
    const B = change(b0, T + 20, s => { s.foods.find(f => f.id === 'f-rice').protein = 3.5 })
    const f = mergeStates(A, B).foods.find(x => x.id === 'f-rice')
    expect([f.name, f.protein]).toEqual(['Basmati rice', 3.5])
  })

  it('a deleted starter food stays deleted when another device adds the starter foods again later', () => {
    const b0 = change({ _ts: T - 10, unit: 'kg', foods: [] }, T - 5, s => { s.foods.push(clone(SEED_EGG)) })
    const A = change(b0, T + 10, s => { s.foods = [] })
    // A device that never had them adds the same starter food, after the deletion by its clock.
    const fresh = change({ _ts: T - 100, unit: 'kg', foods: [] }, T + 500, s => { s.foods.push(clone(SEED_EGG)) })
    expect(fresh.foods[0]._ts).toBe(T + 500)
    expect(ids(mergeStates(A, fresh).foods)).toEqual([])
    expect(ids(mergeStates(fresh, A).foods)).toEqual([])
  })

  it('a starter food edited after it was deleted elsewhere comes back, like any edited entry', () => {
    const b0 = change({ _ts: T - 10, unit: 'kg', foods: [] }, T - 5, s => { s.foods.push(clone(SEED_EGG)) })
    const A = change(b0, T + 10, s => { s.foods = [] })
    const B = change(b0, T + 20, s => { s.foods[0].protein = 13 })
    expect(mergeStates(A, B).foods.map(f => [f.id, f.protein])).toEqual([['seed:egg-whole', 13]])
  })

  it('a log entry keeps its snapshot when its food is edited or deleted', () => {
    const b0 = base()
    const A = change(b0, T + 10, s => { s.foods = s.foods.filter(f => f.id !== 'f-rice') })
    const m = mergeStates(A, b0)
    expect(ids(m.foods)).toEqual(['seed:egg-whole'])
    expect(m.foodLog[0]).toMatchObject({ foodId: 'f-rice', name: 'Rice', n: { kcal: 130 } })
  })
})

describe('targets', () => {
  it('merge per nutrient', () => {
    const b0 = base()
    const A = change(b0, T + 10, s => { s.nutritionTargets = { ...(s.nutritionTargets || {}), protein: 160 } })
    const B = change(b0, T + 20, s => { s.nutritionTargets = { ...(s.nutritionTargets || {}), kcal: 2400 } })
    expect(mergeStates(A, B).nutritionTargets).toEqual({ protein: 160, kcal: 2400 })
    expect(mergeStates(B, A).nutritionTargets).toEqual({ protein: 160, kcal: 2400 })
  })
  it('the later change of the same nutrient wins, whichever copy is newer', () => {
    const b0 = base()
    const A = change(b0, T + 30, s => { s.nutritionTargets = { protein: 170 } })
    const B = change(b0, T + 20, s => { s.nutritionTargets = { protein: 150 } })
    const B2 = change(B, T + 25, s => { s.restSec = 120 })
    expect(mergeStates(A, B2).nutritionTargets.protein).toBe(170)
    expect(mergeStates(B2, A).nutritionTargets.protein).toBe(170)
  })
})

describe('reset and restore', () => {
  it('a reset takes the foods and the log with it from a copy that had not seen it', () => {
    const b0 = base()
    const reset = { _ts: T + 100, unit: 'kg', foods: [], foodLog: [], resetAt: T + 100, resetIds: resetIdsOf(b0) }
    const stale = change(b0, T + 50, s => { s.foodLog.push(log('late', 10)) })
    const m = mergeStates(reset, stale)
    // The entry logged after the reset's copy was taken (unknown to it) stays; the rest goes.
    expect(ids(m.foodLog)).toEqual(['late'])
    expect(ids(m.foods)).toEqual([])
  })
  it('a restored backup brings deleted entries back', () => {
    const b0 = base()
    const A = change(b0, T + 10, s => { s.foodLog = [] })
    const backup = stampRestore(clone(b0), [A], T + 20)
    expect(backup.deleted.foodLog.e1).toBeLessThan(0)
    expect(ids(mergeStates(backup, A).foodLog)).toEqual(['e1'])
  })
})

describe('the server, for a writer that does not stamp', () => {
  it('records a log entry it removed', () => {
    const cur = base()
    const next = clone(cur)
    next.foodLog = []
    delete next.edited
    Server.stampPut(cur, next, { overRead: true, now: T + 100 })
    expect(next.deleted.foodLog.e1).toBeGreaterThanOrEqual(T + 100)
  })
  it('puts back the foods and the log of a writer that does not know them', () => {
    const cur = base()
    const next = clone(cur)
    delete next.foods
    delete next.foodLog
    Server.stampPut(cur, next, { overRead: true, now: T + 100 })
    expect(ids(next.foods)).toEqual(['f-rice', 'seed:egg-whole'])
    expect(ids(next.foodLog)).toEqual(['e1'])
  })
  it('stamps a target it changed, per nutrient', () => {
    const cur = change(base(), T, s => { s.nutritionTargets = { kcal: 2000, protein: 150 } })
    const next = clone(cur)
    next.nutritionTargets.protein = 180
    Server.stampPut(cur, next, { overRead: true, now: T + 100 })
    expect(next.edited['nutritionTargets.protein']).toBeGreaterThanOrEqual(T + 100)
    expect(next.edited['nutritionTargets.kcal']).toBe(cur.edited['nutritionTargets.kcal'])
  })
  it('agrees with the app on when a starter food was last edited', () => {
    const doc = { deleted: { foods: { 'seed:egg-whole': T } }, foods: [{ ...SEED_EGG, _ts: T + 9 }] }
    const kept = clone(doc)
    Server.stampPut({ ...clone(doc), foods: [] }, kept, { stamped: true, now: T + 10 })
    // An unedited starter food held against a removal on record is an add-back (keepHeld) on
    // the server too, never treated as edited after the removal.
    expect(kept.deleted.foods['seed:egg-whole']).toBeLessThan(0)
  })
})
