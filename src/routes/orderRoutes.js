// src/routes/orderRoutes.js
// IMPORTANT: static /orders/mine is registered BEFORE /orders/:id.
import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { userWriteLimiter } from '../middleware/rateLimiter.js';
import * as ctrl from '../controllers/orderController.js';
import { z } from 'zod';

const router = Router();

// ── Zod schemas ──────────────────────────────────────────────────────────────

// Restricted charset: ids become Firestore document paths
const docId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

// Unknown keys (e.g. a client-sent total or price) are stripped by Zod
const createOrderSchema = z.object({
  canteenId: docId,
  slotId: z.string().regex(/^\d{8}_\d{4}$/),
  items: z
    .array(z.object({ itemId: docId, quantity: z.number().int().min(1).max(10) }))
    .min(1)
    .max(20)
    .refine((items) => new Set(items.map((i) => i.itemId)).size === items.length, 'Duplicate itemId'),
  paymentMethod: z.literal('upi_mock'),
});

const idParamSchema = z.object({ id: docId });

// ── Routes ───────────────────────────────────────────────────────────────────

router.post('/orders', userWriteLimiter, validate({ body: createOrderSchema }), ctrl.createOrder);

router.get('/orders/mine', ctrl.listMyOrders);

router.get('/orders/:id', validate({ params: idParamSchema }), ctrl.getOrder);

export default router;
