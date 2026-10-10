// src/routes/index.js
// Aggregates all /api/v1 sub-routes.
// Static routes are registered before parameterised ones to avoid shadowing.
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';

// Route modules (imported below as they are created)
import userRoutes from './userRoutes.js';
import searchRoutes from './searchRoutes.js';
import requestRoutes from './requestRoutes.js';
import connectionRoutes from './connectionRoutes.js';
import canteenRoutes from './canteenRoutes.js';
import orderRoutes from './orderRoutes.js';
import staffRoutes from './staffRoutes.js';

const router = Router();

// All routes under /api/v1 require authentication unless stated otherwise.
router.use(requireAuth);

// searchRoutes FIRST: contains static /users/search which must not be
// shadowed by the parameterised /users/:uid in userRoutes.
router.use('/', searchRoutes);
router.use('/', userRoutes);
router.use('/', requestRoutes);
router.use('/', connectionRoutes);
router.use('/', canteenRoutes);
router.use('/', orderRoutes);
router.use('/', staffRoutes);

export default router;
