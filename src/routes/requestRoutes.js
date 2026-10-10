// src/routes/requestRoutes.js
// IMPORTANT: static routes (/requests/matching) are registered BEFORE
// the parameterised route (/requests/:id) to prevent shadowing.
import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { writeLimiter, strictLimiter } from '../middleware/rateLimiter.js';
import * as ctrl from '../controllers/requestController.js';
import { z } from 'zod';

const router = Router();

// ── Zod schemas ──────────────────────────────────────────────────────────────

const requestBodySchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().default(''),
  type: z.enum(['task', 'teammate']),
  skillsNeeded: z.array(z.string().max(50)).max(15).optional().default([]),
  // ISO 8601 date string or null
  deadline: z.string().datetime({ offset: true }).nullable().optional(),
});

const requestPatchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  type: z.enum(['task', 'teammate']).optional(),
  skillsNeeded: z.array(z.string().max(50)).max(15).optional(),
  deadline: z.string().datetime({ offset: true }).nullable().optional(),
  status: z.enum(['open', 'filled', 'closed']).optional(),
});

const requestListQuerySchema = z.object({
  skill: z.string().max(50).optional(),
  type: z.enum(['task', 'teammate']).optional(),
  status: z.enum(['open', 'filled', 'closed']).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
  cursor: z.string().max(128).optional(),
});

const respondBodySchema = z.object({
  message: z.string().max(1000).optional().default(''),
});

const idParamSchema = z.object({ id: z.string().min(1).max(128) });

// ── Static routes FIRST ───────────────────────────────────────────────────────

// GET /requests (list)
router.get(
  '/requests',
  validate({ query: requestListQuerySchema }),
  ctrl.listRequests
);

// GET /requests/matching — must come before /requests/:id
router.get('/requests/matching', ctrl.getMatchingRequests);

// POST /requests
router.post(
  '/requests',
  writeLimiter,
  validate({ body: requestBodySchema }),
  ctrl.createRequest
);

// ── Parameterised routes ──────────────────────────────────────────────────────

router.get(
  '/requests/:id',
  validate({ params: idParamSchema }),
  ctrl.getRequest
);

router.patch(
  '/requests/:id',
  writeLimiter,
  validate({ body: requestPatchSchema, params: idParamSchema }),
  ctrl.updateRequest
);

router.delete(
  '/requests/:id',
  writeLimiter,
  validate({ params: idParamSchema }),
  ctrl.deleteRequest
);

// ── Response sub-routes ───────────────────────────────────────────────────────

router.post(
  '/requests/:id/respond',
  strictLimiter,
  validate({ body: respondBodySchema, params: idParamSchema }),
  ctrl.respondToRequest
);

router.get(
  '/requests/:id/responses',
  validate({ params: idParamSchema }),
  ctrl.listResponses
);

export default router;
