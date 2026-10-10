// src/services/requestService.js
// Business logic for requests/{requestId} and requests/{requestId}/responses.
import { db } from '../config/firebase.js';
import { notFound, forbidden, badRequest, conflict } from '../utils/apiError.js';
import { normalizeSkills } from '../utils/normalize.js';
import admin from 'firebase-admin';

const { Timestamp } = admin.firestore;
const REQUESTS = 'requests';

// ─── Create ──────────────────────────────────────────────────────────────────

export async function createRequest(authorId, body) {
  const ref = db.collection(REQUESTS).doc();
  const now = Timestamp.now();

  const data = {
    authorId,
    title: body.title,
    description: body.description || '',
    type: body.type,
    skillsNeeded: normalizeSkills(body.skillsNeeded || []),
    deadline: body.deadline ? Timestamp.fromDate(new Date(body.deadline)) : null,
    status: 'open',
    createdAt: now,
    updatedAt: now,
  };

  await ref.set(data);
  return { id: ref.id, ...data };
}

// ─── List (paginated, newest first) ──────────────────────────────────────────

export async function listRequests(filters = {}) {
  const { skill, type, status, limit: rawLimit = 20, cursor } = filters;
  const pageSize = Math.min(Number(rawLimit) || 20, 50);

  let query = db.collection(REQUESTS).orderBy('createdAt', 'desc');

  // Equality filters – each one requires a composite index (defined in indexes.json)
  if (type) query = query.where('type', '==', type);
  if (status) query = query.where('status', '==', status);

  // Cursor pagination by doc ID snapshot
  if (cursor) {
    const cursorSnap = await db.collection(REQUESTS).doc(cursor).get();
    if (cursorSnap.exists) query = query.startAfter(cursorSnap);
  }

  // Fetch slightly more than pageSize to support in-memory skill filter
  const snap = await query.limit(pageSize * 5).get();

  const skillLower = skill ? skill.trim().toLowerCase() : null;
  const results = [];
  let lastId = null;

  for (const doc of snap.docs) {
    const data = doc.data();

    // In-memory skill filter (array-contains with orderBy requires composite index)
    if (skillLower && !(data.skillsNeeded || []).includes(skillLower)) continue;

    results.push({ id: doc.id, ...data });
    lastId = doc.id;
    if (results.length >= pageSize) break;
  }

  return { results, nextCursor: results.length >= pageSize ? lastId : null };
}

// ─── Matching requests (open requests that match MY skills) ───────────────────

export async function getMatchingRequests(uid) {
  // Get the caller's skills
  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists) throw notFound('Profile');

  const mySkills = userSnap.data().skills || [];
  if (mySkills.length === 0) return { results: [] };

  // Fetch open requests, then filter in-memory for skill overlap
  const snap = await db
    .collection(REQUESTS)
    .where('status', '==', 'open')
    .orderBy('createdAt', 'desc')
    .limit(200)
    .get();

  const mySkillSet = new Set(mySkills);
  const results = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((r) => (r.skillsNeeded || []).some((s) => mySkillSet.has(s)));

  return { results };
}

// ─── Get single request ───────────────────────────────────────────────────────

export async function getRequest(requestId) {
  const snap = await db.collection(REQUESTS).doc(requestId).get();
  if (!snap.exists) throw notFound('Request');
  return { id: requestId, ...snap.data() };
}

// ─── Update (author only) ─────────────────────────────────────────────────────

export async function updateRequest(uid, requestId, body) {
  const ref = db.collection(REQUESTS).doc(requestId);
  const snap = await ref.get();
  if (!snap.exists) throw notFound('Request');
  if (snap.data().authorId !== uid) throw forbidden();

  const update = { updatedAt: Timestamp.now() };
  if (body.title !== undefined) update.title = body.title;
  if (body.description !== undefined) update.description = body.description;
  if (body.type !== undefined) update.type = body.type;
  if (body.skillsNeeded !== undefined) update.skillsNeeded = normalizeSkills(body.skillsNeeded);
  if (body.deadline !== undefined) {
    update.deadline = body.deadline ? Timestamp.fromDate(new Date(body.deadline)) : null;
  }
  if (body.status !== undefined) update.status = body.status;

  await ref.update(update);
  const updated = await ref.get();
  return { id: requestId, ...updated.data() };
}

// ─── Delete (author only) ─────────────────────────────────────────────────────

export async function deleteRequest(uid, requestId) {
  const ref = db.collection(REQUESTS).doc(requestId);
  const snap = await ref.get();
  if (!snap.exists) throw notFound('Request');
  if (snap.data().authorId !== uid) throw forbidden();
  await ref.delete();
}

// ─── Respond to a request ────────────────────────────────────────────────────

export async function respondToRequest(uid, requestId, body) {
  const reqSnap = await db.collection(REQUESTS).doc(requestId).get();
  if (!reqSnap.exists) throw notFound('Request');

  const reqData = reqSnap.data();
  if (reqData.authorId === uid) {
    throw badRequest('You cannot respond to your own request.');
  }
  if (reqData.status !== 'open') {
    throw conflict('This request is no longer open.');
  }

  // Prevent duplicate responses from the same user
  const existing = await db
    .collection(REQUESTS)
    .doc(requestId)
    .collection('responses')
    .where('responderId', '==', uid)
    .limit(1)
    .get();

  if (!existing.empty) {
    throw conflict('You have already responded to this request.');
  }

  const ref = db.collection(REQUESTS).doc(requestId).collection('responses').doc();
  const now = Timestamp.now();
  const data = {
    responderId: uid,
    message: body.message || '',
    createdAt: now,
  };

  await ref.set(data);
  return { id: ref.id, ...data };
}

// ─── List responses (author only) ─────────────────────────────────────────────

export async function listResponses(uid, requestId) {
  const reqSnap = await db.collection(REQUESTS).doc(requestId).get();
  if (!reqSnap.exists) throw notFound('Request');
  if (reqSnap.data().authorId !== uid) throw forbidden();

  const snap = await db
    .collection(REQUESTS)
    .doc(requestId)
    .collection('responses')
    .orderBy('createdAt', 'asc')
    .get();

  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
