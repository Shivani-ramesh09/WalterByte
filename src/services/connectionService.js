// src/services/connectionService.js
// Business logic for connections/{connectionId}.
//
// Contact visibility rule (enforced here, not just in rules):
//   A user's contact details are visible when:
//     (a) the viewer has an accepted connection with the profile owner, OR
//     (b) the profile's privacy.showContact is true
//
// This is re-checked at the API layer so the frontend never needs to
// implement the rule itself.

import { db } from '../config/firebase.js';
import { notFound, forbidden, conflict, badRequest } from '../utils/apiError.js';
import { applyPrivacyMask } from './userService.js';
import admin from 'firebase-admin';

const { Timestamp } = admin.firestore;
const CONNECTIONS = 'connections';

// ─── Send connection request ──────────────────────────────────────────────────

export async function sendConnectionRequest(fromUid, toUid) {
  if (fromUid === toUid) {
    throw badRequest('You cannot connect with yourself.');
  }

  // Check that the target user exists and has a visible profile
  const targetSnap = await db.collection('users').doc(toUid).get();
  if (!targetSnap.exists || !targetSnap.data().privacy?.profileVisible) {
    throw notFound('User');
  }

  // Check for any existing connection between the two users (either direction)
  const existing = await db
    .collection(CONNECTIONS)
    .where('fromUid', 'in', [fromUid, toUid])
    .limit(10)
    .get();

  for (const doc of existing.docs) {
    const { fromUid: f, toUid: t, status } = doc.data();
    const isBetweenThem =
      (f === fromUid && t === toUid) || (f === toUid && t === fromUid);
    if (isBetweenThem) {
      if (status === 'accepted') throw conflict('You are already connected.');
      if (status === 'pending') throw conflict('A connection request already exists.');
      // 'declined' — allow re-sending by deleting the old declined record
      if (status === 'declined') await doc.ref.delete();
    }
  }

  const ref = db.collection(CONNECTIONS).doc();
  const now = Timestamp.now();
  const data = { fromUid, toUid, status: 'pending', createdAt: now };
  await ref.set(data);
  return { id: ref.id, ...data };
}

// ─── Get my connections + pending requests ────────────────────────────────────

export async function getMyConnections(uid) {
  // Connections where I am either sender or receiver
  const [sentSnap, receivedSnap] = await Promise.all([
    db.collection(CONNECTIONS).where('fromUid', '==', uid).get(),
    db.collection(CONNECTIONS).where('toUid', '==', uid).get(),
  ]);

  const connections = [
    ...sentSnap.docs.map((d) => ({ id: d.id, direction: 'sent', ...d.data() })),
    ...receivedSnap.docs.map((d) => ({
      id: d.id,
      direction: 'received',
      ...d.data(),
    })),
  ];

  // Collect all peer UIDs to batch-fetch their profile cards
  const peerUids = [
    ...new Set(
      connections.map((c) => (c.fromUid === uid ? c.toUid : c.fromUid))
    ),
  ];

  const profileMap = {};
  // Firestore 'in' query supports up to 30 items; batch if needed
  for (let i = 0; i < peerUids.length; i += 30) {
    const batch = peerUids.slice(i, i + 30);
    const snaps = await db
      .collection('users')
      .where(admin.firestore.FieldPath.documentId(), 'in', batch)
      .get();
    snaps.docs.forEach((d) => {
      profileMap[d.id] = { uid: d.id, name: d.data().name, department: d.data().department };
    });
  }

  return connections.map((c) => {
    const peerUid = c.fromUid === uid ? c.toUid : c.fromUid;
    return { ...c, peer: profileMap[peerUid] || { uid: peerUid } };
  });
}

// ─── Accept or decline (recipient only) ──────────────────────────────────────

export async function updateConnectionStatus(uid, connectionId, status) {
  const ref = db.collection(CONNECTIONS).doc(connectionId);
  const snap = await ref.get();
  if (!snap.exists) throw notFound('Connection');

  const data = snap.data();

  // Only the recipient (toUid) can accept or decline
  if (data.toUid !== uid) throw forbidden('Only the recipient can respond to a connection request.');
  if (data.status !== 'pending') {
    throw conflict(`Connection is already ${data.status}.`);
  }

  await ref.update({ status, updatedAt: Timestamp.now() });
  const updated = await ref.get();
  return { id: connectionId, ...updated.data() };
}

// ─── Check if two users are connected (utility used by other services) ────────

export async function areConnected(uidA, uidB) {
  if (!uidA || !uidB || uidA === uidB) return false;
  const snap = await db
    .collection(CONNECTIONS)
    .where('status', '==', 'accepted')
    .where('fromUid', 'in', [uidA, uidB])
    .limit(5)
    .get();
  return snap.docs.some((d) => {
    const { fromUid, toUid } = d.data();
    return (fromUid === uidA && toUid === uidB) || (fromUid === uidB && toUid === uidA);
  });
}
