// src/services/eat/eatRules.js
// Pure Eat rules: daily-menu and billing CSV validation, the inventory
// arithmetic, service periods and stockout windows. No Firestore here, so
// every rule is unit-tested directly.
//
// Inventory ledger, one doc per canteen + business date + item:
//   planned      portions prepared/planned (null = not stock-tracked)
//   adjustments  net stock adjustments (extra batch +, spoilage/correction -)
//   reserved     confirmed online orders not yet collected
//   onlineSold   online orders collected (moved out of reserved, never twice)
//   counterSold  walk-in counter sales
//   cancelled    online portions released by cancellation (informational)
//   wastage      unsold portions discarded at day close (informational)
//   available    = planned + adjustments - reserved - onlineSold - counterSold
import { toMinutes } from '../../utils/istTime.js';
import { parseCsv } from '../../utils/csv.js';

export const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const MAX_MENU_ROWS = 300;
export const MAX_BILLING_ROWS = 5000;

// ─── Service periods (IST) ───────────────────────────────────────────────────

export const PERIODS = [
  { id: 'breakfast', label: 'Breakfast', from: 0, to: 11 * 60 },
  { id: 'lunch', label: 'Lunch', from: 11 * 60, to: 15 * 60 },
  { id: 'snacks', label: 'Snacks', from: 15 * 60, to: 18 * 60 },
  { id: 'dinner', label: 'Dinner', from: 18 * 60, to: 24 * 60 },
];
export const periodOf = (minutes) => PERIODS.find((p) => minutes >= p.from && minutes < p.to).id;

// ─── Inventory arithmetic ────────────────────────────────────────────────────

export const emptyLedger = () => ({ reserved: 0, onlineSold: 0, counterSold: 0, cancelled: 0, adjustments: 0, wastage: 0, stockouts: [] });

/** Portions still available, or null when the item is not stock-tracked. */
export function availableOf(inv) {
  if (!inv || inv.planned === null || inv.planned === undefined) return null;
  return inv.planned + (inv.adjustments || 0) - (inv.reserved || 0) - (inv.onlineSold || 0) - (inv.counterSold || 0);
}

/**
 * Open a stockout window when availability reaches zero, close it when stock
 * returns. Returns the new list, or null when nothing changed. A stockout is
 * a supply fact only: it never adds to any unmet-demand count.
 */
export function nextStockouts(stockouts = [], available, at) {
  if (available === null) return null;
  const open = stockouts.length && !stockouts[stockouts.length - 1].until;
  if (available <= 0 && !open) return [...stockouts, { at, until: null }];
  if (available > 0 && open) return [...stockouts.slice(0, -1), { ...stockouts[stockouts.length - 1], until: at }];
  return null;
}

// ─── Daily menu CSV ──────────────────────────────────────────────────────────

export const MENU_COLUMNS = ['canteen_id', 'business_date', 'item_id', 'name', 'category', 'price', 'is_veg', 'planned_quantity', 'preorder', 'available_from', 'available_to'];
const REQUIRED_MENU = ['canteen_id', 'business_date', 'item_id', 'name', 'category', 'price', 'is_veg'];

const bool = (v, dflt) => {
  if (v === '' || v === undefined) return dflt;
  const s = v.toLowerCase();
  if (['true', 'yes', 'y', '1'].includes(s)) return true;
  if (['false', 'no', 'n', '0'].includes(s)) return false;
  return undefined;
};
const wholeNumber = (v) => (/^\d+$/.test(v) ? Number(v) : NaN);

/**
 * Validate an authorised daily-menu upload for one canteen and one business
 * date. Every problem is reported with its line; nothing is silently dropped.
 * @returns {{ items: object[], errors: { line: number, field?: string, message: string }[] }}
 */
