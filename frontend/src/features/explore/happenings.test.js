import { describe, expect, it } from 'vitest'
import { HAPPENINGS, interestLabel, recommendationReason, upcoming } from './happenings'
import { gigReason, personReason } from '../connect/reasons'

const mun = HAPPENINGS.find((h) => h.id === 'a-munso')
const hack = HAPPENINGS.find((h) => h.id === 'hackathon')

describe('Explore happenings', () => {
  it('hides events that have ended', () => {
    expect(upcoming(new Date('2026-10-01T00:00:00+05:30')).map((h) => h.id)).toEqual(['a-munso', 'hackathon'])
    expect(upcoming(new Date('2026-10-20T00:00:00+05:30')).map((h) => h.id)).toEqual(['hackathon'])
    expect(upcoming(new Date('2026-12-01T00:00:00+05:30'))).toEqual([])
  })

  it('explains why an event is recommended', () => {
    expect(recommendationReason(mun, ['debate & mun'])).toBe('Matches your interest in Debate & MUN')
    expect(recommendationReason(hack, ['design', 'entrepreneurship'])).toBe('Matches your interest in Design and Entrepreneurship')
    expect(recommendationReason(mun, ['sports'])).toBeNull()
  })

  it('formats interest labels', () => {
    expect(interestLabel('robotics & 3d printing')).toBe('Robotics & 3D Printing')
  })
})

describe('Connect reasons', () => {
  it('matches gigs to interests', () => {
    expect(gigReason({ skill: 'photography' }, { interests: ['photography & film'] })).toBe('Matches your interest in Photography & Film')
    expect(gigReason({ skill: 'ui design' }, { interests: ['design'] })).toBe('Matches your interest in Design')
    expect(gigReason({ skill: 'video editing' }, { interests: ['sports'] })).toBeNull()
  })

  it('explains people matches', () => {
    const person = { skills: ['react', 'python', 'figma'], interests: ['design'] }
    expect(personReason(person, {}, 'react')).toBe("Has react, the skill you're looking for")
    expect(personReason(person, { skills: ['react', 'python'] })).toBe('Shares 2 skills with you: react, python')
    expect(personReason(person, { interests: ['design'] })).toBe('You both like Design')
    expect(personReason(person, { skills: ['go'] })).toBeNull()
  })
})
