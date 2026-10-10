// Campus happenings shown in Explore.
// shortcut: hardcoded sample list (dates to be confirmed with organisers), move to a backend collection so organisers can post events

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

export const HAPPENINGS = [
  {
    id: 'a-munso',
    title: 'A-MUNSO Mock MUN',
    venue: 'Gokul Krishna Hall',
    start: '2026-10-17T09:00:00+05:30',
    end: '2026-10-17T17:00:00+05:30',
    organiser: 'A-MUNSO',
    description: 'A full-day Mock United Nations: committee sessions, position papers, resolutions and debate. Open to first-timers.',
    interests: ['debate & mun'],
  },
  {
    id: 'hackathon',
    title: 'Hackathon',
    venue: 'Venue to be confirmed by organisers',
    start: '2026-10-24T09:00:00+05:30',
    end: '2026-10-24T17:00:00+05:30',
    organiser: 'Student tech clubs',
    description: 'Build something in a day with a team of up to four. Developers, designers and pitchers welcome; teams demo at 4:30 PM.',
    interests: ['coding & hackathons', 'design', 'entrepreneurship'],
  },
]

/** Events that have not ended yet, soonest first. */
export const upcoming = (now = new Date()) =>
  HAPPENINGS.filter((h) => new Date(h.end) > now).sort((a, b) => a.start.localeCompare(b.start))

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
