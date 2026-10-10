// tests/eat.test.js
// Eat (canteen pre-order) API tests.
// Firestore-backed tests need the emulator: npm run test:emulator
import request from 'supertest';
import app from '../src/app.js';
import { db } from '../src/config/firebase.js';
import { estimateWaitMinutes } from '../src/services/queueEstimator.js';
import { findSlot, slotsForDate } from '../src/services/canteenService.js';
import { istDate, istParts } from '../src/utils/istTime.js';

const describeDb = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;
const as = (uid) => ({ 'x-dev-uid': uid });

describe('Queue estimate heuristic', () => {
  const input = { baseWaitMinutes: 6, perOrderMinutes: 1.5, openOrders: 4 };
  // 2026-10-14 is a Wednesday, 2026-10-17 a Saturday (IST)
  const wedLunch = istDate('2026-10-14', 13 * 60);
  const wedQuiet = istDate('2026-10-14', 15 * 60);
  const satLunch = istDate('2026-10-17', 13 * 60);

  it('is base wait plus open-order time off-peak', () => {
    expect(estimateWaitMinutes({ ...input, at: wedQuiet })).toBe(12); // 6 + 4*1.5
  });

  it('scales up during the weekday lunch rush', () => {
    expect(estimateWaitMinutes({ ...input, at: wedLunch })).toBe(17); // 6*1.8 + 6 = 16.8
  });

  it('is lower on weekends', () => {
    expect(estimateWaitMinutes({ ...input, at: satLunch })).toBeLessThan(estimateWaitMinutes({ ...input, at: wedLunch }));
  });

  it('never returns less than 1 minute', () => {
    expect(estimateWaitMinutes({ baseWaitMinutes: 0, perOrderMinutes: 0, openOrders: 0, at: wedQuiet })).toBe(1);
  });
});

describe('Pickup slot grid', () => {
  const canteen = { openTime: '08:00', closeTime: '09:00', slotMinutes: 5 };

  it('generates slots that end by closing time', () => {
    const slots = slotsForDate(canteen, '2026-10-14');
    expect(slots).toHaveLength(12);
    expect(slots[0].id).toBe('20261014_0800');
    expect(slots[0].start.toISOString()).toBe('2026-10-14T02:30:00.000Z');
    expect(slots.at(-1).id).toBe('20261014_0855');
  });

  it('rejects off-grid, out-of-hours and impossible slots', () => {
    expect(findSlot(canteen, '20261014_0805')).not.toBeNull();
    expect(findSlot(canteen, '20261014_0802')).toBeNull();
    expect(findSlot(canteen, '20261014_0900')).toBeNull();
    expect(findSlot(canteen, '20260231_0800')).toBeNull();
  });
});

describe('Eat input validation', () => {
  const validOrder = {
    canteenId: 'central-canteen',
    slotId: '20991231_1200',
    items: [{ itemId: 'filter-coffee', quantity: 1 }],
    paymentMethod: 'upi_mock',
  };

  it('requires auth', async () => {
    expect((await request(app).get('/api/v1/canteens')).status).toBe(401);
    expect((await request(app).get('/api/v1/orders/mine')).status).toBe(401);
  });

  it.each([
    ['quantity 0', { items: [{ itemId: 'filter-coffee', quantity: 0 }] }],
    ['quantity 11', { items: [{ itemId: 'filter-coffee', quantity: 11 }] }],
    ['empty cart', { items: [] }],
    ['duplicate items', { items: [{ itemId: 'a', quantity: 1 }, { itemId: 'a', quantity: 2 }] }],
    ['path-like canteen id', { canteenId: 'x/menu/y' }],
    ['malformed slot', { slotId: 'tomorrow' }],
    ['non-mock payment', { paymentMethod: 'upi' }],
  ])('rejects an order with %s', async (_, patch) => {
    const res = await request(app).post('/api/v1/orders').set(as('student-a')).send({ ...validOrder, ...patch });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an impossible slots date', async () => {
    const res = await request(app).get('/api/v1/canteens/central-canteen/slots?date=2026-02-31').set(as('student-a'));
    expect(res.status).toBe(422);
  });

  it('rejects a bad canteen id', async () => {
    const res = await request(app).get('/api/v1/canteens/bad.id/menu').set(as('student-a'));
    expect(res.status).toBe(422);
  });
});

