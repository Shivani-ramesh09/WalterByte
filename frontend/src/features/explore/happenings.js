// Explore helpers. Events themselves come from the API (GET /events).

/** Interests a student picks at sign-up. Stored lowercase on the profile. */
export const INTERESTS = [
  'debate & mun',
  'coding & hackathons',
  'design',
  'photography & film',
  'music & dance',
  'sports',
  'robotics & 3d printing',
  'entrepreneurship',
]

/** Display label: "debate & mun" → "Debate & MUN". */
export const interestLabel = (i) =>
  i.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bMun\b/, 'MUN').replace(/\b3d\b/i, '3D')

/** Interests of the student that this event matches. */
export const matchedInterests = (event, interests = []) => event.interests.filter((i) => interests.includes(i))

/** "Matches your interest in Design" — or null when nothing matches. */
export function recommendationReason(event, interests) {
  const matched = matchedInterests(event, interests)
  if (!matched.length) return null
  const labels = matched.map(interestLabel)
  return `Matches your interest in ${labels.length > 1 ? `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}` : labels[0]}`
}

const fmtDay = (iso) => new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })

/** "Sat, 17 Oct · 9:00 am – 5:00 pm" */
export const whenLabel = (e) => `${fmtDay(e.start)} · ${fmtTime(e.start)} – ${fmtTime(e.end)}`
