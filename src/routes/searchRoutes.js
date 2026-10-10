// src/routes/searchRoutes.js
// Discovery routes: /users/search, /skills/suggest, /search/people
// All registered as static paths (no parameterised segments).
import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import * as ctrl from '../controllers/searchController.js';
import { z } from 'zod';

const router = Router();

// ── Zod schemas ──────────────────────────────────────────────────────────────

const searchQuerySchema = z.object({
  q: z.string().max(200).optional(),
  // comma-separated skills string
  skills: z.string().max(500).optional(),
  department: z.string().max(100).optional(),
  year: z
    .string()
    .regex(/^[1-5]$/, 'year must be 1–5')
    .optional(),
  availability: z
    .enum(['available', 'busy', 'open_to_projects'])
    .optional(),
  limit: z
    .string()
    .regex(/^\d+$/, 'limit must be a positive integer')
    .optional(),
  cursor: z.string().max(128).optional(),
});

const skillSuggestSchema = z.object({
  prefix: z.string().max(50).optional(),
  limit: z
    .string()
    .regex(/^\d+$/)
    .optional(),
});

const peopleSearchSchema = z.object({
  q: z.string().max(200).optional(),
});

// ── Routes ────────────────────────────────────────────────────────────────────

// /users/search is registered here as a static route; it must be mounted
// in index.js BEFORE userRoutes so it's matched before /users/:uid.
router.get(
  '/users/search',
  validate({ query: searchQuerySchema }),
  ctrl.searchUsers
);

router.get(
  '/skills/suggest',
  validate({ query: skillSuggestSchema }),
  ctrl.suggestSkills
);

// App-wide global search bar endpoint
router.get(
  '/search/people',
  validate({ query: peopleSearchSchema }),
  ctrl.searchPeople
);

export default router;
