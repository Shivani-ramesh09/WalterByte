// src/services/eventService.js
// Explore events, student side.
//
// Data model:
//   organisations/{orgId}  name, category, synthetic?
//   events/{eventId}
//     title, venue, description, orgId, organiser, category, interests[],
//     start, end (Timestamps), capacity|null, registeredCount, status
//     "published" | "cancelled", leadershipTerm?, context?, synthetic?
//   events/{eventId}/participants/{uid}
//     viewedAt?, saved, registered, registeredAt?, attended, attendanceMarkedBy?,
//     feedback? { rating 1-5, comment, at }
// One participant doc per student per event, so every funnel stage counts
// unique people. Attendance is only ever set by the organiser or an admin.
import { db } from '../config/firebase.js';
import { ApiError, notFound, conflict } from '../utils/apiError.js';
import admin from 'firebase-admin';

const { Timestamp } = admin.firestore;
const EVENTS = 'events';

const iso = (ts) => (ts ? ts.toDate().toISOString() : null);

export const serializeEvent = (id, e) => ({
  id,
  title: e.title,
  venue: e.venue,
  description: e.description,
  orgId: e.orgId,
  organiser: e.organiser,
  category: e.category,
  interests: e.interests || [],
  start: iso(e.start),
  end: iso(e.end),
  capacity: e.capacity ?? null,
  registeredCount: e.registeredCount || 0,
  status: e.status,
  synthetic: Boolean(e.synthetic),
});

const myStatus = (p) => ({
  saved: Boolean(p?.saved),
  registered: Boolean(p?.registered),
  attended: Boolean(p?.attended),
  feedbackGiven: Boolean(p?.feedback),
});

const participantRef = (eventId, uid) => db.collection(EVENTS).doc(eventId).collection('participants').doc(uid);

const FEEDBACK_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Published events that have not ended (soonest first), plus events from the
 * last 14 days the caller attended, so they can leave feedback.
 */
export async function listEvents(uid, now = new Date()) {
  const since = Timestamp.fromDate(new Date(now.getTime() - FEEDBACK_WINDOW_MS));
  const snap = await db.collection(EVENTS).where('end', '>', since).orderBy('end').limit(150).get();
  const docs = snap.docs.filter((d) => d.get('status') === 'published');
  const mine = docs.length ? await db.getAll(...docs.map((d) => participantRef(d.id, uid))) : [];
  const all = docs
    .map((d, i) => ({ ...serializeEvent(d.id, d.data()), me: myStatus(mine[i].data()) }))
    .sort((a, b) => a.start.localeCompare(b.start));
  const nowIso = now.toISOString();
  return {
    upcoming: all.filter((e) => e.end > nowIso),
    attended: all.filter((e) => e.end <= nowIso && e.me.attended).reverse(),
  };
}

/** Event detail. Opening it records the student as a viewer (once). */
export async function getEvent(uid, eventId) {
  const snap = await db.collection(EVENTS).doc(eventId).get();
  if (!snap.exists || snap.get('status') !== 'published') throw notFound('Event');
  const ref = participantRef(eventId, uid);
  const p = await ref.get();
  if (!p.get('viewedAt')) await ref.set({ viewedAt: Timestamp.now() }, { merge: true });
  return { ...serializeEvent(snap.id, snap.data()), me: myStatus(p.data()) };
}

/** Save/unsave and register/cancel. Capacity is enforced in a transaction. */
export async function updateMyStatus(uid, eventId, { saved, registered }, now = new Date()) {
  const eventRef = db.collection(EVENTS).doc(eventId);
  const ref = participantRef(eventId, uid);
  return db.runTransaction(async (tx) => {
    const [ev, p] = await Promise.all([tx.get(eventRef), tx.get(ref)]);
    if (!ev.exists || ev.get('status') !== 'published') throw notFound('Event');
    if (ev.get('end').toDate() <= now) throw conflict('This event has ended.');
    const update = {};
    if (saved !== undefined) {
      update.saved = saved;
      update.savedAt = saved ? Timestamp.now() : null;
    }
    if (registered !== undefined && registered !== Boolean(p.get('registered'))) {
      const count = ev.get('registeredCount') || 0;
      const capacity = ev.get('capacity');
      if (registered && capacity && count >= capacity) throw new ApiError(409, 'EVENT_FULL', 'This event is full.');
      update.registered = registered;
      update.registeredAt = registered ? Timestamp.now() : null;
      tx.update(eventRef, { registeredCount: count + (registered ? 1 : -1) });
    }
    tx.set(ref, update, { merge: true });
    return myStatus({ ...p.data(), ...update });
  });
}

/** Feedback only from verified attendees, once, after the event. */
export async function submitFeedback(uid, eventId, { rating, comment }, now = new Date()) {
  const ref = participantRef(eventId, uid);
  return db.runTransaction(async (tx) => {
    const [ev, p] = await Promise.all([tx.get(db.collection(EVENTS).doc(eventId)), tx.get(ref)]);
    if (!ev.exists) throw notFound('Event');
    if (ev.get('end').toDate() > now) throw conflict('Feedback opens after the event ends.');
    if (!p.get('attended')) throw new ApiError(403, 'NOT_ATTENDED', 'Only verified attendees can give feedback.');
    if (p.get('feedback')) throw conflict('You have already given feedback for this event.');
    tx.update(ref, { feedback: { rating, comment: comment || '', at: Timestamp.now() } });
    return myStatus({ ...p.data(), feedback: true });
  });
}
