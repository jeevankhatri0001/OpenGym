// @vitest-environment happy-dom
/* The grams input keeps nothing of its own: the value comes in by props, every change goes out by
 * onChange(grams, how). That is what lets a kitchen scale drive it later (docs/NUTRITION.md). */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GramsInput from './GramsInput.jsx'

let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })

const draw = props => act(() => root.render(<GramsInput {...props} />))
const input = () => host.querySelector('.grams-input input')
const chip = text => [...host.querySelectorAll('.chip')].find(b => b.textContent.replace(/\s+/g, ' ').trim() === text)
const type = v => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input(), v)
  input().dispatchEvent(new Event('input', { bubbles: true }))
})

describe('GramsInput', () => {
  it('says what set the grams: typed, a quick amount or a serving', () => {
    const onChange = vi.fn()
    draw({ value: null, onChange, servings: [{ label: '1 egg', g: 50 }] })
    type('72.5')
    act(() => chip('100 g').click())
    act(() => chip('1 egg 50 g').click())
    expect(onChange.mock.calls).toEqual([[72.5, 'typed'], [100, 'quick'], [50, 'serving']])
  })

  it('shows whatever value it is given, as a scale reading would arrive, and marks a matching chip', () => {
    draw({ value: 100, onChange: () => {} })
    expect(input().value).toBe('100')
    expect(chip('100 g').className).toContain('on')
    draw({ value: 183.4, onChange: () => {} })            // a new reading pushed in from outside
    expect(input().value).toBe('183.4')
    expect(host.querySelector('.chip.on')).toBe(null)
  })

  it('caps a typed amount at the most one entry can hold, and an emptied field is null', () => {
    const onChange = vi.fn()
    draw({ value: 10, onChange })
    type('99999')
    type('')
    expect(onChange.mock.calls).toEqual([[5000, 'typed'], [null, 'typed']])
  })
})
