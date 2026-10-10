// src/routes/adminRoutes.js
// Explore events (student side) and administration analytics for Explore and
// Connect. /admin/* needs an admins/{uid} record; Connect analytics,
// recommendations, decisions and reports are central-administration only.
// Organisation representatives are scoped to their own organisation in the
// service layer (same 404 for missing and not-yours).
import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { userWriteLimiter } from '../middleware/rateLimiter.js';
import { requireAdmin, requireCentral } from '../middleware/requireAdmin.js';
import { READINESS_CRITERIA } from '../services/analytics/exploreAnalytics.js';
import * as ctrl from '../controllers/adminController.js';
import { isRealDate } from '../utils/istTime.js';

const router = Router();

// ── Zod schemas ──────────────────────────────────────────────────────────────

// Restricted charset: ids become Firestore document paths
const docId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const idParams = z.object({ id: docId });
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const periodQuery = z.object({ from: day.optional(), to: day.optional() });

const myEventBody = z
  .object({ saved: z.boolean().optional(), registered: z.boolean().optional() })
  .refine((b) => b.saved !== undefined || b.registered !== undefined, 'Nothing to update');

const feedbackBody = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
});

const attendanceBody = z.object({
  uids: z.array(z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)).min(1).max(500),
  attended: z.boolean(),
});

const money = z.number().min(0).max(100000000);
const readiness = z.object(
  Object.fromEntries(
    READINESS_CRITERIA.map((c) => [c.key, z.object({ met: z.boolean(), evidence: z.string().trim().max(1000) }).optional()])
  )
);

const proposalBody = z.object({
  orgId: docId.optional(), // central admins choose; representatives are fixed to their own
  title: z.string().trim().min(5).max(120),
  summary: z.string().trim().min(20).max(3000),
  category: z.string().trim().min(2).max(40),
  leadershipTerm: z.string().trim().max(80).optional().default(''),
  proposedStart: z.string().datetime({ offset: true }),
  proposedEnd: z.string().datetime({ offset: true }),
  expectedParticipants: z.number().int().min(1).max(100000),
  capacity: z.number().int().min(1).max(100000).nullable().optional().default(null),
  budget: z.object({
    requested: money,
    items: z.array(z.object({ item: z.string().trim().min(1).max(80), amount: money })).max(30).optional().default([]),
  }),
  supportRequested: z.array(z.enum(['funding', 'venue', 'equipment', 'publicity', 'admin', 'pilot'])).max(6).default([]),
  plannedActivities: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  targets: z
    .object({
      attendance: z.number().int().min(0).optional(),
      registrations: z.number().int().min(0).optional(),
      feedbackAverage: z.number().min(1).max(5).optional(),
    })
    .default({}),
  readiness: readiness.default({}),
});
const proposalCreate = proposalBody.refine((b) => new Date(b.proposedEnd) >= new Date(b.proposedStart), 'The end must be after the start');
const proposalPatch = proposalBody.partial().refine((b) => Object.keys(b).length > 0, 'Nothing to update');

const decisionBody = z.object({
  status: z.enum(['needs_info', 'pilot_supported', 'approved', 'declined']),
  note: z.string().trim().min(5, 'Record the reason for the decision').max(2000),
});

