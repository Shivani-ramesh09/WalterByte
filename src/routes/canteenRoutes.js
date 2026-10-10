// src/routes/canteenRoutes.js
import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { userWriteLimiter } from '../middleware/rateLimiter.js';
import * as demand from '../controllers/demandController.js';
import * as ctrl from '../controllers/canteenController.js';
import { isRealDate } from '../utils/istTime.js';
import { z } from 'zod';

const router = Router();

// ── Zod schemas ──────────────────────────────────────────────────────────────

// Restricted charset: ids become Firestore document paths
const idParamSchema = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) });

const slotsQuerySchema = z.object({
  date: z.string().refine(isRealDate, 'Expected a date as YYYY-MM-DD').optional(),
});

const itemParamSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  itemId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
});

// Voluntary follow-up: only recorded when the student chooses to say
const interestBodySchema = z.object({
  outcome: z.enum(['substituted', 'no_purchase']).nullable().optional().default(null),
  substituteItemId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).nullable().optional().default(null),
});

// ── Routes ───────────────────────────────────────────────────────────────────

router.get('/canteens', ctrl.listCanteens);

router.get('/canteens/:id/menu', validate({ params: idParamSchema }), ctrl.getMenu);

router.get(
  '/canteens/:id/slots',
  validate({ params: idParamSchema, query: slotsQuerySchema }),
  ctrl.getSlots
);

// "I wanted this" on a sold-out item (one per student per item per day)
router.post('/canteens/:id/menu/:itemId/interest', userWriteLimiter, validate({ params: itemParamSchema, body: interestBodySchema }), demand.registerInterest);
router.delete('/canteens/:id/menu/:itemId/interest', userWriteLimiter, validate({ params: itemParamSchema }), demand.withdrawInterest);

export default router;
