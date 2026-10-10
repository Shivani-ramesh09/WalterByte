// src/utils/period.js
// Reporting periods for administration analytics. Dates are IST calendar days:
// from = 00:00 IST on `from`, to = 00:00 IST on the day after `to` (exclusive),
// so a period always covers whole campus days.
import { istDate, istParts, isRealDate } from './istTime.js';
import { badRequest } from './apiError.js';

const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_PERIOD_DAYS = 731;

/**
 * @param {{ from?: string, to?: string }} q  "YYYY-MM-DD" IST dates; defaults to the last 30 days
 * @returns {{ from: Date, to: Date, days: number, label: string, previous: { from: Date, to: Date, label: string } }}
 */
export function parsePeriod({ from, to } = {}, now = new Date()) {
  const toDay = to || istParts(now).date;
  if (!isRealDate(toDay) || (from && !isRealDate(from))) throw badRequest('Dates must be real YYYY-MM-DD days.');
  const end = new Date(istDate(toDay, 0).getTime() + DAY_MS);
  const start = from ? istDate(from, 0) : new Date(end.getTime() - 30 * DAY_MS);
  const days = Math.round((end - start) / DAY_MS);
  if (days < 1) throw badRequest('The start date must be on or before the end date.');
  if (days > MAX_PERIOD_DAYS) throw badRequest(`Reporting periods are limited to ${MAX_PERIOD_DAYS} days.`);
  // The comparison period is the equally long period just before this one
  const prevStart = new Date(start.getTime() - days * DAY_MS);
  return {
    from: start,
    to: end,
    days,
    label: labelOf(start, end),
    previous: { from: prevStart, to: start, label: labelOf(prevStart, start) },
  };
}

const labelOf = (start, end) => `${istParts(start).date} to ${istParts(new Date(end.getTime() - 1)).date}`;

export const inPeriod = (date, p) => date >= p.from && date < p.to;

/** Relative change, or null when there is no baseline to compare with. */
export const change = (current, previous) => (previous > 0 ? (current - previous) / previous : null);

/** Academic term of a date: Jul-Dec is the odd semester, Jan-Jun the even one. */
export function termOf(date) {
  const { date: d } = istParts(date);
  const [y, m] = d.split('-').map(Number);
  return m >= 7 ? `${y}-${String(y + 1).slice(2)} Odd semester` : `${y - 1}-${String(y).slice(2)} Even semester`;
}

export const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
