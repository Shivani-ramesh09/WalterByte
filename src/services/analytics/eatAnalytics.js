// src/services/analytics/eatAnalytics.js
// Pure Eat calculations shared by the dashboard, item views, recommendations
// and CSV reports.
//
// What each number means:
//   sold          onlineSold (collected) + counterSold
//   gross sales   sold × that day's menu price. Gross sales are not profit.
//   stockout      availability reached zero; a supply fact, never demand
//   signals       explicit records of unmet demand, kept apart by type:
//     failed_online_attempt  an online order rejected because the item was sold out
//     interest               a student tapped "I wanted this" (one per student per item per day)
//     counter_request        a cashier logged people asking for it (anonymous count)
//   outcomes      substituted / no_purchase are only counted when someone said
//                 so; everything else stays unknown
import { median } from '../../utils/period.js';
import { istParts, toMinutes } from '../../utils/istTime.js';
import { PERIODS, periodOf } from '../eat/eatRules.js';

export const MIN_FORECAST_DAYS = 4;
const EARLY_STOCKOUT_MINUTES = 60;
const istMinutes = (d) => istParts(d).minutes;

// ─── Unmet-demand signals ────────────────────────────────────────────────────

/** Break signals for one item into separate, non-additive measures. */
export function signalBreakdown(signals) {
  const valid = signals.filter((s) => s.status !== 'void');
  const failed = valid.filter((s) => s.type === 'failed_online_attempt');
  const interest = valid.filter((s) => s.type === 'interest');
  const counter = valid.filter((s) => s.type === 'counter_request');
  const qty = (xs) => xs.reduce((n, s) => n + (s.quantity || 1), 0);
  const people = new Set([...failed, ...interest].map((s) => s.actorKey).filter(Boolean));
  const said = (outcome) => qty(valid.filter((s) => s.outcome === outcome && s.type !== 'failed_online_attempt'));
  const identified = failed.length + interest.length;
  return {
    failedOnlineAttempts: failed.length,
    failedPortionsRequested: qty(failed),
    interestResponses: interest.length,
    counterRequests: qty(counter),
    counterEntries: counter.length,
    // Unique people only across signals that carry a student id
    uniqueIdentifiedPeople: people.size,
    duplicateIdentifiedSignals: identified - people.size,
    // Anonymous counter counts cannot be matched against app users
    possibleOverlap: qty(counter) > 0 && identified > 0,
    substitutions: said('substituted'),
    noPurchase: said('no_purchase'),
    unknownOutcome: qty(valid.filter((s) => s.type === 'failed_online_attempt' || !['substituted', 'no_purchase'].includes(s.outcome))),
    voided: signals.length - valid.length,
  };
}

// ─── Per item per day ────────────────────────────────────────────────────────

/** Minutes of service left when the item first sold out (window end, else period end, capped at closing). */
export function minutesLeftAtStockout(inv, at, closeTime) {
  const m = istMinutes(at);
  const close = closeTime ? toMinutes(closeTime) : 24 * 60;
  const periodEnd = PERIODS.find((p) => p.id === periodOf(m)).to;
  const end = Math.min(inv.availableTo ? toMinutes(inv.availableTo) : periodEnd, close);
  return Math.max(0, end - m);
}

export function itemDay(inv, signals, closeTime) {
  const sold = (inv.onlineSold || 0) + (inv.counterSold || 0);
  const first = inv.stockouts?.[0]?.at || null;
  const minutesLeft = first ? minutesLeftAtStockout(inv, first, closeTime) : null;
  const unavailableMinutes = (inv.stockouts || []).reduce((n, s) => {
    const end = s.until ? istMinutes(s.until) : Math.min(closeTime ? toMinutes(closeTime) : 24 * 60, inv.availableTo ? toMinutes(inv.availableTo) : 24 * 60);
    return n + Math.max(0, end - istMinutes(s.at));
  }, 0);
  return {
    canteenId: inv.canteenId,
    itemId: inv.itemId,
    name: inv.name,
    category: inv.category,
    businessDate: inv.businessDate,
    price: inv.price,
    planned: inv.planned ?? null,
    adjustments: inv.adjustments || 0,
    onlineSold: inv.onlineSold || 0,
    counterSold: inv.counterSold || 0,
    uncollected: inv.reserved || 0,
    cancelled: inv.cancelled || 0,
    wastage: inv.wastage ?? null,
    sold,
    gross: sold * inv.price,
    stockoutAt: first ? first.toISOString() : null,
    stockoutCount: (inv.stockouts || []).length,
    minutesLeftAtStockout: minutesLeft,
    earlyStockout: minutesLeft !== null && minutesLeft >= EARLY_STOCKOUT_MINUTES,
    unavailableMinutes: first ? unavailableMinutes : 0,
    signals: signalBreakdown(signals),
    synthetic: Boolean(inv.synthetic),
  };
}

