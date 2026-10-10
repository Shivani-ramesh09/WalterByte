// tests/eatIntelligence.test.js
// Daily menus, inventory ledger, counter sales and unmet-demand measurement.
// Pure rule tests always run; API tests need the emulator: npm run test:emulator
import request from 'supertest';
import app from '../src/app.js';
import { db } from '../src/config/firebase.js';
import { istParts } from '../src/utils/istTime.js';
import { parsePeriod } from '../src/utils/period.js';
import { availableOf, nextStockouts, validateBillingCsv, validateMenuCsv } from '../src/services/eat/eatRules.js';
import { forecastDemand, grossScenario, itemDay, minutesLeftAtStockout, signalBreakdown } from '../src/services/analytics/eatAnalytics.js';
import { periodDates } from '../src/services/eat/eatAdminService.js';

const describeDb = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;
const as = (uid) => ({ 'x-dev-uid': uid });

const HEADER = 'canteen_id,business_date,item_id,name,category,price,is_veg,planned_quantity,preorder,available_from,available_to';
const csvFor = (canteenId, date, rows) => [HEADER, ...rows.map((r) => [canteenId, date, ...r].join(','))].join('\n');

// ─── Menu and billing validation ─────────────────────────────────────────────

describe('Daily menu CSV', () => {
  const ctx = { canteenId: 'c1', businessDate: '2026-10-12' };

  it('accepts valid rows, quoted commas and blank planned quantities', () => {
    const csv = `${HEADER}\nc1,2026-10-12,biryani,Chicken Biryani,Meals,180,false,100,true,11:30,15:00\nc1,2026-10-12,tea,"Tea, masala",Beverages,15,yes,,no,,`;
    const { items, errors } = validateMenuCsv(csv, ctx);
    expect(errors).toEqual([]);
    expect(items[0]).toMatchObject({ itemId: 'biryani', price: 180, isVeg: false, planned: 100, preorder: true, availableFrom: '11:30' });
    expect(items[1]).toMatchObject({ name: 'Tea, masala', planned: null, preorder: false });
  });

  it('reports every bad row with its line and field, and keeps nothing silently', () => {
    const csv = [
      HEADER,
      'c2,2026-10-12,a,A,Meals,50,true,10,true,,', // wrong canteen
      'c1,2026-10-13,b,B,Meals,50,true,10,true,,', // wrong date
      'c1,2026-10-12,c,C,Meals,0,true,10,true,,', // bad price
      'c1,2026-10-12,d,D,Meals,50,maybe,10,true,,', // bad is_veg
      'c1,2026-10-12,e,E,Meals,50,true,10,true,15:00,11:00', // window reversed
      'c1,2026-10-12,f,F,Meals,50,true,10,true,,',
      'c1,2026-10-12,f,F again,Meals,50,true,10,true,,', // duplicate id
    ].join('\n');
    const { items, errors } = validateMenuCsv(csv, ctx);
    expect(items.map((i) => i.itemId)).toEqual(['f']);
    expect(errors.map((e) => [e.line, e.field])).toEqual([
      [2, 'canteen_id'],
      [3, 'business_date'],
      [4, 'price'],
      [5, 'is_veg'],
      [6, 'available_to'],
      [8, 'item_id'],
    ]);
  });

  it('rejects files missing required columns', () => {
    expect(validateMenuCsv('item_id,name\nx,y', ctx).errors[0].message).toMatch(/Missing column/);
  });
});

describe('Billing CSV', () => {
  const menu = new Set(['tea', 'biryani']);
  it('groups rows into transactions and rejects a transaction with any bad row', () => {
    const csv = 'txn_id,time,item_id,quantity\nT1,12:05,biryani,1\nT1,12:05,tea,2\nT2,12:10,dosa,1\nT2,12:10,tea,1\nT3,25:00,tea,1';
    const { transactions, errors, rejectedTxns } = validateBillingCsv(csv, menu);
    expect(transactions).toEqual([{ txnId: 'T1', time: '12:05', lines: [{ itemId: 'biryani', quantity: 1 }, { itemId: 'tea', quantity: 2 }] }]);
    expect(rejectedTxns.sort()).toEqual(['T2', 'T3']);
    expect(errors.map((e) => e.field).sort()).toEqual(['item_id', 'time']);
  });
});

// ─── Inventory arithmetic and stockouts ──────────────────────────────────────