describeDb('Eat API (Firestore emulator)', () => {
  // Unique per run so tests never see another run's data
  const canteenId = `test-canteen-${Date.now()}`;
  const tomorrow = istParts(new Date(Date.now() + 24 * 60 * 60 * 1000)).date;
  const slotId = `${tomorrow.replace(/-/g, '')}_1200`;
  const order = (patch = {}) => ({
    canteenId,
    slotId,
    items: [{ itemId: 'dosa', quantity: 2 }],
    paymentMethod: 'upi_mock',
    ...patch,
  });

  beforeAll(async () => {
    const ref = db.collection('canteens').doc(canteenId);
    await ref.set({
      name: 'Test Canteen',
      placeId: 'place-test',
      openTime: '00:00',
      closeTime: '23:59',
      isActive: true,
      slotMinutes: 5,
      slotCapacity: 5,
      baseWaitMinutes: 5,
      perOrderMinutes: 1,
    });
    await ref.collection('menu').doc('dosa').set({ name: 'Masala Dosa', category: 'Breakfast', price: 55, isVeg: true, isAvailable: true });
    await ref.collection('menu').doc('coffee').set({ name: 'Filter Coffee', category: 'Beverages', price: 20, isVeg: true, isAvailable: true });
    await ref.collection('menu').doc('poha').set({ name: 'Poha', category: 'Breakfast', price: 30, isVeg: true, isAvailable: false });
  });

  it('lists canteens with open status and a labelled estimate', async () => {
    const res = await request(app).get('/api/v1/canteens').set(as('student-a'));
    expect(res.status).toBe(200);
    const c = res.body.canteens.find((x) => x.id === canteenId);
    expect(c).toMatchObject({ name: 'Test Canteen', placeId: 'place-test', openTime: '00:00' });
    expect(typeof c.isOpen).toBe('boolean');
    if (c.isOpen) {
      expect(c.queue.isEstimate).toBe(true);
      expect(c.queue.estimatedWaitMinutes).toBeGreaterThanOrEqual(1);
    }
  });

  it('returns the menu grouped by category', async () => {
    const res = await request(app).get(`/api/v1/canteens/${canteenId}/menu`).set(as('student-a'));
    expect(res.status).toBe(200);
    expect(res.body.categories.map((c) => c.name)).toEqual(['Beverages', 'Breakfast']);
    const poha = res.body.categories[1].items.find((i) => i.id === 'poha');
    expect(poha).toMatchObject({ price: 30, isVeg: true, isAvailable: false });
  });

  it('returns 404 for an unknown canteen', async () => {
    const res = await request(app).get('/api/v1/canteens/no-such-canteen/menu').set(as('student-a'));
    expect(res.status).toBe(404);
  });

  it('calculates the total on the server and marks mock payment paid', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set(as('student-a'))
      .send(order({ items: [{ itemId: 'dosa', quantity: 2, price: 1 }, { itemId: 'coffee', quantity: 1 }], total: 1 }));
    expect(res.status).toBe(201);
    expect(res.body.total).toBe(130); // 2*55 + 20
    expect(res.body.items[0]).toMatchObject({ name: 'Masala Dosa', price: 55, quantity: 2, lineTotal: 110 });
    expect(res.body).toMatchObject({ status: 'placed', paymentMethod: 'upi_mock', paymentStatus: 'paid', userId: 'student-a' });
    expect(res.body.pickupSlot.id).toBe(slotId);
  });

  it('rejects unavailable and unknown items with their ids', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set(as('student-a'))
      .send(order({ items: [{ itemId: 'poha', quantity: 1 }, { itemId: 'ghost', quantity: 1 }, { itemId: 'dosa', quantity: 1 }] }));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ITEMS_UNAVAILABLE');
    expect(res.body.error.details.itemIds).toEqual(['poha', 'ghost']);
  });

  it('rejects past and off-grid slots', async () => {
    const past = await request(app).post('/api/v1/orders').set(as('student-a')).send(order({ slotId: '20200101_1200' }));
    expect(past.status).toBe(409);
    expect(past.body.error.code).toBe('SLOT_UNAVAILABLE');
    const offGrid = await request(app).post('/api/v1/orders').set(as('student-a')).send(order({ slotId: slotId.replace('_1200', '_1202') }));
    expect(offGrid.body.error.code).toBe('SLOT_UNAVAILABLE');
  });

  it('never overbooks a slot under concurrent checkouts', async () => {
    const fullSlot = `${tomorrow.replace(/-/g, '')}_1300`;
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        request(app).post('/api/v1/orders').set(as(`buyer-${i}`)).send(order({ slotId: fullSlot, items: [{ itemId: 'coffee', quantity: 1 }] }))
      )
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 201, 201, 201, 201, 409]);
    expect(results.find((r) => r.status === 409).body.error.code).toBe('SLOT_FULL');

    const slotDoc = await db.collection('canteens').doc(canteenId).collection('slots').doc(fullSlot).get();
    expect(slotDoc.get('booked')).toBe(5);

    const slots = await request(app).get(`/api/v1/canteens/${canteenId}/slots?date=${tomorrow}`).set(as('student-a'));
    const s = slots.body.slots.find((x) => x.id === fullSlot);
    expect(s).toMatchObject({ capacity: 5, booked: 5, remaining: 0, available: false });
    expect(slots.body.slots.find((x) => x.id === slotId).available).toBe(true);
  }, 30_000); // contended transactions retry with backoff in the emulator (2-8 s measured)

  it('shows orders only to their owner', async () => {
    const placed = await request(app).post('/api/v1/orders').set(as('owner-1')).send(order());
    const id = placed.body.id;

    const mine = await request(app).get(`/api/v1/orders/${id}`).set(as('owner-1'));
    expect(mine.status).toBe(200);
    expect(mine.body.total).toBe(110);

    const theirs = await request(app).get(`/api/v1/orders/${id}`).set(as('intruder'));
    expect(theirs.status).toBe(404);

    const list = await request(app).get('/api/v1/orders/mine').set(as('owner-1'));
    expect(list.status).toBe(200);
    expect(list.body.orders.map((o) => o.id)).toEqual([id]);
    const intruderList = await request(app).get('/api/v1/orders/mine').set(as('intruder'));
    expect(intruderList.body.orders).toEqual([]);
  });

  describe('staff counter', () => {
    const staffUid = `staff-${canteenId}`;
    const otherStaffUid = `staff-other-${canteenId}`;

    beforeAll(async () => {
      await db.collection('staff').doc(staffUid).set({ canteenId, name: 'Counter' });
      await db.collection('staff').doc(otherStaffUid).set({ canteenId: 'some-other-canteen', name: 'Other' });
      await db.collection('users').doc('hungry-student').set({ name: 'Aarav Mehta' });
    });

    it('rejects students on every staff route', async () => {
      expect((await request(app).get('/api/v1/staff/orders').set(as('hungry-student'))).status).toBe(403);
      expect((await request(app).patch('/api/v1/staff/orders/x').set(as('hungry-student')).send({ status: 'ready' })).status).toBe(403);
      expect((await request(app).post('/api/v1/staff/menu').set(as('hungry-student')).send({})).status).toBe(403);
    });

    it('shows the counter its own orders with items, time, payment and customer', async () => {
      const placed = await request(app)
        .post('/api/v1/orders')
        .set(as('hungry-student'))
        .send(order({ slotId: `${tomorrow.replace(/-/g, '')}_1400` }));
      expect(placed.status).toBe(201);

      const res = await request(app).get('/api/v1/staff/orders').set(as(staffUid));
      expect(res.status).toBe(200);
      const o = res.body.orders.find((x) => x.id === placed.body.id);
      expect(o).toMatchObject({ status: 'placed', paymentStatus: 'paid', customerName: 'Aarav Mehta', total: 110 });
      expect(o.items[0]).toMatchObject({ name: 'Masala Dosa', quantity: 2 });
      expect(o.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      const other = await request(app).get('/api/v1/staff/orders').set(as(otherStaffUid));
      expect(other.body.orders.find((x) => x.id === placed.body.id)).toBeUndefined();
    });

    it('moves an order placed → preparing → ready → collected and the student sees it', async () => {
      const { body: placed } = await request(app)
        .post('/api/v1/orders')
        .set(as('hungry-student'))
        .send(order({ slotId: `${tomorrow.replace(/-/g, '')}_1405` }));
      const patch = (status, uid = staffUid) =>
        request(app).patch(`/api/v1/staff/orders/${placed.id}`).set(as(uid)).send({ status });

      const skip = await patch('ready');
      expect(skip.status).toBe(409);
      expect(skip.body.error.code).toBe('INVALID_STATUS_TRANSITION');
      expect((await patch('preparing', otherStaffUid)).status).toBe(404);

      expect((await patch('preparing')).body.status).toBe('preparing');
      const ready = await patch('ready');
      expect(ready.body.readyAt).toMatch(/^\d{4}-/);
      expect((await patch('collected')).status).toBe(200);
      expect((await patch('collected')).status).toBe(409);

      const tracked = await request(app).get(`/api/v1/orders/${placed.id}`).set(as('hungry-student'));
      expect(tracked.body.status).toBe('collected');

      const queue = await request(app).get('/api/v1/staff/orders').set(as(staffUid));
      expect(queue.body.orders.find((x) => x.id === placed.id)).toBeUndefined();
      const history = await request(app).get('/api/v1/staff/orders?status=collected').set(as(staffUid));
      expect(history.body.orders.find((x) => x.id === placed.id)).toBeDefined();
    });

    it('adds items and marks them sold out, reflected in the menu and checkout', async () => {
      const added = await request(app)
        .post('/api/v1/staff/menu')
        .set(as(staffUid))
        .send({ name: 'Onion Uttapam', category: 'Breakfast', price: 60, isVeg: true, canteenId: 'some-other-canteen' });
      expect(added.status).toBe(201);
      expect(added.body).toMatchObject({ name: 'Onion Uttapam', price: 60, isAvailable: true });

      let menu = await request(app).get(`/api/v1/canteens/${canteenId}/menu`).set(as('hungry-student'));
      const findItem = () => menu.body.categories.flatMap((c) => c.items).find((i) => i.id === added.body.id);
      expect(findItem()).toMatchObject({ name: 'Onion Uttapam', isAvailable: true });

      const soldOut = await request(app)
        .patch(`/api/v1/staff/menu/${added.body.id}`)
        .set(as(staffUid))
        .send({ isAvailable: false });
      expect(soldOut.status).toBe(200);
      menu = await request(app).get(`/api/v1/canteens/${canteenId}/menu`).set(as('hungry-student'));
      expect(findItem().isAvailable).toBe(false);

      const rejected = await request(app)
        .post('/api/v1/orders')
        .set(as('hungry-student'))
        .send(order({ items: [{ itemId: added.body.id, quantity: 1 }] }));
      expect(rejected.body.error.code).toBe('ITEMS_UNAVAILABLE');

      // Another canteen's staff cannot touch this item
      const foreign = await request(app)
        .patch(`/api/v1/staff/menu/${added.body.id}`)
        .set(as(otherStaffUid))
        .send({ isAvailable: true });
      expect(foreign.status).toBe(404);
    });

    it('validates staff input', async () => {
      const bad = await request(app).post('/api/v1/staff/menu').set(as(staffUid)).send({ name: 'Free food', category: 'X', price: -5, isVeg: true });
      expect(bad.status).toBe(422);
      const empty = await request(app).patch('/api/v1/staff/menu/dosa').set(as(staffUid)).send({});
      expect(empty.status).toBe(422);
      const badStatus = await request(app).get('/api/v1/staff/orders?status=placed,eaten').set(as(staffUid));
      expect(badStatus.status).toBe(422);
    });
  });
});
