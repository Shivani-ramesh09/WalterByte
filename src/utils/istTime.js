// src/utils/istTime.js
// Campus clock helpers. Canteen hours and pickup slots are in IST.
// India has no DST, so a fixed +05:30 offset is exact.

const IST_OFFSET_MS = 330 * 60 * 1000;

/** "HH:mm" → minutes since midnight. */
export const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** minutes since midnight → "HHmm" (used in slot ids). */
export const toHHmm = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}${String(minutes % 60).padStart(2, '0')}`;

/**
 * IST view of an instant.
 * @returns {{ date: string, minutes: number, day: number }} date "YYYY-MM-DD", minutes since IST midnight, day 0=Sun
 */
export function istParts(at = new Date()) {
  const ist = new Date(at.getTime() + IST_OFFSET_MS);
  return {
    date: ist.toISOString().slice(0, 10),
    minutes: ist.getUTCHours() * 60 + ist.getUTCMinutes(),
    day: ist.getUTCDay(),
  };
}

/** IST "YYYY-MM-DD" + minutes since midnight → Date. */
export function istDate(date, minutes) {
  const [y, mo, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d) + minutes * 60 * 1000 - IST_OFFSET_MS);
}

/** True for a real calendar date "YYYY-MM-DD" (rejects 2026-02-31). */
export const isRealDate = (date) =>
  /^\d{4}-\d{2}-\d{2}$/.test(date) && istParts(istDate(date, 0)).date === date;
