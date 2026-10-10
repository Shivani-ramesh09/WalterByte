// src/services/eat/eatAdminService.js
// Eat intelligence for central administration: loads the period's ledger,
// orders, counter sales and demand signals with bounded queries and runs the
// shared calculations in ../analytics/eatAnalytics.js on the server.
import { db } from '../../config/firebase.js';
import { notFound } from '../../utils/apiError.js';
import { istParts } from '../../utils/istTime.js';
import {
  buildItemDays,
  canteenSummary,
  dataQuality,
  eatRecommendations,
  forecastDemand,
  grossScenario,
  interpretItem,
  itemSummaries,
} from '../analytics/eatAnalytics.js';
import { recId } from '../analytics/recommendations.js';

const LIMIT = 20000;
const toDate = (t) => (t?.toDate ? t.toDate() : t || null);

/** IST business dates covered by a period (to is exclusive). */
export const periodDates = (period) => ({ from: istParts(period.from).date, to: istParts(new Date(period.to.getTime() - 1)).date });

async function loadEat(period) {
  const { from, to } = periodDates(period);
  const byDate = (col) => db.collection(col).where('businessDate', '>=', from).where('businessDate', '<=', to).limit(LIMIT).get();
  const [inv, sig, status, sales, orders, canteenSnap] = await Promise.all([
    byDate('inventory'),
    byDate('demandSignals'),
    byDate('eatDataStatus'),
    byDate('counterSales'),
    db.collection('orders').where('createdAt', '>=', period.from).where('createdAt', '<', period.to).limit(LIMIT).get(),
    db.collection('canteens').get(),
  ]);
  const canteens = Object.fromEntries(canteenSnap.docs.map((d) => [d.id, { name: d.get('name'), closeTime: d.get('closeTime') }]));
  const inventory = inv.docs.map((d) => {
    const x = d.data();
    return { ...x, stockouts: (x.stockouts || []).map((s) => ({ at: toDate(s.at), until: toDate(s.until) })) };
  });
  return {
    canteens,
    inventory,
    signals: sig.docs.map((d) => d.data()),
    statuses: status.docs.map((d) => d.data()),
    counterSales: sales.docs.map((d) => ({ ...d.data(), at: toDate(d.get('at')) })),
    orders: orders.docs.map((d) => ({ ...d.data(), createdAt: toDate(d.get('createdAt')) })),
    truncated: [inv, sig, status, sales, orders].some((s) => s.size >= LIMIT),
    synthetic: inv.docs.some((d) => d.get('synthetic')),
  };
}

const NOTES = [
  'Gross sales = portions sold × that day\'s menu price. It is not profit: ingredient, labour and wastage costs are not recorded.',
  'Online sold = orders collected. Orders placed but never collected are shown as uncollected reservations.',
  'Counter figures come from cashier entries or imported billing files; days without either have no counter data.',
  'A stockout only shows supply ran out. Unmet demand is counted only from explicit signals, kept separate by type.',
];

export async function eatAnalytics(period) {
  const data = await loadEat(period);
  const days = buildItemDays(data);
  // Canteens with no published menu in the period have nothing to analyse
  const withMenus = new Set(days.map((d) => d.canteenId));
  const ids = Object.keys(data.canteens).filter((id) => withMenus.has(id)).sort();
  return {
    period,
    canteensWithoutMenus: Object.keys(data.canteens).filter((id) => !withMenus.has(id)).map((id) => data.canteens[id].name),
    canteens: ids.map((id) => ({
      canteenId: id,
      name: data.canteens[id].name,
      ...canteenSummary(id, { days, orders: data.orders, counterSales: data.counterSales }),
      quality: dataQuality(id, days, data.statuses),
    })),
    items: itemSummaries(days).map((it) => ({ ...it, canteenName: data.canteens[it.canteenId]?.name || it.canteenId })),
    dataQuality: { truncated: data.truncated, synthetic: data.synthetic, notes: NOTES },
    _days: days, // for recommendations; stripped before sending
  };
}

export async function itemDetail(canteenId, itemId, period, scenario = {}) {
  const data = await loadEat(period);
  if (!data.canteens[canteenId]) throw notFound('Canteen');
  const all = buildItemDays(data);
  const days = all.filter((d) => d.canteenId === canteenId && d.itemId === itemId).sort((a, b) => a.businessDate.localeCompare(b.businessDate));
  if (!days.length) throw notFound('Item in this period');
  const quality = dataQuality(canteenId, days, data.statuses);
  const todayDate = istParts(new Date()).date;
  // Today is still trading, so it is never a comparable day for the forecast
  const comparable = days.filter((d) => d.businessDate < todayDate);
  const latest = days[days.length - 1];
  const [summary] = itemSummaries(days);
  return {
    period,
    canteen: { id: canteenId, name: data.canteens[canteenId].name, closeTime: data.canteens[canteenId].closeTime },
    item: { itemId, name: latest.name, category: latest.category, price: latest.price },
    summary,
    days,
    quality: {
      ...quality,
      signalChannels: ['Online order attempts (automatic)', '"I wanted this" in the app (voluntary)', 'Cashier-recorded requests (anonymous counts)'],
      uniquePeopleNote: 'Unique people are counted only across app signals, which carry a student id. Cashier counts are anonymous and may include the same people.',
    },
    interpretation: interpretItem(days, quality),
    forecast: forecastDemand(comparable),
    scenario: scenario.portions ? grossScenario({ portions: scenario.portions, price: latest.price, unitCost: scenario.unitCost ?? null }) : null,
    synthetic: days.some((d) => d.synthetic),
  };
}

export function eatRecs(eat, period) {
  const byItem = new Map();
  for (const d of eat._days) {
    const k = `${d.canteenId}|${d.itemId}`;
    if (!byItem.has(k)) byItem.set(k, []);
    byItem.get(k).push(d);
  }
  const names = Object.fromEntries(eat.canteens.map((c) => [c.canteenId, c.name]));
  return eatRecommendations(eat.items, byItem, names, period, recId);
}

export const publicEat = ({ _days, ...rest }) => rest;
