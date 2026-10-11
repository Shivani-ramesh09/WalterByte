// tests/admin.test.js
// Explore/Connect administration. Pure analytics tests always run;
// Firestore-backed tests need the emulator: npm run test:emulator
import request from 'supertest';
import app from '../src/app.js';
import { db } from '../src/config/firebase.js';
import admin from 'firebase-admin';
import { parsePeriod, termOf } from '../src/utils/period.js';
import { assessProposal, eventFunnel, outcomeComparison, summarise } from '../src/services/analytics/exploreAnalytics.js';
import { skillDemand, skillPairs } from '../src/services/analytics/connectAnalytics.js';
import { connectRecommendations, exploreRecommendations } from '../src/services/analytics/recommendations.js';

const { Timestamp } = admin.firestore;
const describeDb = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;
const as = (uid) => ({ 'x-dev-uid': uid });

// ─── Periods and timezone boundaries ─────────────────────────────────────────

describe('Reporting periods', () => {
  it('covers whole IST days and compares with the equal period before', () => {
    const p = parsePeriod({ from: '2026-10-01', to: '2026-10-10' });
    expect(p.from.toISOString()).toBe('2026-09-30T18:30:00.000Z'); // 00:00 IST 1 Oct
    expect(p.to.toISOString()).toBe('2026-10-10T18:30:00.000Z'); // 00:00 IST 11 Oct, exclusive
    expect(p.days).toBe(10);
    expect(p.previous.label).toBe('2026-09-21 to 2026-09-30');
  });

  it('rejects reversed, impossible and over-long periods', () => {
    expect(() => parsePeriod({ from: '2026-10-10', to: '2026-10-01' })).toThrow();
    expect(() => parsePeriod({ from: '2026-02-31', to: '2026-03-01' })).toThrow();
    expect(() => parsePeriod({ from: '2020-01-01', to: '2026-01-01' })).toThrow();
  });

  it('assigns academic terms in IST', () => {
    expect(termOf(new Date('2026-06-30T19:00:00Z'))).toBe('2026-27 Odd semester'); // 1 Jul 00:30 IST
    expect(termOf(new Date('2026-06-30T18:00:00Z'))).toBe('2025-26 Even semester');
  });
});

// ─── Explore analytics ───────────────────────────────────────────────────────

const ev = (id, patch = {}) => ({ id, title: id, orgId: 'org', category: 'Debate', start: new Date('2026-01-10T04:30:00Z'), capacity: 50, ...patch });
const people = (n, patch) => Array.from({ length: n }, (_, i) => ({ uid: `u${i}`, viewedAt: true, ...patch(i) }));

describe('Event funnel', () => {
  it('keeps views, registrations and verified attendance separate', () => {
    const f = eventFunnel(ev('e1'), people(10, (i) => ({ registered: i < 6, attended: i < 3, saved: i === 9, feedback: i < 2 ? { rating: 4 + i } : undefined })));
    expect(f).toMatchObject({ viewers: 10, saves: 1, registrations: 6, attended: 3, conversion: 0.5, utilisation: 0.06 });
    expect(f.feedback).toEqual({ responses: 2, average: 4.5 });
  });

  it('reports no conversion without registrations instead of 0%', () => {
    expect(eventFunnel(ev('e2'), []).conversion).toBeNull();
  });

  it('counts each student once across events and finds repeat attendees', () => {
    const a = eventFunnel(ev('a'), people(4, () => ({ registered: true, attended: true })));
    const b = eventFunnel(ev('b'), people(2, () => ({ registered: true, attended: true })));
    const s = summarise([a, b]);
    expect(s.attended).toBe(6);
    expect(s.uniqueAttendees).toBe(4);
    expect(s.repeatAttendees).toBe(2);
  });
});

