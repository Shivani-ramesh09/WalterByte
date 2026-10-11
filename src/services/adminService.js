// src/services/adminService.js
// Administration data loading for Explore and Connect. All aggregation runs
// here on the server with bounded queries; the browser only gets results.
// Calculations live in ./analytics/* so cards, tables, recommendations and
// CSV exports share one definition of every number.
//
// Collections added for administration:
//   admins/{uid}                 role, orgId?, name (see middleware/requireAdmin.js)
//   proposals/{proposalId}       orgId, title, summary, category, leadershipTerm,
//                                proposedStart, proposedEnd, expectedParticipants,
//                                capacity, budget { requested, items[] },
//                                supportRequested[], plannedActivities[],
//                                targets { attendance, registrations, feedbackAverage },
//                                readiness { <criterion>: { met, evidence } },
//                                status, decisionNote, decidedBy, decidedAt,
//                                outcome { eventId, actualSpend, spendVerified,
//                                          actualRevenue, revenueVerified,
//                                          deliveredActivities[], notes },
//                                createdBy, createdAt, updatedAt, synthetic?
//   recommendationReviews/{recId} status, note, reviewedBy, reviewedAt
import { db } from '../config/firebase.js';
import { ApiError, forbidden, notFound, conflict } from '../utils/apiError.js';
import { canAccessOrg } from '../middleware/requireAdmin.js';
import { change } from '../utils/period.js';
import {
  assessProposal,
  categoryTrends,
  eventFunnel,
  organisationHistory,
  outcomeComparison,
  summarise,
} from './analytics/exploreAnalytics.js';
import { connectTotals, skillDemand, skillPairs } from './analytics/connectAnalytics.js';
import { connectRecommendations, exploreRecommendations } from './analytics/recommendations.js';
import { eatAnalytics, eatRecs } from './eat/eatAdminService.js';
import admin from 'firebase-admin';

const { Timestamp } = admin.firestore;
const ts = (d) => Timestamp.fromDate(d);
const iso = (t) => (t ? t.toDate().toISOString() : null);

// Query bounds. A result at the bound is reported as possibly incomplete.
const EVENT_LIMIT = 500;
const RECORD_LIMIT = 3000;
const PROFILE_LIMIT = 5000;

// ─── Explore loading ─────────────────────────────────────────────────────────

const toEvent = (d) => ({ id: d.id, ...d.data(), start: d.get('start').toDate(), end: d.get('end').toDate() });

async function funnelsOf(docs) {
  const parts = await Promise.all(docs.map((d) => d.ref.collection('participants').get()));
  return docs.map((d, i) => eventFunnel(toEvent(d), parts[i].docs.map((p) => ({ uid: p.id, ...p.data() }))));
}

const published = (snap) => snap.docs.filter((d) => d.get('status') === 'published');

async function funnelsBetween(from, to) {
  const snap = await db
    .collection('events')
    .where('start', '>=', ts(from))
    .where('start', '<', ts(to))
    .limit(EVENT_LIMIT)
    .get();
  return { funnels: await funnelsOf(published(snap)), truncated: snap.size >= EVENT_LIMIT };
}

/** Events that have already ended, optionally limited to an organisation or category. */
async function pastFunnels({ orgId, category }, now = new Date()) {
  let q = db.collection('events');
  if (orgId) q = q.where('orgId', '==', orgId);
  if (category) q = q.where('category', '==', category);
  const snap = await q.limit(EVENT_LIMIT).get();
  return funnelsOf(published(snap).filter((d) => d.get('end').toDate() <= now));
}

// Student ids stay on the server: dashboards get counts, not identities
const publicFunnel = ({ attendeeIds, registrantIds, ...f }) => ({ ...f, start: f.start.toISOString() });