describe('Inventory ledger', () => {
  it('deducts reservations once; collection moves them to sold without changing availability', () => {
    const placed = { planned: 100, adjustments: 0, reserved: 25, onlineSold: 0, counterSold: 40 };
    expect(availableOf(placed)).toBe(35);
    const collected = { ...placed, reserved: 0, onlineSold: 25 };
    expect(availableOf(collected)).toBe(35);
    expect(availableOf({ planned: null })).toBeNull();
  });

  it('opens a stockout at zero and closes it when stock returns', () => {
    const t1 = new Date('2026-10-12T07:00:00Z');
    const t2 = new Date('2026-10-12T08:00:00Z');
    const opened = nextStockouts([], 0, t1);
    expect(opened).toEqual([{ at: t1, until: null }]);
    expect(nextStockouts(opened, -1, t2)).toBeNull(); // still out
    expect(nextStockouts(opened, 5, t2)).toEqual([{ at: t1, until: t2 }]);
    expect(nextStockouts([], 3, t1)).toBeNull();
  });
});

// ─── Unmet-demand signals ────────────────────────────────────────────────────

describe('Demand signals', () => {
  const sig = (type, patch = {}) => ({ type, quantity: 1, status: 'valid', outcome: null, actorKey: null, ...patch });

  it('keeps types separate, deduplicates identified people and flags anonymous overlap', () => {
    const b = signalBreakdown([
      sig('failed_online_attempt', { actorKey: 'u1', quantity: 2 }),
      sig('failed_online_attempt', { actorKey: 'u1' }), // retried
      sig('interest', { actorKey: 'u1', outcome: 'substituted' }), // same student, other channel
      sig('interest', { actorKey: 'u2', outcome: 'no_purchase' }),
      sig('counter_request', { quantity: 12 }), // anonymous batch
      sig('counter_request', { quantity: 3, status: 'void' }),
    ]);
    expect(b).toMatchObject({
      failedOnlineAttempts: 2,
      failedPortionsRequested: 3,
      interestResponses: 2,
      counterRequests: 12,
      uniqueIdentifiedPeople: 2,
      duplicateIdentifiedSignals: 2,
      possibleOverlap: true,
      substitutions: 1,
      noPurchase: 1,
      voided: 1,
    });
    // 3 failed portions + 12 counter people with no stated outcome
    expect(b.unknownOutcome).toBe(15);
  });

  it('never counts a stockout as unmet demand', () => {
    const inv = {
      canteenId: 'c', itemId: 'biryani', name: 'Biryani', category: 'Meals', businessDate: '2026-10-12', price: 180,
      planned: 100, onlineSold: 30, counterSold: 70, reserved: 0,
      stockouts: [{ at: new Date('2026-10-12T07:30:00Z'), until: null }], // 13:00 IST
    };
    const d = itemDay(inv, [], '20:00');
    expect(d.sold).toBe(100);
    expect(d.gross).toBe(18000);
    expect(d.stockoutAt).toBeTruthy();
    expect(d.signals.failedOnlineAttempts + d.signals.counterRequests + d.signals.interestResponses).toBe(0);
  });

  it('measures time left in the service period at the stockout', () => {
    const lunchEarly = new Date('2026-10-12T06:45:00Z'); // 12:15 IST
    const lunchLate = new Date('2026-10-12T09:15:00Z'); // 14:45 IST
    expect(minutesLeftAtStockout({}, lunchEarly, '21:00')).toBe(165);
    expect(minutesLeftAtStockout({}, lunchLate, '21:00')).toBe(15);
    expect(minutesLeftAtStockout({ availableTo: '13:00' }, lunchEarly, '21:00')).toBe(45);
  });
});

// ─── Forecast and financial scenario ─────────────────────────────────────────

describe('Forecast and scenarios', () => {
  const day = (sold, extra = {}) => ({ planned: 100, sold, stockoutAt: sold >= 100 ? 'x' : null, signals: { failedPortionsRequested: 0, counterRequests: 0, interestResponses: 0, ...extra } });

  it('refuses to forecast with fewer than 4 comparable days', () => {
    const f = forecastDemand([day(100), day(100), day(90)]);
    expect(f).toMatchObject({ sufficient: false, message: 'Insufficient data to estimate additional demand.' });
  });

  it('gives a range from sales and recorded signals, not a confidence interval', () => {
    const f = forecastDemand([day(100, { counterRequests: 10 }), day(100, { failedPortionsRequested: 5, counterRequests: 15 }), day(95), day(100, { interestResponses: 20 })]);
    expect(f).toMatchObject({ sufficient: true, observations: 4, low: 100, soldOutDays: 3 });
    expect(f.high).toBe(115); // median of 110, 120, 95, 120
    expect(f.note).toMatch(/not a statistical confidence interval/);
    expect(f.assumptions.length).toBeGreaterThan(2);
  });

  it('states gross sales as a conditional scenario and profit only with an explicit cost', () => {
    const s = grossScenario({ portions: 20, price: 180 });
    expect(s.grossSales).toBe(3600);
    expect(s.contribution).toBeNull();
    expect(s.statement).toBe('If 20 additional portions could be sold at ₹180 each, gross sales would be ₹3,600 before additional costs. This is a scenario, not a prediction or guaranteed return.');
    expect(grossScenario({ portions: 20, price: 180, unitCost: 110 }).contribution).toBe(1400);
  });

  it('maps reporting periods to IST business dates', () => {
    expect(periodDates(parsePeriod({ from: '2026-10-01', to: '2026-10-07' }))).toEqual({ from: '2026-10-01', to: '2026-10-07' });
  });
});

