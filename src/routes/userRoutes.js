// src/routes/userRoutes.js
// Routes for user profiles and projects subcollection.
// IMPORTANT: Static routes (/me, /me/projects) are registered BEFORE
// parameterised routes (/:uid) to prevent shadowing.
import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { writeLimiter } from '../middleware/rateLimiter.js';
import * as ctrl from '../controllers/userController.js';
import { z } from 'zod';

const router = Router();

// ── Zod schemas ──────────────────────────────────────────────────────────────

const contactMethodSchema = z.object({
  type: z.enum(['whatsapp', 'email', 'instagram', 'none']),
  value: z.string().max(200).default(''),
});

const privacySchema = z.object({
  profileVisible: z.boolean().default(true),
  showLocation: z.boolean().default(false),
  showContact: z.boolean().default(false),
});

const linksSchema = z.object({
  github: z.string().url().optional().nullable(),
  portfolio: z.string().url().optional().nullable(),
  instagram: z.string().optional().nullable(),
  linkedin: z.string().url().optional().nullable(),
});

// Full profile body (used for POST /users/me upsert)
const profileBodySchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().optional(),
  department: z.string().min(1).max(100),
  year: z.number().int().min(1).max(5),
  bio: z.string().max(500).optional().default(''),
  skills: z.array(z.string()).max(20).optional().default([]),
  interests: z.array(z.string()).max(20).optional().default([]),
  availability: z.enum(['available', 'busy', 'open_to_projects']).default('available'),
  contactMethod: contactMethodSchema.optional(),
  usuallyFoundAtPlaceId: z.string().nullable().optional(),
  privacy: privacySchema.optional(),
  links: linksSchema.optional(),
});

// Partial update body (all fields optional)
const profilePatchSchema = profileBodySchema.partial();

const projectBodySchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional().default(''),
  link: z.string().url().optional().nullable(),
  tags: z.array(z.string().max(50)).max(10).optional().default([]),
});

const projectPatchSchema = projectBodySchema.partial();

const uidParamSchema = z.object({
  uid: z.string().min(1).max(128),
});

const projectIdParamSchema = z.object({
  id: z.string().min(1).max(128),
});

// ── Profile routes ────────────────────────────────────────────────────────────

// Static /me routes FIRST
router.post(
  '/users/me',
  writeLimiter,
  validate({ body: profileBodySchema }),
  ctrl.upsertMyProfile
);

router.get('/users/me', ctrl.getMyProfile);

router.patch(
  '/users/me',
  writeLimiter,
  validate({ body: profilePatchSchema }),
  ctrl.updateMyProfile
);

// ── Project routes ────────────────────────────────────────────────────────────

router.post(
  '/users/me/projects',
  writeLimiter,
  validate({ body: projectBodySchema }),
  ctrl.addProject
);

router.patch(
  '/users/me/projects/:id',
  writeLimiter,
  validate({ body: projectPatchSchema, params: projectIdParamSchema }),
  ctrl.updateProject
);

router.delete(
  '/users/me/projects/:id',
  writeLimiter,
  validate({ params: projectIdParamSchema }),
  ctrl.deleteProject
);

// ── Public profile – parameterised route LAST ─────────────────────────────────
router.get(
  '/users/:uid',
  validate({ params: uidParamSchema }),
  ctrl.getUserProfile
);

export default router;
