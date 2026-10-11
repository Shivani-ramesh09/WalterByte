// src/services/staffService.js
// Counter-side Eat logic. Every function is scoped to the caller's own
// canteen (req.staff.canteenId); staff never see or edit another canteen.
import { db } from '../config/firebase.js';
import { ApiError, notFound } from '../utils/apiError.js';
import { cancelInTx, collectionUpdates, serializeOrder } from './orderService.js';
import admin from 'firebase-admin';

const { Timestamp } = admin.firestore;

export const ACTIVE_STATUSES = ['placed', 'preparing', 'ready'];
// Staff can cancel before the food is ready (e.g. an item ran out in the kitchen)
const TRANSITIONS = {
  placed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['collected'],
};

// ─── Order queue ─────────────────────────────────────────────────────────────

/** Orders for the counter, earliest pickup first. */
export async function listCanteenOrders(canteenId, statuses = ACTIVE_STATUSES) {
  const snap = await db
    .collection('orders')
    .where('canteenId', '==', canteenId)
    .where('status', 'in', statuses)
    .limit(200)
    .get();
  return snap.docs
    .filter((d) => !d.get('synthetic')) // demo history belongs on the dashboard, not the counter
    .map((d) => serializeOrder(d.id, d.data()))
    .sort((a, b) => a.pickupSlot.start.localeCompare(b.pickupSlot.start) || a.createdAt.localeCompare(b.createdAt));
}

export async function updateOrderStatus(canteenId, orderId, status) {
  const ref = db.collection('orders').doc(orderId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    // Same 404 for missing and other-canteen orders
    if (!snap.exists || snap.get('canteenId') !== canteenId) throw notFound('Order');
    const current = snap.get('status');
    if (!TRANSITIONS[current]?.includes(status)) {
      throw new ApiError(409, 'INVALID_STATUS_TRANSITION', `Cannot move an order from ${current} to ${status}.`);
    }
    if (status === 'cancelled') return serializeOrder(orderId, await cancelInTx(tx, ref, snap.data(), 'staff'));
    const update = { status, updatedAt: Timestamp.now() };
    update[`${status}At`] = update.updatedAt; // preparingAt / readyAt / collectedAt
    tx.update(ref, update);
    // Collection moves reserved portions to sold; they were deducted once, at order time
    if (status === 'collected') for (const u of collectionUpdates(snap.data())) tx.set(u.ref, u.data, { merge: true });
    return serializeOrder(orderId, { ...snap.data(), ...update });
  });
}

// ─── Inventory ───────────────────────────────────────────────────────────────

const menuRef = (canteenId) => db.collection('canteens').doc(canteenId).collection('menu');

const toItem = (id, m) => ({
  id,
  name: m.name,
  category: m.category,
  price: m.price,
  isVeg: m.isVeg,
  isAvailable: m.isAvailable,
});

export async function addMenuItem(canteenId, body) {
  const ref = menuRef(canteenId).doc();
  const item = { ...body, updatedAt: Timestamp.now() };
  await ref.set(item);
  return toItem(ref.id, item);
}

export async function updateMenuItem(canteenId, itemId, body) {
  const ref = menuRef(canteenId).doc(itemId);
  const snap = await ref.get();
  if (!snap.exists) throw notFound('Menu item');
  await ref.update({ ...body, updatedAt: Timestamp.now() });
  return toItem(itemId, { ...snap.data(), ...body });
}
