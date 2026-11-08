// @vitest-environment happy-dom
// The Coach tab before the Coach is set up: it says what is missing and how to fix it, instead of
// sending the tap back to Home without a word (which read as the tab being broken).
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const nav = vi.hoisted(() => vi.fn())
vi.mock('react-router-dom', async importOriginal => ({ ...(await importOriginal()), useNavigate: () => nav }))
vi.mock('../coach.css', () => ({}))

import { CoachUnavailable } from './CoachChat.jsx'

let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  nav.mockReset()
})
afterEach(() => { act(() => root.unmount()); host.remove() })
const draw = user => act(() => root.render(<CoachUnavailable user={user} />))
const button = () => host.querySelector('.empty-acts button')

describe('the Coach tab before the Coach is set up', () => {
  it('the admin gets a button straight to the AI Coach card', () => {
    draw({ id: 'u1', name: 'Jeevan', admin: true })
    expect(host.textContent).toContain('Connect an AI account')
    act(() => button().click())
    expect(nav).toHaveBeenCalledWith('/admin', { state: { section: 'coach' } })
  })

  it('anyone else is told to ask their admin, with nothing to press', () => {
    draw({ id: 'u2', name: 'Guest friend' })
    expect(host.textContent).toContain('not switched on yet')
    expect(button()).toBe(null)
  })

  it('without a profile, to sign in', () => {
    draw(null)
    expect(host.textContent).toContain('Sign in to use the Coach')
  })

  it('never sends you anywhere by itself', () => {
    draw({ id: 'u1', admin: true })
    expect(nav).not.toHaveBeenCalled()
  })
})
