// The nutrition coach (lib/nutrition-coach.js): what it says about a day after food is added.
import { describe, it, expect } from 'vitest'
import { nutritionCoach, coachTargets, mealsLeft, mealBalance, proteinFood, lightFood, coachQuestion } from './nutrition-coach.js'
import { makeLogEntry } from './nutrition.js'

const D = '2026-11-08'
const TARGETS = { kcal: 2200, protein: 140, carbs: 250, fat: 70, fibre: 30 }
const CHICKEN = { id: 'chicken', name: 'Chicken breast', kcal: 120, protein: 23, carbs: 0, fat: 2.6, fibre: 0 }
const RICE = { id: 'rice', name: 'White rice, cooked', kcal: 130, protein: 2.7, carbs: 28, fat: 0.3, fibre: 0.4 }
const BUTTER = { id: 'butter', name: 'Butter', kcal: 717, protein: 0.9, carbs: 0.1, fat: 81, fibre: 0 }
const YOGHURT = { id: 'skyr', name: 'Skyr', kcal: 63, protein: 11, carbs: 4, fat: 0.2, fibre: 0 }
const OATS = { id: 'oats', name: 'Oats', kcal: 379, protein: 13, carbs: 68, fat: 6.5, fibre: 10 }
const FOODS = [CHICKEN, RICE, BUTTER, YOGHURT, OATS]

let n = 0
const eat = (food, grams, meal, at = 0) => makeLogEntry({ food, grams, meal, d: D, id: 'e' + (++n), at })
const ids = r => r.tips.map(x => x.id)

describe('coachTargets', () => {
  it('leans up on a training day and a little down on a rest day', () => {
    expect(coachTargets(TARGETS, { trained: true })).toMatchObject({ kcal: 2420, protein: 154, carbs: 300, fat: 70 })
    expect(coachTargets(TARGETS, { trained: false })).toMatchObject({ kcal: 2090, protein: 140, carbs: 225 })
  })
})

describe('mealsLeft', () => {
  it('counts the main meals still to come by the clock and what is logged', () => {
    expect(mealsLeft([], 8)).toBe(3)
    expect(mealsLeft([{ meal: 'breakfast' }], 9)).toBe(2)
    expect(mealsLeft([{ meal: 'breakfast' }, { meal: 'lunch' }], 13)).toBe(1)
    expect(mealsLeft([], 22)).toBe(0)
  })
  it('leaves room for a snack once the meals are done, until the day is over', () => {
    expect(mealsLeft([{ meal: 'breakfast' }, { meal: 'lunch' }, { meal: 'dinner' }], 19)).toBe(1)
  })
})

describe('mealBalance', () => {
  it('flags a meal that is mostly fat, mostly carbs, or short on protein', () => {
    expect(mealBalance({ kcal: 500, protein: 5, carbs: 10, fat: 50 })).toBe('mealFat')
    expect(mealBalance({ kcal: 500, protein: 8, carbs: 100, fat: 3 })).toBe('mealCarbs')
    expect(mealBalance({ kcal: 500, protein: 10, carbs: 60, fat: 20 })).toBe('mealProtein')
    expect(mealBalance({ kcal: 500, protein: 35, carbs: 50, fat: 15 })).toBeNull()
  })
  it('leaves a snack alone', () => {
    expect(mealBalance({ kcal: 150, protein: 0, carbs: 0, fat: 16 })).toBeNull()
  })
})

describe('food suggestions', () => {
  it('suggests a protein food from the list, favourites first, in a sensible amount', () => {
    expect(proteinFood(FOODS, 46)).toMatchObject({ id: 'chicken', grams: 200 })
    expect(proteinFood([CHICKEN, { ...YOGHURT, favourite: true }], 22)).toMatchObject({ id: 'skyr', grams: 200 })
    expect(proteinFood([RICE, BUTTER], 40)).toBeNull()
  })
  it('caps the amount at 400 g', () => {
    expect(proteinFood([CHICKEN], 200).grams).toBe(400)
  })
  it('suggests a light food for a tight meal', () => {
    // Lean and filling: chicken has the most protein for its calories; oats and butter are not light.
    expect(lightFood(FOODS, 250)).toMatchObject({ id: 'chicken', grams: 210 })
    expect(lightFood([OATS, BUTTER, { ...YOGHURT, favourite: true }, CHICKEN], 250)).toMatchObject({ id: 'skyr' })
  })
})

