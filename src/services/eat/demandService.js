// src/services/eat/demandService.js
// Explicit unmet-demand signals. A stockout never creates one; only these do.
//
// demandSignals/{id}
//   canteenId, itemId, businessDate, period, at
//   type      "failed_online_attempt" | "interest" | "counter_request"
//   quantity  portions asked for (counter batches: number of people asking)
//   actorKey  student uid for app signals (deduplication only, never shown
//             in analytics); null for anonymous counter counts
//   anonymous true for counter counts
//   outcome   "substituted" | "no_purchase" | null (unknown) — only when stated
//   substituteItemId  when the person said what they chose instead
//   source    "app" | "counter"
//   status    "valid" | "void" (counter corrections keep the record)
//   recordedBy, voidReason, voidedBy, voidedAt
//
// Ids make retries harmless:
//   interest_{canteen}_{date}_{item}_{uid}   one per student per item per day
//   counter_{canteen}_{requestId}            client-generated idempotency key
import { db } from '../../config/firebase.js';
import { ApiError, conflict, notFound } from '../../utils/apiError.js';
import { istParts } from '../../utils/istTime.js';
import { inventoryRef, publishedMenu, today } from './dailyMenuService.js';
import { availableOf, periodOf } from './eatRules.js';
import admin from 'firebase-admin';

const { Timestamp } = admin.firestore;
const SIGNALS = 'demandSignals';

/** Online orders rejected because the item had sold out. One signal per item per attempt. */
export async function recordFailedAttempts(uid, canteenId, attempts) {
  const batch = db.batch();
  const at = Timestamp.now();
  for (const a of attempts) {
    batch.set(db.collection(SIGNALS).doc(), {
      canteenId,
      itemId: a.itemId,
      businessDate: a.businessDate,
      period: a.period,
      at,
      type: 'failed_online_attempt',
      quantity: a.quantity,
      actorKey: uid,
      anonymous: false,
      outcome: null,
      source: 'app',
      status: 'valid',
    });
  }
  await batch.commit();
}

async function soldOutTodayItem(canteenId, itemId) {
  const date = today();
  const menu = await publishedMenu(canteenId, date);
  if (!menu?.items.some((i) => i.itemId === itemId)) throw notFound('Menu item');
  const inv = await inventoryRef(canteenId, date, itemId).get();
  return { date, available: availableOf(inv.data()) };
}

const interestRef = (canteenId, date, itemId, uid) => db.collection(SIGNALS).doc(`interest_${canteenId}_${date}_${itemId}_${uid}`);

/**
 * "I wanted this" on a sold-out item. Voluntary; repeating it updates the same
 * record, so one student counts once per item per day.
 */
export async function registerInterest(uid, canteenId, itemId, { outcome = null, substituteItemId = null } = {}) {
  const { date, available } = await soldOutTodayItem(canteenId, itemId);
  if (available === null || available > 0) throw conflict('This item is available; you can order it instead.');
  const ref = interestRef(canteenId, date, itemId, uid);
  const now = new Date();
  await ref.set(
    {
      canteenId,
      itemId,
      businessDate: date,
      period: periodOf(istParts(now).minutes),
      at: Timestamp.fromDate(now),
      type: 'interest',
      quantity: 1,
      actorKey: uid,
      anonymous: false,
      outcome,
      substituteItemId: outcome === 'substituted' ? substituteItemId : null,
      source: 'app',
      status: 'valid',
    },
    { merge: true }
  );
  return { itemId, interested: true, outcome };
}

export async function withdrawInterest(uid, canteenId, itemId) {
  await interestRef(canteenId, today(), itemId, uid).delete();
  return { itemId, interested: false };
}

/** Item ids the student has already said they wanted today (no repeated prompts). */
export async function myInterests(uid, canteenId, date) {
  const snap = await db
    .collection(SIGNALS)
    .where('actorKey', '==', uid)
    .where('canteenId', '==', canteenId)
    .where('businessDate', '==', date)
    .limit(100)
    .get();
  return new Set(snap.docs.filter((d) => d.get('type') === 'interest').map((d) => d.get('itemId')));
}

// ─── Counter (cashier) ───────────────────────────────────────────────────────

/**
 * A cashier logs people asking for an unavailable item. A batch of 12 is 12
 * anonymous requests, not 12 identified students. Retrying with the same
 * requestId returns the original record instead of counting twice.
 */
export async function recordCounterRequest(staff, { requestId, itemId, quantity, outcome = null, substituteItemId = null }) {
  const date = today();
  const menu = await publishedMenu(staff.canteenId, date);
  if (!menu?.items.some((i) => i.itemId === itemId)) throw notFound('Menu item');
  const ref = db.collection(SIGNALS).doc(`counter_${staff.canteenId}_${requestId}`);
  const now = new Date();
  const data = {
    canteenId: staff.canteenId,
    itemId,
    businessDate: date,
    period: periodOf(istParts(now).minutes),
    at: Timestamp.fromDate(now),
    type: 'counter_request',
    quantity,
    actorKey: null,
    anonymous: true,
    outcome,
    substituteItemId: outcome === 'substituted' ? substituteItemId : null,
    source: 'counter',
    status: 'valid',
    recordedBy: staff.uid,
  };
  try {
    await ref.create(data);
    return { id: requestId, duplicate: false, ...serializeSignal(data) };
  } catch (err) {
    if (err.code !== 6) throw err; // 6 = ALREADY_EXISTS: a retried submission
    const existing = await ref.get();
    if (existing.get('canteenId') !== staff.canteenId) throw conflict('Request id already used.');
    return { id: requestId, duplicate: true, ...serializeSignal(existing.data()) };
  }
}

/** Corrections void the record with a reason instead of deleting it (auditable). */
export async function voidCounterRequest(staff, requestId, reason) {
  const ref = db.collection(SIGNALS).doc(`counter_${staff.canteenId}_${requestId}`);
  const snap = await ref.get();
  if (!snap.exists || snap.get('canteenId') !== staff.canteenId) throw notFound('Request record');
  if (snap.get('status') === 'void') throw new ApiError(409, 'ALREADY_VOID', 'This record is already voided.');
  const update = { status: 'void', voidReason: reason, voidedBy: staff.uid, voidedAt: Timestamp.now() };
  await ref.update(update);
  return { id: requestId, ...serializeSignal({ ...snap.data(), ...update }) };
}

export async function listCounterRequests(canteenId, date) {
  const snap = await db.collection(SIGNALS).where('canteenId', '==', canteenId).where('businessDate', '==', date).limit(500).get();
  return snap.docs
    .filter((d) => d.get('type') === 'counter_request')
    .map((d) => ({ id: d.id.replace(`counter_${canteenId}_`, ''), ...serializeSignal(d.data()) }))
    .sort((a, b) => b.at.localeCompare(a.at));
}

const serializeSignal = (s) => ({
  itemId: s.itemId,
  businessDate: s.businessDate,
  period: s.period,
  at: s.at.toDate().toISOString(),
  type: s.type,
  quantity: s.quantity,
  outcome: s.outcome,
  substituteItemId: s.substituteItemId || null,
  status: s.status,
  voidReason: s.voidReason || null,
});
