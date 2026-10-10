// tests/api.test.js
import request from 'supertest';
import app from '../src/app.js';
import { applyPrivacyMask } from '../src/services/userService.js';

describe('Health Checks', () => {
  it('GET /health returns standard health payload', async () => {
    const res = await request(app).get('/health');
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('env');
    expect(res.body).toHaveProperty('firestore');
  });

  it('GET /api/v1/health also returns health check payload', async () => {
    const res = await request(app).get('/api/v1/health');
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('status');
  });
});

describe('Authentication & Dev Bypass Middleware', () => {
  it('rejects protected routes without auth header or dev bypass with 401', async () => {
    const res = await request(app).get('/api/v1/users/me');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('allows access with x-dev-uid when DEV_BYPASS_AUTH is enabled', async () => {
    // Calling with an invalid body triggers validation (422), confirming auth passed
    const res = await request(app)
      .post('/api/v1/users/me')
      .set('x-dev-uid', 'test-user-123')
      .send({ invalid: true });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('Privacy Masking Service', () => {
  const sampleProfile = {
    name: 'Rohit Sharma',
    email: 'rohit@campus.edu',
    department: 'CSE',
    year: 3,
    bio: 'Software engineer',
    contactMethod: { type: 'whatsapp', value: '+91 9876543210' },
    usuallyFoundAtPlaceId: 'library-floor-2',
    privacy: {
      profileVisible: true,
      showContact: false,
      showLocation: false,
    },
    _searchTokens: ['rohit', 'sharma'],
  };

  it('owner sees complete profile without masking', () => {
    const masked = applyPrivacyMask(sampleProfile, true, false);
    expect(masked.email).toBe('rohit@campus.edu');
    expect(masked.contactMethod.value).toBe('+91 9876543210');
    expect(masked.usuallyFoundAtPlaceId).toBe('library-floor-2');
    expect(masked._searchTokens).toBeUndefined(); // internal tokens always stripped
  });

  it('hides contact and location for non-owner when flags are false and not connected', () => {
    const masked = applyPrivacyMask(sampleProfile, false, false);
    expect(masked.email).toBeUndefined();
    expect(masked.contactMethod.value).toBeNull();
    expect(masked.contactMethod.type).toBe('whatsapp');
    expect(masked.usuallyFoundAtPlaceId).toBeUndefined();
    expect(masked._searchTokens).toBeUndefined();
  });

  it('reveals contact when users are connected even if showContact is false', () => {
    const masked = applyPrivacyMask(sampleProfile, false, true);
    expect(masked.contactMethod.value).toBe('+91 9876543210');
    expect(masked.usuallyFoundAtPlaceId).toBeUndefined(); // location still hidden
  });

  it('reveals location when showLocation is true', () => {
    const profileWithLocation = {
      ...sampleProfile,
      privacy: { profileVisible: true, showContact: false, showLocation: true },
    };
    const masked = applyPrivacyMask(profileWithLocation, false, false);
    expect(masked.usuallyFoundAtPlaceId).toBe('library-floor-2');
  });
});

describe('Validation Error Handling (Zod)', () => {
  it('returns 422 VALIDATION_ERROR when creating profile with invalid data', async () => {
    const res = await request(app)
      .post('/api/v1/users/me')
      .set('x-dev-uid', 'test-user-123')
      .send({
        name: 'A',
        year: 10, // Invalid year (must be 1-5)
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(res.body.error.details)).toBe(true);
  });

  it('returns 422 when creating request without title or type', async () => {
    const res = await request(app)
      .post('/api/v1/requests')
      .set('x-dev-uid', 'test-user-123')
      .send({
        description: 'Missing title and type',
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 422 when connecting with invalid body (missing toUid)', async () => {
    const res = await request(app)
      .post('/api/v1/connections')
      .set('x-dev-uid', 'test-user-123')
      .send({});

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('Route Ordering & 404 Catch-All', () => {
  it('returns 404 for unknown public route', async () => {
    const res = await request(app).get('/non-existent-route');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 for unknown authenticated API route', async () => {
    const res = await request(app)
      .get('/api/v1/non-existent-route')
      .set('x-dev-uid', 'test-user-123');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('routes /users/search to search handler rather than /users/:uid', async () => {
    const res = await request(app).get('/api/v1/users/search');
    // It should hit auth middleware and return 401, NOT route to /users/:uid
    expect(res.status).toBe(401);
  });
});