describe('Proposal assessment', () => {
  const comparable = [0.4, 0.6, 0.8].map((c, i) => eventFunnel(ev(`c${i}`), people(10, (k) => ({ registered: true, attended: k < c * 10 }))));
  const proposal = {
    expectedParticipants: 100,
    capacity: 70,
    budget: { requested: 50000 },
    readiness: { proposalComplete: { met: true, evidence: 'Doc' }, riskPlan: { met: true, evidence: '   ' } },
  };

  it('builds low/middle/high attendance scenarios from comparable events, capped by capacity', () => {
    const a = assessProposal(proposal, [], comparable);
    expect(a.scenarios.map((s) => s.attendance)).toEqual([40, 60, 70]);
    expect(a.scenarios[0].costPerAttendee).toBe(1250);
    expect(a.budget.costPerExpectedParticipant).toBe(500);
  });

  it('refuses scenarios with fewer than 3 comparable events', () => {
    const a = assessProposal(proposal, [], comparable.slice(0, 2));
    expect(a.scenarios).toBeNull();
    expect(a.scenarioNote).toMatch(/Insufficient data/);
  });

  it('only counts readiness criteria that have written evidence', () => {
    const a = assessProposal(proposal, [], comparable);
    expect(a.readiness.met).toBe(1);
    expect(a.risks).toEqual(expect.arrayContaining([expect.stringMatching(/Limited track record/), expect.stringMatching(/exceed venue capacity/)]));
  });

  it('reports financial ROI only from verified spend and revenue', () => {
    const funnel = comparable[1];
    expect(outcomeComparison({ outcome: { actualSpend: 1000, spendVerified: true } }, funnel).financialRoi).toBeNull();
    expect(outcomeComparison({ outcome: { actualSpend: 1000, spendVerified: false, actualRevenue: 1500, revenueVerified: true } }, funnel).financialRoi).toBeNull();
    expect(outcomeComparison({ outcome: { actualSpend: 1000, spendVerified: true, actualRevenue: 1500, revenueVerified: true } }, funnel).financialRoi).toBe(0.5);
  });
});

// ─── Connect analytics ───────────────────────────────────────────────────────

describe('Skill demand', () => {
  const period = parsePeriod({ from: '2026-10-01', to: '2026-10-30' });
  const at = (d) => new Date(`${d}T06:00:00Z`);
  const now = at('2026-10-30');
  const data = {
    requests: [
      { skillsNeeded: ['3d printing', 'cad'], createdAt: at('2026-10-05'), status: 'open', responseCount: 0 },
      { skillsNeeded: ['3d printing'], createdAt: at('2026-10-06'), status: 'open', responseCount: 2 },
      { skillsNeeded: ['3d printing'], createdAt: at('2026-09-20'), status: 'open' }, // previous period
    ],
    hireRequests: [
      { skill: 'photography', createdAt: at('2026-10-02'), status: 'pending' }, // stale: > 7 days
      { skill: 'photography', createdAt: at('2026-10-28'), status: 'pending' },
    ],
    gigs: [
      { skill: 'photography', sellerId: 's1', status: 'active' },
      { skill: 'photography', sellerId: 's1', status: 'active' },
      { skill: 'react', sellerId: 's2', status: 'paused' },
    ],
    profiles: [{ skills: ['3d printing', 'react'], availability: 'open_to_projects' }, { skills: ['react'] }],
  };

  it('counts demand from requests only, and supply separately', () => {
    const rows = skillDemand(data, period, now);
    const printing = rows.find((r) => r.skill === '3d printing');
    expect(printing).toMatchObject({ requests: 2, demand: 2, previousDemand: 1, growth: 1, unfulfilled: 1, activeProviders: 0, demandToSupply: null, listedInProfiles: 1, availableProfiles: 1 });
    const photo = rows.find((r) => r.skill === 'photography');
    expect(photo).toMatchObject({ hireRequests: 2, activeProviders: 1, demandToSupply: 2, unfulfilled: 1 });
    // A skill that is only listed on profiles is not demand
    expect(rows.find((r) => r.skill === 'react')).toBeUndefined();
  });

  it('finds skills requested together', () => {
    expect(skillPairs(data.requests, period)).toEqual([{ pair: '3d printing + cad', count: 1 }]);
  });

  it('recommends evaluating a resource only with enough demand, and never purchases', () => {
    const skills = [{ skill: '3d printing', requests: 9, hireRequests: 0, demand: 9, previousDemand: 3, unfulfilled: 4, activeProviders: 0, demandToSupply: null, listedInProfiles: 2, resourceHint: 'more printers', growth: 2 }];
    const [rec] = connectRecommendations(skills, period);
    expect(rec.action).toMatch(/^Evaluate whether more printers is justified/);
    expect(rec.limitations.length).toBeGreaterThan(0);
    expect(connectRecommendations([{ ...skills[0], demand: 4 }], period)).toEqual([]);
  });
});

