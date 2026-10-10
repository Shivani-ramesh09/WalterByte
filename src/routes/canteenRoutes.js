// src/routes/canteenRoutes.js
import { Router } from 'express';
import { validate } from '../middleware/validate.js';
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

// ── Routes ───────────────────────────────────────────────────────────────────

router.get('/canteens', ctrl.listCanteens);

router.get('/canteens/:id/menu', validate({ params: idParamSchema }), ctrl.getMenu);

router.get(
  '/canteens/:id/slots',
  validate({ params: idParamSchema, query: slotsQuerySchema }),
  ctrl.getSlots
);

export default router;
