// api/coach/core/nutrition.js repeats a few rules of the app's, because the api image cannot
// import the frontend: whether the Nutrition module is on, the daily targets and a day's totals.
// The two copies are held together here, over the same table, so they cannot drift.
import { describe, expect, it } from 'vitest'
import { isOn, MODULE_IDS } from './modules.js'
import { DEFAULT_TARGETS, NUTRIENTS, dailyTotals, targetsOf } from './nutrition.js'
import * as server from '../../../api/coach/core/nutrition.js'

const PROFILES = [
  {}, { modules: null }, { modules: 'junk' }, { checkIn: false },
  { modules: { nutrition: true } }, { modules: { nutrition: false } },
  { modules: { seasonal: false } }, { modules: { seasonal: false, nutrition: true } },
  { modules: { checkin: true }, checkIn: false }, { modules: { body: true, coach: true } },
  ...MODULE_IDS.filter(id => id !== 'nutrition').map(id => ({ modules: { [id]: false } })),
]

describe('the Coach’s copy of the Nutrition rules', () => {
  it('knows every other module the app has', () => {
    expect([...server.OTHER_MODULES].sort()).toEqual(MODULE_IDS.filter(id => id !== 'nutrition').sort())
  })

  it('says the module is on exactly when the app does', () => {
    for (const S of PROFILES) expect(server.nutritionOn(S), JSON.stringify(S)).toBe(isOn(S, 'nutrition'))
  })

  it('reads the targets the way the app does', () => {
    expect(server.DEFAULT_TARGETS).toEqual(DEFAULT_TARGETS)
    expect(server.NUTRIENT_KEYS).toEqual(NUTRIENTS)
    for (const nutritionTargets of [undefined, {}, { kcal: 2500 }, { kcal: '2400', protein: -1 }, { fat: 99999, fibre: 25.6 }, { carbs: null, kcal: 'x' }]) {
      expect(server.targetsOf({ nutritionTargets })).toEqual(targetsOf({ nutritionTargets }))
    }
  })

  it('sums a day the way the app does', () => {
    const log = [
      { d: '2026-07-27', n: { kcal: 190.4, protein: 6.5, carbs: 33, fat: 3.5, fibre: 5 } },
      { d: '2026-07-27', n: { kcal: '100', protein: -3, carbs: null, fat: 1.25 } },
      { d: '2026-07-26', n: { kcal: 500 } }, { d: 'bad', n: { kcal: 9 } }, null,
    ]
    const app = dailyTotals(log, '2026-07-27')
    const mine = server.dayTotals({ foodLog: log }, '2026-07-27', '2026-07-27')[0]
    for (const k of NUTRIENTS) expect(Math.round(mine[k] * 10) / 10, k).toBe(app[k])
  })
})