const key = (canteenId, itemId, date) => `${canteenId}|${itemId}|${date}`;

export function buildItemDays({ inventory, signals, canteens }) {
  const byKey = new Map();
  for (const s of signals) {
    const k = key(s.canteenId, s.itemId, s.businessDate);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(s);
  }
  return inventory.map((inv) => itemDay(inv, byKey.get(key(inv.canteenId, inv.itemId, inv.businessDate)) || [], canteens[inv.canteenId]?.closeTime));
}

// ─── Aggregates ──────────────────────────────────────────────────────────────

const sumSignals = (rows) =>
  rows.reduce(
    (a, r) => {
      for (const k of ['failedOnlineAttempts', 'interestResponses', 'counterRequests', 'substitutions', 'noPurchase', 'unknownOutcome']) a[k] += r.signals[k];
      return a;
    },
    { failedOnlineAttempts: 0, interestResponses: 0, counterRequests: 0, substitutions: 0, noPurchase: 0, unknownOutcome: 0 }
  );

/** One row per canteen + item over the period. */
export function itemSummaries(days) {
  const groups = new Map();
  for (const d of days) {
    const k = `${d.canteenId}|${d.itemId}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(d);
  }
  return [...groups.values()].map((rows) => {
    const last = rows.reduce((a, b) => (a.businessDate > b.businessDate ? a : b));
    const sum = (f) => rows.reduce((n, r) => n + (r[f] || 0), 0);
    const stockoutDays = rows.filter((r) => r.stockoutAt);
    return {
      canteenId: last.canteenId,
      itemId: last.itemId,
      name: last.name,
      category: last.category,
      daysOnMenu: rows.length,
      planned: rows.every((r) => r.planned === null) ? null : sum('planned'),
      onlineSold: sum('onlineSold'),
      counterSold: sum('counterSold'),
      sold: sum('sold'),
      gross: sum('gross'),
      cancelled: sum('cancelled'),
      wastage: rows.some((r) => r.wastage !== null) ? sum('wastage') : null,
      stockoutDays: stockoutDays.length,
      earlyStockoutDays: rows.filter((r) => r.earlyStockout).length,
      medianStockoutTime: stockoutDays.length ? medianClock(stockoutDays.map((r) => r.stockoutAt)) : null,
      signals: sumSignals(rows),
    };
  });
}

const medianClock = (isos) => {
  const m = median(isos.map((i) => istMinutes(new Date(i))));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
};

/** Canteen-level totals, online versus counter, and demand by IST hour. */
export function canteenSummary(canteenId, { days, orders, counterSales }) {
  const d = days.filter((x) => x.canteenId === canteenId);
  const o = orders.filter((x) => x.canteenId === canteenId);
  const c = counterSales.filter((x) => x.canteenId === canteenId);
  const completed = o.filter((x) => x.status === 'collected');
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, online: 0, counter: 0 }));
  for (const x of o.filter((x) => x.status !== 'cancelled')) hours[Math.floor(istMinutes(x.createdAt) / 60)].online += x.items.reduce((n, l) => n + l.quantity, 0);
  for (const x of c) hours[Math.floor(istMinutes(x.at) / 60)].counter += x.lines.reduce((n, l) => n + l.quantity, 0);
  const sum = (f) => d.reduce((n, r) => n + (r[f] || 0), 0);
  const onlineGross = d.reduce((n, r) => n + r.onlineSold * r.price, 0);
  const counterGross = d.reduce((n, r) => n + r.counterSold * r.price, 0);
  return {
    canteenId,
    days: new Set(d.map((r) => r.businessDate)).size,
    onlineSold: sum('onlineSold'),
    counterSold: sum('counterSold'),
    sold: sum('sold'),
    onlineGross,
    counterGross,
    gross: onlineGross + counterGross,
    onlineOrders: completed.length,
    counterTransactions: c.length,
    averageOnlineOrder: completed.length ? completed.reduce((n, x) => n + x.total, 0) / completed.length : null,
    averageCounterTransaction: c.length ? c.reduce((n, x) => n + x.total, 0) / c.length : null,
    cancelledOrders: o.filter((x) => x.status === 'cancelled').length,
    uncollected: sum('uncollected'),
    wastage: d.some((r) => r.wastage !== null) ? sum('wastage') : null,
    stockouts: d.filter((r) => r.stockoutAt).length,
    earlyStockouts: d.filter((r) => r.earlyStockout).length,
    signals: sumSignals(d),
    byHour: hours.filter((h) => h.online || h.counter),
  };
}

/** Coverage of the sources behind the numbers, per canteen. */
export function dataQuality(canteenId, days, statuses) {
  const dates = [...new Set(days.filter((d) => d.canteenId === canteenId).map((d) => d.businessDate))].sort();
  const status = new Map(statuses.filter((s) => s.canteenId === canteenId).map((s) => [s.businessDate, s]));
  const complete = dates.filter((d) => status.get(d)?.counterComplete);
  const live = dates.filter((d) => status.get(d)?.counterSource === 'live');
  const imported = dates.filter((d) => status.get(d)?.counterSource === 'import');
  const none = dates.filter((d) => !status.get(d)?.counterSource);
  return {
    daysWithMenu: dates.length,
    counterCompleteDays: complete.length,
    counterLiveDays: live.length,
    counterImportDays: imported.length,
    daysWithoutCounterData: none,
    incompleteDays: dates.filter((d) => !status.get(d)?.counterComplete),
    oversoldDays: days.filter((d) => d.canteenId === canteenId && d.planned !== null && d.sold + d.uncollected > d.planned + d.adjustments).map((d) => `${d.businessDate} ${d.name}`),
  };
}

// ─── Forecast, scenario, interpretation ──────────────────────────────────────

/**
 * Plausible demand range for one item from comparable past days (any weekday:
 * menus do not repeat by weekday). Refuses with too little history.
 * low  = median portions sold (sales are capped by supply on sold-out days)
 * high = median of sold + recorded failed attempts + counter requests + interest
 */
export function forecastDemand(days) {
  const usable = days.filter((d) => d.planned !== null);
  if (usable.length < MIN_FORECAST_DAYS) {
    return { sufficient: false, observations: usable.length, message: 'Insufficient data to estimate additional demand.', reason: `Needs at least ${MIN_FORECAST_DAYS} comparable days with recorded preparation quantities; ${usable.length} available.` };
  }
  const low = median(usable.map((d) => d.sold));
  const high = median(usable.map((d) => d.sold + d.signals.failedPortionsRequested + d.signals.counterRequests + d.signals.interestResponses));
  const soldOut = usable.filter((d) => d.stockoutAt).length;
  return {
    sufficient: true,
    observations: usable.length,
    low: Math.round(low),
    high: Math.round(Math.max(low, high)),
    soldOutDays: soldOut,
    evidence: [
      `${usable.length} comparable days on the menu`,
      `${soldOut} of them sold out, so sales on those days understate demand`,
      'Recorded failed online attempts, counter requests and interest responses',
    ],
    assumptions: [
      'Each recorded request stands for at most one more portion; some people would not have bought.',
      'Counter requests are anonymous and may overlap with app signals, so the high end may double count.',
      'People who wanted the item but told nobody are not recorded, so true demand could be higher.',
      'Future days resemble these days (menu mix, events, exams and weather are not modelled).',
    ],
    note: 'A range from comparable days, not a statistical confidence interval.',
  };
}

/** Conditional gross-sales scenario; profit only with a user-supplied unit cost. */
export function grossScenario({ portions, price, unitCost = null }) {
  const grossSales = portions * price;
  const contribution = unitCost === null ? null : portions * (price - unitCost);
  return {
    portions,
    price,
    unitCost,
    grossSales,
    contribution,
    statement:
      `If ${portions} additional portions could be sold at ₹${price} each, gross sales would be ₹${grossSales.toLocaleString('en-IN')} before additional costs. ` +
      'This is a scenario, not a prediction or guaranteed return.' +
      (contribution === null ? '' : ` With the assumed ingredient and preparation cost of ₹${unitCost} per portion, the contribution would be ₹${contribution.toLocaleString('en-IN')}, before labour, capacity and wastage risk.`),
  };
}

/** What the evidence supports for one item, in plain sentences. */
export function interpretItem(days, quality) {
  const n = days.length;
  const out = days.filter((d) => d.stockoutAt);
  const early = days.filter((d) => d.earlyStockout);
  const s = sumSignals(days);
  const strong = s.failedOnlineAttempts + s.counterRequests;
  const lines = {
    supports: [],
    unknown: [
      'How many people wanted the item without recording it anywhere.',
      'Whether people who could not buy it bought something else or left, unless they said so.',
    ],
    nextStep: '',
  };
  if (!out.length) lines.supports.push(`It did not sell out on any of the ${n} days, so sales are a fair measure of demand at these quantities.`);
  else lines.supports.push(`It sold out on ${out.length} of ${n} days; on ${early.length} of them with an hour or more of service left.`);
  if (strong || s.interestResponses) {
    lines.supports.push(`Recorded unmet demand: ${s.failedOnlineAttempts} failed online attempts, ${s.counterRequests} counter requests and ${s.interestResponses} "I wanted this" responses. These are lower bounds, kept separate, and not extra portions that would certainly have sold.`);
  } else if (out.length) {
    lines.supports.push('No unmet-demand signals were recorded after the stockouts, so the stockouts alone do not show how much more would have sold.');
  }
  if (quality.incompleteDays.length) lines.unknown.push(`Counter records are incomplete on ${quality.incompleteDays.length} day(s), so counter requests may be undercounted.`);
  if (early.length >= 2 && strong < 5) lines.nextStep = 'Ask cashiers to log every request for this item after it sells out for the next two weeks, so the size of the gap can be measured.';
  else if (early.length >= 3) lines.nextStep = 'Try a measured increase on a few comparable days and compare sell-out time, recorded requests and wastage.';
  else lines.nextStep = 'Keep recording; no change is indicated yet.';
  return lines;
}

// ─── Recommendations ─────────────────────────────────────────────────────────

/** Preparation reviews for items that repeatedly sell out early with recorded requests. */
export function eatRecommendations(items, daysByItem, canteenNames, period, recId) {
  const recs = [];
  for (const it of items) {
    const days = daysByItem.get(`${it.canteenId}|${it.itemId}`) || [];
    const strong = it.signals.failedOnlineAttempts + it.signals.counterRequests;
    if (it.earlyStockoutDays < 3 || strong < 5) continue;
    const f = forecastDemand(days);
    const plannedMedian = median(days.filter((d) => d.planned !== null).map((d) => d.planned + d.adjustments));
    recs.push({
      id: recId('prep-review', `${it.canteenId}-${it.itemId}`, period),
      module: 'eat',
      title: `${it.name} at ${canteenNames[it.canteenId] || it.canteenId} repeatedly sells out early`,
      observation: `Sold out with an hour or more of service left on ${it.earlyStockoutDays} of ${it.daysOnMenu} days (median sell-out ${it.medianStockoutTime}); ${it.signals.failedOnlineAttempts} failed online attempts and ${it.signals.counterRequests} counter requests were recorded.`,
      metrics: [
        { label: 'Days on menu', value: it.daysOnMenu },
        { label: 'Early sell-outs', value: it.earlyStockoutDays },
        { label: 'Median prepared', value: plannedMedian ?? 'n/a' },
        { label: 'Failed online attempts', value: it.signals.failedOnlineAttempts },
        { label: 'Counter requests (anonymous)', value: it.signals.counterRequests },
        { label: 'Plausible demand range', value: f.sufficient ? `${f.low}-${f.high} portions/day` : 'insufficient data' },
      ],
      limitations: [
        'Requests are lower bounds and may overlap between the app and the counter.',
        'A request is not a guaranteed extra sale; some people would have bought something else.',
        'Ingredient cost, kitchen capacity, shelf life and wastage are not recorded here.',
      ],
      action: !f.sufficient || plannedMedian === null
        ? 'Review preparation with the kitchen and keep recording requests until a demand range can be estimated.'
        : f.high > plannedMedian
          ? `Review preparation: evaluate between ${plannedMedian} and ${f.high} portions on comparable days, weighing food cost, capacity, shelf life and wastage. The kitchen decides.`
          : 'Recorded demand does not clearly exceed the usual preparation. Check whether it sells out because of timing (an earlier rush) rather than quantity, and keep recording requests.',
      evidence: strong >= 15 && it.earlyStockoutDays >= 5 ? 'strong' : 'moderate',
    });
  }
  return recs;
}
