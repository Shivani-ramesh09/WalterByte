// src/services/eat/counterService.js
// Walk-in counter sales next to online orders. The existing billing counters
// stay in use: sales arrive here either from cashiers recording them in the
// staff app ("live") or from an authorised billing CSV export ("import").
// No integration with the billing system is assumed.
//
// counterSales/{canteenId}_{txnId}
//   canteenId, businessDate, txnId, at, period, lines [{ itemId, name, price,
//   quantity, lineTotal }], total, source "live" | "import", recordedBy,
//   importId?, oversold [itemIds], synthetic?
// eatDataStatus/{canteenId}_{date}
//   counterSource "live" | "import", lastCounterAt, counterComplete,
//   closedBy, closedAt, imports [{ importId, at, complete }]
// eatImports/{importId}
//   canteenId, businessDate, fileName, importedBy, importedAt, rows,
//   accepted, duplicates, rejected, errors[], complete
//
// The txn id is the idempotency key: a retried request or a re-imported file
// never counts a sale twice.
import { db } from '../../config/firebase.js';
import { ApiError, notFound } from '../../utils/apiError.js';
import { istDate, istParts, toMinutes } from '../../utils/istTime.js';
import { dayInventory, inventoryRef, publishedMenu, statusRef, today } from './dailyMenuService.js';
import { availableOf, nextStockouts, periodOf, validateBillingCsv } from './eatRules.js';
import { listCounterRequests } from './demandService.js';
import admin from 'firebase-admin';

const { Timestamp, FieldValue } = admin.firestore;
const saleRef = (canteenId, txnId) => db.collection('counterSales').doc(`${canteenId}_${txnId}`);
const iso = (t) => (t ? t.toDate().toISOString() : null);

const noMenu = () => new ApiError(409, 'NO_DAILY_MENU', "Today's menu has not been published yet, so counter records cannot be linked to items.");

/** Everything the counter needs on one screen for today. */
export async function counterView(canteenId) {
  const date = today();
  const [inventory, requests, status] = await Promise.all([dayInventory(canteenId, date), listCounterRequests(canteenId, date), statusRef(canteenId, date).get()]);
  return {
    businessDate: date,
    published: Boolean(inventory),
    menuVersion: inventory?.version || null,
    items: inventory?.items || [],
    requests,
    dataStatus: serializeStatus(status.data()),
  };
}

const serializeStatus = (s = {}) => ({
  counterSource: s.counterSource || null,
  lastCounterAt: iso(s.lastCounterAt),
  counterComplete: Boolean(s.counterComplete),
  closedAt: iso(s.closedAt),
});

/**
 * Record one counter transaction. A sale beyond the recorded stock is still
 * recorded (the food was handed over) but flagged, because it means the stock
 * figures were wrong, not that the sale did not happen.
 */
export async function recordSale(staff, { txnId, lines }) {
  const date = today();
  const ref = saleRef(staff.canteenId, txnId);
  return db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return { duplicate: true, ...serializeSale(existing.data()) };
    const menu = await publishedMenu(staff.canteenId, date, tx);
    if (!menu) throw noMenu();
    const byId = new Map(menu.items.map((i) => [i.itemId, i]));
    const unknown = lines.filter((l) => !byId.has(l.itemId)).map((l) => l.itemId);
    if (unknown.length) throw new ApiError(422, 'UNKNOWN_ITEMS', "Some items are not on today's menu.", { itemIds: unknown });
    const refs = lines.map((l) => inventoryRef(staff.canteenId, date, l.itemId));
    const invs = await tx.getAll(...refs);
    const now = new Date();
    const at = Timestamp.fromDate(now);
    const oversold = [];
    invs.forEach((s, i) => {
      const inv = s.data() || {};
      const after = availableOf({ ...inv, counterSold: (inv.counterSold || 0) + lines[i].quantity });
      if (after !== null && after < 0) oversold.push(lines[i].itemId);
      const stockouts = nextStockouts(inv.stockouts || [], after, at);
      tx.set(refs[i], { counterSold: FieldValue.increment(lines[i].quantity), ...(stockouts && { stockouts }) }, { merge: true });
    });
    const priced = lines.map((l) => {
      const m = byId.get(l.itemId);
      return { itemId: l.itemId, name: m.name, price: m.price, quantity: l.quantity, lineTotal: m.price * l.quantity };
    });
    const sale = {
      canteenId: staff.canteenId,
      businessDate: date,
      txnId,
      at,
      period: periodOf(istParts(now).minutes),
      lines: priced,
      total: priced.reduce((n, l) => n + l.lineTotal, 0),
      source: 'live',
      recordedBy: staff.uid,
      oversold,
    };
    tx.create(ref, sale);
    tx.set(statusRef(staff.canteenId, date), { canteenId: staff.canteenId, businessDate: date, counterSource: 'live', lastCounterAt: at }, { merge: true });
    return { duplicate: false, ...serializeSale(sale) };
  });
}

const serializeSale = (s) => ({ ...s, at: iso(s.at) });

