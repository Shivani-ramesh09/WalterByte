// src/routes/staffRoutes.js
// Canteen counter routes. All require a staff/{uid} record (requireStaff)
// and only touch the caller's own canteen.
import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { userWriteLimiter } from '../middleware/rateLimiter.js';
import { requireStaff } from '../middleware/requireStaff.js';
import * as ctrl from '../controllers/staffController.js';
import { ACTIVE_STATUSES } from '../services/staffService.js';
import { z } from 'zod';

const router = Router();

// ── Zod schemas ──────────────────────────────────────────────────────────────

// Restricted charset: ids become Firestore document paths
const docId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const ORDER_STATUSES = ['placed', 'preparing', 'ready', 'collected', 'cancelled'];

const ordersQuerySchema = z.object({
  // Comma-separated, e.g. ?status=placed,preparing. Defaults to the live queue.
  status: z
    .string()
    .transform((s) => [...new Set(s.split(','))])
    .pipe(z.array(z.enum(ORDER_STATUSES)).min(1))
    .optional()
    .default(ACTIVE_STATUSES.join(',')),
});

const statusBodySchema = z.object({
  status: z.enum(['preparing', 'ready', 'collected', 'cancelled']),
});

// Client-generated idempotency keys: a retried tap never records twice
const clientKey = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

const saleBodySchema = z.object({
  txnId: clientKey,
  lines: z
    .array(z.object({ itemId: docId, quantity: z.number().int().min(1).max(50) }))
    .min(1)
    .max(20)
    .refine((l) => new Set(l.map((x) => x.itemId)).size === l.length, 'Duplicate itemId'),
});

const unavailableBodySchema = z.object({
  requestId: clientKey,
  itemId: docId,
  quantity: z.number().int().min(1).max(50), // people asking; anonymous count
  outcome: z.enum(['substituted', 'no_purchase']).nullable().optional().default(null),
  substituteItemId: docId.nullable().optional().default(null),
});

const voidBodySchema = z.object({ reason: z.string().trim().min(3).max(200) });

const adjustBodySchema = z.object({
  requestId: clientKey,
  delta: z.number().int().min(-1000).max(1000).refine((d) => d !== 0, 'Use a non-zero change'),
  reason: z.enum(['extra_batch', 'spoilage', 'correction', 'staff_meal']),
});

const closeDayBodySchema = z.object({
  wastage: z.array(z.object({ itemId: docId, quantity: z.number().int().min(0).max(10000) })).max(300).default([]),
  counterComplete: z.boolean(),
});

const menuItemSchema = z.object({
  name: z.string().trim().min(1).max(80),
  category: z.string().trim().min(1).max(40),
  price: z.number().int().min(1).max(5000), // whole INR
  isVeg: z.boolean(),
  isAvailable: z.boolean().optional().default(true),
});

// ── Routes ───────────────────────────────────────────────────────────────────

router.use('/staff', requireStaff);

router.get('/staff/me', ctrl.getMe);

router.get('/staff/orders', validate({ query: ordersQuerySchema }), ctrl.listOrders);

router.patch(
  '/staff/orders/:id',
  userWriteLimiter,
  validate({ params: z.object({ id: docId }), body: statusBodySchema }),
  ctrl.updateOrderStatus
);

router.post('/staff/menu', userWriteLimiter, validate({ body: menuItemSchema }), ctrl.addMenuItem);

// Partial update; { isAvailable: false } marks an item sold out
router.patch(
  '/staff/menu/:itemId',
  userWriteLimiter,
  validate({
    params: z.object({ itemId: docId }),
    body: menuItemSchema.partial().refine((b) => Object.keys(b).length > 0, 'Nothing to update'),
  }),
  ctrl.updateMenuItem
);

// ── Counter: walk-in sales, unavailable requests, stock, day close ──────────

router.get('/staff/counter', ctrl.getCounter);
router.post('/staff/counter-sales', userWriteLimiter, validate({ body: saleBodySchema }), ctrl.recordSale);
router.post('/staff/unavailable-requests', userWriteLimiter, validate({ body: unavailableBodySchema }), ctrl.recordUnavailableRequest);
router.patch(
  '/staff/unavailable-requests/:id',
  userWriteLimiter,
  validate({ params: z.object({ id: clientKey }), body: voidBodySchema }),
  ctrl.voidUnavailableRequest
);
router.post('/staff/inventory/:itemId/adjust', userWriteLimiter, validate({ params: z.object({ itemId: docId }), body: adjustBodySchema }), ctrl.adjustStock);
router.post('/staff/day-close', userWriteLimiter, validate({ body: closeDayBodySchema }), ctrl.closeDay);

export default router;