// ─── API (emulator) ──────────────────────────────────────────────────────────

describeDb('Eat inventory and demand (Firestore emulator)', () => {
  const run = Date.now();
  const canteenId = `eat-int-${run}`;
  const otherCanteen = `eat-other-${run}`;
  const central = `eat-admin-${run}`;
  const staff = `eat-staff-${run}`;
  const otherStaff = `eat-staff-other-${run}`;
  const students = Array.from({ length: 6 }, (_, i) => `eat-student-${i}-${run}`);
  const todayDate = istParts(new Date()).date;
  // Next grid slot at least 15 minutes ahead (the test canteen is open all day)
  const slotAt = new Date(Math.ceil((Date.now() + 15 * 60 * 1000) / (5 * 60 * 1000)) * 5 * 60 * 1000);
  const slot = istParts(slotAt);
  const slotId = `${slot.date.replace(/-/g, '')}_${String(Math.floor(slot.minutes / 60)).padStart(2, '0')}${String(slot.minutes % 60).padStart(2, '0')}`;
  const rows = [
    ['biryani', 'Chicken Biryani', 'Meals', 180, false, 3, true, '', ''],
    ['tea', 'Tea', 'Beverages', 15, true, '', true, '', ''],
    ['parotta', 'Parotta', 'Meals', 40, true, 50, false, '', ''],
  ];
  const order = (uid, itemId = 'biryani', quantity = 1) =>
    request(app).post('/api/v1/orders').set(as(uid)).send({ canteenId, slotId, items: [{ itemId, quantity }], paymentMethod: 'upi_mock' });
  const inv = async (itemId, date = slot.date) => (await db.collection('inventory').doc(`${canteenId}_${date}_${itemId}`).get()).data();
  const publishFor = async (date, r = rows) => {
    const up = await request(app).post('/api/v1/admin/eat/menus').set(as(central)).send({ canteenId, businessDate: date, csv: csvFor(canteenId, date, r) });
    expect(up.status).toBe(201);
    return request(app).post(`/api/v1/admin/eat/menus/${canteenId}/${date}/publish`).set(as(central));
  };

  beforeAll(async () => {
    const base = { name: 'Integration Canteen', openTime: '00:00', closeTime: '23:59', isActive: true, slotMinutes: 5, slotCapacity: 50, baseWaitMinutes: 5, perOrderMinutes: 1 };
    await db.collection('canteens').doc(canteenId).set(base);
    await db.collection('canteens').doc(otherCanteen).set({ ...base, name: 'Other' });
    await db.collection('admins').doc(central).set({ role: 'central', name: 'Food admin' });
    await db.collection('staff').doc(staff).set({ canteenId, name: 'Counter' });
    await db.collection('staff').doc(otherStaff).set({ canteenId: otherCanteen, name: 'Other counter' });
    // Counter actions use today's menu; orders use the slot day's menu
    await publishFor(todayDate);
    if (slot.date !== todayDate) await publishFor(slot.date);
  });

  afterAll(async () => {
    const cols = ['inventory', 'demandSignals', 'counterSales', 'eatDataStatus', 'eatImports', 'dailyMenus', 'orders'];
    for (const c of cols) {
      const snap = await db.collection(c).where('canteenId', '==', canteenId).get();
      await Promise.all(snap.docs.map((d) => db.recursiveDelete(d.ref)));
    }
    await Promise.all([
      db.recursiveDelete(db.collection('canteens').doc(canteenId)),
      db.recursiveDelete(db.collection('canteens').doc(otherCanteen)),
      db.collection('admins').doc(central).delete(),
      db.collection('staff').doc(staff).delete(),
      db.collection('staff').doc(otherStaff).delete(),
    ]);
  });

  it('keeps students and staff out of Eat administration', async () => {
    expect((await request(app).get('/api/v1/admin/eat').set(as(students[0]))).status).toBe(403);
    expect((await request(app).get('/api/v1/admin/eat').set(as(staff))).status).toBe(403);
    expect((await request(app).post('/api/v1/admin/eat/menus').set(as(staff)).send({ canteenId, businessDate: todayDate, csv: 'x' })).status).toBe(403);
  });

  it('rejects an invalid upload with row errors and publishes versions', async () => {
    const bad = await request(app).post('/api/v1/admin/eat/menus').set(as(central)).send({ canteenId, businessDate: todayDate, csv: csvFor(canteenId, todayDate, [['x', 'X', 'Meals', 0, true, '', true, '', '']]) });
    expect(bad.status).toBe(422);
    expect(bad.body.error.details[0]).toMatchObject({ line: 2, field: 'price' });
    const record = await request(app).get(`/api/v1/admin/eat/menus/${canteenId}/${todayDate}`).set(as(central));
    expect(record.body.published.version).toBe(1);
    const menu = await request(app).get(`/api/v1/canteens/${canteenId}/menu`).set(as(students[0]));
    expect(menu.body.source).toBe('daily');
    const parotta = menu.body.categories.flatMap((c) => c.items).find((i) => i.id === 'parotta');
    expect(parotta).toMatchObject({ counterOnly: true, isAvailable: false });
  });

  it('never oversells under concurrent orders and records each rejected attempt', async () => {
    const results = await Promise.all(students.map((uid) => order(uid)));
    const ok = results.filter((r) => r.status === 201);
    const soldOut = results.filter((r) => r.status === 409 && r.body.error.code === 'ITEMS_SOLD_OUT');
    expect(ok).toHaveLength(3);
    expect(soldOut).toHaveLength(3);
    const ledger = await inv('biryani');
    expect(ledger.reserved).toBe(3);
    expect(availableOf(ledger)).toBe(0);
    expect(ledger.stockouts).toHaveLength(1);
    const signals = await db.collection('demandSignals').where('canteenId', '==', canteenId).where('type', '==', 'failed_online_attempt').get();
    expect(signals.size).toBe(3);
    expect(signals.docs.every((d) => d.get('actorKey') && d.get('outcome') === null)).toBe(true);
  }, 30000); // contended transactions retry with backoff on the emulator

  it('moves a collected order from reserved to sold without deducting again', async () => {
    const staffOrders = await request(app).get('/api/v1/staff/orders').set(as(staff));
    const first = staffOrders.body.orders.find((o) => o.items[0].itemId === 'biryani');
    for (const status of ['preparing', 'ready', 'collected']) {
      expect((await request(app).patch(`/api/v1/staff/orders/${first.id}`).set(as(staff)).send({ status })).status).toBe(200);
    }
    const ledger = await inv('biryani');
    expect(ledger).toMatchObject({ reserved: 2, onlineSold: 1 });
    expect(availableOf(ledger)).toBe(0);
  });

  it('releases stock and the slot when a student cancels, closing the stockout', async () => {
    const placed = (await db.collection('orders').where('canteenId', '==', canteenId).where('status', '==', 'placed').get()).docs[0];
    const owner = placed.get('userId');
    expect((await request(app).post(`/api/v1/orders/${placed.id}/cancel`).set(as(students.find((s) => s !== owner)))).status).toBe(404);
    const res = await request(app).post(`/api/v1/orders/${placed.id}/cancel`).set(as(owner));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'cancelled', paymentStatus: 'refunded_mock' });
    const ledger = await inv('biryani');
    expect(ledger).toMatchObject({ reserved: 1, cancelled: 1 });
    expect(availableOf(ledger)).toBe(1);
    expect(ledger.stockouts[0].until).toBeTruthy();
    expect((await request(app).post(`/api/v1/orders/${placed.id}/cancel`).set(as(owner))).status).toBe(409);
  });

  it('records counter sales once per transaction id', async () => {
    const sale = { txnId: `txn-${run}`, lines: [{ itemId: 'parotta', quantity: 4 }, { itemId: 'tea', quantity: 2 }] };
    const first = await request(app).post('/api/v1/staff/counter-sales').set(as(staff)).send(sale);
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ duplicate: false, total: 190, source: 'live' });
    const retry = await request(app).post('/api/v1/staff/counter-sales').set(as(staff)).send(sale);
    expect(retry.body.duplicate).toBe(true);
    expect((await inv('parotta', todayDate)).counterSold).toBe(4);
    // Another canteen's counter cannot record against this menu
    expect((await request(app).post('/api/v1/staff/counter-sales').set(as(otherStaff)).send({ ...sale, txnId: `other-${run}` })).status).toBe(409);
  });

  it('stores cashier batch counts as anonymous requests, idempotently, with auditable voids', async () => {
    const body = { requestId: `req-${run}`, itemId: 'biryani', quantity: 12 };
    const r1 = await request(app).post('/api/v1/staff/unavailable-requests').set(as(staff)).send(body);
    expect(r1.status).toBe(201);
    expect(r1.body).toMatchObject({ quantity: 12, type: 'counter_request', duplicate: false });
    expect((await request(app).post('/api/v1/staff/unavailable-requests').set(as(staff)).send(body)).body.duplicate).toBe(true);
    const doc = await db.collection('demandSignals').doc(`counter_${canteenId}_req-${run}`).get();
    expect(doc.data()).toMatchObject({ anonymous: true, actorKey: null, quantity: 12 });
    expect((await request(app).patch(`/api/v1/staff/unavailable-requests/req-${run}`).set(as(otherStaff)).send({ reason: 'typo' })).status).toBe(404);
    const voided = await request(app).patch(`/api/v1/staff/unavailable-requests/req-${run}`).set(as(staff)).send({ reason: 'Entered twice' });
    expect(voided.body).toMatchObject({ status: 'void', voidReason: 'Entered twice' });
  });

  it('accepts "I wanted this" only for sold-out items, once per student', async () => {
    expect((await request(app).post(`/api/v1/canteens/${canteenId}/menu/tea/interest`).set(as(students[0])).send({})).status).toBe(409);
    // Sell out today's biryani at the counter (it is stock-tracked at 3)
    await request(app).post('/api/v1/staff/inventory/biryani/adjust').set(as(staff)).send({ requestId: `adj-${run}`, delta: -10, reason: 'correction' });
    const a = await request(app).post(`/api/v1/canteens/${canteenId}/menu/biryani/interest`).set(as(students[0])).send({});
    expect(a.status).toBe(200);
    await request(app).post(`/api/v1/canteens/${canteenId}/menu/biryani/interest`).set(as(students[0])).send({ outcome: 'substituted', substituteItemId: 'parotta' });
    const docs = (await db.collection('demandSignals').where('canteenId', '==', canteenId).where('actorKey', '==', students[0]).get()).docs.filter((d) => d.get('type') === 'interest');
    expect(docs).toHaveLength(1);
    expect(docs[0].get('outcome')).toBe('substituted');
    const menu = await request(app).get(`/api/v1/canteens/${canteenId}/menu`).set(as(students[0]));
    const biryani = menu.body.categories.flatMap((c) => c.items).find((i) => i.id === 'biryani');
    expect(biryani).toMatchObject({ soldOut: true, isAvailable: false, wanted: true });
  });

  it('imports billing files idempotently and reports rejected rows', async () => {
    const csv = 'txn_id,time,item_id,quantity\nB1,09:05,tea,1\nB2,09:10,tea,2\nB3,09:15,nope,1';
    const body = { canteenId, businessDate: todayDate, csv, complete: true };
    const first = await request(app).post('/api/v1/admin/eat/counter-imports').set(as(central)).send(body);
    expect(first.body).toMatchObject({ accepted: 2, duplicates: 0, rejected: 1 });
    expect(first.body.errors[0]).toMatchObject({ line: 4, field: 'item_id' });
    const again = await request(app).post('/api/v1/admin/eat/counter-imports').set(as(central)).send(body);
    expect(again.body).toMatchObject({ accepted: 0, duplicates: 2 });
    expect((await inv('tea', todayDate)).counterSold).toBe(2 + 3);
  });

  it('reports the item with separate signal types and refuses a forecast on one day of data', async () => {
    const res = await request(app).get(`/api/v1/admin/eat/items/${canteenId}/biryani?from=${todayDate}&to=${slot.date}&portions=20`).set(as(central));
    expect(res.status).toBe(200);
    expect(res.body.forecast.sufficient).toBe(false);
    expect(res.body.scenario.statement).toMatch(/^If 20 additional portions could be sold at ₹180 each/);
    const s = res.body.summary.signals;
    expect(s.failedOnlineAttempts).toBeGreaterThanOrEqual(slot.date === todayDate ? 3 : 0);
    expect(s.counterRequests).toBe(0); // the only batch was voided
    expect(s.interestResponses).toBe(1);
    expect(res.body.quality.uniquePeopleNote).toMatch(/anonymous/);
    // Identities never reach the dashboard
    expect(JSON.stringify(res.body)).not.toContain(students[0]);
  });
});
