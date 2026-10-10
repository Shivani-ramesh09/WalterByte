// src/routes/connectionRoutes.js
import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { strictLimiter } from '../middleware/rateLimiter.js';
import * as ctrl from '../controllers/connectionController.js';
import { z } from 'zod';

const router = Router();

// ── Zod schemas ──────────────────────────────────────────────────────────────

const sendConnectionSchema = z.object({
  toUid: z.string().min(1).max(128),
});

const updateConnectionSchema = z.object({
  status: z.enum(['accepted', 'declined']),
});

const idParamSchema = z.object({ id: z.string().min(1).max(128) });

// ── Routes ────────────────────────────────────────────────────────────────────

// Send a connection request
router.post(
  '/connections',
  strictLimiter,
  validate({ body: sendConnectionSchema }),
  ctrl.sendConnectionRequest
);

// Get my connections + pending requests
router.get('/connections', ctrl.getMyConnections);

// Accept or decline (recipient only)
router.patch(
  '/connections/:id',
  strictLimiter,
  validate({ body: updateConnectionSchema, params: idParamSchema }),
  ctrl.updateConnection
);

export default router;
