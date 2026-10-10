// src/services/orderService.js
// Business logic for orders/{orderId}.
//
// Data model:
//   orders/{orderId}
//     userId, customerName, canteenId, canteenName, placeId,
//     items [{ itemId, name, price, quantity, lineTotal }], total (whole INR),
//     pickupSlot { id, start, end },
//     paymentMethod "upi_mock", paymentStatus "paid", paymentReference,
//     status "placed" | "preparing" | "ready" | "collected",
//     createdAt, updatedAt, preparingAt, readyAt, collectedAt (set by staff)
import { db } from '../config/firebase.js';
import { ApiError, notFound } from '../utils/apiError.js';
import { findSlot } from './canteenService.js';
import admin from 'firebase-admin';

const { Timestamp } = admin.firestore;
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
    const menuSnaps = await tx.getAll(...items.map((it) => canteenRef.collection('menu').doc(it.itemId)));
    const unavailable = items
      .filter((_, i) => !menuSnaps[i].exists || !menuSnaps[i].get('isAvailable'))
      .map((it) => it.itemId);
    if (unavailable.length) {
      throw new ApiError(409, 'ITEMS_UNAVAILABLE', 'Some items in your cart are no longer available.', {
        itemIds: unavailable,
      });
    }

    const slotSnap = await tx.get(slotRef);
    const capacity = slotSnap.get('capacity') ?? canteen.slotCapacity;
    const booked = slotSnap.get('booked') ?? 0;
    if (booked >= capacity) {
      throw new ApiError(409, 'SLOT_FULL', 'That pickup slot just filled up. Pick another.');
    }

    const lines = items.map((it, i) => {
      const m = menuSnaps[i].data();
      return { itemId: it.itemId, name: m.name, price: m.price, quantity: it.quantity, lineTotal: m.price * it.quantity };
    });
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
    };

    tx.set(slotRef, { start: data.pickupSlot.start, booked: booked + 1, capacity });
    tx.create(orderRef, data);
    return data;
  });

  return serializeOrder(orderRef.id, order);
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
