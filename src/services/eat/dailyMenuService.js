// src/services/eat/dailyMenuService.js
// Authorised daily menus and the per-day inventory ledger.
//
// Menus come from an administration CSV upload (never the private digital-TV
// URL) and change day to day: nothing assumes a weekday repeats.
//
// Data model:
//   dailyMenus/{canteenId}_{YYYY-MM-DD}
//     canteenId, businessDate,
//     draft     { items[], fileName, uploadedBy, uploadedAt } | null
//     published { version, items[], publishedBy, publishedAt } | null
//   dailyMenus/{id}/versions/{n}   every published version, kept for history
//   inventory/{canteenId}_{YYYY-MM-DD}_{itemId}
//     canteenId, businessDate, itemId, name, category, price, isVeg, preorder,
//     availableFrom, availableTo, onMenu, menuVersion, planned + ledger fields
//     (see eatRules.js), stockouts [{ at, until }], adjustmentLog[]
// Orders keep their own price snapshot, so yesterday's orders stay linked to
// yesterday's prices even after a new menu is published.
import { db } from '../../config/firebase.js';
import { ApiError, notFound } from '../../utils/apiError.js';
import { istParts } from '../../utils/istTime.js';
import { availableOf, emptyLedger, nextStockouts, validateMenuCsv } from './eatRules.js';
import admin from 'firebase-admin';

const { Timestamp } = admin.firestore;

export const menuRef = (canteenId, date) => db.collection('dailyMenus').doc(`${canteenId}_${date}`);
export const inventoryRef = (canteenId, date, itemId) => db.collection('inventory').doc(`${canteenId}_${date}_${itemId}`);
export const statusRef = (canteenId, date) => db.collection('eatDataStatus').doc(`${canteenId}_${date}`);
export const today = (now = new Date()) => istParts(now).date;

const iso = (t) => (t ? t.toDate().toISOString() : null);

/** The published menu for a canteen and date, or null (callers fall back to the static menu). */
export async function publishedMenu(canteenId, date, tx = null) {
  const snap = tx ? await tx.get(menuRef(canteenId, date)) : await menuRef(canteenId, date).get();
  return snap.exists && snap.get('published') ? snap.get('published') : null;
}

async function requireCanteen(canteenId) {
  const c = await db.collection('canteens').doc(canteenId).get();
  if (!c.exists) throw notFound('Canteen');
  return c;
}

export async function validateUpload({ canteenId, businessDate, csv }) {
  await requireCanteen(canteenId);
  const { items, errors } = validateMenuCsv(csv, { canteenId, businessDate });
  return { canteenId, businessDate, items, errors, accepted: items.length, rejected: errors.length };
}

/** Save a validated upload as the draft. Any row error rejects the whole file. */
export async function saveDraft(adminUser, { canteenId, businessDate, csv, fileName }) {
  const result = await validateUpload({ canteenId, businessDate, csv });
  if (result.errors.length) throw new ApiError(422, 'MENU_INVALID', 'Fix the listed rows and upload again.', result.errors);
  const draft = { items: result.items, fileName: fileName || null, uploadedBy: adminUser.uid, uploadedAt: Timestamp.now() };
  await menuRef(canteenId, businessDate).set({ canteenId, businessDate, draft }, { merge: true });
  return getMenuRecord(canteenId, businessDate);
}

/**
 * Publish the draft as a new version and sync the inventory ledger in one
 * transaction. Planned quantities change; sales and reservations are kept.
 */
export async function publish(adminUser, canteenId, businessDate) {
  const ref = menuRef(canteenId, businessDate);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const draft = snap.get('draft');
    if (!snap.exists || !draft) throw new ApiError(409, 'NO_DRAFT', 'Upload a menu before publishing.');
    const previous = snap.get('published');
    const ids = new Set([...draft.items.map((i) => i.itemId), ...(previous?.items || []).map((i) => i.itemId)]);
    const refs = [...ids].map((id) => inventoryRef(canteenId, businessDate, id));
    const invSnaps = await tx.getAll(...refs);
    const now = Timestamp.now();
    const version = (previous?.version || 0) + 1;
    const published = { version, items: draft.items, publishedBy: adminUser.uid, publishedAt: now };

    tx.set(ref, { published, draft: null }, { merge: true });
    tx.set(ref.collection('versions').doc(String(version)), { ...published, fileName: draft.fileName });
    const byId = new Map(draft.items.map((i) => [i.itemId, i]));
    invSnaps.forEach((s, i) => {
      const item = byId.get(s.id.slice(`${canteenId}_${businessDate}_`.length));
      if (!item) {
        tx.set(refs[i], { onMenu: false, menuVersion: version }, { merge: true });
        return;
      }
      const ledger = s.exists ? s.data() : emptyLedger();
      const next = { ...ledger, ...item, canteenId, businessDate, onMenu: true, menuVersion: version };
      const stockouts = nextStockouts(ledger.stockouts || [], availableOf(next), now);
      tx.set(refs[i], { ...(s.exists ? {} : emptyLedger()), ...item, canteenId, businessDate, onMenu: true, menuVersion: version, ...(stockouts && { stockouts }) }, { merge: true });
    });
  });
  return getMenuRecord(canteenId, businessDate);
}

export async function getMenuRecord(canteenId, businessDate) {
  const snap = await menuRef(canteenId, businessDate).get();
  if (!snap.exists) throw notFound('Daily menu');
  const d = snap.data();
  return {
    canteenId,
    businessDate,
    draft: d.draft ? { ...d.draft, uploadedAt: iso(d.draft.uploadedAt) } : null,
    published: d.published ? { ...d.published, publishedAt: iso(d.published.publishedAt) } : null,
  };
}

export async function listMenus({ from, to }) {
  const snap = await db.collection('dailyMenus').where('businessDate', '>=', from).where('businessDate', '<=', to).limit(1000).get();
  return snap.docs
    .map((d) => ({
      canteenId: d.get('canteenId'),
      businessDate: d.get('businessDate'),
      hasDraft: Boolean(d.get('draft')),
      publishedVersion: d.get('published')?.version || null,
      items: d.get('published')?.items.length || 0,
      synthetic: Boolean(d.get('synthetic')),
    }))
    .sort((a, b) => b.businessDate.localeCompare(a.businessDate) || a.canteenId.localeCompare(b.canteenId));
}

// ─── Inventory reads ─────────────────────────────────────────────────────────

export const serializeInventory = (id, d) => ({
  itemId: d.itemId,
  name: d.name,
  category: d.category,
  price: d.price,
  isVeg: d.isVeg,
  preorder: d.preorder,
  availableFrom: d.availableFrom || null,
  availableTo: d.availableTo || null,
  onMenu: d.onMenu !== false,
  planned: d.planned ?? null,
  adjustments: d.adjustments || 0,
  reserved: d.reserved || 0,
  onlineSold: d.onlineSold || 0,
  counterSold: d.counterSold || 0,
  cancelled: d.cancelled || 0,
  wastage: d.wastage ?? null,
  available: availableOf(d),
  soldOut: availableOf(d) !== null && availableOf(d) <= 0,
  stockouts: (d.stockouts || []).map((s) => ({ at: iso(s.at), until: iso(s.until) })),
});

/** Today's ledger for a canteen, items on the published menu only. */
export async function dayInventory(canteenId, date) {
  const menu = await publishedMenu(canteenId, date);
  if (!menu) return null;
  const snaps = await db.getAll(...menu.items.map((i) => inventoryRef(canteenId, date, i.itemId)));
  return { version: menu.version, items: snaps.filter((s) => s.exists).map((s) => serializeInventory(s.id, s.data())) };
}
