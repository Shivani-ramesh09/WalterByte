// scripts/seedEat.js
// SYNTHETIC Eat history for the administration dashboard: emulator only, every
// document flagged synthetic: true. Not real Amrita sales.
//
// 28 past days per canteen plus today's published menu. Menus rotate at random
// (no weekday pattern). Demand is simulated per customer: the first `planned`
// arrivals are served, the rest are unmet, and only some unmet customers leave
// a recorded signal, as in real life. Cashiers skip logging on some days and
// two days have no counter data at all, so the data-quality flags show.
// Deterministic: fixed-seed PRNG, dates relative to the day the seed runs.

const EAT_SEED = 7041;
const DAY = 24 * 60 * 60 * 1000;
const BASE_DEMAND = { Breakfast: 30, Meals: 40, Chicken: 25, Egg: 18, Snacks: 24, Beverages: 45 };
const SPECIAL = {
  'samudra/chicken-biriyani': { base: 78, prep: 0.74 }, // sells out early, with requests
  'sopanam/chicken-biriyani': { base: 46, prep: 1.02 }, // sometimes sells out late
  'prasada/masala-dosa': { base: 38, prep: 0.95 },
};
const WINDOWS = { Breakfast: [480, 660], Meals: [690, 900], Chicken: [690, 900], Egg: [480, 1200], Snacks: [900, 1140], Beverages: [480, 1200] };

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const periodOf = (m) => (m < 660 ? 'breakfast' : m < 900 ? 'lunch' : m < 1080 ? 'snacks' : 'dinner');
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}${String(m % 60).padStart(2, '0')}`;

export function buildEatSeed(nowDate, canteens, studentIds) {
  const rand = mulberry32(EAT_SEED);
  const dateOf = (d) => new Date(d.getTime() + 330 * 60000).toISOString().slice(0, 10);
  const at = (date, minutes) => new Date(Date.parse(`${date}T00:00:00Z`) + (minutes - 330) * 60000);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const todayDate = dateOf(nowDate);
  const out = { menus: [], inventory: [], orders: [], counterSales: [], signals: [], statuses: [] };

  for (let ago = 28; ago >= 0; ago--) {
    const date = dateOf(new Date(nowDate.getTime() - ago * DAY));
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const dayFactor = weekday === 0 || weekday === 6 ? 0.6 : 1;
    const isToday = date === todayDate;
    const counterMode = ago === 9 || ago === 17 ? 'none' : ago % 4 === 0 ? 'import' : 'live';
    const cashierLogs = rand() < 0.7;

    for (const c of canteens) {
      const chosen = c.menu.filter((m) => (SPECIAL[`${c.id}/${m.id}`] ? rand() < 0.9 : rand() < 0.75));
      const menuItems = chosen.map((m) => {
        const spec = SPECIAL[`${c.id}/${m.id}`];
        const base = spec?.base ?? BASE_DEMAND[m.category] ?? 25;
        // Today's specials are small so a live demo can sell them out
        const planned = isToday && spec ? 6 : Math.round(base * dayFactor * (spec?.prep ?? 1.05 + rand() * 0.3));
        return { itemId: m.id, name: m.name, category: m.category, price: m.price, isVeg: m.isVeg, planned, preorder: true, availableFrom: null, availableTo: null, base };
      });
      out.menus.push({ canteenId: c.id, businessDate: date, items: menuItems.map(({ base, ...i }) => i), isToday });
      if (isToday) {
        for (const { base, ...i } of menuItems) out.inventory.push({ canteenId: c.id, businessDate: date, ...i, onMenu: true, menuVersion: 1, isToday: true });
        continue;
      }

      let txn = 0;
      for (const mi of menuItems) {
        const [from, to] = WINDOWS[mi.category] || [480, 1200];
        const demand = Math.round(mi.base * dayFactor * (0.8 + rand() * 0.45));
        const arrivals = Array.from({ length: demand }, () => ({ t: Math.round(from + (to - from) * ((rand() + rand()) / 2)), online: rand() < 0.3 })).sort((a, b) => a.t - b.t);
        const served = arrivals.slice(0, mi.planned);
        const unmet = arrivals.slice(mi.planned);
        const stockoutAt = unmet.length && served.length ? at(date, served[served.length - 1].t) : null;
        const onlineServed = served.filter((a) => a.online);
        const counterServed = served.filter((a) => !a.online);

        // Online orders grouped per 15 minutes, up to 3 portions each
        const buckets = new Map();
        for (const a of onlineServed) buckets.set(Math.floor(a.t / 15), [...(buckets.get(Math.floor(a.t / 15)) || []), a]);
        // Every served online portion is a collected order. Occasionally a
        // student also places an order and cancels it; those portions went
        // back on sale and were bought by the next customer, so sales are unchanged.
        let cancelled = 0;
        const order = (k, t, qty, status) => {
          const created = at(date, Math.max(from - 30, t - 20));
          const slotStart = at(date, k * 15);
          out.orders.push({
            canteenId: c.id,
            canteenName: c.name,
            placeId: c.placeId || null,
            userId: pick(studentIds),
            customerName: 'Demo Student',
            items: [{ itemId: mi.itemId, name: mi.name, price: mi.price, quantity: qty, lineTotal: qty * mi.price }],
            total: qty * mi.price,
            pickupSlot: { id: `${date.replace(/-/g, '')}_${hhmm(k * 15)}`, start: slotStart, end: new Date(slotStart.getTime() + 5 * 60000) },
            paymentMethod: 'upi_mock',
            paymentStatus: status === 'cancelled' ? 'refunded_mock' : 'paid',
            paymentReference: `MOCK-SYN${out.orders.length}`,
            status,
            createdAt: created,
            updatedAt: created,
            businessDate: date,
            menuVersion: 1,
            inventoryTracked: true,
          });
        };
        for (const [k, group] of buckets) {
          for (let i = 0; i < group.length; i += 3) {
            order(k, group[i].t, Math.min(3, group.length - i), 'collected');
            if (rand() < 0.05) {
              order(k, group[i].t, 1, 'cancelled');
              cancelled++;
            }
          }
        }

        // Counter transactions grouped per 10 minutes
        const cb = new Map();
        for (const a of counterServed) cb.set(Math.floor(a.t / 10), (cb.get(Math.floor(a.t / 10)) || 0) + 1);
        if (counterMode !== 'none') {
          for (const [k, qty] of cb) {
            txn++;
            out.counterSales.push({
              canteenId: c.id,
              businessDate: date,
              txnId: `SYN-${date}-${c.id}-${txn}`,
              at: at(date, k * 10 + 5),
              period: periodOf(k * 10),
              lines: [{ itemId: mi.itemId, name: mi.name, price: mi.price, quantity: qty, lineTotal: qty * mi.price }],
              total: qty * mi.price,
              source: counterMode,
              oversold: [],
            });
          }
        }

        // Recorded unmet demand: only some unmet customers leave a trace
        let counterLogged = 0;
        for (const a of unmet) {
          const student = pick(studentIds);
          if (a.online && rand() < 0.6) {
            out.signals.push({ canteenId: c.id, itemId: mi.itemId, businessDate: date, period: periodOf(a.t), at: at(date, a.t), type: 'failed_online_attempt', quantity: 1, actorKey: student, anonymous: false, outcome: null, source: 'app', status: 'valid' });
            // Some of the same students also tap "I wanted this": a duplicate across channels
            if (rand() < 0.3) {
              const r = rand();
              out.signals.push({ id: `interest_${c.id}_${date}_${mi.itemId}_${student}`, canteenId: c.id, itemId: mi.itemId, businessDate: date, period: periodOf(a.t), at: at(date, a.t + 2), type: 'interest', quantity: 1, actorKey: student, anonymous: false, outcome: r < 0.4 ? 'substituted' : r < 0.6 ? 'no_purchase' : null, substituteItemId: null, source: 'app', status: 'valid' });
            }
          } else if (!a.online && cashierLogs && counterMode !== 'none' && rand() < 0.6) counterLogged++;
        }
        if (counterLogged && stockoutAt) {
          out.signals.push({ id: `counter_${c.id}_syn-${date}-${mi.itemId}`, canteenId: c.id, itemId: mi.itemId, businessDate: date, period: periodOf(served[served.length - 1].t), at: stockoutAt, type: 'counter_request', quantity: counterLogged, actorKey: null, anonymous: true, outcome: null, source: 'counter', status: 'valid' });
        }

        out.inventory.push({
          canteenId: c.id,
          businessDate: date,
          itemId: mi.itemId,
          name: mi.name,
          category: mi.category,
          price: mi.price,
          isVeg: mi.isVeg,
          preorder: true,
          availableFrom: null,
          availableTo: null,
          onMenu: true,
          menuVersion: 1,
          planned: mi.planned,
          adjustments: 0,
          reserved: 0,
          onlineSold: onlineServed.length,
          counterSold: counterMode === 'none' ? 0 : counterServed.length,
          cancelled,
          wastage: unmet.length ? 0 : mi.planned - served.length,
          stockouts: stockoutAt ? [{ at: stockoutAt, until: null }] : [],
        });
      }
      out.statuses.push(
        counterMode === 'none'
          ? { canteenId: c.id, businessDate: date, counterSource: null, counterComplete: false }
          : { canteenId: c.id, businessDate: date, counterSource: counterMode, counterComplete: cashierLogs, lastCounterAt: at(date, 1200) }
      );
    }
  }
  return out;
}
