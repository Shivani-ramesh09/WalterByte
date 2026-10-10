// Campus happenings shown in Explore. Static for now.
// shortcut: hardcoded list, move to a backend collection when organisers need to post events themselves

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

export const HAPPENINGS = [
  {
    id: 'a-munso',
    title: 'A-MUNSO Mock MUN',
    venue: 'Gokul Krishna Hall',
    time: '9:00 AM – 5:00 PM',
    description: 'Mock United Nations session: committees, resolutions and debate.',
    interests: ['debate & mun'],
  },
  {
    id: 'hackathon',
    title: 'Hackathon',
    venue: 'Venue to be announced',
    time: '9:00 AM – 5:00 PM',
    description: 'Build something in a day with a team. Developers, designers and pitchers welcome.',
    interests: ['coding & hackathons', 'design', 'entrepreneurship'],
  },
]

/** Happenings matching any of the student's interests. */
export const forInterests = (interests = []) =>
  HAPPENINGS.filter((h) => h.interests.some((i) => interests.includes(i)))

/** Display label: "debate & mun" → "Debate & MUN". */
export const interestLabel = (i) =>
  i.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bMun\b/, 'MUN').replace(/\b3d\b/i, '3D')
