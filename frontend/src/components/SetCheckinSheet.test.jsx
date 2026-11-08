// @vitest-environment happy-dom
// The set check-in sheet: one tap on how the set felt, a coach line, and Apply changes only the
// sets still to do.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SetCheckin } from './SetCheckinSheet.jsx'
import { useUI } from '../store/useUI.js'
import { useStore } from '../store/useStore.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const coach = vi.hoisted(() => ({ open: vi.fn() }))
vi.mock('./WorkoutCoachSheet.jsx', () => ({ workoutCoachSheet: (...a) => coach.open(...a) }))

const BENCH = '0025'
const row = (w, r, done = false) => ({ w, r, done })
let host, root, originalS, close

const render = (props = {}) => act(() => root.render(<SetCheckin entryIdx={0} setIdx={0} activeId="a" close={close} {...props} />))
const chip = label => [...host.querySelectorAll('button.chip')].find(b => b.textContent.trim() === label)
const button = label => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === label)
const sets = () => useStore.getState().S.active.entries[0].sets

beforeEach(() => {
  originalS = useStore.getState().S
  useStore.setState({ S: {
    ...originalS, unit: 'kg', effort: 'none', exWeights: {}, workouts: [],
    active: { id: 'a', name: 'Push', start: Date.now(), cur: 0, entries: [
      { id: BENCH, target: { sets: 3, reps: 5, weight: 60 }, sets: [row(60, 5, true), row(60, 5), row(60, 5)] },
    ] },
  } })
  useUI.setState({ sheets: [] })
  close = vi.fn()
  coach.open.mockReset()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.render(null))
  useStore.setState({ S: originalS })
  host.remove()
})

describe('the set check-in', () => {
  it('asks how it felt, with nothing to apply until you answer', () => {
    render()
    expect(host.textContent).toContain('How did that feel?')
    expect(button('Got it').disabled).toBe(true)
  })

  it('an easy set offers more weight, and Apply puts it on the open sets only', () => {
    render()
    act(() => chip('Easy').click())
    expect(host.textContent).toMatch(/Next sets: [\d.]+ kg/)
    act(() => button('Apply').click())
    expect(sets()[0]).toMatchObject({ w: 60, rir: 4 })
    expect(sets()[1].w).toBeGreaterThan(60)
    expect(close).toHaveBeenCalled()
  })

  it('Keep as planned saves the rating and leaves the weights', () => {
    render()
    act(() => chip('Easy').click())
    act(() => button('Keep as planned').click())
    expect(sets()[0].rir).toBe(4)
    expect(sets()[1].w).toBe(60)
  })

  it('a solid set has nothing to change', () => {
    render()
    act(() => chip('Solid').click())
    expect(host.textContent).toContain('Right where you want it')
    act(() => button('Got it').click())
    expect(sets()[0].rir).toBe(2)
  })

  it('something hurt hands over to Ask the Coach when it is set up', () => {
    render({ canAskCoach: true })
    act(() => chip('Something hurt').click())
    expect(host.textContent).toContain('Pain is a signal')
    act(() => button('Ask the Coach').click())
    expect(coach.open).toHaveBeenCalledWith(0, { reason: 'pain' })
  })

  it('without the Coach, pain still says stop and changes nothing', () => {
    render()
    act(() => chip('Something hurt').click())
    expect(button('Ask the Coach')).toBeUndefined()
    act(() => button('Got it').click())
    expect(sets()[1].w).toBe(60)
  })

  it('Skip leaves the set unrated', () => {
    render()
    act(() => button('Skip').click())
    expect(sets()[0].rir).toBeUndefined()
    expect(close).toHaveBeenCalled()
  })
})
