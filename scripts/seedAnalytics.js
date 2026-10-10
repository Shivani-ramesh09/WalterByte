// scripts/seedAnalytics.js
// SYNTHETIC demonstration data for the Explore and Connect administration
// dashboards. Emulator only: every document carries synthetic: true and the
// dashboard labels it. These are NOT real Amrita statistics.
//
// Deterministic: a fixed-seed PRNG drives every choice, and dates are offsets
// from the day the seed runs, so trends always land in "the last 30 days".
// Re-running replaces the synthetic documents (deterministic ids).

const SEED = 20261011;

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 24 * 60 * 60 * 1000;

export const organisations = [
  { id: 'a-munso', name: 'Amrita Model United Nations Society (A-MUNSO)', category: 'Debate & MUN' },
  { id: 'literary-club', name: 'Literary and Debate Club', category: 'Debate & MUN' },
  { id: 'tech-club', name: 'Student Tech Club', category: 'Coding & Hackathons' },
  { id: 'lens-club', name: 'Lens Photography Club', category: 'Photography & Film' },
  { id: 'robotics-club', name: 'Robotics and 3D Printing Club', category: 'Robotics & 3D Printing' },
];

const interestOf = {
  'Debate & MUN': ['debate & mun'],
  'Coding & Hackathons': ['coding & hackathons'],
  'Photography & Film': ['photography & film'],
  'Robotics & 3D Printing': ['robotics & 3d printing'],
};

// [orgId, title, daysAgo, capacity, viewers, registrations, conversion, avg rating, leadershipTerm, context]
// A-MUNSO's earlier committee had weak turnout; the Literary Club's debates
// convert well, so the category median sits above A-MUNSO's history.
const pastEvents = [
  ['a-munso', 'MUN Orientation', 395, 80, 70, 52, 0.38, 3.4, '2025-26 core committee', null],
  ['a-munso', 'Crisis Committee Simulation', 330, 60, 61, 40, 0.42, 3.6, '2025-26 core committee', 'Clashed with mid-semester exams'],
  ['a-munso', 'Intra-college Mock MUN', 240, 120, 115, 75, 0.45, 3.8, '2025-26 core committee', null],
  ['a-munso', 'Position Paper Workshop', 150, 50, 44, 30, 0.5, 3.9, '2025-26 core committee', null],
  ['literary-club', 'Parliamentary Debate Open', 360, 64, 80, 58, 0.79, 4.3, null, null],
  ['literary-club', 'Turncoat Debate Night', 260, 60, 66, 48, 0.75, 4.1, null, null],
  ['literary-club', 'Asian Parliamentary Training', 120, 40, 47, 36, 0.81, 4.4, null, null],
  ['tech-club', 'Intro to Git and GitHub', 300, 90, 110, 70, 0.66, 4.0, null, null],
  ['tech-club', 'Web Dev Bootcamp', 200, 100, 140, 88, 0.7, 4.2, null, null],
  ['tech-club', 'Open Source Day', 45, 60, 70, 18, 0.72, 4.1, null, null],
  ['tech-club', 'Cloud Workshop', 25, 80, 95, 30, 0.4, 3.7, null, 'Announced two days before'],
  ['tech-club', 'Competitive Programming Contest', 12, 60, 88, 26, 0.73, 4.3, null, null],
  ['lens-club', 'Campus Photowalk', 210, 40, 52, 35, 0.69, 4.5, null, null],
  ['lens-club', 'Lightroom Editing Session', 18, 35, 41, 24, 0.71, 4.2, null, null],
  ['robotics-club', 'Arduino Basics', 60, 30, 38, 22, 0.64, 4.0, null, null],
];

