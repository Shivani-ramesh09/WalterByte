// src/services/analytics/exploreAnalytics.js
// Pure Explore calculations shared by dashboard cards, tables, proposals and
// CSV reports, so every view reports the same numbers.
//
// Funnel definitions (each person counted once per event, from
// events/{id}/participants/{uid}):
//   viewers       – signed-in students who opened the event detail
//   saves         – students with the event currently saved
//   registrations – students currently registered (cancelled RSVPs excluded)
//   attended      – attendance verified by the organiser or an administrator
//   conversion    – attended / registrations (null without registrations)
//   utilisation   – attended / capacity (null without a capacity)
import { median, termOf } from '../../utils/period.js';

export const READINESS_CRITERIA = [
  { key: 'proposalComplete', label: 'Complete written proposal' },
  { key: 'committeeConfirmed', label: 'Committee roles confirmed' },
  { key: 'milestones', label: 'Planning milestones set' },
  { key: 'venueFeasible', label: 'Venue and schedule feasible' },
  { key: 'budgetRealistic', label: 'Itemised, realistic budget' },
  { key: 'recruitmentEvidence', label: 'Recruitment or participation evidence' },
  { key: 'riskPlan', label: 'Risk and contingency plan' },
];

// Fewer comparable past events than this and we refuse to project attendance
export const MIN_COMPARABLE_EVENTS = 3;

const ratio = (a, b) => (b > 0 ? a / b : null);

export function eventFunnel(event, participants) {
  const registered = participants.filter((p) => p.registered);
  const attended = participants.filter((p) => p.attended);
  const ratings = participants.map((p) => p.feedback?.rating).filter(Number.isFinite);
  return {
    eventId: event.id,
    title: event.title,
    orgId: event.orgId,
    category: event.category,
    start: event.start,
    leadershipTerm: event.leadershipTerm || null,
    context: event.context || null,
    capacity: event.capacity || null,
    synthetic: Boolean(event.synthetic),
    viewers: participants.filter((p) => p.viewedAt).length,
    saves: participants.filter((p) => p.saved).length,
    registrations: registered.length,
    attended: attended.length,
    conversion: ratio(attended.length, registered.length),
    utilisation: event.capacity ? attended.length / event.capacity : null,
    feedback: { responses: ratings.length, average: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null },
    attendeeIds: attended.map((p) => p.uid),
    registrantIds: registered.map((p) => p.uid),
  };
}

/** Totals over many events, counting each student once. */
export function summarise(funnels) {
  const sum = (k) => funnels.reduce((n, f) => n + f[k], 0);
  const attendance = new Map();
  for (const f of funnels) for (const uid of f.attendeeIds) attendance.set(uid, (attendance.get(uid) || 0) + 1);
  const registrants = new Set(funnels.flatMap((f) => f.registrantIds));
  const ratings = funnels.filter((f) => f.feedback.responses);
  const responses = ratings.reduce((n, f) => n + f.feedback.responses, 0);
  return {
    events: funnels.length,
    viewers: sum('viewers'),
    registrations: sum('registrations'),
    attended: sum('attended'),
    uniqueRegistrants: registrants.size,
    uniqueAttendees: attendance.size,
    repeatAttendees: [...attendance.values()].filter((n) => n >= 2).length,
    conversion: ratio(sum('attended'), sum('registrations')),
    feedback: {
      responses,
      average: responses ? ratings.reduce((n, f) => n + f.feedback.average * f.feedback.responses, 0) / responses : null,
    },
  };
}

/** Per-category totals for the current period next to the previous one. */
export function categoryTrends(current, previous) {
  const cats = [...new Set([...current, ...previous].map((f) => f.category))].sort();
  return cats.map((category) => {
    const cur = summarise(current.filter((f) => f.category === category));
    const prev = summarise(previous.filter((f) => f.category === category));
    return { category, current: cur, previous: prev };
  });
}

/** Organisation history grouped by academic term, with leadership context kept. */
export function organisationHistory(funnels) {
  const terms = new Map();
  for (const f of funnels) {
    const term = termOf(f.start);
    if (!terms.has(term)) terms.set(term, []);
    terms.get(term).push(f);
  }
  return [...terms.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([term, fs]) => ({
      term,
      leadershipTerms: [...new Set(fs.map((f) => f.leadershipTerm).filter(Boolean))],
      ...summarise(fs),
    }));
}