export async function exploreAnalytics(adminUser, period) {
  const [cur, prev, orgSnap] = await Promise.all([
    funnelsBetween(period.from, period.to),
    funnelsBetween(period.previous.from, period.previous.to),
    db.collection('organisations').limit(200).get(),
  ]);
  const scope = (fs) => fs.filter((f) => canAccessOrg(adminUser, f.orgId));
  const current = scope(cur.funnels);
  const previous = scope(prev.funnels);
  const orgs = orgSnap.docs.filter((d) => canAccessOrg(adminUser, d.id));
  return {
    period,
    summary: { current: summarise(current), previous: summarise(previous) },
    categories: categoryTrends(current, previous),
    organisations: orgs.map((o) => ({
      orgId: o.id,
      name: o.get('name'),
      category: o.get('category'),
      current: summarise(current.filter((f) => f.orgId === o.id)),
      previous: summarise(previous.filter((f) => f.orgId === o.id)),
    })),
    events: current.map(publicFunnel).sort((a, b) => b.start.localeCompare(a.start)),
    dataQuality: dataQuality([...current, ...previous], cur.truncated || prev.truncated, [
      'Impressions (an event card scrolling past) are not recorded; "viewers" are students who opened the event.',
      'Attendance counts only what organisers marked; unmarked events show 0 attended.',
    ]),
  };
}

export async function organisationDetail(adminUser, orgId) {
  if (!canAccessOrg(adminUser, orgId)) throw notFound('Organisation');
  const org = await db.collection('organisations').doc(orgId).get();
  if (!org.exists) throw notFound('Organisation');
  const [past, upcomingSnap, proposals] = await Promise.all([
    pastFunnels({ orgId }),
    db.collection('events').where('orgId', '==', orgId).limit(EVENT_LIMIT).get(),
    listProposals(adminUser, orgId),
  ]);
  const now = new Date();
  return {
    organisation: { id: org.id, name: org.get('name'), category: org.get('category'), synthetic: Boolean(org.get('synthetic')) },
    summary: summarise(past),
    byTerm: organisationHistory(past),
    events: past.map(publicFunnel).sort((a, b) => b.start.localeCompare(a.start)),
    upcoming: upcomingSnap.docs
      .filter((d) => d.get('end').toDate() > now)
      .map((d) => ({ id: d.id, title: d.get('title'), start: iso(d.get('start')), registeredCount: d.get('registeredCount') || 0, capacity: d.get('capacity') ?? null })),
    proposals,
  };
}

// ─── Attendance (organiser or central admin) ─────────────────────────────────

async function eventFor(adminUser, eventId) {
  const snap = await db.collection('events').doc(eventId).get();
  if (!snap.exists || !canAccessOrg(adminUser, snap.get('orgId'))) throw notFound('Event');
  return snap;
}

/** Registrants and attendees with names: only for the event's own organiser. */
export async function listParticipants(adminUser, eventId) {
  const ev = await eventFor(adminUser, eventId);
  const parts = await ev.ref.collection('participants').get();
  const people = parts.docs.filter((p) => p.get('registered') || p.get('attended'));
  const profiles = people.length ? await db.getAll(...people.map((p) => db.collection('users').doc(p.id))) : [];
  return {
    event: { id: ev.id, title: ev.get('title'), start: iso(ev.get('start')), end: iso(ev.get('end')) },
    participants: people.map((p, i) => ({
      uid: p.id,
      name: profiles[i].get('name') || 'Student',
      department: profiles[i].get('department') || '',
      registered: Boolean(p.get('registered')),
      attended: Boolean(p.get('attended')),
    })),
  };
}

export async function markAttendance(adminUser, eventId, uids, attended) {
  const ev = await eventFor(adminUser, eventId);
  if (ev.get('start').toDate() > new Date()) throw conflict('Attendance can be marked once the event has started.');
  const refs = uids.map((uid) => ev.ref.collection('participants').doc(uid));
  const snaps = await db.getAll(...refs);
  const unknown = snaps.filter((s) => !s.get('registered') && !s.get('attended')).map((s) => s.id);
  if (unknown.length) throw new ApiError(422, 'NOT_REGISTERED', 'Only registered students can be marked.', unknown);
  const batch = db.batch();
  for (const ref of refs) {
    batch.update(ref, { attended, attendanceMarkedBy: adminUser.uid, attendanceMarkedAt: Timestamp.now() });
  }
  await batch.commit();
  return { updated: refs.length };
}

// ─── Proposals ───────────────────────────────────────────────────────────────

const serializeProposal = (id, p) => ({
  id,
  ...p,
  proposedStart: iso(p.proposedStart),
  proposedEnd: iso(p.proposedEnd),
  decidedAt: iso(p.decidedAt),
  createdAt: iso(p.createdAt),
  updatedAt: iso(p.updatedAt),
});