export function buildAnalyticsSeed(nowDate, realStudents) {
  const rand = mulberry32(SEED);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const daysAgo = (d, hour = 10) => {
    const t = new Date(nowDate.getTime() - d * DAY);
    t.setUTCHours(hour - 5, 30, 0, 0); // hour:00 IST
    return t;
  };

  const departments = ['Computer Science', 'Electronics', 'Mechanical', 'Civil', 'Aerospace', 'Chemical', 'Mathematics'];
  const skillPool = ['python', 'react', 'nodejs', 'figma', 'photography', 'video editing', 'c++', 'matlab', 'cad', 'public speaking'];
  const students = Array.from({ length: 90 }, (_, i) => {
    const id = `syn-student-${String(i + 1).padStart(3, '0')}`;
    return {
      uid: id,
      name: `Demo Student ${String(i + 1).padStart(3, '0')}`,
      department: pick(departments),
      year: 1 + Math.floor(rand() * 4),
      skills: shuffle(skillPool).slice(0, 1 + Math.floor(rand() * 3)),
      interests: [],
      availability: rand() < 0.4 ? 'open_to_projects' : 'busy',
      // Hidden from Connect search: these are demo records, not real people
      privacy: { profileVisible: false, showLocation: false, showContact: false },
      synthetic: true,
    };
  });
  const pool = [...realStudents, ...students.map((s) => s.uid)];

  const events = [];
  pastEvents.forEach(([orgId, title, ago, capacity, viewers, regs, conv, rating, term, context], i) => {
    const org = organisations.find((o) => o.id === orgId);
    const start = daysAgo(ago, 10);
    const people = shuffle(pool).slice(0, viewers);
    const attendCount = Math.round(regs * conv);
    const participants = people.map((uid, k) => {
      const registered = k < regs;
      const attended = k < attendCount;
      const p = { uid, viewedAt: start, saved: rand() < 0.3, registered, attended };
      if (attended && rand() < 0.6) {
        p.feedback = { rating: Math.max(1, Math.min(5, Math.round(rating + (rand() - 0.5) * 2))), comment: '', at: start };
      }
      return p;
    });
    events.push({
      id: `syn-event-${String(i + 1).padStart(2, '0')}`,
      data: {
        title,
        venue: 'Demo venue',
        description: `${title} (synthetic demonstration event).`,
        orgId,
        organiser: org.name,
        category: org.category,
        interests: interestOf[org.category],
        start,
        end: new Date(start.getTime() + 3 * 60 * 60 * 1000),
        capacity,
        registeredCount: regs,
        status: 'published',
        leadershipTerm: term,
        context,
        synthetic: true,
      },
      participants,
    });
  });

  // Upcoming synthetic event with registrations already coming in
  const upStart = daysAgo(-3, 14);
  events.push({
    id: 'syn-event-upcoming-01',
    data: {
      title: 'Lens Club Night Photography Walk',
      venue: 'Demo venue',
      description: 'Synthetic demonstration event: an evening photowalk around campus.',
      orgId: 'lens-club',
      organiser: 'Lens Photography Club',
      category: 'Photography & Film',
      interests: ['photography & film'],
      start: upStart,
      end: new Date(upStart.getTime() + 2 * 60 * 60 * 1000),
      capacity: 30,
      registeredCount: 12,
      status: 'published',
      synthetic: true,
    },
    participants: shuffle(students.map((s) => s.uid)).slice(0, 20).map((uid, k) => ({ uid, viewedAt: daysAgo(1), saved: k % 3 === 0, registered: k < 12, attended: false })),
  });

  const yes = (evidence) => ({ met: true, evidence });
  const proposals = [
    {
      id: 'syn-proposal-munso-conference',
      orgId: 'a-munso',
      title: 'A-MUNSO Annual Conference (3 days)',
      summary:
        'A three-day inter-college Model United Nations conference with five committees, run by the new 2026-27 core committee. Synthetic demonstration proposal.',
      category: 'Debate & MUN',
      leadershipTerm: '2026-27 core committee',
      proposedStart: daysAgo(-60, 9),
      proposedEnd: daysAgo(-62, 17),
      expectedParticipants: 180,
      capacity: 220,
      budget: { requested: 150000, items: [{ item: 'Venue setup and AV', amount: 50000 }, { item: 'Delegate kits', amount: 45000 }, { item: 'Hospitality', amount: 55000 }] },
      supportRequested: ['funding', 'venue', 'publicity'],
      plannedActivities: ['Five committees', 'Opening ceremony', 'Awards'],
      targets: { attendance: 150, registrations: 180, feedbackAverage: 4 },
      readiness: {
        proposalComplete: yes('Full proposal document submitted on the portal.'),
        committeeConfirmed: yes('Secretary-General, USG and committee directors named with roles.'),
        milestones: yes('Timeline: committee briefs T-45, registrations T-30, mock session T-10.'),
        venueFeasible: yes('Gokul Krishna Hall tentatively available on the proposed dates.'),
        budgetRealistic: yes('Itemised budget with three vendor quotes attached.'),
        recruitmentEvidence: yes('64 pre-registrations from an interest form in two weeks.'),
        riskPlan: { met: false, evidence: '' },
      },
      status: 'submitted',
      decisionNote: '',
    },
    {
      id: 'syn-proposal-robotics-workshop',
      orgId: 'robotics-club',
      title: '3D Printing Workshop Series',
      summary: 'A four-week workshop series on CAD and 3D printing using lab printers. Synthetic demonstration proposal.',
      category: 'Robotics & 3D Printing',
      leadershipTerm: '2026-27 core committee',
      proposedStart: daysAgo(-14, 15),
      proposedEnd: daysAgo(-42, 17),
      expectedParticipants: 40,
      capacity: 25,
      budget: { requested: 40000, items: [{ item: 'Filament and consumables', amount: 40000 }] },
      supportRequested: ['funding', 'equipment'],
      plannedActivities: ['CAD basics', 'Slicing', 'Print project'],
      targets: { attendance: 25, registrations: 40 },
      readiness: {
        proposalComplete: yes('Workshop outline submitted.'),
        committeeConfirmed: yes('Two instructors confirmed.'),
        budgetRealistic: { met: false, evidence: '' },
      },
      status: 'submitted',
      decisionNote: '',
    },
    {
      id: 'syn-proposal-tech-git',
      orgId: 'tech-club',
      title: 'Open Source Day',
      summary: 'A day of guided first contributions to open-source projects. Synthetic demonstration proposal, already held.',
      category: 'Coding & Hackathons',
      leadershipTerm: '',
      proposedStart: daysAgo(46, 9),
      proposedEnd: daysAgo(45, 17),
      expectedParticipants: 20,
      capacity: 60,
      budget: { requested: 8000, items: [{ item: 'Refreshments', amount: 8000 }] },
      supportRequested: ['funding', 'venue'],
      plannedActivities: ['Talk on open source', 'Guided first pull requests', 'Swag'],
      targets: { attendance: 15, registrations: 20, feedbackAverage: 4 },
      readiness: {},
      status: 'approved',
      decisionNote: 'Small, well-scoped event. Approved for refreshments only.',
      outcome: {
        eventId: 'syn-event-10',
        actualSpend: 7200,
        spendVerified: true,
        deliveredActivities: ['Talk on open source', 'Guided first pull requests'],
        notes: 'Swag did not arrive in time.',
      },
    },
  ];

  // Connect: collaboration requests and gig hire requests over 120 days.
  // [skills, count in last 30 days, count in the 30 days before]
  const demand = [
    [['3d printing'], 9, 3],
    [['3d printing', 'cad'], 2, 0],
    [['photography'], 6, 4],
    [['video editing'], 5, 2],
    [['machine learning', 'python'], 6, 2],
    [['react', 'nodejs'], 4, 3],
    [['figma'], 2, 2],
  ];
  const requests = [];
  let r = 0;
  for (const [skills, current, previous] of demand) {
    for (const [n, from, span] of [[current, 1, 29], [previous, 31, 29]]) {
      for (let k = 0; k < n; k++) {
        r++;
        const createdAt = daysAgo(from + Math.floor(rand() * span), 9 + Math.floor(rand() * 9));
        const answered = rand() < 0.35;
        requests.push({
          id: `syn-request-${String(r).padStart(3, '0')}`,
          data: {
            authorId: pick(students).uid,
            title: `Looking for help with ${skills.join(' and ')}`,
            description: 'Synthetic demonstration request.',
            type: pick(['project', 'study_group', 'hackathon']),
            skillsNeeded: skills,
            deadline: null,
            status: answered && rand() < 0.5 ? 'closed' : 'open',
            createdAt,
            updatedAt: createdAt,
            synthetic: true,
          },
          responses: answered ? [{ responderId: pick(students).uid, message: 'Happy to help.', createdAt }] : [],
        });
      }
    }
  }

  // Hire requests against the seeded gigs (seed-gig-001 photography, 002/004 video, 003 ui design)
  const hires = [
    ['seed-gig-001', 6, 2],
    ['seed-gig-002', 2, 1],
    ['seed-gig-004', 1, 0],
    ['seed-gig-003', 2, 2],
  ];
  const gigRequests = [];
  let h = 0;
  for (const [gigId, current, previous] of hires) {
    for (const [n, from] of [[current, 1], [previous, 31]]) {
      for (let k = 0; k < n; k++) {
        h++;
        const createdAt = daysAgo(from + Math.floor(rand() * 29), 12);
        gigRequests.push({
          id: `syn-hire-${String(h).padStart(3, '0')}`,
          gigId,
          data: {
            buyerId: pick(students).uid,
            buyerName: 'Demo Student',
            message: 'Synthetic demonstration hire request.',
            status: pick(['pending', 'accepted', 'declined', 'completed', 'completed']),
            createdAt,
            updatedAt: createdAt,
            synthetic: true,
          },
        });
      }
    }
  }

  return { students, events, proposals, requests, gigRequests };
}

