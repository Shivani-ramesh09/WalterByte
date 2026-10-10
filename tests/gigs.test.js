// tests/gigs.test.js
// Connect freelance gigs. Firestore-backed tests need the emulator: npm run test:emulator
import request from 'supertest';
import app from '../src/app.js';
import { db } from '../src/config/firebase.js';

const describeDb = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;
const as = (uid) => ({ 'x-dev-uid': uid });

const gigBody = (patch = {}) => ({
  title: 'Event photography with edited photos',
  skill: 'Photography',
  description: 'Fests, portraits and club events, edited and delivered in two days.',
  priceFrom: 800,
  deliveryDays: 2,
  samples: [{ type: 'image', url: 'https://example.com/shot.jpg', caption: 'Fest stage' }],
  ...patch,
});

describe('Gig validation', () => {
  it.each([
    ['no work samples', { samples: [] }],
    ['a non-https sample', { samples: [{ type: 'image', url: 'http://example.com/a.jpg' }] }],
    ['a negative price', { priceFrom: -1 }],
    ['a short description', { description: 'too short' }],
  ])('rejects a gig with %s', async (_, patch) => {
    const res = await request(app).post('/api/v1/freelancer/gigs').set(as('seller-x')).send(gigBody(patch));
    expect(res.status).toBe(422);
  });

  it('requires auth', async () => {
    expect((await request(app).get('/api/v1/gigs')).status).toBe(401);
    expect((await request(app).get('/api/v1/freelancer/dashboard')).status).toBe(401);
  });
});

describeDb('Gigs (Firestore emulator)', () => {
  const run = Date.now();
  const seller = `seller-${run}`;
  const buyer = `buyer-${run}`;
  const stranger = `stranger-${run}`;
  let gigId;

  beforeAll(async () => {
    await db.collection('users').doc(seller).set({
      name: 'Meera Pillai',
      department: 'Fine Arts',
      email: 'meera@campus.edu',
      contactMethod: { type: 'instagram', value: '@meera.lens' },
    });
    await db.collection('users').doc(buyer).set({
      name: 'Rohan Sharma',
      email: 'rohan@campus.edu',
      contactMethod: { type: 'whatsapp', value: '+91-9000000003' },
    });
  });

  it('needs a profile before offering a gig', async () => {
    const res = await request(app).post('/api/v1/freelancer/gigs').set(as(stranger)).send(gigBody());
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PROFILE_REQUIRED');
  });

  it('publishes a gig with samples and lists it for buyers', async () => {
    const res = await request(app).post('/api/v1/freelancer/gigs').set(as(seller)).send(gigBody());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ sellerName: 'Meera Pillai', skill: 'photography', status: 'active' });
    expect(res.body.samples).toHaveLength(1);
    gigId = res.body.id;

    const list = await request(app).get('/api/v1/gigs?skill=photography&q=fest').set(as(buyer));
    expect(list.body.gigs.map((g) => g.id)).toContain(gigId);
    const miss = await request(app).get('/api/v1/gigs?q=nothing-matches-this').set(as(buyer));
    expect(miss.body.gigs.map((g) => g.id)).not.toContain(gigId);
  });

  it('runs a hire request from pending to completed, sharing contacts only on accept', async () => {
    expect((await request(app).post(`/api/v1/gigs/${gigId}/requests`).set(as(seller)).send({ message: 'me' })).status).toBe(403);

    const hire = await request(app)
      .post(`/api/v1/gigs/${gigId}/requests`)
      .set(as(buyer))
      .send({ message: 'Need photos for our club event on Friday' });
    expect(hire.status).toBe(201);
    expect(hire.body).toMatchObject({ status: 'pending', buyerName: 'Rohan Sharma', gigTitle: gigBody().title });
    const dup = await request(app).post(`/api/v1/gigs/${gigId}/requests`).set(as(buyer)).send({ message: 'again' });
    expect(dup.status).toBe(409);

    let mine = await request(app).get('/api/v1/gig-requests/mine').set(as(buyer));
    expect(mine.body.requests[0].sellerContact).toBeUndefined();

    const dash = await request(app).get('/api/v1/freelancer/dashboard').set(as(seller));
    expect(dash.body.stats).toEqual({ activeGigs: 1, pendingRequests: 1, completedJobs: 0 });
    expect(dash.body.requests[0].buyerContact).toBeUndefined();

    const patch = (status, uid = seller) =>
      request(app).patch(`/api/v1/freelancer/requests/${hire.body.id}`).set(as(uid)).send({ status });
    expect((await patch('completed')).status).toBe(409);
    expect((await patch('accepted', stranger)).status).toBe(404);

    const accepted = await patch('accepted');
    expect(accepted.body.buyerContact.method.value).toBe('+91-9000000003');
    mine = await request(app).get('/api/v1/gig-requests/mine').set(as(buyer));
    expect(mine.body.requests[0].sellerContact.method.value).toBe('@meera.lens');

    expect((await patch('completed')).body.status).toBe('completed');
    const after = await request(app).get('/api/v1/freelancer/dashboard').set(as(seller));
    expect(after.body.stats.completedJobs).toBe(1);
  });

  it('lets only the owner edit, pause and delete a gig', async () => {
    expect((await request(app).patch(`/api/v1/freelancer/gigs/${gigId}`).set(as(stranger)).send({ priceFrom: 1 })).status).toBe(404);

    const paused = await request(app).patch(`/api/v1/freelancer/gigs/${gigId}`).set(as(seller)).send({ status: 'paused' });
    expect(paused.body.status).toBe('paused');
    expect((await request(app).get(`/api/v1/gigs/${gigId}`).set(as(buyer))).status).toBe(404);
    expect((await request(app).get(`/api/v1/gigs/${gigId}`).set(as(seller))).status).toBe(200);
    const hire = await request(app).post(`/api/v1/gigs/${gigId}/requests`).set(as(buyer)).send({ message: 'hi' });
    expect(hire.status).toBe(404);

    expect((await request(app).delete(`/api/v1/freelancer/gigs/${gigId}`).set(as(stranger))).status).toBe(404);
    expect((await request(app).delete(`/api/v1/freelancer/gigs/${gigId}`).set(as(seller))).status).toBe(204);
    expect((await request(app).get(`/api/v1/gigs/${gigId}`).set(as(seller))).status).toBe(404);
  });
});