const outcomeBody = z
  .object({
    eventId: docId.optional(),
    actualSpend: money.optional(),
    spendVerified: z.boolean().optional(),
    actualRevenue: money.optional(),
    revenueVerified: z.boolean().optional(),
    deliveredActivities: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, 'Nothing to update');

const recParams = z.object({ id: z.string().regex(/^[a-z0-9-]{1,200}$/) });
const reviewBody = z.object({
  status: z.enum(['reviewed', 'accepted', 'dismissed', 'more_info']),
  note: z.string().trim().max(1000).optional().default(''),
});
const reportParams = z.object({ kind: z.enum(['events', 'organisations', 'skills', 'eat-items']) });

// ── Eat schemas ──────────────────────────────────────────────────────────────
const realDay = day.refine(isRealDate, 'Not a real date');
const csvText = z.string().min(1).max(1_000_000);
const menuUploadBody = z.object({
  canteenId: docId,
  businessDate: realDay,
  csv: csvText,
  fileName: z.string().trim().max(200).optional(),
});
const menuParams = z.object({ canteenId: docId, date: realDay });
const menuListQuery = z.object({ from: realDay, to: realDay });
const billingBody = menuUploadBody.extend({ complete: z.boolean() });
const itemParams = z.object({ canteenId: docId, itemId: docId });
const itemQuery = periodQuery.extend({
  portions: z.coerce.number().int().min(1).max(10000).optional(),
  unitCost: z.coerce.number().min(0).max(100000).optional(),
});

// ── Student-facing events ────────────────────────────────────────────────────

router.get('/events', ctrl.listEvents);
router.get('/events/:id', validate({ params: idParams }), ctrl.getEvent);
router.patch('/events/:id/me', userWriteLimiter, validate({ params: idParams, body: myEventBody }), ctrl.updateMyEvent);
router.post('/events/:id/feedback', userWriteLimiter, validate({ params: idParams, body: feedbackBody }), ctrl.submitFeedback);

// ── Administration (any admin role) ──────────────────────────────────────────

router.use('/admin', requireAdmin);
router.get('/admin/me', ctrl.me);
router.get('/admin/explore', validate({ query: periodQuery }), ctrl.explore);
router.get('/admin/organisations/:id', validate({ params: idParams }), ctrl.organisation);
router.get('/admin/events/:id/participants', validate({ params: idParams }), ctrl.participants);
router.post('/admin/events/:id/attendance', userWriteLimiter, validate({ params: idParams, body: attendanceBody }), ctrl.attendance);
router.get('/admin/proposals', ctrl.listProposals);
router.post('/admin/proposals', userWriteLimiter, validate({ body: proposalCreate }), ctrl.createProposal);
router.get('/admin/proposals/:id', validate({ params: idParams }), ctrl.getProposal);
router.patch('/admin/proposals/:id', userWriteLimiter, validate({ params: idParams, body: proposalPatch }), ctrl.updateProposal);
router.patch('/admin/proposals/:id/outcome', userWriteLimiter, validate({ params: idParams, body: outcomeBody }), ctrl.recordOutcome);

// ── Central administration only ──────────────────────────────────────────────

router.get('/admin/overview', requireCentral, validate({ query: periodQuery }), ctrl.overview);
router.get('/admin/connect', requireCentral, validate({ query: periodQuery }), ctrl.connect);
router.patch('/admin/proposals/:id/decision', requireCentral, userWriteLimiter, validate({ params: idParams, body: decisionBody }), ctrl.decideProposal);
router.get('/admin/recommendations', requireCentral, validate({ query: periodQuery }), ctrl.recommendations);
router.patch('/admin/recommendations/:id', requireCentral, userWriteLimiter, validate({ params: recParams, body: reviewBody }), ctrl.reviewRecommendation);
router.get('/admin/reports/:kind', requireCentral, validate({ params: reportParams, query: periodQuery }), ctrl.report);

// ── Eat (central administration only) ───────────────────────────────────────

router.post('/admin/eat/menus/validate', requireCentral, userWriteLimiter, validate({ body: menuUploadBody }), ctrl.validateMenu);
router.post('/admin/eat/menus', requireCentral, userWriteLimiter, validate({ body: menuUploadBody }), ctrl.saveMenuDraft);
router.get('/admin/eat/menus', requireCentral, validate({ query: menuListQuery }), ctrl.listMenus);
router.get('/admin/eat/menus/:canteenId/:date', requireCentral, validate({ params: menuParams }), ctrl.getMenuRecord);
router.post('/admin/eat/menus/:canteenId/:date/publish', requireCentral, userWriteLimiter, validate({ params: menuParams }), ctrl.publishMenu);
router.post('/admin/eat/counter-imports', requireCentral, userWriteLimiter, validate({ body: billingBody }), ctrl.importBilling);
router.get('/admin/eat', requireCentral, validate({ query: periodQuery }), ctrl.eat);
router.get('/admin/eat/items/:canteenId/:itemId', requireCentral, validate({ params: itemParams, query: itemQuery }), ctrl.eatItem);

export default router;