// Explore events from the original student app (sample placeholders, not synthetic analytics)
export const sampleEvents = [
  {
    id: 'a-munso',
    title: 'A-MUNSO Mock MUN',
    venue: 'Gokul Krishna Hall',
    start: '2026-10-17T09:00:00+05:30',
    end: '2026-10-17T17:00:00+05:30',
    orgId: 'a-munso',
    organiser: 'A-MUNSO',
    category: 'Debate & MUN',
    capacity: 150,
    description: 'A full-day Mock United Nations: committee sessions, position papers, resolutions and debate. Open to first-timers.',
    interests: ['debate & mun'],
  },
  {
    id: 'hackathon',
    title: 'Hackathon',
    venue: 'Venue to be confirmed by organisers',
    start: '2026-10-24T09:00:00+05:30',
    end: '2026-10-24T17:00:00+05:30',
    orgId: 'tech-club',
    organiser: 'Student tech clubs',
    category: 'Coding & Hackathons',
    capacity: 200,
    description: 'Build something in a day with a team of up to four. Developers, designers and pitchers welcome; teams demo at 4:30 PM.',
    interests: ['coding & hackathons', 'design', 'entrepreneurship'],
  },
];

// Administration logins (emulator only). admins/{uid} grants dashboard access.
export const admins = [
  { uid: 'admin-central', email: 'admin@campus.edu', name: 'Amrita Administration (demo)', role: 'central' },
  { uid: 'rep-munso', email: 'munso.rep@campus.edu', name: 'A-MUNSO representative (demo)', role: 'org', orgId: 'a-munso' },
];
