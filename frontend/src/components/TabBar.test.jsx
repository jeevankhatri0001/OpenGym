// @vitest-environment happy-dom
// The tab bar is fixed on screen and re-renders on every store write — once a second for the
// whole of a rest. Its buttons must survive that: a component declared inside the render body is
// a new function each time, which React reads as a different type and rebuilds from scratch.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TabBar from './TabBar.jsx'
import { DEF, useStore } from '../store/useStore.js'

const where = vi.hoisted(() => ({ loc: { pathname: '/home' } }))
vi.mock('react-router-dom', () => ({
  useNavigate: () => () => {},
  useLocation: () => where.loc,
}))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let host, root, originalS, originalUser

beforeEach(() => {
  const store = useStore.getState()
  originalS = store.S
  originalUser = store.user
  useStore.setState({ S: JSON.parse(JSON.stringify(DEF)), user: { id: 1, name: 'test' } })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  useStore.setState({ S: originalS, user: originalUser })
  where.loc = { pathname: '/home' }
})

const tabs = () => [...host.querySelectorAll('#tabbar button')]
// Start by what it is, not where: it moves to stay in the middle as module tabs come and go.
const startBtn = () => host.querySelector('#tabbar button[data-tour="start"]')

describe('the tab bar across a store write', () => {
  it('keeps the very same buttons instead of rebuilding them every tick', () => {
    act(() => { root.render(<TabBar onStart={() => {}} />) })
    const before = tabs()
    expect(before).toHaveLength(7)   // Nutrition's and the Coach's tabs too: a default profile has every module on

    // What a rest does once a second: S is replaced, so everything reading it re-renders.
    act(() => { useStore.getState().update(s => { s.restSec = 91 }, false) })

    const after = tabs()
    expect(after).toHaveLength(before.length)
    after.forEach((el, i) => expect(el).toBe(before[i]))
  })

  it('still lights the tab for the route it is on, and follows a change of state', () => {
    act(() => { root.render(<TabBar onStart={() => {}} />) })
    expect(tabs()[0].className).toBe('on')
    expect(tabs()[1].className).toBe('')
    expect(startBtn().className).toBe('start')

    act(() => { useStore.getState().update(s => { s.active = { id: 'a', entries: [], cur: 0 } }, false) })
    expect(startBtn().className).toBe('start rec')
    expect(tabs()[0].className).toBe('on')
  })
})

// Settings → "Show connection status" off (#369, #330): a stuck sync shows as a dot on Home, the
// tab Settings opens from, and the tab's name says it.
describe('the connection dot on Home', () => {
  const home = () => tabs()[0]
  it('is there for a sync problem only while the banner is switched off', () => {
    const original = useStore.getState().sync
    try {
      useStore.setState({ sync: { status: 'error', lastError: { status: 502 }, pending: true } })
      act(() => { root.render(<TabBar onStart={() => {}} />) })
      expect(home().querySelector('.tab-dot')).toBeNull()
      act(() => { useStore.getState().update(s => { s.connStatus = false }, false) })
      expect(home().querySelector('.tab-dot')).not.toBeNull()
      expect(home().getAttribute('aria-label')).toBe('Home, Connection problem')
      act(() => { useStore.setState({ sync: { status: 'ok', lastError: null, pending: false } }) })
      expect(home().querySelector('.tab-dot')).toBeNull()
      expect(home().getAttribute('aria-label')).toBeNull()
    } finally { useStore.setState({ sync: original }) }
  })
})