/**
 * Evidence pack for a funding/support proposal. Historical outcomes, current
 * readiness, demand, budget and scenarios are reported separately; nothing
 * here approves, rejects or scores the proposal.
 *
 * @param proposal     proposals/{id} data
 * @param orgPast      funnels of the organisation's past events
 * @param comparable   funnels of past events in the same category (all organisations)
 */
export function assessProposal(proposal, orgPast, comparable) {
  const readiness = READINESS_CRITERIA.map((c) => ({
    ...c,
    met: Boolean(proposal.readiness?.[c.key]?.met && proposal.readiness[c.key].evidence?.trim()),
    evidence: proposal.readiness?.[c.key]?.evidence || '',
  }));
  const conversions = comparable.map((f) => f.conversion).filter((c) => c !== null);
  const expected = proposal.expectedParticipants;
  const budget = proposal.budget?.requested ?? null;
  const capacity = proposal.capacity || null;

  let scenarios = null;
  if (conversions.length >= MIN_COMPARABLE_EVENTS && expected) {
    const attend = (rate) => Math.round(Math.min(expected * rate, capacity || Infinity));
    scenarios = [
      ['Low', Math.min(...conversions)],
      ['Middle', median(conversions)],
      ['High', Math.max(...conversions)],
    ].map(([name, rate]) => {
      const attendance = attend(rate);
      return { name, conversion: rate, attendance, costPerAttendee: budget !== null && attendance ? budget / attendance : null };
    });
  }

  const missing = readiness.filter((r) => !r.met).map((r) => r.label);
  const risks = [
    ...missing.map((m) => `No documented evidence for: ${m}.`),
    ...(capacity && expected > capacity ? [`Expected participants (${expected}) exceed venue capacity (${capacity}).`] : []),
    ...(orgPast.length < MIN_COMPARABLE_EVENTS ? ['Limited track record: fewer than 3 past events on record for this organisation.'] : []),
  ];

  return {
    historical: { ...summarise(orgPast), byTerm: organisationHistory(orgPast), limited: orgPast.length < MIN_COMPARABLE_EVENTS },
    readiness: { criteria: readiness, met: readiness.filter((r) => r.met).length, total: readiness.length },
    demand: {
      comparableEvents: comparable.length,
      medianRegistrations: median(comparable.map((f) => f.registrations)),
      medianConversion: median(conversions),
    },
    budget: {
      requested: budget,
      costPerExpectedParticipant: budget !== null && expected ? budget / expected : null,
    },
    scenarios,
    scenarioNote: scenarios
      ? `Scenarios apply the lowest, median and highest registration-to-attendance conversion of ${conversions.length} comparable past events to the ${expected} expected registrations. They are conditional estimates, not predictions.`
      : `Insufficient data: fewer than ${MIN_COMPARABLE_EVENTS} comparable past events with registrations, so no attendance scenarios are shown.`,
    risks,
  };
}

/** Targets in the proposal against what was recorded after the event. */
export function outcomeComparison(proposal, funnel) {
  const o = proposal.outcome || {};
  const t = proposal.targets || {};
  const spendVerified = Boolean(o.spendVerified && Number.isFinite(o.actualSpend));
  const revenueVerified = Boolean(o.revenueVerified && Number.isFinite(o.actualRevenue));
  return {
    attendance: { target: t.attendance ?? null, actual: funnel?.attended ?? null },
    registrations: { target: t.registrations ?? null, actual: funnel?.registrations ?? null },
    feedback: { target: t.feedbackAverage ?? null, actual: funnel?.feedback.average ?? null, responses: funnel?.feedback.responses ?? 0 },
    spend: { planned: proposal.budget?.requested ?? null, actual: spendVerified ? o.actualSpend : null, verified: spendVerified },
    activities: { planned: proposal.plannedActivities || [], delivered: o.deliveredActivities || [] },
    // Financial ROI only from verified money in and out; attendance is never ROI
    financialRoi: spendVerified && revenueVerified && o.actualSpend > 0 ? (o.actualRevenue - o.actualSpend) / o.actualSpend : null,
    notes: o.notes || '',
  };
}
