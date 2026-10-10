// src/routes/gigRoutes.js
// Freelance gigs. /gigs* is the buyer side, /freelancer/* is the seller's
// dashboard; every /freelancer route is scoped to the caller's own gigs.
import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { userWriteLimiter } from '../middleware/rateLimiter.js';
import * as ctrl from '../controllers/gigController.js';
import { z } from 'zod';

const router = Router();

// ── Zod schemas ──────────────────────────────────────────────────────────────

// Restricted charset: ids become Firestore document paths
const idParamSchema = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) });

const sampleSchema = z.object({
  type: z.enum(['image', 'video', 'link']),
  url: z.string().url().max(500).startsWith('https://', 'Sample links must use https'),
  caption: z.string().trim().max(120).optional().default(''),
});

const gigBodySchema = z.object({
  title: z.string().trim().min(5).max(100),
  skill: z.string().trim().min(2).max(50),
  description: z.string().trim().min(20).max(1500),
  priceFrom: z.number().int().min(0).max(100000), // whole INR
  deliveryDays: z.number().int().min(1).max(60),
  // A gig must show at least one piece of real work
  samples: z.array(sampleSchema).min(1, 'Add at least one work sample').max(6),
});

const gigPatchSchema = gigBodySchema
  .partial()
  .extend({ status: z.enum(['active', 'paused']).optional() })
  .refine((b) => Object.keys(b).length > 0, 'Nothing to update');

const gigListQuerySchema = z.object({
  skill: z.string().max(50).optional(),
  q: z.string().max(200).optional(),
});

const hireBodySchema = z.object({ message: z.string().trim().min(1).max(1000) });

const requestStatusSchema = z.object({ status: z.enum(['accepted', 'declined', 'completed']) });

// ── Buyer side ───────────────────────────────────────────────────────────────

router.get('/gigs', validate({ query: gigListQuerySchema }), ctrl.listGigs);
router.get('/gigs/:id', validate({ params: idParamSchema }), ctrl.getGig);
router.post(
  '/gigs/:id/requests',
  userWriteLimiter,
  validate({ params: idParamSchema, body: hireBodySchema }),
  ctrl.requestGig
);
router.get('/gig-requests/mine', ctrl.listMyRequests);

// ── Freelancer dashboard ─────────────────────────────────────────────────────

router.get('/freelancer/dashboard', ctrl.getDashboard);
router.post('/freelancer/gigs', userWriteLimiter, validate({ body: gigBodySchema }), ctrl.createGig);
router.patch(
  '/freelancer/gigs/:id',
  userWriteLimiter,
  validate({ params: idParamSchema, body: gigPatchSchema }),
  ctrl.updateGig
);
router.delete('/freelancer/gigs/:id', userWriteLimiter, validate({ params: idParamSchema }), ctrl.deleteGig);
router.patch(
  '/freelancer/requests/:id',
  userWriteLimiter,
  validate({ params: idParamSchema, body: requestStatusSchema }),
  ctrl.updateRequestStatus
);

export default router;
