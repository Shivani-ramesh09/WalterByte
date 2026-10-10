// src/services/userService.js
// All business logic for the users/{uid} Firestore collection.
import { db } from '../config/firebase.js';
import { normalizeSkills, normalizeStringArray } from '../utils/normalize.js';
import { notFound, conflict } from '../utils/apiError.js';
import admin from 'firebase-admin';

const { FieldValue, Timestamp } = admin.firestore;

const USERS = 'users';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Apply privacy rules to a profile document before exposing it publicly.
 * @param {object} data  Raw Firestore data
 * @param {boolean} isOwner  True when the requester is the owner
 * @param {boolean} isConnected  True when requester has an accepted connection
 * @returns {object} Sanitized profile
 */
export function applyPrivacyMask(data, isOwner, isConnected = false) {
  const profile = { ...data };

  // Always strip internal Firestore-only fields
  delete profile._searchTokens;

  if (isOwner) return profile; // Owner sees everything

  // Contact: visible only if showContact=true OR accepted connection
  const showContact = data.privacy?.showContact === true || isConnected;
  if (!showContact) {
    if (profile.contactMethod) {
      profile.contactMethod = { type: profile.contactMethod.type, value: null };
    }
    // Also hide email
    delete profile.email;
  }

  // Location: visible only if showLocation=true
  if (!data.privacy?.showLocation) {
    delete profile.usuallyFoundAtPlaceId;
  }

  // Always hide email from public view unless contact is visible
  if (!showContact) {
    delete profile.email;
  }

  return profile;
}

// ─── Create / Upsert ────────────────────────────────────────────────────────

/**
 * POST /users/me – create or upsert the caller's profile.
 * Safe to call on every login (idempotent upsert).
 */
export async function upsertProfile(uid, body) {
  const ref = db.collection(USERS).doc(uid);
  const snap = await ref.get();
  const now = Timestamp.now();

  const normalized = buildProfileData(body, now);

  if (snap.exists) {
    // Merge: don't overwrite fields not present in body
    await ref.set({ ...normalized, updatedAt: now }, { merge: true });
  } else {
    await ref.set({ ...normalized, createdAt: now, updatedAt: now });
  }

  const updated = await ref.get();
  return { uid, ...updated.data() };
}

// ─── Read ────────────────────────────────────────────────────────────────────

export async function getMyProfile(uid) {
  const snap = await db.collection(USERS).doc(uid).get();
  if (!snap.exists) throw notFound('Profile');
  return { uid, ...snap.data() };
}

/**
 * Returns the public view of a profile.
 * Throws 404 if the profile is hidden (profileVisible=false).
 */
export async function getPublicProfile(uid, requestingUid) {
  const snap = await db.collection(USERS).doc(uid).get();
  if (!snap.exists) throw notFound('Profile');

  const data = snap.data();
  if (!data.privacy?.profileVisible) throw notFound('Profile');

  // Check accepted connection
  const isConnected = await hasAcceptedConnection(uid, requestingUid);

  return { uid, ...applyPrivacyMask(data, false, isConnected) };
}

// ─── Update ──────────────────────────────────────────────────────────────────

export async function updateProfile(uid, body) {
  const ref = db.collection(USERS).doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw notFound('Profile');

  const normalized = buildProfileData(body, null);
  // Remove undefined keys (partial update)
  const update = {};
  for (const [k, v] of Object.entries(normalized)) {
    if (v !== undefined) update[k] = v;
  }
  update.updatedAt = Timestamp.now();

  await ref.update(update);
  const updated = await ref.get();
  return { uid, ...updated.data() };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function buildProfileData(body, now) {
  return {
    ...(body.name !== undefined && { name: body.name }),
    ...(body.email !== undefined && { email: body.email }),
    ...(body.department !== undefined && { department: body.department }),
    ...(body.year !== undefined && { year: body.year }),
    ...(body.bio !== undefined && { bio: body.bio }),
    ...(body.skills !== undefined && { skills: normalizeSkills(body.skills) }),
    ...(body.interests !== undefined && {
      interests: normalizeStringArray(body.interests),
    }),
    ...(body.availability !== undefined && { availability: body.availability }),
    ...(body.contactMethod !== undefined && { contactMethod: body.contactMethod }),
    ...(body.usuallyFoundAtPlaceId !== undefined && {
      usuallyFoundAtPlaceId: body.usuallyFoundAtPlaceId,
    }),
    ...(body.privacy !== undefined && { privacy: body.privacy }),
    ...(body.links !== undefined && { links: body.links }),
  };
}

/**
 * Check if two users have an accepted connection in either direction.
 */
async function hasAcceptedConnection(uidA, uidB) {
  if (!uidA || !uidB || uidA === uidB) return false;

  const snap = await db
    .collection('connections')
    .where('status', '==', 'accepted')
    .where('fromUid', 'in', [uidA, uidB])
    .limit(5)
    .get();

  return snap.docs.some((d) => {
    const { fromUid, toUid } = d.data();
    return (
      (fromUid === uidA && toUid === uidB) ||
      (fromUid === uidB && toUid === uidA)
    );
  });
}
