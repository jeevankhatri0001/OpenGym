import { describe, expect, it } from 'vitest'
import { profileLines } from './coach.js'
import { cleanCompete } from './coach-compete.js'

describe('a competitor in the chat’s intake bubble', () => {
  it('names the division, the show, the body, the food and the posing, in the profile’s unit', () => {
    const compete = cleanCompete({ division: 'classic', federation: 'NatFed', showDate: '2027-05-16', heightCm: 175, weight: 172, age: 24,
      trainingYears: 3, diet: 'veg', meals: 4, foodNotes: 'no mushrooms', posing: 'never' })
    const lines = profileLines({ goal: 'compete', experience: 'regular', compete }, 'lb')
    expect(lines[0]).toBe('Compete in bodybuilding')
    expect(lines[1]).toBe('Classic Physique · NatFed')
    expect(lines[2]).toMatch(/^Show on .*2027/)
    expect(lines[3]).toBe('175 cm · 172 lb · 24 years old')
    expect(lines).toContain('Vegetarian · 4 meals a day')
    expect(lines).toContain('Food: no mushrooms')
    expect(lines).toContain('Posing: Never practised')
  })

  it('without a date says so, and another goal shows no competitor lines', () => {
    expect(profileLines({ goal: 'compete', compete: cleanCompete({ division: 'other' }) })).toContain('No show date yet')
    expect(profileLines({ goal: 'muscle', compete: cleanCompete({ division: 'classic' }) }).join(' ')).not.toMatch(/Classic/)
  })
})
