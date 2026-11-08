import { describe, expect, it } from 'vitest'
import { STARTER_FOODS, STARTER_IDS, STARTER_VARIES, shouldSeed, starterFoodsToAdd } from './nutrition-seed.js'
import { cleanFood, foodProblems } from './nutrition.js'

describe('starter foods', () => {
  it('has the 21 foods asked for, each with a fixed, unique seed id', () => {
    expect(STARTER_FOODS).toHaveLength(21)
    expect(new Set(STARTER_IDS).size).toBe(21)
    for (const id of STARTER_IDS) expect(id).toMatch(/^seed:[a-z-]+$/)
    for (const id of STARTER_VARIES) expect(STARTER_IDS).toContain(id)
  })

  it('every one passes the same checks as a food typed in, and is stored the way the app stores it', () => {
    for (const f of STARTER_FOODS) {
      expect(foodProblems(f), f.id).toEqual([])
      expect(cleanFood(f), f.id).toEqual(f)
      expect(f).toMatchObject({ seed: true, isCustom: false, favourite: false })
      expect(f.servings?.length, f.id).toBeGreaterThan(0)
    }
  })

  it('the calories agree with the macros (4 / 4 / 9 kcal per gram), so no value is a typo', () => {
    // USDA works calories out with factors per food (tofu's 144 is 10 % under 4/4/9), so the check
    // allows 12 %: enough for that, far too little for a misplaced digit.
    for (const f of STARTER_FOODS) {
      const fromMacros = 4 * f.protein + 4 * f.carbs + 9 * f.fat
      expect(Math.abs(fromMacros - f.kcal), f.id).toBeLessThanOrEqual(Math.max(12, f.kcal * 0.12))
    }
  })

  it('the list cannot be changed from outside, and the copies handed out are fresh', () => {
    expect(Object.isFrozen(STARTER_FOODS)).toBe(true)
    const a = starterFoodsToAdd({})
    a[0].servings[0].g = 1
    expect(STARTER_FOODS[0].servings[0].g).not.toBe(1)
  })
})

describe('adding them', () => {
  it('an empty profile gets them all; a food already there is not added twice', () => {
    expect(shouldSeed({})).toBe(true)
    expect(starterFoodsToAdd({})).toHaveLength(21)
    const S = { foods: [{ id: 'seed:banana', name: 'My banana' }] }
    expect(shouldSeed(S)).toBe(false)
    expect(starterFoodsToAdd(S).map(f => f.id)).not.toContain('seed:banana')
    expect(starterFoodsToAdd(S)).toHaveLength(20)
  })

  it('a deleted starter food stays deleted unless asked for, and deleting them all keeps the list empty', () => {
    const S = { foods: [], deleted: { foods: { 'seed:paneer': 1000 } } }
    expect(shouldSeed(S)).toBe(false)
    expect(starterFoodsToAdd(S).map(f => f.id)).not.toContain('seed:paneer')
    expect(starterFoodsToAdd(S, { restoreDeleted: true }).map(f => f.id)).toContain('seed:paneer')
    // a removal taken back (negative stamp, lib/sync-merge.js stampDeletions) is not a removal
    expect(shouldSeed({ deleted: { foods: { 'seed:paneer': -1000 } } })).toBe(true)
  })

  it('only starter foods deleted count: a custom food deleted does not stop the seeding', () => {
    expect(shouldSeed({ foods: [], deleted: { foods: { mine: 1000 } } })).toBe(true)
  })
})
