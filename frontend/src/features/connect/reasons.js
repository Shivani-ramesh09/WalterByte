import { interestLabel } from '../explore/happenings'

// Short "why you're seeing this" lines for Connect cards.

const interestWords = (interest) => interest.split('&').map((w) => w.trim()).filter((w) => w.length > 2 && w !== 'mun')

/** "Matches your interest in Photography & Film" when the gig's skill fits an interest. */
export function gigReason(gig, profile) {
  const hit = (profile?.interests || []).find((i) => interestWords(i).some((w) => gig.skill.includes(w) || w.includes(gig.skill)))
  return hit ? `Matches your interest in ${interestLabel(hit)}` : null
}

/** Why a person card is relevant: the skill you filtered by, or what you have in common. */
export function personReason(person, profile, skillFilter) {
  if (skillFilter && person.skills.includes(skillFilter)) return `Has ${skillFilter}, the skill you're looking for`
  const sharedSkills = person.skills.filter((s) => (profile?.skills || []).includes(s))
  if (sharedSkills.length >= 2) return `Shares ${sharedSkills.length} skills with you: ${sharedSkills.slice(0, 2).join(', ')}`
  const sharedInterests = (person.interests || []).filter((i) => (profile?.interests || []).includes(i))
  if (sharedInterests.length) return `You both like ${interestLabel(sharedInterests[0])}`
  if (sharedSkills.length) return `You both know ${sharedSkills[0]}`
  return null
}