describe('Explore recommendations', () => {
  const period = parsePeriod({ from: '2026-10-01', to: '2026-10-30' });
  const assessment = (patch) => ({
    historical: { limited: false, conversion: 0.4, events: 4 },
    demand: { medianConversion: 0.6 },
    readiness: { met: 6, total: 7 },
    budget: { requested: 100000 },
    ...patch,
  });

  it('flags a strong proposal from an organisation with a weaker record for a pilot, not approval', () => {
    const [rec] = exploreRecommendations({ categories: [], events: [], proposals: [{ id: 'p1', title: 'Conference', status: 'submitted', assessment: assessment() }] }, period);
    expect(rec.action).toMatch(/pilot/);
    expect(rec.id).toBe('proposal-pilot--p1--2026-10-01--2026-10-30');
  });

  it('does not flag proposals without documented readiness', () => {
    const recs = exploreRecommendations({ categories: [], events: [], proposals: [{ id: 'p2', title: 'X', status: 'submitted', assessment: assessment({ readiness: { met: 3, total: 7 } }) }] }, period);
    expect(recs).toEqual([]);
  });
});

// ─── API: roles, events, attendance (emulator) ───────────────────────────────

describe('Admin routes need auth', () => {
  it('rejects anonymous callers', async () => {
    expect((await request(app).get('/api/v1/admin/overview')).status).toBe(401);
    expect((await request(app).get('/api/v1/events')).status).toBe(401);
  });
});