export function validateMenuCsv(text, { canteenId, businessDate }) {
  const { header, rows } = parseCsv(text);
  const errors = [];
  const missing = REQUIRED_MENU.filter((c) => !header.includes(c));
  if (!header.length) return { items: [], errors: [{ line: 1, message: 'The file is empty.' }] };
  if (missing.length) return { items: [], errors: [{ line: 1, message: `Missing column(s): ${missing.join(', ')}.` }] };
  if (rows.length > MAX_MENU_ROWS) return { items: [], errors: [{ line: 1, message: `At most ${MAX_MENU_ROWS} items per menu.` }] };

  const items = [];
  const seen = new Map();
  for (const { line, values: v, extraCells } of rows) {
    const err = (field, message) => errors.push({ line, field, message });
    const before = errors.length;
    if (extraCells) err(null, 'More cells than columns (check for an unquoted comma).');
    if (v.canteen_id !== canteenId) err('canteen_id', `Expected ${canteenId}, found "${v.canteen_id}".`);
    if (v.business_date !== businessDate) err('business_date', `Expected ${businessDate}, found "${v.business_date}".`);
    if (!ID_RE.test(v.item_id)) err('item_id', 'Use 1-64 letters, digits, - or _.');
    else if (seen.has(v.item_id)) err('item_id', `Duplicate of line ${seen.get(v.item_id)}.`);
    if (!v.name || v.name.length > 80) err('name', 'Required, at most 80 characters.');
    if (!v.category || v.category.length > 40) err('category', 'Required, at most 40 characters.');
    const price = wholeNumber(v.price);
    if (!(price >= 1 && price <= 5000)) err('price', 'Whole rupees from 1 to 5000.');
    const isVeg = bool(v.is_veg);
    if (isVeg === undefined) err('is_veg', 'Use true or false.');
    const planned = v.planned_quantity ? wholeNumber(v.planned_quantity) : null;
    if (planned !== null && !(planned >= 0 && planned <= 10000)) err('planned_quantity', 'A whole number from 0 to 10000, or blank if not tracked.');
    const preorder = bool(v.preorder, true);
    if (preorder === undefined) err('preorder', 'Use true or false.');
    const from = v.available_from || null;
    const to = v.available_to || null;
    if (from && !HHMM_RE.test(from)) err('available_from', 'Use HH:mm (24-hour IST).');
    if (to && !HHMM_RE.test(to)) err('available_to', 'Use HH:mm (24-hour IST).');
    if (from && to && HHMM_RE.test(from) && HHMM_RE.test(to) && toMinutes(from) >= toMinutes(to)) err('available_to', 'Must be after available_from.');
    if (ID_RE.test(v.item_id) && !seen.has(v.item_id)) seen.set(v.item_id, line);
    if (errors.length === before) {
      items.push({ itemId: v.item_id, name: v.name, category: v.category, price, isVeg, planned, preorder, availableFrom: from, availableTo: to });
    }
  }
  if (!rows.length) errors.push({ line: 1, message: 'No menu rows found.' });
  return { items, errors };
}

// ─── Billing (counter transactions) CSV ──────────────────────────────────────

const REQUIRED_BILLING = ['txn_id', 'time', 'item_id', 'quantity'];

/**
 * Validate an authorised billing export: one row per line item, rows with the
 * same txn_id form one transaction. Unknown items and bad rows are rejected
 * with their line; a transaction with any bad row is rejected whole.
 */
export function validateBillingCsv(text, menuItemIds) {
  const { header, rows } = parseCsv(text);
  if (!header.length) return { transactions: [], errors: [{ line: 1, message: 'The file is empty.' }], rejectedTxns: [] };
  const missing = REQUIRED_BILLING.filter((c) => !header.includes(c));
  if (missing.length) return { transactions: [], errors: [{ line: 1, message: `Missing column(s): ${missing.join(', ')}.` }], rejectedTxns: [] };
  if (rows.length > MAX_BILLING_ROWS) return { transactions: [], errors: [{ line: 1, message: `At most ${MAX_BILLING_ROWS} rows per import.` }], rejectedTxns: [] };

  const errors = [];
  const txns = new Map();
  const bad = new Set();
  for (const { line, values: v } of rows) {
    const err = (field, message) => errors.push({ line, field, message });
    const before = errors.length;
    if (!ID_RE.test(v.txn_id)) err('txn_id', 'Use 1-64 letters, digits, - or _.');
    if (!HHMM_RE.test(v.time)) err('time', 'Use HH:mm (24-hour IST).');
    if (!menuItemIds.has(v.item_id)) err('item_id', `"${v.item_id}" is not on this day's published menu.`);
    const qty = wholeNumber(v.quantity);
    if (!(qty >= 1 && qty <= 100)) err('quantity', 'A whole number from 1 to 100.');
    if (!ID_RE.test(v.txn_id)) continue;
    if (!txns.has(v.txn_id)) txns.set(v.txn_id, { txnId: v.txn_id, time: v.time, lines: new Map() });
    const t = txns.get(v.txn_id);
    if (errors.length > before) bad.add(v.txn_id);
    else {
      if (t.time !== v.time) {
        err('time', `Transaction ${v.txn_id} has different times on different rows.`);
        bad.add(v.txn_id);
      }
      t.lines.set(v.item_id, (t.lines.get(v.item_id) || 0) + qty);
    }
  }
  const transactions = [...txns.values()]
    .filter((t) => !bad.has(t.txnId))
    .map((t) => ({ txnId: t.txnId, time: t.time, lines: [...t.lines].map(([itemId, quantity]) => ({ itemId, quantity })) }));
  return { transactions, errors, rejectedTxns: [...bad] };
}
