// src/services/orderService.js
// Business logic for orders/{orderId}.
//
// Data model:
//   orders/{orderId}
//     userId, customerName, canteenId, canteenName, placeId,
//     items [{ itemId, name, price, quantity, lineTotal }], total (whole INR),
//     pickupSlot { id, start, end },
//     paymentMethod "upi_mock", paymentStatus "paid", paymentReference,
//     status "placed" | "preparing" | "ready" | "collected" | "cancelled",
//     createdAt, updatedAt, preparingAt, readyAt, collectedAt (set by staff),
//     cancelledAt, cancelledBy
//     businessDate, menuVersion, inventoryTracked  (orders from a published daily menu)
//
// With a published daily menu for the pickup date, prices and stock come from
// it and each order reserves portions in the inventory ledger inside the same
// transaction (no overselling). Without one, the static canteen menu is used.
import { db } from '../config/firebase.js';
import { ApiError, notFound } from '../utils/apiError.js';
import { findSlot } from './canteenService.js';
import { inventoryRef, publishedMenu } from './eat/dailyMenuService.js';
import { availableOf, nextStockouts, periodOf } from './eat/eatRules.js';
import { recordFailedAttempts } from './eat/demandService.js';
import { istParts, toMinutes } from '../utils/istTime.js';
import admin from 'firebase-admin';

const { Timestamp, FieldValue } = admin.firestore;
const ORDERS = 'orders';

const toIso = (ts) => (ts ? ts.toDate().toISOString() : null);

export function serializeOrder(id, o) {
  return {
    id,
    ...o,
    pickupSlot: { id: o.pickupSlot.id, start: toIso(o.pickupSlot.start), end: toIso(o.pickupSlot.end) },
    createdAt: toIso(o.createdAt),
    updatedAt: toIso(o.updatedAt),
    preparingAt: toIso(o.preparingAt),
    readyAt: toIso(o.readyAt),
    collectedAt: toIso(o.collectedAt),
    cancelledAt: toIso(o.cancelledAt),
  };
}

// ─── Create ──────────────────────────────────────────────────────────────────

export async function createOrder(uid, { canteenId, slotId, items }) {
  const canteenRef = db.collection('canteens').doc(canteenId);
  const slotRef = canteenRef.collection('slots').doc(slotId);
  const orderRef = db.collection(ORDERS).doc();
  // Name shown at the counter; outside the transaction, profiles are not order state
  const customerName = (await db.collection('users').doc(uid).get()).get('name') || null;

  // Capacity check, slot increment and order create share one transaction so
  // concurrent checkouts cannot overbook a slot.
  const order = await db.runTransaction(async (tx) => {
    const canteenSnap = await tx.get(canteenRef);
    if (!canteenSnap.exists) throw notFound('Canteen');
    const canteen = canteenSnap.data();
    if (canteen.isActive === false) {
      throw new ApiError(409, 'CANTEEN_CLOSED', 'This canteen is not taking orders right now.');
    }

    const slot = findSlot(canteen, slotId);
    if (!slot || slot.start <= new Date()) {
      throw new ApiError(409, 'SLOT_UNAVAILABLE', 'That pickup slot is not available. Pick another.');
    }

    // Prices and availability come from Firestore only, never from the client
    const businessDate = istParts(slot.start).date;
    const daily = await publishedMenu(canteenId, businessDate, tx);
    const priced = daily
      ? await dailyMenuLines(tx, canteenId, businessDate, daily, items, slot)
      : await staticMenuLines(tx, canteenRef, items);

    const slotSnap = await tx.get(slotRef);
    const capacity = slotSnap.get('capacity') ?? canteen.slotCapacity;
    const booked = slotSnap.get('booked') ?? 0;
    if (booked >= capacity) {
      throw new ApiError(409, 'SLOT_FULL', 'That pickup slot just filled up. Pick another.');
    }

    const lines = priced.lines;
    const now = Timestamp.now();
    const data = {
      userId: uid,
      customerName,
      canteenId,
      canteenName: canteen.name,
      placeId: canteen.placeId || null,
      items: lines,
      total: lines.reduce((sum, l) => sum + l.lineTotal, 0),
      pickupSlot: { id: slotId, start: Timestamp.fromDate(slot.start), end: Timestamp.fromDate(slot.end) },
      // shortcut: demo-only mock UPI, no money moves; plug a real gateway in here after the demo
      paymentMethod: 'upi_mock',
      paymentStatus: 'paid',
      paymentReference: `MOCK-${orderRef.id.slice(0, 8).toUpperCase()}`,
      status: 'placed',
      createdAt: now,
      updatedAt: now,
      ...(daily && { businessDate, menuVersion: daily.version, inventoryTracked: true }),
    };

    tx.set(slotRef, { start: data.pickupSlot.start, booked: booked + 1, capacity });
    // Reserve portions: deducted once here, moved to onlineSold on collection
    for (const r of priced.reservations) tx.update(r.ref, r.update(now));
    tx.create(orderRef, data);
    return data;
  }).catch(async (err) => {
    // A rejected attempt on a sold-out item is a recorded unmet-demand signal
    if (err.code === 'ITEMS_SOLD_OUT') await recordFailedAttempts(uid, canteenId, err.attempts);
    throw err;
  });

  return serializeOrder(orderRef.id, order);
}

async function staticMenuLines(tx, canteenRef, items) {
  const menuSnaps = await tx.getAll(...items.map((it) => canteenRef.collection('menu').doc(it.itemId)));
  const unavailable = items.filter((_, i) => !menuSnaps[i].exists || !menuSnaps[i].get('isAvailable')).map((it) => it.itemId);
  if (unavailable.length) {
    throw new ApiError(409, 'ITEMS_UNAVAILABLE', 'Some items in your cart are no longer available.', { itemIds: unavailable });
  }
  return {
    lines: items.map((it, i) => {
      const m = menuSnaps[i].data();
      return { itemId: it.itemId, name: m.name, price: m.price, quantity: it.quantity, lineTotal: m.price * it.quantity };
    }),
    reservations: [],
  };
}