/** Extra batches, spoilage and corrections, with an audit log on the item. */
export async function adjustStock(staff, itemId, { delta, reason, requestId }) {
  const date = today();
  const ref = inventoryRef(staff.canteenId, date, itemId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get('onMenu') === false) throw notFound('Menu item');
    const inv = snap.data();
    if (inv.planned === null || inv.planned === undefined) throw new ApiError(409, 'NOT_TRACKED', 'This item has no recorded quantity to adjust.');
    if ((inv.adjustmentLog || []).some((a) => a.requestId === requestId)) return { duplicate: true, available: availableOf(inv) };
    const at = Timestamp.now();
    const next = { ...inv, adjustments: (inv.adjustments || 0) + delta };
    const stockouts = nextStockouts(inv.stockouts || [], availableOf(next), at);
    tx.update(ref, {
      adjustments: FieldValue.increment(delta),
      adjustmentLog: FieldValue.arrayUnion({ requestId, delta, reason, by: staff.uid, at }),
      ...(stockouts && { stockouts }),
    });
    return { duplicate: false, available: availableOf(next) };
  });
}

/** End of service: unsold portions discarded, and whether counter records are complete. */
export async function closeDay(staff, { wastage, counterComplete }) {
  const date = today();
  const menu = await publishedMenu(staff.canteenId, date);
  if (!menu) throw noMenu();
  const onMenu = new Set(menu.items.map((i) => i.itemId));
  const unknown = wastage.filter((w) => !onMenu.has(w.itemId)).map((w) => w.itemId);
  if (unknown.length) throw new ApiError(422, 'UNKNOWN_ITEMS', "Some items are not on today's menu.", { itemIds: unknown });
  const batch = db.batch();
  // Set, not increment: submitting the close again replaces the figures
  for (const w of wastage) batch.set(inventoryRef(staff.canteenId, date, w.itemId), { wastage: w.quantity }, { merge: true });
  batch.set(statusRef(staff.canteenId, date), { canteenId: staff.canteenId, businessDate: date, counterComplete, closedBy: staff.uid, closedAt: Timestamp.now() }, { merge: true });
  await batch.commit();
  return { businessDate: date, counterComplete, wastageItems: wastage.length };
}

/**
 * Import an authorised billing CSV for one canteen and day. Each transaction
 * is written with its inventory increments in one batch keyed by txn id, so a
 * re-import skips transactions already recorded instead of double counting.
 */
export async function importBilling(adminUser, { canteenId, businessDate, csv, complete, fileName }) {
  const menu = await publishedMenu(canteenId, businessDate);
  if (!menu) throw new ApiError(409, 'NO_DAILY_MENU', 'Publish the menu for that day before importing its sales.');
  const byId = new Map(menu.items.map((i) => [i.itemId, i]));
  const { transactions, errors, rejectedTxns } = validateBillingCsv(csv, new Set(byId.keys()));
  let accepted = 0;
  let duplicates = 0;
  const importRef = db.collection('eatImports').doc();
  for (const t of transactions) {
    const at = Timestamp.fromDate(istDate(businessDate, toMinutes(t.time)));
    const lines = t.lines.map((l) => {
      const m = byId.get(l.itemId);
      return { itemId: l.itemId, name: m.name, price: m.price, quantity: l.quantity, lineTotal: m.price * l.quantity };
    });
    const batch = db.batch();
    batch.create(saleRef(canteenId, t.txnId), {
      canteenId,
      businessDate,
      txnId: t.txnId,
      at,
      period: periodOf(toMinutes(t.time)),
      lines,
      total: lines.reduce((n, l) => n + l.lineTotal, 0),
      source: 'import',
      importId: importRef.id,
      recordedBy: adminUser.uid,
      oversold: [],
    });
    for (const l of lines) batch.set(inventoryRef(canteenId, businessDate, l.itemId), { counterSold: FieldValue.increment(l.quantity) }, { merge: true });
    try {
      await batch.commit();
      accepted++;
    } catch (err) {
      if (err.code !== 6) throw err; // ALREADY_EXISTS: imported before
      duplicates++;
    }
  }
  const record = {
    canteenId,
    businessDate,
    fileName: fileName || null,
    importedBy: adminUser.uid,
    importedAt: Timestamp.now(),
    transactions: transactions.length + rejectedTxns.length,
    accepted,
    duplicates,
    rejected: rejectedTxns.length,
    errors: errors.slice(0, 200),
    complete,
  };
  await importRef.set(record);
  await statusRef(canteenId, businessDate).set(
    {
      canteenId,
      businessDate,
      counterSource: 'import',
      lastCounterAt: record.importedAt,
      counterComplete: complete && !rejectedTxns.length,
      imports: FieldValue.arrayUnion({ importId: importRef.id, at: record.importedAt, complete }),
    },
    { merge: true }
  );
  // shortcut: imported sales carry their own times but stockout windows are not rebuilt from them; replay sales in time order if stockout timing for import-only days matters
  return { importId: importRef.id, ...record, importedAt: iso(record.importedAt) };
}
