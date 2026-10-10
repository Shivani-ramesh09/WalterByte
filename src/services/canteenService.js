// src/services/canteenService.js
// Business logic for canteens/{canteenId}, its menu and pickup slots.
//
// Data model:
//   canteens/{canteenId}
//     name, description, placeId (map pin id), openTime/closeTime "HH:mm" (IST),
//     isActive (manual open switch), slotMinutes, slotCapacity,
//     baseWaitMinutes, perOrderMinutes (queue heuristic inputs)
//   canteens/{canteenId}/menu/{itemId}
//     name, category, price (whole INR), isVeg, isAvailable
//   canteens/{canteenId}/slots/{YYYYMMDD_HHmm}
//     start, booked, capacity   (created on first booking)
import { db } from '../config/firebase.js';
import { notFound } from '../utils/apiError.js';
import { istParts, istDate, isRealDate, toMinutes, toHHmm } from '../utils/istTime.js';
import { estimateWaitMinutes } from './queueEstimator.js';

const CANTEENS = 'canteens';
export const OPEN_ORDER_STATUSES = ['placed', 'preparing'];
// Open orders due for pickup within this window count toward the live queue
const QUEUE_WINDOW_MS = 30 * 60 * 1000;

// ─── Hours & slots ───────────────────────────────────────────────────────────

export function isOpenAt(canteen, at = new Date()) {
  const { minutes } = istParts(at);
  return (
    canteen.isActive !== false &&
    minutes >= toMinutes(canteen.openTime) &&
    minutes < toMinutes(canteen.closeTime)
  );
}

/** Every pickup slot on an IST date that ends by closing time. */
export function slotsForDate(canteen, date) {
  const step = canteen.slotMinutes;
  const close = toMinutes(canteen.closeTime);
  const slots = [];
  for (let t = toMinutes(canteen.openTime); t + step <= close; t += step) {
    slots.push({
      id: `${date.replace(/-/g, '')}_${toHHmm(t)}`,
      start: istDate(date, t),
      end: istDate(date, t + step),
    });
  }
  return slots;
}

/** "YYYYMMDD_HHmm" → the slot if it is on this canteen's grid, else null. */
export function findSlot(canteen, slotId) {
  const m = /^(\d{4})(\d{2})(\d{2})_\d{4}$/.exec(slotId);
  if (!m) return null;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  if (!isRealDate(date)) return null;
  return slotsForDate(canteen, date).find((s) => s.id === slotId) ?? null;
}

// ─── Reads ───────────────────────────────────────────────────────────────────

async function getCanteenData(canteenId) {
  const snap = await db.collection(CANTEENS).doc(canteenId).get();
  if (!snap.exists) throw notFound('Canteen');
  return snap.data();
}

async function queueFor(canteenId, canteen, now) {
  const open = await db
    .collection('orders')
    .where('canteenId', '==', canteenId)
    .where('status', 'in', OPEN_ORDER_STATUSES)
    .select('pickupSlot.start')
    .get();
  const horizon = now.getTime() + QUEUE_WINDOW_MS;
  const openOrders = open.docs.filter((d) => d.get('pickupSlot.start').toMillis() <= horizon).length;
  return {
    estimatedWaitMinutes: estimateWaitMinutes({
      baseWaitMinutes: canteen.baseWaitMinutes,
      perOrderMinutes: canteen.perOrderMinutes,
      openOrders,
      at: now,
    }),
    openOrders,
    isEstimate: true,
  };
}

export async function listCanteens(now = new Date()) {
  const snap = await db.collection(CANTEENS).orderBy('name').get();
  return Promise.all(
    snap.docs.map(async (doc) => {
      const c = doc.data();
      const isOpen = isOpenAt(c, now);
      return {
        id: doc.id,
        name: c.name,
        description: c.description || '',
        placeId: c.placeId || null,
        openTime: c.openTime,
        closeTime: c.closeTime,
        slotMinutes: c.slotMinutes,
        isOpen,
        // No estimate while closed rather than a made-up number
        queue: isOpen ? await queueFor(doc.id, c, now) : null,
      };
    })
  );
}

export async function getMenu(canteenId, now = new Date()) {
  const canteen = await getCanteenData(canteenId);
  const snap = await db.collection(CANTEENS).doc(canteenId).collection('menu').get();

  const byCategory = new Map();
  const items = snap.docs
    .map((d) => {
      const m = d.data();
      return {
        id: d.id,
        name: m.name,
        category: m.category,
        price: m.price,
        isVeg: m.isVeg,
        isAvailable: m.isAvailable,
      };
    })
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  for (const item of items) {
    if (!byCategory.has(item.category)) byCategory.set(item.category, []);
    byCategory.get(item.category).push(item);
  }

  return {
    canteen: { id: canteenId, name: canteen.name, isOpen: isOpenAt(canteen, now) },
    categories: [...byCategory].map(([name, categoryItems]) => ({ name, items: categoryItems })),
  };
}

export async function getSlots(canteenId, date, now = new Date()) {
  const canteen = await getCanteenData(canteenId);
  const day = date || istParts(now).date;
  const slots = slotsForDate(canteen, day);
  const slotsRef = db.collection(CANTEENS).doc(canteenId).collection('slots');
  // Slots without a doc have no bookings yet
  const snaps = slots.length ? await db.getAll(...slots.map((s) => slotsRef.doc(s.id))) : [];

  return {
    canteenId,
    date: day,
    slotMinutes: canteen.slotMinutes,
    slots: slots.map((s, i) => {
      const capacity = snaps[i].get('capacity') ?? canteen.slotCapacity;
      const booked = snaps[i].get('booked') ?? 0;
      const remaining = Math.max(0, capacity - booked);
      return {
        id: s.id,
        start: s.start.toISOString(),
        end: s.end.toISOString(),
        capacity,
        booked,
        remaining,
        available: canteen.isActive !== false && remaining > 0 && s.start > now,
      };
    }),
  };
}