/** Lines priced from the published daily menu, with stock checked and reserved. */
async function dailyMenuLines(tx, canteenId, businessDate, daily, items, slot) {
  const byId = new Map(daily.items.map((i) => [i.itemId, i]));
  const slotMinutes = istParts(slot.start).minutes;
  const inWindow = (m) =>
    (!m.availableFrom || slotMinutes >= toMinutes(m.availableFrom)) && (!m.availableTo || slotMinutes < toMinutes(m.availableTo));
  const unavailable = items.filter((it) => !byId.get(it.itemId)?.preorder || !inWindow(byId.get(it.itemId))).map((it) => it.itemId);
  if (unavailable.length) {
    throw new ApiError(409, 'ITEMS_UNAVAILABLE', 'Some items in your cart are not available for pre-order at that time.', { itemIds: unavailable });
  }
  const refs = items.map((it) => inventoryRef(canteenId, businessDate, it.itemId));
  const invs = await tx.getAll(...refs);
  const soldOut = items.filter((it, i) => {
    const a = availableOf(invs[i].data());
    return a !== null && a < it.quantity;
  });
  if (soldOut.length) {
    const err = new ApiError(409, 'ITEMS_SOLD_OUT', 'Some items sold out before your order went through.', { itemIds: soldOut.map((it) => it.itemId) });
    err.attempts = soldOut.map((it) => ({ itemId: it.itemId, quantity: it.quantity, businessDate, period: periodOf(slotMinutes) }));
    throw err;
  }
  return {
    lines: items.map((it) => {
      const m = byId.get(it.itemId);
      return { itemId: it.itemId, name: m.name, price: m.price, quantity: it.quantity, lineTotal: m.price * it.quantity };
    }),
    reservations: items.map((it, i) => ({
      ref: refs[i],
      update: (now) => {
        const inv = invs[i].data();
        const stockouts = nextStockouts(inv.stockouts || [], availableOf({ ...inv, reserved: (inv.reserved || 0) + it.quantity }), now);
        return { reserved: FieldValue.increment(it.quantity), ...(stockouts && { stockouts }) };
      },
    })),
  };
}

// ─── Ledger moves shared with the counter ────────────────────────────────────

/** Inventory updates when staff mark an order collected: reserved → onlineSold, never deducted twice. */
export function collectionUpdates(order) {
  if (!order.inventoryTracked) return [];
  return order.items.map((l) => ({
    ref: inventoryRef(order.canteenId, order.businessDate, l.itemId),
    data: { reserved: FieldValue.increment(-l.quantity), onlineSold: FieldValue.increment(l.quantity) },
  }));
}

/**
 * Cancel inside a transaction: frees the slot place, releases reserved
 * portions (closing a stockout if stock returns) and marks the mock payment
 * refunded. All reads happen before any write.
 */
export async function cancelInTx(tx, orderRef, order, by) {
  const slotRef = db.collection('canteens').doc(order.canteenId).collection('slots').doc(order.pickupSlot.id);
  const invRefs = order.inventoryTracked ? order.items.map((l) => inventoryRef(order.canteenId, order.businessDate, l.itemId)) : [];
  const [slotSnap, ...invSnaps] = await tx.getAll(slotRef, ...invRefs);
  const now = Timestamp.now();
  if (slotSnap.exists) tx.update(slotRef, { booked: Math.max(0, (slotSnap.get('booked') || 1) - 1) });
  invSnaps.forEach((s, i) => {
    const q = order.items[i].quantity;
    const inv = s.data() || {};
    const stockouts = nextStockouts(inv.stockouts || [], availableOf({ ...inv, reserved: (inv.reserved || 0) - q }), now);
    tx.set(invRefs[i], { reserved: FieldValue.increment(-q), cancelled: FieldValue.increment(q), ...(stockouts && { stockouts }) }, { merge: true });
  });
  // shortcut: mock UPI, so the refund is a status change only; a real gateway refund goes here
  const update = {
    status: 'cancelled',
    paymentStatus: order.paymentMethod === 'upi_mock' ? 'refunded_mock' : order.paymentStatus,
    cancelledAt: now,
    cancelledBy: by,
    updatedAt: now,
  };
  tx.update(orderRef, update);
  return { ...order, ...update };
}

/** A student can cancel their own order until the kitchen starts preparing it. */
export async function cancelOrder(uid, orderId) {
  const ref = db.collection(ORDERS).doc(orderId);
  const updated = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get('userId') !== uid) throw notFound('Order');
    if (snap.get('status') !== 'placed') {
      throw new ApiError(409, 'CANNOT_CANCEL', 'The kitchen has started this order, so it can no longer be cancelled here. Ask at the counter.');
    }
    return cancelInTx(tx, ref, snap.data(), 'student');
  });
  return serializeOrder(orderId, updated);
}

// ─── Reads (owner only) ──────────────────────────────────────────────────────

export async function listMyOrders(uid) {
  const snap = await db
    .collection(ORDERS)
    .where('userId', '==', uid)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();
  return snap.docs.map((d) => serializeOrder(d.id, d.data()));
}

export async function getOrder(uid, orderId) {
  const snap = await db.collection(ORDERS).doc(orderId).get();
  // Same 404 for missing and not-yours, so order ids cannot be probed
  if (!snap.exists || snap.get('userId') !== uid) throw notFound('Order');
  return serializeOrder(snap.id, snap.data());
}
