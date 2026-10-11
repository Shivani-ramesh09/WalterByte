// src/services/analytics/recommendations.js
// Deterministic, explainable recommendation rules. Each one names the
// observation, period, supporting numbers, limitations and a suggested next
// step. None of them approves budgets or buys anything: an administrator
// reviews every recommendation.

const pct = (x) => `${Math.round(x * 100)}%`;
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

/** Stable id so a review stays attached to the same finding for the same period. */
export const recId = (rule, subject, period) =>
  `${rule}--${slug(subject)}--${period.label.replace(' to ', '--')}`;

export function connectRecommendations(skills, period) {
  const recs = [];
  for (const s of skills) {
    const gap = s.demand >= 5 && (s.activeProviders === 0 || s.demandToSupply >= 3);
    if (gap) {
      recs.push({
        id: recId('skill-gap', s.skill, period),
        module: 'connect',
        title: `Demand for ${s.skill} outstrips active providers`,
        observation: `${s.demand} requests for ${s.skill} (${s.requests} collaboration, ${s.hireRequests} hire) against ${s.activeProviders} active provider${s.activeProviders === 1 ? '' : 's'}; ${s.unfulfilled} went unanswered or unserved.`,
        metrics: [
          { label: 'Requests in period', value: s.demand },
          { label: 'Active providers', value: s.activeProviders },
          { label: 'Demand-to-supply', value: s.demandToSupply === null ? 'no providers' : s.demandToSupply.toFixed(1) },
          { label: 'Unfulfilled', value: s.unfulfilled },
          { label: 'Profiles listing the skill', value: s.listedInProfiles },
        ],
        limitations: [
          'Providers may have limited capacity or experience; a listed skill does not mean availability.',
          'Requests can be resolved outside the app, so unfulfilled counts may be overstated.',
          'Costs, existing facilities and utilisation are not recorded here.',
        ],
        action: s.resourceHint
          ? `Evaluate whether ${s.resourceHint} is justified: check existing capacity, utilisation and cost before any purchase.`
          : `Invite students with ${s.skill} skills to offer gigs, and recheck demand next period.`,
        evidence: s.demand >= 10 && s.unfulfilled >= 3 ? 'strong' : 'moderate',
      });
    } else if (s.demand >= 5 && s.growth !== null && s.growth >= 0.5) {
      recs.push({
        id: recId('skill-growth', s.skill, period),
        module: 'connect',
        title: `Requests for ${s.skill} are growing`,
        observation: `${s.demand} requests this period against ${s.previousDemand} in the previous period (${pct(s.growth)} change).`,
        metrics: [
          { label: 'Requests in period', value: s.demand },
          { label: 'Previous period', value: s.previousDemand },
          { label: 'Active providers', value: s.activeProviders },
        ],
        limitations: ['Two periods are a short trend; seasonal events (fests, exams) can explain a jump.'],
        action: 'Watch this skill for another period before committing resources.',
        evidence: 'limited',
      });
    }
  }
  return recs;
}

export function exploreRecommendations({ categories, events, proposals }, period) {
  const recs = [];
  for (const c of categories) {
    const cur = c.current.registrations;
    const prev = c.previous.registrations;
    if (cur >= 20 && prev > 0 && (cur - prev) / prev >= 0.25) {
      recs.push({
        id: recId('category-growth', c.category, period),
        module: 'explore',
        title: `${c.category} event registrations increased`,
        observation: `${cur} registrations across ${c.current.events} ${c.category} events, against ${prev} across ${c.previous.events} in the previous period.`,
        metrics: [
          { label: 'Registrations', value: cur },
          { label: 'Previous period', value: prev },
          { label: 'Verified attendance', value: c.current.attended },
          { label: 'Unique attendees', value: c.current.uniqueAttendees },
        ],
        limitations: [
          'More or larger events in a period raise registrations without more interest per event.',
          'Registrations are not attendance and are not financial return.',
        ],
        action: `Review whether future ${c.category} events merit additional support, using attendance and feedback, not registrations alone.`,
        evidence: c.current.events >= 3 ? 'moderate' : 'limited',
      });
    }
  }
  for (const e of events) {
    if (e.registrations >= 20 && e.conversion !== null && e.conversion < 0.5) {
      recs.push({
        id: recId('low-attendance', e.eventId, period),
        module: 'explore',
        title: `Low turnout for registrants of ${e.title}`,
        observation: `${e.attended} of ${e.registrations} registrants attended (${pct(e.conversion)}).`,
        metrics: [
          { label: 'Registrations', value: e.registrations },
          { label: 'Verified attendance', value: e.attended },
        ],
        limitations: ['Attendance depends on the organiser marking it completely; unmarked attendees look absent.'],
        action: 'Ask the organiser whether attendance was fully recorded, then consider reminders or a registration deposit.',
        evidence: 'moderate',
      });
    }
  }
  for (const p of proposals) {
    const a = p.assessment;
    const weakOrLimited =
      a.historical.limited ||
      (a.historical.conversion !== null && a.demand.medianConversion !== null && a.historical.conversion < a.demand.medianConversion);
    if (p.status === 'submitted' && weakOrLimited && a.readiness.met >= 5) {
      recs.push({
        id: recId('proposal-pilot', p.id, period),
        module: 'explore',
        title: `${p.title}: strong current readiness despite a ${a.historical.limited ? 'limited' : 'weaker'} track record`,
        observation: `${a.readiness.met} of ${a.readiness.total} readiness criteria are backed by documented evidence${p.leadershipTerm ? ` under the ${p.leadershipTerm}` : ''}.`,
        metrics: [
          { label: 'Past events on record', value: a.historical.events },
          { label: 'Past conversion', value: a.historical.conversion === null ? 'n/a' : pct(a.historical.conversion) },
          { label: 'Comparable median conversion', value: a.demand.medianConversion === null ? 'n/a' : pct(a.demand.medianConversion) },
          { label: 'Requested budget', value: a.budget.requested === null ? 'n/a' : `₹${a.budget.requested.toLocaleString('en-IN')}` },
        ],
        limitations: [
          'Readiness evidence is self-reported by the organisation until verified.',
          'Past outcomes were under different leadership and may not predict this team.',
        ],
        action: 'Consider supporting a smaller pilot with measurable targets before the full proposal.',
        evidence: 'moderate',
      });
    }
  }
  return recs;
}
