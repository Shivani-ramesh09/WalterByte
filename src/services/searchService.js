// src/services/searchService.js
// Discovery logic for /users/search, /skills/suggest, and /search/people.
//
// Firestore has no full-text search. Strategy:
//   1. Apply structured Firestore filters (department, year, availability)
//      that are indexable — these reduce the result set in the database.
//   2. Fetch a capped batch (up to FETCH_LIMIT docs) using cursor pagination.
//   3. Filter profileVisible=false in memory (to avoid Firestore inequality
//      compound index issues and keep rules simple).
//   4. Apply in-memory q matching against name, bio, skills[], interests[].
//   5. Apply skills[] "any match" filter in memory (array-contains-any in
//      Firestore is limited to 30 items and requires a composite index for
//      every other field combination — in-memory is simpler and correct).
//   6. Return the requested page size with the next cursor.

import { db } from '../config/firebase.js';

const USERS = 'users';
const FETCH_LIMIT = 200; // How many raw docs to pull before in-memory filtering

// ─── Main search ─────────────────────────────────────────────────────────────

/**
 * Search and filter users.
 * @param {object} filters
 * @param {string}   [filters.q]            Free-text query
 * @param {string[]} [filters.skills]       Skill names (any match)
 * @param {string}   [filters.department]
 * @param {number}   [filters.year]
 * @param {string}   [filters.availability]
 * @param {number}   [filters.limit]        Page size (default 20, max 50)
 * @param {string}   [filters.cursor]       Last doc ID for pagination
 * @param {number}   [maxResults]           Override for /search/people (cap 5)
 */
export async function searchUsers(filters = {}, maxResults = null) {
  const {
    q,
    skills,
    department,
    year,
    availability,
    limit: rawLimit = 20,
    cursor,
  } = filters;

  const pageSize = maxResults ?? Math.min(Number(rawLimit) || 20, 50);

  // ── Build Firestore query with equality filters ─────────────────────────
  let query = db.collection(USERS);

  if (department) {
    query = query.where('department', '==', department);
  }
  if (year) {
    query = query.where('year', '==', Number(year));
  }
  if (availability) {
    query = query.where('availability', '==', availability);
  }

  // Order and paginate by document ID (stable, no extra index needed)
  query = query.orderBy('name').limit(FETCH_LIMIT);

  // Cursor: start after the last document from the previous page
  if (cursor) {
    const cursorSnap = await db.collection(USERS).doc(cursor).get();
    if (cursorSnap.exists) {
      query = query.startAfter(cursorSnap);
    }
  }

  const snap = await query.get();

  // ── In-memory filtering ────────────────────────────────────────────────
  const qLower = q ? q.trim().toLowerCase() : null;
  const skillsLower = skills
    ? skills.map((s) => s.trim().toLowerCase()).filter(Boolean)
    : null;

  const results = [];
  let lastUid = null;

  for (const doc of snap.docs) {
    const data = doc.data();

    // Exclude hidden profiles
    if (data.privacy?.profileVisible === false) continue;

    // Skills filter: at least one of the requested skills must be present
    if (skillsLower && skillsLower.length > 0) {
      const userSkills = data.skills || [];
      const hasMatch = skillsLower.some((s) => userSkills.includes(s));
      if (!hasMatch) continue;
    }

    // Free-text match against name, bio, skills, interests
    if (qLower) {
      const searchable = [
        data.name || '',
        data.bio || '',
        ...(data.skills || []),
        ...(data.interests || []),
      ]
        .join(' ')
        .toLowerCase();

      if (!searchable.includes(qLower)) continue;
    }

    results.push(toProfileCard(doc.id, data));
    lastUid = doc.id;

    if (results.length >= pageSize) break;
  }

  return {
    results,
    // Only return a cursor if we filled the page (there may be more)
    nextCursor: results.length >= pageSize ? lastUid : null,
  };
}

// ─── Skill autocomplete ───────────────────────────────────────────────────────

/**
 * Return distinct skills that start with the given prefix.
 * We scan users (capped) and collect unique skills in memory —
 * acceptable for a campus-scale dataset.
 */
export async function suggestSkills(prefix = '', limit = 10) {
  const prefixLower = prefix.trim().toLowerCase();

  // Fetch a broad set; in production you'd maintain a separate skills index
  const snap = await db.collection(USERS).limit(500).get();
  const seen = new Set();
  const suggestions = [];

  for (const doc of snap.docs) {
    const skills = doc.data().skills || [];
    for (const skill of skills) {
      if (seen.has(skill)) continue;
      seen.add(skill);
      if (!prefixLower || skill.startsWith(prefixLower)) {
        suggestions.push(skill);
        if (suggestions.length >= limit) break;
      }
    }
    if (suggestions.length >= limit) break;
  }

  return suggestions.sort();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Shape a Firestore doc into a lightweight profile card (public safe).
 * Never includes email, contactMethod.value, or location.
 */
function toProfileCard(uid, data) {
  return {
    uid,
    name: data.name || '',
    department: data.department || '',
    year: data.year || null,
    skills: (data.skills || []).slice(0, 5), // top 5 skills
    interests: (data.interests || []).slice(0, 3),
    availability: data.availability || 'available',
    bio: data.bio ? data.bio.slice(0, 120) : '',
  };
}
