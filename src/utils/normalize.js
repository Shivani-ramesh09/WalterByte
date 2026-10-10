// src/utils/normalize.js
// Helpers for normalising skill lists and other string arrays.

/**
 * Normalize a skills array:
 *  - trim whitespace
 *  - convert to lowercase
 *  - remove empty strings
 *  - deduplicate
 *  - cap at maxSkills (default 15)
 *
 * @param {string[]} skills
 * @param {number}   [maxSkills=15]
 * @returns {string[]}
 */
export function normalizeSkills(skills, maxSkills = 15) {
  if (!Array.isArray(skills)) return [];
  const seen = new Set();
  const result = [];
  for (const s of skills) {
    if (typeof s !== 'string') continue;
    const normalized = s.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= maxSkills) break;
  }
  return result;
}

/**
 * Normalize a generic string array (trim, lowercase, dedupe).
 * Used for interests.
 */
export function normalizeStringArray(arr) {
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  return arr
    .filter((s) => typeof s === 'string')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => {
      if (!s || seen.has(s)) return false;
      seen.add(s);
      return true;
    });
}