describeDb('Explore and administration (Firestore emulator)', () => {
  const run = Date.now();
  const central = `central-${run}`;
  const rep = `rep-${run}`;
  const otherRep = `rep-other-${run}`;
  const student = `student-${run}`;
  const student2 = `student2-${run}`;
  const orgId = `org-${run}`;
  const otherOrg = `org-other-${run}`;
  const eventId = `event-${run}`;
  const pastId = `past-${run}`;
  const hour = 60 * 60 * 1000;

  beforeAll(async () => {
    const batch = db.batch();
    batch.set(db.collection('admins').doc(central), { role: 'central', name: 'Central' });
    batch.set(db.collection('admins').doc(rep), { role: 'org', orgId, name: 'Rep' });
    batch.set(db.collection('admins').doc(otherRep), { role: 'org', orgId: otherOrg, name: 'Other rep' });
    batch.set(db.collection('organisations').doc(orgId), { name: 'Test Society', category: 'Test' });
    batch.set(db.collection('organisations').doc(otherOrg), { name: 'Other Society', category: 'Test' });
    batch.set(db.collection('users').doc(student), { name: 'Asha', department: 'CSE' });
    const base = { title: 'Test event', venue: 'Hall', description: 'd', orgId, organiser: 'Test Society', category: 'Test', interests: [], status: 'published' };
    batch.set(db.collection('events').doc(eventId), {
      ...base,
      start: Timestamp.fromMillis(run + 24 * hour),
      end: Timestamp.fromMillis(run + 26 * hour),
      capacity: 1,
      registeredCount: 0,
    });
    batch.set(db.collection('events').doc(pastId), {
      ...base,
      start: Timestamp.fromMillis(run - 26 * hour),
      end: Timestamp.fromMillis(run - 24 * hour),
      capacity: 10,
      registeredCount: 2,
    });
    batch.set(db.collection('events').doc(pastId).collection('participants').doc(student), { registered: true, attended: false });
    batch.set(db.collection('events').doc(pastId).collection('participants').doc(student2), { registered: true, attended: false });
    await batch.commit();
  });

  // The emulator may also hold demo data: leave no test events or roles behind
  afterAll(async () => {
    const proposals = await db.collection('proposals').where('orgId', '==', orgId).get();
    const refs = [
      ...[central, rep, otherRep].map((u) => db.collection('admins').doc(u)),
      ...[orgId, otherOrg].map((o) => db.collection('organisations').doc(o)),
      ...[eventId, pastId].map((e) => db.collection('events').doc(e)),
      db.collection('users').doc(student),
      db.collection('recommendationReviews').doc('skill-gap--3d-printing--2026-10-01--2026-10-30'),
      ...proposals.docs.map((d) => d.ref),
    ];
    await Promise.all(refs.map((r) => db.recursiveDelete(r)));
  });

  it('keeps students out of every administration API', async () => {
    for (const path of ['/admin/me', '/admin/overview', '/admin/explore', '/admin/connect', '/admin/recommendations', '/admin/reports/skills', '/admin/proposals']) {
      expect((await request(app).get(`/api/v1${path}`).set(as(student))).status).toBe(403);
    }
  });

  it('limits organisation representatives to their own organisation', async () => {
    expect((await request(app).get('/api/v1/admin/connect').set(as(rep))).status).toBe(403);
    expect((await request(app).get('/api/v1/admin/reports/events').set(as(rep))).status).toBe(403);
    expect((await request(app).get(`/api/v1/admin/organisations/${otherOrg}`).set(as(rep))).status).toBe(404);
    expect((await request(app).get(`/api/v1/admin/organisations/${orgId}`).set(as(rep))).status).toBe(200);
    expect((await request(app).get(`/api/v1/admin/events/${pastId}/participants`).set(as(otherRep))).status).toBe(404);
    const explore = await request(app).get('/api/v1/admin/explore').set(as(rep));
    expect(explore.body.organisations.map((o) => o.orgId)).toEqual([orgId]);
  });

  it('counts a viewer once however often they open the event', async () => {
    await request(app).get(`/api/v1/events/${eventId}`).set(as(student));
    await request(app).get(`/api/v1/events/${eventId}`).set(as(student));
    const parts = await db.collection('events').doc(eventId).collection('participants').get();
    expect(parts.size).toBe(1);
  });

  it('enforces capacity on registration and frees the place on cancel', async () => {
    const reg = await request(app).patch(`/api/v1/events/${eventId}/me`).set(as(student)).send({ registered: true });
    expect(reg.body).toMatchObject({ registered: true });
    // Registering twice does not double count
    await request(app).patch(`/api/v1/events/${eventId}/me`).set(as(student)).send({ registered: true });
    const full = await request(app).patch(`/api/v1/events/${eventId}/me`).set(as(student2)).send({ registered: true });
    expect(full.status).toBe(409);
    expect(full.body.error.code).toBe('EVENT_FULL');
    await request(app).patch(`/api/v1/events/${eventId}/me`).set(as(student)).send({ registered: false });
    expect((await request(app).patch(`/api/v1/events/${eventId}/me`).set(as(student2)).send({ registered: true })).status).toBe(200);
    expect((await db.collection('events').doc(eventId).get()).get('registeredCount')).toBe(1);
  });

  it('only lets the organiser mark attendance, and only for registrants', async () => {
    expect((await request(app).post(`/api/v1/admin/events/${pastId}/attendance`).set(as(student)).send({ uids: [student], attended: true })).status).toBe(403);
    expect((await request(app).post(`/api/v1/admin/events/${pastId}/attendance`).set(as(rep)).send({ uids: ['nobody'], attended: true })).status).toBe(422);
    expect((await request(app).post(`/api/v1/admin/events/${eventId}/attendance`).set(as(rep)).send({ uids: [student2], attended: true })).status).toBe(409);
    const ok = await request(app).post(`/api/v1/admin/events/${pastId}/attendance`).set(as(rep)).send({ uids: [student], attended: true });
    expect(ok.body).toEqual({ updated: 1 });
  });

  it('takes feedback once, only from verified attendees', async () => {
    expect((await request(app).post(`/api/v1/events/${pastId}/feedback`).set(as(student2)).send({ rating: 5 })).status).toBe(403);
    expect((await request(app).post(`/api/v1/events/${pastId}/feedback`).set(as(student)).send({ rating: 4 })).status).toBe(200);
    expect((await request(app).post(`/api/v1/events/${pastId}/feedback`).set(as(student)).send({ rating: 5 })).status).toBe(409);
    const detail = await request(app).get(`/api/v1/admin/organisations/${orgId}`).set(as(rep));
    const past = detail.body.events.find((e) => e.eventId === pastId);
    expect(past).toMatchObject({ registrations: 2, attended: 1, conversion: 0.5, feedback: { responses: 1, average: 4 } });
    // Student identities never leave the server in analytics
    expect(past.attendeeIds).toBeUndefined();
  });

  it('runs a proposal through human review; representatives cannot decide or verify spending', async () => {
    const body = {
      title: 'Annual conference',
      summary: 'A three-day conference with five committees and guest speakers.',
      category: 'Test',
      proposedStart: '2026-12-01T09:00:00+05:30',
      proposedEnd: '2026-12-03T17:00:00+05:30',
      expectedParticipants: 100,
      budget: { requested: 50000 },
      readiness: { proposalComplete: { met: true, evidence: 'Attached' } },
    };
    const created = await request(app).post('/api/v1/admin/proposals').set(as(rep)).send({ ...body, orgId: otherOrg });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ orgId, status: 'submitted' }); // pinned to the rep's own org
    const id = created.body.id;

    const detail = await request(app).get(`/api/v1/admin/proposals/${id}`).set(as(rep));
    expect(detail.body.assessment.readiness.met).toBe(1);
    expect(detail.body.assessment.scenarios).toBeNull(); // only 1 comparable past event

    expect((await request(app).get(`/api/v1/admin/proposals/${id}`).set(as(otherRep))).status).toBe(404);
    expect((await request(app).patch(`/api/v1/admin/proposals/${id}/decision`).set(as(rep)).send({ status: 'approved', note: 'Looks good' })).status).toBe(403);
    expect((await request(app).patch(`/api/v1/admin/proposals/${id}/outcome`).set(as(rep)).send({ actualSpend: 1000, spendVerified: true })).status).toBe(403);

    const decided = await request(app).patch(`/api/v1/admin/proposals/${id}/decision`).set(as(central)).send({ status: 'pilot_supported', note: 'Run a one-day pilot first.' });
    expect(decided.body).toMatchObject({ status: 'pilot_supported', decidedBy: central });
    expect((await request(app).patch(`/api/v1/admin/proposals/${id}`).set(as(rep)).send({ title: 'Changed title' })).status).toBe(409);

    const outcome = await request(app).patch(`/api/v1/admin/proposals/${id}/outcome`).set(as(rep)).send({ eventId: pastId, actualSpend: 42000 });
    expect(outcome.body.outcomeComparison).toMatchObject({ attendance: { actual: 1 }, spend: { actual: null, verified: false } });
    const verified = await request(app).patch(`/api/v1/admin/proposals/${id}/outcome`).set(as(central)).send({ spendVerified: true });
    expect(verified.body.outcomeComparison.spend).toEqual({ planned: 50000, actual: 42000, verified: true });
  });

  it('stores recommendation reviews and serves CSV reports to central admins only', async () => {
    const id = 'skill-gap--3d-printing--2026-10-01--2026-10-30';
    const review = await request(app).patch(`/api/v1/admin/recommendations/${id}`).set(as(central)).send({ status: 'more_info', note: 'Ask the lab about printer utilisation.' });
    expect(review.body).toMatchObject({ id, status: 'more_info', reviewedBy: central });
    expect((await request(app).patch(`/api/v1/admin/recommendations/${id}`).set(as(central)).send({ status: 'approved' })).status).toBe(422);

    const csv = await request(app).get('/api/v1/admin/reports/events').set(as(central));
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text.split('\n')[0]).toMatch(/^event,organisation,category/);
  });

  it('validates the reporting period', async () => {
    expect((await request(app).get('/api/v1/admin/explore?from=2026-10-10&to=2026-10-01').set(as(central))).status).toBe(400);
    expect((await request(app).get('/api/v1/admin/explore?from=yesterday').set(as(central))).status).toBe(422);
  });
});