export async function listProposals(adminUser, orgId) {
  const scopeOrg = adminUser.role === 'org' ? adminUser.orgId : orgId;
  let q = db.collection('proposals');
  if (scopeOrg) q = q.where('orgId', '==', scopeOrg);
  const snap = await q.limit(200).get();
  return snap.docs
    .map((d) => serializeProposal(d.id, d.data()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(({ readiness, outcome, ...p }) => p);
}

async function proposalFor(adminUser, id) {
  const ref = db.collection('proposals').doc(id);
  const snap = await ref.get();
  if (!snap.exists || !canAccessOrg(adminUser, snap.get('orgId'))) throw notFound('Proposal');
  return { ref, snap };
}

export async function getProposal(adminUser, id) {
  const { snap } = await proposalFor(adminUser, id);
  const p = snap.data();
  const [orgPast, comparable, org] = await Promise.all([
    pastFunnels({ orgId: p.orgId }),
    pastFunnels({ category: p.category }),
    db.collection('organisations').doc(p.orgId).get(),
  ]);
  let outcome = null;
  if (p.outcome?.eventId) {
    const ev = await db.collection('events').doc(p.outcome.eventId).get();
    const funnel = ev.exists ? (await funnelsOf([ev]))[0] : null;
    outcome = outcomeComparison(p, funnel);
  }
  return {
    ...serializeProposal(snap.id, p),
    organisationName: org.get('name') || p.orgId,
    assessment: assessProposal(p, orgPast, comparable),
    outcomeComparison: outcome,
  };
}

const toProposalData = (body) => {
  const data = { ...body };
  if (body.proposedStart) data.proposedStart = ts(new Date(body.proposedStart));
  if (body.proposedEnd) data.proposedEnd = ts(new Date(body.proposedEnd));
  return data;
};

export async function createProposal(adminUser, body) {
  const orgId = adminUser.role === 'org' ? adminUser.orgId : body.orgId;
  if (!orgId) throw new ApiError(422, 'ORG_REQUIRED', 'Choose the organisation this proposal is for.');
  const org = await db.collection('organisations').doc(orgId).get();
  if (!org.exists) throw notFound('Organisation');
  const now = Timestamp.now();
  const ref = db.collection('proposals').doc();
  const data = {
    ...toProposalData(body),
    orgId,
    status: 'submitted',
    decisionNote: '',
    createdBy: adminUser.uid,
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(data);
  return serializeProposal(ref.id, data);
}

export async function updateProposal(adminUser, id, body) {
  const { ref, snap } = await proposalFor(adminUser, id);
  if (!['submitted', 'needs_info'].includes(snap.get('status'))) throw conflict('A decided proposal can no longer be edited.');
  const { orgId, ...rest } = body; // a proposal never moves between organisations
  const update = { ...toProposalData(rest), updatedAt: Timestamp.now() };
  if (snap.get('status') === 'needs_info') update.status = 'submitted';
  await ref.update(update);
  return serializeProposal(id, { ...snap.data(), ...update });
}

/** Human decision by central administration. Nothing is decided automatically. */
export async function decideProposal(adminUser, id, { status, note }) {
  const { ref, snap } = await proposalFor(adminUser, id);
  const update = { status, decisionNote: note, decidedBy: adminUser.uid, decidedAt: Timestamp.now(), updatedAt: Timestamp.now() };
  await ref.update(update);
  return serializeProposal(id, { ...snap.data(), ...update });
}

/** Post-event results. Only central administration can mark money as verified. */
export async function recordOutcome(adminUser, id, body) {
  const { ref, snap } = await proposalFor(adminUser, id);
  if (body.eventId) {
    const ev = await db.collection('events').doc(body.eventId).get();
    if (!ev.exists || ev.get('orgId') !== snap.get('orgId')) throw notFound('Event');
  }
  if (adminUser.role !== 'central' && (body.spendVerified || body.revenueVerified)) {
    throw forbidden('Only central administration can verify spending and revenue.');
  }
  const prev = snap.get('outcome') || {};
  const outcome = { ...prev, ...body };
  // Changing an amount clears its verification until it is checked again
  if (adminUser.role !== 'central') {
    if (body.actualSpend !== undefined && body.actualSpend !== prev.actualSpend) outcome.spendVerified = false;
    if (body.actualRevenue !== undefined && body.actualRevenue !== prev.actualRevenue) outcome.revenueVerified = false;
  }
  await ref.update({ outcome, updatedAt: Timestamp.now() });
  return getProposal(adminUser, id);
}

// ─── Connect loading ─────────────────────────────────────────────────────────

async function loadConnect(period) {
  const range = (col) =>
    db.collection(col).where('createdAt', '>=', ts(period.previous.from)).where('createdAt', '<', ts(period.to)).limit(RECORD_LIMIT).get();
  const [reqSnap, hireSnap, gigSnap, userSnap] = await Promise.all([
    range('requests'),
    range('gigRequests'),
    db.collection('gigs').limit(1000).get(),
    db.collection('users').select('skills', 'availability').limit(PROFILE_LIMIT).get(),
  ]);
  const gigSkill = new Map(gigSnap.docs.map((g) => [g.id, g.get('skill')]));
  const requests = await Promise.all(
    reqSnap.docs.map(async (d) => {
      const r = { id: d.id, ...d.data(), createdAt: d.get('createdAt').toDate() };
      // Responses only matter for open requests (answered or not)
      if (r.status === 'open' && r.createdAt >= period.from) {
        r.responseCount = (await d.ref.collection('responses').count().get()).data().count;
      }
      return r;
    })
  );
  return {
    requests,
    hireRequests: hireSnap.docs
      .map((d) => ({ ...d.data(), skill: gigSkill.get(d.get('gigId')), createdAt: d.get('createdAt').toDate() }))
      .filter((h) => h.skill),
    gigs: gigSnap.docs.map((d) => d.data()),
    profiles: userSnap.docs.map((d) => d.data()),
    truncated: [reqSnap, hireSnap].some((s) => s.size >= RECORD_LIMIT) || userSnap.size >= PROFILE_LIMIT,
    synthetic: [...reqSnap.docs, ...hireSnap.docs].some((d) => d.get('synthetic')),
  };
}

export async function connectAnalytics(period) {
  const data = await loadConnect(period);
  return {
    period,
    totals: connectTotals(data, period),
    skills: skillDemand(data, period),
    pairs: skillPairs(data.requests, period),
    dataQuality: {
      truncated: data.truncated,
      synthetic: data.synthetic,
      notes: [
        'Demand counts collaboration requests and gig hire requests only; skills listed on profiles are supply, not demand.',
        'A request naming three skills counts once for each skill.',
        'Unfulfilled = open requests with no responses, plus hire requests declined or pending over 7 days.',
      ],
    },
  };
}

// ─── Overview, recommendations, reports ──────────────────────────────────────

function dataQuality(funnels, truncated, notes) {
  return { truncated, synthetic: funnels.some((f) => f.synthetic), notes };
}

export async function overview(adminUser, period) {
  const [explore, connect, eat] = await Promise.all([exploreAnalytics(adminUser, period), connectAnalytics(period), eatAnalytics(period)]);
  const recs = await recommendations(adminUser, period, { explore, connect, eat });
  const { current, previous } = explore.summary;
  return {
    period,
    explore: {
      ...current,
      previous,
      registrationsChange: change(current.registrations, previous.registrations),
      attendanceChange: change(current.attended, previous.attended),
    },
    connect: {
      ...connect.totals,
      topGaps: connect.skills.filter((s) => s.demand > 0).slice(0, 5),
    },
    eat: {
      canteens: eat.canteens.map((c) => ({ canteenId: c.canteenId, name: c.name, gross: c.gross, sold: c.sold, onlineSold: c.onlineSold, counterSold: c.counterSold, earlyStockouts: c.earlyStockouts, signals: c.signals, incompleteDays: c.quality.incompleteDays.length })),
    },
    openRecommendations: recs.recommendations.filter((r) => !r.review || r.review.status === 'more_info').length,
    synthetic: explore.dataQuality.synthetic || connect.dataQuality.synthetic || eat.dataQuality.synthetic,
  };
}

export async function recommendations(adminUser, period, preloaded = {}) {
  const [explore, connect, eat, proposalSnap] = await Promise.all([
    preloaded.explore || exploreAnalytics(adminUser, period),
    preloaded.connect || connectAnalytics(period),
    preloaded.eat || eatAnalytics(period),
    db.collection('proposals').where('status', '==', 'submitted').limit(50).get(),
  ]);
  const proposals = await Promise.all(proposalSnap.docs.map((d) => getProposal(adminUser, d.id)));
  const recs = [
    ...exploreRecommendations({ categories: explore.categories, events: explore.events, proposals }, period),
    ...connectRecommendations(connect.skills, period),
    ...eatRecs(eat, period),
  ];
  const reviews = recs.length ? await db.getAll(...recs.map((r) => db.collection('recommendationReviews').doc(r.id))) : [];
  return {
    period,
    synthetic: explore.dataQuality.synthetic || connect.dataQuality.synthetic || eat.dataQuality.synthetic,
    recommendations: recs.map((r, i) => ({
      ...r,
      period: period.label,
      review: reviews[i].exists ? { ...reviews[i].data(), reviewedAt: iso(reviews[i].get('reviewedAt')) } : null,
    })),
  };
}

export async function reviewRecommendation(adminUser, id, { status, note }) {
  const data = { status, note, reviewedBy: adminUser.uid, reviewedAt: Timestamp.now() };
  await db.collection('recommendationReviews').doc(id).set(data);
  return { id, ...data, reviewedAt: data.reviewedAt.toDate().toISOString() };
}

const csvCell = (v) => {
  if (v === null || v === undefined) return '';
  // Leading = + - @ would run as a formula in a spreadsheet
  const s = typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : String(v).replace(/^([=+\-@])/, "'$1");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (header, rows) => [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n';

export async function report(adminUser, kind, period) {
  if (kind === 'eat-items') {
    const { items } = await eatAnalytics(period);
    return toCsv(
      ['canteen', 'item', 'category', 'days_on_menu', 'planned', 'online_sold', 'counter_sold', 'sold', 'gross_sales_inr', 'cancelled', 'wastage', 'stockout_days', 'early_stockout_days', 'median_stockout_time', 'failed_online_attempts', 'counter_requests_anonymous', 'interest_responses', 'stated_substitutions', 'stated_no_purchase'],
      items.map((i) => [i.canteenName, i.name, i.category, i.daysOnMenu, i.planned, i.onlineSold, i.counterSold, i.sold, i.gross, i.cancelled, i.wastage, i.stockoutDays, i.earlyStockoutDays, i.medianStockoutTime, i.signals.failedOnlineAttempts, i.signals.counterRequests, i.signals.interestResponses, i.signals.substitutions, i.signals.noPurchase])
    );
  }
  if (kind === 'skills') {
    const { skills } = await connectAnalytics(period);
    return toCsv(
      ['skill', 'collaboration_requests', 'hire_requests', 'demand', 'previous_period_demand', 'unfulfilled', 'active_providers', 'available_profiles', 'profiles_listing_skill', 'demand_to_supply'],
      skills.map((s) => [s.skill, s.requests, s.hireRequests, s.demand, s.previousDemand, s.unfulfilled, s.activeProviders, s.availableProfiles, s.listedInProfiles, s.demandToSupply])
    );
  }
  const explore = await exploreAnalytics(adminUser, period);
  if (kind === 'events') {
    return toCsv(
      ['event', 'organisation', 'category', 'start', 'capacity', 'viewers', 'saves', 'registrations', 'verified_attendance', 'conversion', 'utilisation', 'feedback_responses', 'feedback_average', 'synthetic'],
      explore.events.map((e) => [e.title, e.orgId, e.category, e.start, e.capacity, e.viewers, e.saves, e.registrations, e.attended, e.conversion, e.utilisation, e.feedback.responses, e.feedback.average, e.synthetic])
    );
  }
  return toCsv(
    ['organisation', 'category', 'events', 'registrations', 'unique_registrants', 'verified_attendance', 'unique_attendees', 'repeat_attendees', 'conversion', 'previous_period_events', 'previous_period_attendance'],
    explore.organisations.map((o) => [o.name, o.category, o.current.events, o.current.registrations, o.current.uniqueRegistrants, o.current.attended, o.current.uniqueAttendees, o.current.repeatAttendees, o.current.conversion, o.previous.events, o.previous.attended])
  );
}
