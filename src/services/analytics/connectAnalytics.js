// src/services/analytics/connectAnalytics.js
// Pure Connect skill-demand calculations.
//
// Demand comes only from things students asked for:
//   requests      – collaboration requests naming a skill (requests.skillsNeeded)
//   hireRequests  – hire requests sent to a freelance gig in that skill
// Supply is reported separately and never counted as demand:
//   activeProviders  – distinct students with an active gig in the skill
//   availableProfiles – profiles listing the skill and marked open to projects
//   listedInProfiles  – every profile listing the skill (no capacity implied)
import { change, inPeriod } from '../../utils/period.js';

const STALE_HIRE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

// Possible institutional resources to *evaluate* when demand outstrips supply
export const RESOURCE_HINTS = {
  photography: 'a campus media collective with shared camera kit',
  'video editing': 'a campus media collective with shared editing workstations',
  '3d printing': 'additional 3D printer capacity (e.g. in the Combustion Research Lab)',
  'machine learning': 'shared GPU / high-performance computing time',
  'deep learning': 'shared GPU / high-performance computing time',
  react: 'a supervised student software-projects programme',
  nodejs: 'a supervised student software-projects programme',
  'web development': 'a supervised student software-projects programme',
  'app development': 'a supervised student software-projects programme',
};

/** Is this request still unanswered/unserved at `now`? */
const unfulfilledRequest = (r) => r.status === 'open' && !r.responseCount;
const unfulfilledHire = (h, now) =>
  h.status === 'declined' || (h.status === 'pending' && now - h.createdAt > STALE_HIRE_DAYS * DAY_MS);

export function skillDemand({ requests, hireRequests, gigs, profiles }, period, now = new Date()) {
  const skills = new Map();
  const row = (skill) => {
    if (!skills.has(skill)) {
      skills.set(skill, {
        skill,
        requests: 0,
        hireRequests: 0,
        previousDemand: 0,
        unfulfilled: 0,
        providers: new Set(),
        availableProfiles: 0,
        listedInProfiles: 0,
      });
    }
    return skills.get(skill);
  };

  for (const r of requests) {
    for (const s of r.skillsNeeded || []) {
      if (inPeriod(r.createdAt, period)) {
        row(s).requests++;
        if (unfulfilledRequest(r)) row(s).unfulfilled++;
      } else if (inPeriod(r.createdAt, period.previous)) row(s).previousDemand++;
    }
  }
  for (const h of hireRequests) {
    if (inPeriod(h.createdAt, period)) {
      row(h.skill).hireRequests++;
      if (unfulfilledHire(h, now)) row(h.skill).unfulfilled++;
    } else if (inPeriod(h.createdAt, period.previous)) row(h.skill).previousDemand++;
  }
  // Supply is only attached to skills someone has asked for, or that have providers
  for (const g of gigs) if (g.status === 'active') row(g.skill).providers.add(g.sellerId);
  for (const p of profiles) {
    for (const s of p.skills || []) {
      if (!skills.has(s)) continue;
      skills.get(s).listedInProfiles++;
      if (p.availability === 'open_to_projects') skills.get(s).availableProfiles++;
    }
  }

  return [...skills.values()]
    .map(({ providers, ...s }) => {
      const demand = s.requests + s.hireRequests;
      return {
        ...s,
        demand,
        activeProviders: providers.size,
        growth: change(demand, s.previousDemand),
        // valid requests / active providers; null = demand with nobody offering the skill
        demandToSupply: providers.size ? demand / providers.size : null,
        resourceHint: RESOURCE_HINTS[s.skill] || null,
      };
    })
    .filter((s) => s.demand || s.previousDemand || s.activeProviders)
    .sort((a, b) => b.demand - a.demand || a.skill.localeCompare(b.skill));
}

/** Skills that are requested together in the same collaboration request. */
export function skillPairs(requests, period, limit = 10) {
  const pairs = new Map();
  for (const r of requests) {
    if (!inPeriod(r.createdAt, period)) continue;
    const s = [...new Set(r.skillsNeeded || [])].sort();
    for (let i = 0; i < s.length; i++) {
      for (let j = i + 1; j < s.length; j++) {
        const key = `${s[i]} + ${s[j]}`;
        pairs.set(key, (pairs.get(key) || 0) + 1);
      }
    }
  }
  return [...pairs.entries()]
    .map(([pair, count]) => ({ pair, count }))
    .sort((a, b) => b.count - a.count || a.pair.localeCompare(b.pair))
    .slice(0, limit);
}

/** Totals for overview cards. */
export function connectTotals({ requests, hireRequests }, period, now = new Date()) {
  const cur = requests.filter((r) => inPeriod(r.createdAt, period));
  const prev = requests.filter((r) => inPeriod(r.createdAt, period.previous));
  const hires = hireRequests.filter((h) => inPeriod(h.createdAt, period));
  const prevHires = hireRequests.filter((h) => inPeriod(h.createdAt, period.previous));
  return {
    requests: cur.length,
    previousRequests: prev.length,
    hireRequests: hires.length,
    previousHireRequests: prevHires.length,
    completedHires: hires.filter((h) => h.status === 'completed').length,
    unansweredRequests: cur.filter(unfulfilledRequest).length,
    unservedHires: hires.filter((h) => unfulfilledHire(h, now)).length,
  };
}
