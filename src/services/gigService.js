// src/services/gigService.js
// Freelance gigs (Fiverr-style): a student offers a skill with at least one
// work sample, other students send hire requests, and the freelancer manages
// both from their dashboard.
//
// Data model:
//   gigs/{gigId}
//     sellerId, sellerName, sellerDepartment, title, skill (lowercase),
//     description, priceFrom (whole INR), deliveryDays,
//     samples [{ type: "image" | "video" | "link", url (https), caption }] (1-6),
//     status "active" | "paused", createdAt, updatedAt
//   gigRequests/{requestId}
//     gigId, gigTitle, sellerId, sellerName, buyerId, buyerName, message,
//     status "pending" | "accepted" | "declined" | "completed", createdAt, updatedAt
//
// Contact details are shared only once the freelancer accepts a request:
// the buyer then sees the seller's contact, and the seller sees the buyer's.
import { db } from '../config/firebase.js';
import { ApiError, notFound, forbidden, conflict } from '../utils/apiError.js';
import admin from 'firebase-admin';

const { Timestamp } = admin.firestore;
const GIGS = 'gigs';
const REQUESTS = 'gigRequests';

const REQUEST_TRANSITIONS = {
  pending: ['accepted', 'declined'],
  accepted: ['completed'],
};

const toIso = (ts) => (ts ? ts.toDate().toISOString() : null);
const serialize = (id, d) => ({ id, ...d, createdAt: toIso(d.createdAt), updatedAt: toIso(d.updatedAt) });
const newestFirst = (a, b) => b.createdAt.localeCompare(a.createdAt);
const isShared = (r) => r.status === 'accepted' || r.status === 'completed';

async function contactOf(uid) {
  const snap = await db.collection('users').doc(uid).get();
  return snap.exists ? { email: snap.get('email') || null, method: snap.get('contactMethod') || null } : null;
}

// ─── Browse (any signed-in student) ──────────────────────────────────────────

export async function listGigs({ skill, q } = {}) {
  const snap = await db
    .collection(GIGS)
    .where('status', '==', 'active')
    .orderBy('createdAt', 'desc')
    .limit(200)
    .get();
  const skillLower = skill?.trim().toLowerCase();
  const qLower = q?.trim().toLowerCase();
  return snap.docs
    .map((d) => serialize(d.id, d.data()))
    .filter((g) => !skillLower || g.skill === skillLower)
    .filter(
      (g) =>
        !qLower ||
        `${g.title} ${g.skill} ${g.description} ${g.sellerName}`.toLowerCase().includes(qLower)
    )
    .slice(0, 50);
}

export async function getGig(uid, gigId) {
  const snap = await db.collection(GIGS).doc(gigId).get();
  // Paused gigs are visible only to their owner
  if (!snap.exists || (snap.get('status') !== 'active' && snap.get('sellerId') !== uid)) {
    throw notFound('Gig');
  }
  return serialize(snap.id, snap.data());
}

// ─── Hire requests (buyer side) ──────────────────────────────────────────────

export async function requestGig(buyerUid, gigId, message) {
  const gigSnap = await db.collection(GIGS).doc(gigId).get();
  if (!gigSnap.exists || gigSnap.get('status') !== 'active') throw notFound('Gig');
  if (gigSnap.get('sellerId') === buyerUid) throw forbidden('You cannot hire yourself.');

  const pending = await db
    .collection(REQUESTS)
    .where('gigId', '==', gigId)
    .where('buyerId', '==', buyerUid)
    .where('status', '==', 'pending')
    .limit(1)
    .get();
  if (!pending.empty) throw conflict('You already have a pending request for this gig.');

  const buyer = await db.collection('users').doc(buyerUid).get();
  const now = Timestamp.now();
  const ref = db.collection(REQUESTS).doc();
  const data = {
    gigId,
    gigTitle: gigSnap.get('title'),
    sellerId: gigSnap.get('sellerId'),
    sellerName: gigSnap.get('sellerName'),
    buyerId: buyerUid,
    buyerName: buyer.get('name') || 'A student',
    message,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(data);
  return serialize(ref.id, data);
}

export async function listMyRequests(buyerUid) {
  const snap = await db.collection(REQUESTS).where('buyerId', '==', buyerUid).limit(100).get();
  const requests = snap.docs.map((d) => serialize(d.id, d.data())).sort(newestFirst);
  return Promise.all(
    requests.map(async (r) => (isShared(r) ? { ...r, sellerContact: await contactOf(r.sellerId) } : r))
  );
}

// ─── Freelancer dashboard (seller side, scoped to the caller) ────────────────

export async function getDashboard(uid) {
  const [gigSnap, reqSnap] = await Promise.all([
    db.collection(GIGS).where('sellerId', '==', uid).get(),
    db.collection(REQUESTS).where('sellerId', '==', uid).limit(200).get(),
  ]);
  const gigs = gigSnap.docs.map((d) => serialize(d.id, d.data())).sort(newestFirst);
  const requests = await Promise.all(
    reqSnap.docs
      .map((d) => serialize(d.id, d.data()))
      .sort(newestFirst)
      .map(async (r) => (isShared(r) ? { ...r, buyerContact: await contactOf(r.buyerId) } : r))
  );
  return {
    gigs,
    requests,
    stats: {
      activeGigs: gigs.filter((g) => g.status === 'active').length,
      pendingRequests: requests.filter((r) => r.status === 'pending').length,
      completedJobs: requests.filter((r) => r.status === 'completed').length,
    },
  };
}

export async function createGig(uid, body) {
  const profile = await db.collection('users').doc(uid).get();
  if (!profile.exists) {
    throw new ApiError(409, 'PROFILE_REQUIRED', 'Create your profile before offering a gig.');
  }
  const now = Timestamp.now();
  const ref = db.collection(GIGS).doc();
  const data = {
    sellerId: uid,
    sellerName: profile.get('name'),
    sellerDepartment: profile.get('department') || '',
    ...body,
    skill: body.skill.trim().toLowerCase(),
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(data);
  return serialize(ref.id, data);
}

async function ownGig(uid, gigId) {
  const ref = db.collection(GIGS).doc(gigId);
  const snap = await ref.get();
  // Same 404 for missing and not-yours
  if (!snap.exists || snap.get('sellerId') !== uid) throw notFound('Gig');
  return { ref, snap };
}

export async function updateGig(uid, gigId, body) {
  const { ref, snap } = await ownGig(uid, gigId);
  const update = { ...body, updatedAt: Timestamp.now() };
  if (body.skill) update.skill = body.skill.trim().toLowerCase();
  await ref.update(update);
  return serialize(gigId, { ...snap.data(), ...update });
}

export async function deleteGig(uid, gigId) {
  const { ref } = await ownGig(uid, gigId);
  await ref.delete();
}

export async function updateRequestStatus(uid, requestId, status) {
  const ref = db.collection(REQUESTS).doc(requestId);
  const updated = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get('sellerId') !== uid) throw notFound('Request');
    const current = snap.get('status');
    if (!REQUEST_TRANSITIONS[current]?.includes(status)) {
      throw new ApiError(409, 'INVALID_STATUS_TRANSITION', `Cannot move a request from ${current} to ${status}.`);
    }
    const update = { status, updatedAt: Timestamp.now() };
    tx.update(ref, update);
    return serialize(requestId, { ...snap.data(), ...update });
  });
  return isShared(updated) ? { ...updated, buyerContact: await contactOf(updated.buyerId) } : updated;
}
