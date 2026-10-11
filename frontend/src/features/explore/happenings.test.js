import { describe, expect, it } from 'vitest'
import { interestLabel, recommendationReason } from './happenings'
import { gigReason, personReason } from '../connect/reasons'

const mun = { id: 'a-munso', interests: ['debate & mun'] }
const hack = { id: 'hackathon', interests: ['coding & hackathons', 'design', 'entrepreneurship'] }

describe('Explore happenings', () => {
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
