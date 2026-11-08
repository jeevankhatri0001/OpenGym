// @vitest-environment happy-dom
/* The nutrition coach on screen: the card under the day's totals, the check-in line after food is
 * added, and Ask the Coach opening the chat with the day as a question. The rules themselves are
 * lib/nutrition-coach.test.js's.
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api.js', async importOriginal => ({ ...(await importOriginal()), api: vi.fn(() => Promise.reject(new Error('offline'))), beacon: vi.fn() }))
const gate = vi.hoisted(() => ({ ok: false }))
vi.mock('../lib/use-coach-gate.js', () => ({ useCoachGate: () => ({ known: true, ok: gate.ok }) }))
const navTo = vi.hoisted(() => vi.fn())
vi.mock('../lib/nav.js', async importOriginal => { const real = await importOriginal(); real.setNav(navTo); return real })

import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { todayISO } from '../lib/format.js'
import { addDays } from '../lib/nutrition.js'
import Nutrition, { addFoodSheet } from '../views/Nutrition.jsx'
import { askText, trainedOn, tipLine } from './NutritionCoach.jsx'
import { CONSENT_VERSION } from '../lib/coach.js'

const clone = v => JSON.parse(JSON.stringify(v))
const mounted = []
function render(el) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(<MemoryRouter initialEntries={['/nutrition']}>{el}</MemoryRouter>))
  return host
}
const topSheet = () => { const s = useUI.getState().sheets.at(-1); return s ? render(s.render(() => useUI.getState().closeSheet(s.id))) : null }
const button = (host, text) => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === text)
const S = () => useStore.getState().S

const CHICKEN = { id: 'chicken', name: 'Chicken breast', kcal: 120, protein: 23, carbs: 0, fat: 2.6, fibre: 0, isCustom: true, favourite: true }
const entry = (over = {}) => ({ id: 'e1', foodId: 'chicken', name: 'Chicken breast', d: todayISO(), grams: 100, meal: 'lunch', loggedAt: 1, source: 'manual', n: { kcal: 120, protein: 23, carbs: 0, fat: 2.6, fibre: 0 }, ...over })

function seed(extra = {}) {
  useStore.setState({ S: Object.assign(clone(DEF), { foods: [clone(CHICKEN)], foodLog: [], workouts: [], nutritionTargets: { kcal: 2200, protein: 140, carbs: 250, fat: 70, fibre: 30 } }, extra), user: null })
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  useUI.setState({ sheets: [], toastMsg: '', toastAction: null })
  document.body.innerHTML = ''
  gate.ok = false
  navTo.mockReset()
})
afterEach(() => { act(() => { mounted.splice(0).forEach(r => r.unmount()) }) })

describe('the coach card', () => {
  it('on an empty day, says what to aim for', () => {
    seed()
    const screen = render(<Nutrition />)
    expect(screen.querySelector('.nut-coach').textContent).toMatch(/Nothing logged yet\. Today aim for about 2,?090 kcal and 140 g protein/)
  })

  it('paces the protein left with a food from the list', () => {
    seed({ foodLog: [entry()] })
    const screen = render(<Nutrition />)
    expect(screen.querySelector('.nut-coach').textContent).toMatch(/117 g protein left/)
    expect(screen.querySelector('.nut-coach').textContent).toMatch(/Chicken breast/)
  })

  it('shows Ask the Coach only when the AI Coach is set up and agreed to', () => {
    seed()
    expect(button(render(<Nutrition />).querySelector('.nut-coach'), 'Ask the Coach')).toBeUndefined()
    gate.ok = true
    seed({ coach: { consent: { agreedAt: 1, version: CONSENT_VERSION } } })
    const card = render(<Nutrition />).querySelectorAll('.nut-coach')
    const ask = button(card[card.length - 1], 'Ask the Coach')
    expect(ask).toBeTruthy()
    act(() => ask.click())
    expect(navTo.mock.calls[0][0]).toMatch(/^\/coach\?ask=/)
  })
})

describe('the check-in after adding food', () => {
  it('the toast names the food and the coach’s first tip, with More for the rest', () => {
    seed()
    render(<Nutrition />)
    act(() => addFoodSheet(todayISO(), 'lunch'))
    const sheet = topSheet()
    act(() => { sheet.querySelector('.nut-food').click() })
    act(() => { button(sheet, 'Add to Lunch').click() })
    expect(S().foodLog).toHaveLength(1)
    const ui = useUI.getState()
    expect(ui.toastMsg).toMatch(/^Chicken breast added\. /)
    expect(ui.toastMsg).toMatch(/protein left/)
    expect(ui.toastAction.label).toBe('More')
    act(() => useUI.getState().runToastAction())
    const more = topSheet()
    expect(more.textContent).toContain('Your day so far')
  })
})

describe('helpers', () => {
  it('a workout logged that day, or one running today, makes it a training day', () => {
    expect(trainedOn({ workouts: [{ d: todayISO() }] }, todayISO())).toBe(true)
    expect(trainedOn({ workouts: [], active: { id: 'a' } }, todayISO())).toBe(true)
    expect(trainedOn({ workouts: [{ d: addDays(todayISO(), -1) }] }, todayISO())).toBe(false)
  })

  it('the question for the AI Coach carries the day and the targets', () => {
    seed({ foodLog: [entry()] })
    const q = askText(S(), todayISO())
    expect(q).toContain('Chicken breast 100 g (lunch)')
    expect(q).toContain('120 kcal, 23 g protein')
    expect(q).toContain('It was a rest day.')
    expect(q).toMatch(/rest of the day\?$/)
  })

  it('words every tip', () => {
    for (const id of ['kcalOver', 'mealFat', 'mealCarbs', 'mealProtein', 'proteinDone', 'proteinShort', 'kcalPace', 'fibreLow', 'trainingDay', 'restDay', 'kcalLeft'])
      expect(tipLine({ id, over: 1, meal: 'lunch', eaten: 1, left: 1, kcal: 1, protein: 1, carbs: 1 })).not.toBe('')
  })
})