describe('nutritionCoach', () => {
  it('an empty day says what to aim for', () => {
    const r = nutritionCoach({ log: [], d: D, targets: TARGETS, hour: 8 })
    expect(r.tips).toEqual([{ id: 'empty', kcal: 2090, protein: 140 }])
  })

  it('paces the protein left over the meals to come, with a food that covers it', () => {
    const log = [eat(OATS, 80, 'breakfast')]
    const r = nutritionCoach({ log, d: D, targets: TARGETS, foods: FOODS, hour: 9, lastMeal: 'breakfast' })
    const p = r.tips.find(x => x.id === 'proteinPace')
    expect(p.meals).toBe(2)
    expect(p.perMeal).toBe(Math.ceil((140 - 10.4) / 2))
    expect(p.food.id).toBe('chicken')
  })

  it('says protein is done when it is within reach', () => {
    const log = [eat(CHICKEN, 600, 'lunch')]
    expect(ids(nutritionCoach({ log, d: D, targets: TARGETS, foods: FOODS, hour: 13 }))).toContain('proteinDone')
  })

  it('puts calories over first', () => {
    const log = [eat(BUTTER, 300, 'lunch')]
    const r = nutritionCoach({ log, d: D, targets: TARGETS, foods: FOODS, hour: 13, lastMeal: 'lunch' })
    expect(r.tips[0]).toEqual({ id: 'kcalOver', over: Math.round(2151 - 2090) })
    expect(ids(r)[1]).toBe('mealFat')
  })

  it('warns when eating ahead of the day', () => {
    const log = [eat(OATS, 400, 'lunch')]
    expect(ids(nutritionCoach({ log, d: D, targets: TARGETS, foods: FOODS, hour: 12 }))).toContain('kcalPace')
  })

  it('suggests a light meal when little room is left for the meals to come', () => {
    const log = [eat(OATS, 250, 'breakfast'), eat(CHICKEN, 300, 'lunch'), eat(RICE, 350, 'lunch')]
    const r = nutritionCoach({ log, d: D, targets: TARGETS, foods: FOODS, hour: 16 })
    const t = r.tips.find(x => x.id === 'kcalTight')
    expect(t).toBeTruthy()
    expect(t.food.kcal).toBeLessThanOrEqual(Math.max(t.perMeal, 0) + 20)
    expect(['chicken', 'skyr']).toContain(t.food.id)
  })

  it('flags low fibre in the evening, not in the morning', () => {
    const log = [eat(CHICKEN, 200, 'lunch')]
    expect(ids(nutritionCoach({ log, d: D, targets: TARGETS, foods: FOODS, hour: 18 }))).toContain('fibreLow')
    expect(ids(nutritionCoach({ log, d: D, targets: TARGETS, foods: FOODS, hour: 9 }))).not.toContain('fibreLow')
  })

  it('names a training day with its raised targets', () => {
    const log = [eat(OATS, 80, 'breakfast')]
    const r = nutritionCoach({ log, d: D, targets: TARGETS, foods: FOODS, hour: 9, trained: true })
    expect(r.tips.find(x => x.id === 'trainingDay')).toMatchObject({ kcal: 2420, protein: 154, carbs: 300 })
    expect(r.tips.find(x => x.id === 'proteinPace').left).toBe(Math.round(154 - 10.4))
  })

  it('a past day plans no meals', () => {
    const log = [eat(OATS, 80, 'breakfast')]
    const r = nutritionCoach({ log, d: D, targets: TARGETS, foods: FOODS, hour: 24 })
    expect(ids(r)).toContain('proteinShort')
    expect(ids(r)).not.toContain('proteinPace')
  })
})

describe('coachQuestion', () => {
  it('sums the day for the AI Coach', () => {
    const log = [eat(CHICKEN, 200, 'lunch')]
    const q = coachQuestion({ log, d: D, targets: TARGETS, trained: true })
    expect(q.ate).toBe('Chicken breast 200 g (lunch)')
    expect(q.totals).toMatchObject({ kcal: 240, protein: 46 })
    expect(q.targets.kcal).toBe(2420)
  })
})
