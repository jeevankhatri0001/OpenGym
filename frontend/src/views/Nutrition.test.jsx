// @vitest-environment happy-dom
/* Nutrition used the way a person uses it: add a food to a meal in a few taps, correct the grams,
 * delete it and take that back, look at another day, keep a food library and read the week.
 * The numbers themselves are lib/nutrition.test.js's; this checks the screens write them right.
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api.js', async importOriginal => ({ ...(await importOriginal()), api: vi.fn(() => Promise.reject(new Error('offline'))), beacon: vi.fn() }))

import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { todayISO } from '../lib/format.js'
import { addDays } from '../lib/nutrition.js'
import Nutrition, { NutritionFoods, NutritionHistory, addFoodSheet, foodFormSheet, mealNow } from './Nutrition.jsx'
import NutritionTargetsPage from './NutritionTargets.jsx'

const clone = v => JSON.parse(JSON.stringify(v))
const mounted = []
function render(el, path = '/nutrition') {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(<MemoryRouter initialEntries={[path]}>{el}</MemoryRouter>))
  return host
}
const topSheet = () => { const s = useUI.getState().sheets.at(-1); return s ? render(s.render(() => useUI.getState().closeSheet(s.id))) : null }
const setValue = (input, v) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, v)
  input.dispatchEvent(new Event('input', { bubbles: true }))
})
const button = (host, text) => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === text)
const click = (host, text) => act(() => { button(host, text).click() })
const S = () => useStore.getState().S

const OATS = { id: 'oats', name: 'Oats', kcal: 380, protein: 13, carbs: 66, fat: 7, fibre: 10, isCustom: true, favourite: false }
const EGG = { id: 'egg', name: 'Egg, whole', kcal: 143, protein: 12.6, carbs: 0.7, fat: 9.5, fibre: 0, servings: [{ label: '1 egg', g: 50 }], isCustom: true, favourite: true }
const entry = (over = {}) => ({ id: 'e1', foodId: 'oats', name: 'Oats', d: todayISO(), grams: 50, meal: 'breakfast', loggedAt: 1, source: 'manual', n: { kcal: 190, protein: 6.5, carbs: 33, fat: 3.5, fibre: 5 }, ...over })

function seed(extra = {}) {
  useStore.setState({ S: Object.assign(clone(DEF), { foods: [clone(OATS), clone(EGG)], foodLog: [] }, extra), user: null })
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  useUI.setState({ sheets: [], toastMsg: '', toastAction: null })
  document.body.innerHTML = ''
})
afterEach(() => { act(() => { mounted.splice(0).forEach(r => r.unmount()) }) })

describe('adding food', () => {
  it('pick a food, a quick amount and Add: a manual entry with its nutrients taken now', () => {
    seed()
    const screen = render(<Nutrition />)
    act(() => addFoodSheet(todayISO(), 'lunch'))
    let sheet = topSheet()
    act(() => { sheet.querySelector('.nut-food').click() })      // the favourite (Egg) comes first
    expect(sheet.querySelector('h3').textContent).toBe('Egg, whole')
    expect(sheet.querySelector('.grams-input input').value).toBe('50')   // its first serving
    click(sheet, '150 g')
    expect(sheet.querySelector('.nut-preview').textContent).toMatch(/215/)   // 143 × 1.5 = 214.5
    click(sheet, 'Add to Lunch')
    expect(S().foodLog).toHaveLength(1)
    expect(S().foodLog[0]).toMatchObject({ foodId: 'egg', name: 'Egg, whole', d: todayISO(), grams: 150, meal: 'lunch', source: 'manual', n: { kcal: 214.5, protein: 18.9 } })
    expect(screen.textContent).toContain('Egg, whole')
    expect(screen.textContent).toMatch(/215\s*kcal/)
  })

  it('search narrows the list, and a typed amount is used as it is', () => {
    seed()
    act(() => addFoodSheet())
    let sheet = topSheet()
    setValue(sheet.querySelector('input'), 'oat')
    const names = [...sheet.querySelectorAll('.nut-food .lrow-t')].map(x => x.textContent)
    expect(names).toEqual(['Oats'])
    act(() => { sheet.querySelector('.nut-food').click() })
    setValue(sheet.querySelector('.grams-input input'), '42.5')
    act(() => { [...sheet.querySelectorAll('.btn')].find(b => /^Add to/.test(b.textContent)).click() })
    expect(S().foodLog[0].grams).toBe(42.5)
    expect(S().foodLog[0].meal).toBe(mealNow())
  })

  it('a food logged before shows under Recent, and nothing is saved without grams', () => {
    seed({ foodLog: [entry()] })
    act(() => addFoodSheet())
    let sheet = topSheet()
    expect([...sheet.querySelectorAll('.sect-t')].map(x => x.textContent)).toEqual(['Favourites', 'Recent'])
    act(() => { [...sheet.querySelectorAll('.nut-food')].find(b => b.textContent.includes('Oats')).click() })
    setValue(sheet.querySelector('.grams-input input'), '')
    expect([...sheet.querySelectorAll('.btn')].find(b => /^Add to/.test(b.textContent)).disabled).toBe(true)
    expect(S().foodLog).toHaveLength(1)
  })
})

describe('the day', () => {
  it('totals the day against the targets and groups the entries by meal', () => {
    seed({ foodLog: [entry(), entry({ id: 'e2', meal: 'dinner', grams: 100, n: { kcal: 380, protein: 13, carbs: 66, fat: 7, fibre: 10 } })], nutritionTargets: { kcal: 2000 } })
    const screen = render(<Nutrition />)
    expect(screen.querySelector('.nut-today .big').textContent).toMatch(/570/)
    expect(screen.textContent).toMatch(/1,?430 kcal left/)
    const meals = [...screen.querySelectorAll('.nut-meal')]
    expect(meals[0].textContent).toMatch(/Breakfast · 190 kcal/)
    expect(meals[2].textContent).toMatch(/Dinner · 380 kcal/)
    expect(screen.querySelector('.nut-bars').textContent).toMatch(/570 \/ 2,?000/)
  })

  it('the date switcher shows yesterday on its own, and Today has no next day', () => {
    const y = addDays(todayISO(), -1)
    seed({ foodLog: [entry(), entry({ id: 'old', d: y, name: 'Rice', n: { kcal: 260, protein: 5, carbs: 57, fat: 0.6, fibre: 0.8 } })] })
    let screen = render(<Nutrition />)
    expect(screen.querySelector('.nut-day-t').textContent).toBe('Today')
    expect(screen.querySelector('[aria-label="Next day"]').disabled).toBe(true)
    act(() => { screen.querySelector('[aria-label="Previous day"]').click() })
    expect(screen.querySelector('.nut-day-t').textContent).toBe('Yesterday')
    expect(screen.textContent).toContain('Rice')
    expect(screen.textContent).not.toContain('Oats')
    screen = render(<Nutrition />, '/nutrition?d=' + y)
    expect(screen.textContent).toContain('Rice')
  })

  it('a future day in the address falls back to today', () => {
    seed({ foodLog: [entry()] })
    const screen = render(<Nutrition />, '/nutrition?d=' + addDays(todayISO(), 3))
    expect(screen.querySelector('.nut-day-t').textContent).toBe('Today')
  })

  it('editing an entry scales its own snapshot, not the food as it is now', () => {
    seed({ foodLog: [entry()] })
    useStore.getState().update(s => { s.foods[0].kcal = 999 })   // the food changed since
    const screen = render(<Nutrition />)
    act(() => { screen.querySelector('.nut-entry').click() })
    let sheet = topSheet()
    click(sheet, '100 g')
    act(() => { [...sheet.querySelectorAll('.seg button, [role="radio"], button')].find(b => b.textContent.trim() === 'Snack').click() })
    click(sheet, 'Save')
    expect(S().foodLog[0]).toMatchObject({ grams: 100, meal: 'snack', n: { kcal: 380, protein: 13 } })
  })

  it('delete, then Undo: the entry is back, and the removal was on record meanwhile', () => {
    seed({ foodLog: [entry()] })
    const screen = render(<Nutrition />)
    act(() => { screen.querySelector('.nut-entry').click() })
    click(topSheet(), 'Delete')
    expect(S().foodLog).toHaveLength(0)
    expect(S().deleted?.foodLog?.e1).toBeGreaterThan(0)
    expect(useUI.getState().toastAction?.label).toBe('Undo')
    act(() => useUI.getState().runToastAction())
    expect(S().foodLog.map(e => e.id)).toEqual(['e1'])
    expect(screen.textContent).toContain('Oats')
  })

  it('each entry sits in a swipe row, which deletes it', () => {
    seed({ foodLog: [entry()] })
    const screen = render(<Nutrition />)
    expect(screen.querySelector('.swrow .nut-entry')).toBeTruthy()
    expect(screen.querySelector('.swpane.del').textContent).toContain('Delete')
  })
})

describe('the foods', () => {
  it('a new food is checked before it is saved', () => {
    seed()
    act(() => foodFormSheet())
    let sheet = topSheet()
    click(sheet, 'Save')
    expect(sheet.querySelector('.nut-problems').textContent).toContain('Give the food a name.')
    expect(S().foods).toHaveLength(2)
    setValue(sheet.querySelector('input[aria-label="Name"]'), 'Paneer')
    const nums = [...sheet.querySelectorAll('.nut-form input')]
    ;['321', '25', '3.6', '25', '0'].forEach((v, i) => setValue(nums[i], v))
    click(sheet, 'Add serving')
    const row = sheet.querySelector('.nut-serving')
    setValue(row.querySelector('input'), '1 cube')
    setValue(row.querySelector('.measure-input input'), '20')
    click(sheet, 'Save')
    const p = S().foods.find(f => f.name === 'Paneer')
    expect(p).toMatchObject({ kcal: 321, protein: 25, carbs: 3.6, fat: 25, fibre: 0, isCustom: true, servings: [{ label: '1 cube', g: 20 }] })
  })

  it('macros over 100 g per 100 g are refused', () => {
    seed()
    act(() => foodFormSheet())
    let sheet = topSheet()
    setValue(sheet.querySelector('input[aria-label="Name"]'), 'Typo')
    const nums = [...sheet.querySelectorAll('.nut-form input')]
    ;['500', '60', '60', '10', '0'].forEach((v, i) => setValue(nums[i], v))
    click(sheet, 'Save')
    expect(sheet.textContent).toContain('add up to more than 100 g')
    expect(S().foods.some(f => f.name === 'Typo')).toBe(false)
  })

  it('editing a food keeps what was logged, and the library stars and deletes with Undo', () => {
    seed({ foodLog: [entry()] })
    act(() => foodFormSheet('oats'))
    let sheet = topSheet()
    setValue(sheet.querySelector('.nut-form input'), '400')
    click(sheet, 'Save')
    expect(S().foods.find(f => f.id === 'oats').kcal).toBe(400)
    expect(S().foodLog[0].n.kcal).toBe(190)

    const lib = render(<NutritionFoods />, '/nutrition/foods')
    act(() => { lib.querySelector('[aria-label="Add to favourites"]').click() })
    expect(S().foods.find(f => f.id === 'oats').favourite).toBe(true)
    act(() => foodFormSheet('egg'))
    click(topSheet(), 'Delete food')
    click(topSheet(), 'Delete')                                 // the confirmation
    expect(S().foods).toHaveLength(1)
    expect(lib.textContent).not.toContain('Egg, whole')
    act(() => useUI.getState().runToastAction())
    expect(S().foods).toHaveLength(2)
  })
})

describe('history and targets', () => {
  it('seven days with an average over the days logged', () => {
    const d = todayISO()
    seed({ foodLog: [entry({ n: { kcal: 2000, protein: 100, carbs: 200, fat: 60, fibre: 20 } }), entry({ id: 'e2', d: addDays(d, -2), n: { kcal: 1000, protein: 50, carbs: 100, fat: 30, fibre: 10 } })] })
    const screen = render(<NutritionHistory />, '/nutrition/history')
    expect(screen.querySelectorAll('.nut-bars .sbar-row')).toHaveLength(7)
    expect(screen.querySelector('.big').textContent).toMatch(/1,?500/)
    expect(screen.textContent).toContain('Average of the 2 days you logged')
    expect(screen.querySelectorAll('.sect-b .lrow')).toHaveLength(2)
  })

  it('the target button opens the targets right on the Nutrition tab, as a sheet', () => {
    seed()
    const screen = render(<Nutrition />)
    expect(screen.querySelector('.hdr [data-back]')).toBe(null)          // a tab of its own: no back button
    act(() => { screen.querySelector('[aria-label="Daily targets"]').click() })
    const sheet = topSheet()
    setValue(sheet.querySelector('input[aria-label="Calories"]'), '2400')
    expect(S().nutritionTargets.kcal).toBe(2400)
    expect(screen.textContent).toMatch(/2,?400/)
  })

  it('targets are set one at a time, and an empty field goes back to the default', () => {
    seed()
    const page = render(<NutritionTargetsPage />, '/settings/nutrition')
    setValue(page.querySelector('input[aria-label="Protein"]'), '160')
    expect(S().nutritionTargets.protein).toBe(160)
    setValue(page.querySelector('input[aria-label="Protein"]'), '')
    expect(S().nutritionTargets.protein).toBe(null)
    setValue(page.querySelector('input[aria-label="Calories"]'), '2500')
    click(page, 'Back to the defaults')
    expect(S().nutritionTargets).toEqual({ kcal: null, protein: null, carbs: null, fat: null, fibre: null })
  })
})

describe('starter foods', () => {
  it('go in on the first visit, once, and a deleted one does not come back', () => {
    seed({ foods: [] })
    render(<Nutrition />)
    expect(S().foods).toHaveLength(21)
    expect(S().foods.every(f => f.seed && f.id.startsWith('seed:'))).toBe(true)
    useStore.getState().update(s => { s.foods = s.foods.filter(f => f.id !== 'seed:paneer') })
    render(<Nutrition />)
    expect(S().foods).toHaveLength(20)
    useStore.getState().update(s => { s.foods = [] })     // all deleted: the list stays empty
    render(<Nutrition />)
    expect(S().foods).toHaveLength(0)
  })

  it('a profile that already has foods gets none by itself; the library offers them, deleted ones too', () => {
    seed({ deleted: { foods: { 'seed:paneer': 5 } } })
    render(<Nutrition />)
    expect(S().foods).toHaveLength(2)
    const lib = render(<NutritionFoods />, '/nutrition/foods')
    expect(lib.textContent).toContain('Add 21 starter foods')
    click(lib, 'Add 21 starter foods')
    expect(S().foods).toHaveLength(23)
    expect(S().foods.some(f => f.id === 'seed:paneer')).toBe(true)
    expect(lib.textContent).not.toContain('starter foods')
    expect(lib.textContent).toMatch(/Paneer.*approximate/)
  })

  it('a starter food says its values are approximate, and which to check against the packaging', () => {
    seed({ foods: [] })
    render(<Nutrition />)
    act(() => foodFormSheet('seed:whey'))
    expect(topSheet().textContent).toContain('copy the numbers from your packaging')
    act(() => foodFormSheet('seed:banana'))
    expect(topSheet().textContent).toContain('approximate values from USDA FoodData Central')
  })
})
