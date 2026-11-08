import { describe, expect, it } from 'vitest'
import { parseImport } from './import-csv.js'
import { routineFromSession } from './session-routines.js'

// Exports that name each row's kind as NORMAL_SET, WARMUP_SET, DROP_SET, FAILURE_SET, TOP_SET,
// LEFT_SET/RIGHT_SET, with the workout's length in "Duration" and the set's own in "Time".
const HEAD = 'Title,Date,Duration,Exercise,Superset id,Weight,Reps,Distance,Time,Set Type'
const file = rows => [HEAD, ...rows].join('\n')

describe('CSV with *_SET set types', () => {
  const p = parseImport(file([
    'Leg day 1,2026-11-08 00:30:17,02:00:14,Lever Leg Extension,,40.000,12,,,WARMUP_SET',
    'Leg day 1,2026-11-08 00:30:17,02:00:14,Lever Leg Extension,,80.000,10,,,NORMAL_SET',
    'Leg day 1,2026-11-08 00:30:17,02:00:14,Bulgarian Split Squat,,17.500,15,,,LEFT_SET',
    'Leg day 1,2026-11-08 00:30:17,02:00:14,Bulgarian Split Squat,,17.500,12,,,RIGHT_SET',
    'Leg day 1,2026-11-08 00:30:17,02:00:14,Bulgarian Split Squat,,22.500,12,,,LEFT_SET',
    'Leg day 1,2026-11-08 00:30:17,02:00:14,Bulgarian Split Squat,,22.500,10,,,RIGHT_SET',
    'Shoulders,2026-11-05 00:30:44,01:39:32,Lateral Raise,,12.500,10,null,null,NORMAL_SET',
    'Shoulders,2026-11-05 00:30:44,01:39:32,Lateral Raise,,7.500,10,null,null,DROP_SET',
    'Shoulders,2026-11-05 00:30:44,01:39:32,Lateral Raise,,5.000,10,null,null,DROP_SET',
    'Shoulders,2026-11-05 00:30:44,01:39:32,Lateral Raise,,12.500,8,null,null,FAILURE_SET',
    'Shoulders,2026-11-05 00:30:44,01:39:32,Lateral Raise,,14.000,6,null,null,TOP_SET',
    'Shoulders,2026-11-05 18:00:00,00:20:00,Lateral Raise,,10.000,12,,,NORMAL_SET',
  ]), { unit: 'kg' })
  const leg = p.workouts.find(w => w.name === 'Leg day 1')
  const sh = p.workouts.filter(w => w.d === '2026-11-05').sort((a, b) => a.start - b.start)

  it('takes the workout length from Duration, not as a set time', () => {
    expect(Math.round((leg.end - leg.start) / 60000)).toBe(120)
    expect(Math.round((sh[0].end - sh[0].start) / 60000)).toBe(100)
    expect(leg.entries.flatMap(e => e.sets).every(s => s.sec == null && s.min == null)).toBe(true)
  })

  it('pairs a LEFT_SET with the RIGHT_SET after it into one per-side set', () => {
    const bss = leg.entries.find(e => e.sets.some(s => s.sides)).sets
    expect(bss).toHaveLength(2)
    expect(bss[0].sides).toEqual({ L: { w: 17.5, r: 15, done: true }, R: { w: 17.5, r: 12, done: true } })
    expect(bss[1].sides.L.w).toBe(22.5)
    expect(leg.entries.find(e => e.sets.some(x => x.sides)).target).toEqual({ side: true })
    expect(leg.entries.find(e => !e.sets.some(x => x.sides)).target).toBeUndefined()
    // and Save as routine plans it per side, from the last set: 12 + 10 reps = 11 a side
    const r = routineFromSession(leg, 'Leg day 1')
    expect(r.ex.find(x => x.side)).toMatchObject({ side: true, sets: 2, reps: 22, weight: 22.5 })
  })

  it('an "EZ-bar Biceps Curl" is the EZ-bar curl, not the deadlift with a curl', () => {
    const q = parseImport([HEAD, 'Arms,2026-11-05 10:00:00,01:00:00,EZ-bar Biceps Curl,,15.000,12,,,NORMAL_SET'].join('\n'), { unit: 'kg' })
    expect(q.workouts[0].entries[0].id).toBe('0447')
  })

  it('reads warm-ups, drops under their set, failure and top sets', () => {
    const ext = leg.entries.find(e => e.sets.length === 2 && !e.sets[0].sides).sets
    expect(ext[0].phase).toBe('warmup')
    const lr = sh[0].entries[0].sets
    expect(lr).toHaveLength(3)
    expect(lr[0]).toMatchObject({ w: 12.5, r: 10, type: 'dropset', drops: [{ w: 7.5, r: 10 }, { w: 5, r: 10 }] })
    expect(lr[1]).toMatchObject({ w: 12.5, r: 8, failure: true })
    expect(lr[2]).toMatchObject({ w: 14, r: 6 })
    expect(lr[2].failure).toBeUndefined()
  })

  it('keeps two workouts on one day apart by their start', () => {
    expect(sh).toHaveLength(2)
    expect(sh[1].entries[0].sets).toHaveLength(1)
  })
})