// v1.3.11 icon sweep: one icon per concept. Every tab carries its name under the icon, Start is a
// play button whether or not a session runs, and Exercises is the dumbbell (no more generic list).
describe('the tab icons and labels', () => {
  const icon = el => el.querySelector('svg')?.getAttribute('data-icon')
  const label = el => el.querySelector('span:last-child').textContent
  it('labels every tab and uses one icon per concept', () => {
    act(() => { root.render(<TabBar onStart={() => {}} />) })
    // Start in the middle: three tabs either side
    expect(tabs().map(icon)).toEqual(['house', 'calendar', 'apple', 'play', 'sparkles', 'chart', 'dumbbell'])
    expect(tabs().map(label)).toEqual(['Home', 'Plan', 'Nutrition', 'Start', 'Coach', 'Stats', 'Exercises'])

    act(() => { useStore.getState().update(s => { s.active = { id: 'a', entries: [], cur: 0 } }, false) })
    expect(icon(startBtn())).toBe('play')
    expect(label(startBtn())).toBe('Resume')
  })

  it('Nutrition is a tab while its module is on, lit on its own pages, gone when switched off', () => {
    where.loc = { pathname: '/nutrition/foods' }
    act(() => { root.render(<TabBar onStart={() => {}} />) })
    expect(tabs().find(b => label(b) === 'Nutrition').className).toBe('on')
    expect(tabs().find(b => label(b) === 'Home').className).toBe('')
    act(() => { useStore.getState().update(s => { s.modules = { nutrition: false } }, false) })
    expect(tabs().map(label)).toEqual(['Home', 'Plan', 'Start', 'Coach', 'Stats', 'Exercises'])
    act(() => { useStore.getState().update(s => { s.modules = { nutrition: false, coach: false } }, false) })
    expect(tabs().map(label)).toEqual(['Home', 'Plan', 'Start', 'Stats', 'Exercises'])
  })

  it('the Coach is a tab while its module is on, lit on its intake and setup too', () => {
    where.loc = { pathname: '/coach/intake' }
    act(() => { root.render(<TabBar onStart={() => {}} />) })
    expect(tabs().find(b => label(b) === 'Coach').className).toBe('on')
    expect(host.querySelector('#tabbar').className).toBe('many')
    act(() => { useStore.getState().update(s => { s.modules = { coach: false } }, false) })
    expect(tabs().some(b => label(b) === 'Coach')).toBe(false)
    expect(host.querySelector('#tabbar').className).toBe('')
  })

  it('shows a minimized session’s running time, still named Resume', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(2026, 9, 5, 18, 0, 0))
      act(() => { useStore.getState().update(s => { s.active = { id: 'a', entries: [], cur: 0, start: Date.now() - 754_000 } }, false) })
      act(() => { root.render(<TabBar onStart={() => {}} />) })
      const start = startBtn()
      expect(label(start)).toBe('12:34')
      expect(start.getAttribute('aria-label')).toBe('Resume')
      act(() => { vi.advanceTimersByTime(2000) })
      expect(label(start)).toBe('12:36')
      expect(startBtn()).toBe(start)   // the same button, only its text ticks

      // a past workout being edited has no clock running
      act(() => { useStore.getState().update(s => { s.active.editingWorkoutId = 'w1' }, false) })
      expect(label(startBtn())).toBe('Edit workout')
    } finally { vi.useRealTimers() }
  })
})

// A screen without a tab of its own keeps the tab it was opened from lit. Check-in, Progress photos
// and Body measurements lit none: Measurements moved under Stats (75a3b750) and the bar never heard.
describe('the tab a screen without its own lights', () => {
  const lit = () => tabs().filter(b => b.classList.contains('on')).map(b => b.textContent)
  it.each([
    ['/history', 'Stats'], ['/structural-balance', 'Stats'], ['/progress-photos', 'Stats'], ['/measurements', 'Stats'],
    ['/settings', 'Home'], ['/settings/units', 'Home'], ['/checkin', 'Home'], ['/muscles', 'Exercises'],
  ])('%s lights %s', (pathname, tab) => {
    where.loc = { pathname }
    act(() => { root.render(<TabBar onStart={() => {}} />) })
    expect(lit()).toEqual([tab])
  })

  it('Muscles opened from Stats lights Stats, the way its back button goes', () => {
    where.loc = { pathname: '/muscles', state: { from: '/stats' } }
    act(() => { root.render(<TabBar onStart={() => {}} />) })
    expect(lit()).toEqual(['Stats'])
  })
})
