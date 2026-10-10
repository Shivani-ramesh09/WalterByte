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
const ORDER_STATUSES = ['placed', 'preparing', 'ready', 'collected'];

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
  status: z.enum(['preparing', 'ready', 'collected']),
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

export default router;
