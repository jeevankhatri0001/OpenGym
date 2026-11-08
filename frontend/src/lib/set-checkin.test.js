// The set check-in (lib/set-checkin.js): "How did that feel?" after a work set, the advice it
// gives, and that advice applied to the sets still to do.
import { describe, it, expect } from 'vitest'
import { checkinAdvice, applyCheckin, hasOpenWork, effortFields, FEEL_RIR } from './set-checkin.js'

const BENCH = '0025', PUSHUP = '0662'
const row = (w, r, done = false, extra = {}) => ({ w, r, done, ...extra })
const warm = (w, r, done = false) => ({ w, r, done, phase: 'warmup', warmup: true })
const session = (sets, extra = {}) => ({
  unit: 'kg', exWeights: {}, workouts: [], week: {}, dayPlan: {}, routines: [], ...extra,
  active: { id: 'a1', d: '2026-11-08', cur: 0, entries: [{ id: BENCH, target: { sets: 3, reps: 5, weight: 60 }, sets }] },
})

describe('checkinAdvice', () => {
  it('rates each answer in reps left in the tank', () => {
    for (const f of Object.keys(FEEL_RIR)) expect(checkinAdvice({ feel: f, reps: 5, targetReps: 5, weight: 60 }).rir).toBe(FEEL_RIR[f])
  })

  it('an easy set that hit its reps earns weight; one that missed them does not', () => {
    expect(checkinAdvice({ feel: 'easy', reps: 5, targetReps: 5, weight: 60 }).action).toEqual({ type: 'weight', pct: 5 })
    expect(checkinAdvice({ feel: 'easy', reps: 4, targetReps: 5, weight: 60 }).action).toEqual({ type: 'hold' })
  })

  it('bodyweight work moves the reps instead of the weight', () => {
    expect(checkinAdvice({ feel: 'easy', reps: 10, targetReps: 10, weight: 0 }).action).toEqual({ type: 'reps', reps: 12 })
    expect(checkinAdvice({ feel: 'max', reps: 7, targetReps: 10, weight: 0 }).action).toEqual({ type: 'reps', reps: 7 })
  })

  it('solid holds; hard holds unless the reps fell two or more short', () => {
    expect(checkinAdvice({ feel: 'solid', reps: 5, targetReps: 5, weight: 60 }).action.type).toBe('hold')
    expect(checkinAdvice({ feel: 'hard', reps: 4, targetReps: 5, weight: 60 }).action.type).toBe('hold')
    expect(checkinAdvice({ feel: 'hard', reps: 3, targetReps: 5, weight: 60 }).action).toEqual({ type: 'weight', pct: -5 })
  })

  it('a max effort gives weight back, more when the reps were missed', () => {
    expect(checkinAdvice({ feel: 'max', reps: 5, targetReps: 5, weight: 60 }).action).toEqual({ type: 'weight', pct: -5 })
    expect(checkinAdvice({ feel: 'max', reps: 3, targetReps: 5, weight: 60 }).action).toEqual({ type: 'weight', pct: -10 })
  })

  it('pain stops and points to the Coach, whatever the feel', () => {
    const a = checkinAdvice({ feel: 'easy', flag: 'pain', reps: 5, targetReps: 5, weight: 60 })
    expect(a.action).toEqual({ type: 'stop' })
    expect(a.askCoach).toBe(true)
  })

  it('form breaking down takes 10% off', () => {
    expect(checkinAdvice({ feel: 'solid', flag: 'form', reps: 5, targetReps: 5, weight: 60 }).action).toEqual({ type: 'weight', pct: -10 })
  })

  it('after the last set there is nothing to change', () => {
    const a = checkinAdvice({ feel: 'easy', reps: 5, targetReps: 5, weight: 60, hasNext: false })
    expect(a.action).toEqual({ type: 'hold' })
    expect(a.tip).toBe('lastEasy')
  })

  it('a set without a rep target is never a miss', () => {
    expect(checkinAdvice({ feel: 'easy', reps: 3, targetReps: null, weight: 60 }).action.type).toBe('weight')
  })
})

describe('applyCheckin', () => {
  it('raises the open work sets to the next real step, logged sets untouched', () => {
    const S = session([warm(30, 5, true), row(60, 5, true), row(60, 5), row(60, 5)])
    const r = applyCheckin(S, 0, 1, { rir: 4, action: { type: 'weight', pct: 5 } })
    const sets = S.active.entries[0].sets
    expect(r.changed).toBe(true)
    expect(sets[1].w).toBe(60)
    expect(sets[2].w).toBeGreaterThan(60)
    expect(sets[3].w).toBe(sets[2].w)
    expect(sets[2].w).toBeLessThanOrEqual(69)
  })

  it('a cut rounds down and never goes under the bar', () => {
    const S = session([row(60, 5, true), row(60, 5), row(60, 5)])
    applyCheckin(S, 0, 0, { rir: 0, action: { type: 'weight', pct: -10 } })
    const sets = S.active.entries[0].sets
    expect(sets[1].w).toBeLessThanOrEqual(54)
    expect(sets[1].w).toBeGreaterThan(0)
  })

  it('writes the effort onto the logged set in the profile’s own scale, once', () => {
    const S = session([row(60, 5, true), row(60, 5)])
    applyCheckin(S, 0, 0, { rir: 2, action: { type: 'hold' } })
    expect(S.active.entries[0].sets[0].rir).toBe(2)
    applyCheckin(S, 0, 0, { rir: 0, action: { type: 'hold' } })
    expect(S.active.entries[0].sets[0].rir).toBe(2)

    const R = session([row(60, 5, true), row(60, 5)], { effort: 'rpe' })
    applyCheckin(R, 0, 0, { rir: 1, action: { type: 'hold' } })
    expect(R.active.entries[0].sets[0].rpe).toBe(9)
    expect(R.active.entries[0].sets[0].rir).toBeUndefined()
  })

  it('a reps change lands on the open sets only', () => {
    const S = session([row(0, 10, true), row(0, 10), row(0, 10)])
    S.active.entries[0].id = PUSHUP
    const r = applyCheckin(S, 0, 0, { rir: 4, action: { type: 'reps', reps: 12 } })
    expect(r.changed).toBe(true)
    expect(S.active.entries[0].sets.map(s => s.r)).toEqual([10, 12, 12])
  })

  it('hold and stop change no numbers', () => {
    const S = session([row(60, 5, true), row(60, 5)])
    expect(applyCheckin(S, 0, 0, { rir: 2, action: { type: 'stop' } }).changed).toBe(false)
    expect(S.active.entries[0].sets[1].w).toBe(60)
  })

  it('knows whether a work set is still open', () => {
    expect(hasOpenWork(session([row(60, 5, true), row(60, 5)]).active, 0)).toBe(true)
    expect(hasOpenWork(session([row(60, 5, true)]).active, 0)).toBe(false)
  })

  it('effortFields follows the profile’s scale', () => {
    expect(effortFields({ effort: 'rpe' }, 2)).toEqual({ rpe: 8 })
    expect(effortFields({}, 2)).toEqual({ rir: 2 })
    expect(effortFields({}, null)).toEqual({})
  })
})
