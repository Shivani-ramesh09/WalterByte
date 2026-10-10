// src/services/queueEstimator.js
// v1 queue-time heuristic (PRD §7.2): canteen base wait, scaled by a
// time-of-day and day-of-week multiplier, plus time for open orders.
// Pure function on purpose: a trained model can replace it without touching
// the canteen service or API shape.
import { istParts, toMinutes } from '../utils/istTime.js';

// IST rush windows on a weekday
const PEAKS = [
  { from: toMinutes('08:00'), to: toMinutes('09:30'), factor: 1.3 }, // breakfast
  { from: toMinutes('12:30'), to: toMinutes('14:00'), factor: 1.8 }, // lunch
  { from: toMinutes('16:00'), to: toMinutes('17:30'), factor: 1.4 }, // evening snacks
];
const WEEKEND_FACTOR = 0.6;

/**
 * @param {{ baseWaitMinutes: number, perOrderMinutes: number, openOrders: number, at?: Date }} input
 * @returns {number} estimated wait in whole minutes (always ≥ 1)
 */
export function estimateWaitMinutes({ baseWaitMinutes, perOrderMinutes, openOrders, at = new Date() }) {
  const { minutes, day } = istParts(at);
  const timeFactor = PEAKS.find((p) => minutes >= p.from && minutes < p.to)?.factor ?? 1;
  const dayFactor = day === 0 || day === 6 ? WEEKEND_FACTOR : 1;
  return Math.max(1, Math.round(baseWaitMinutes * timeFactor * dayFactor + openOrders * perOrderMinutes));
}
