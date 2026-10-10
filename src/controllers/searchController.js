// src/controllers/searchController.js
import * as searchService from '../services/searchService.js';
import { ok } from '../utils/response.js';

export async function searchUsers(req, res, next) {
  try {
    const { q, skills, department, year, availability, limit, cursor } = req.query;

    // skills query param comes in as a comma-separated string: "react,nodejs"
    const skillsArray = skills
      ? skills.split(',').map((s) => s.trim()).filter(Boolean)
      : null;

    const data = await searchService.searchUsers({
      q,
      skills: skillsArray,
      department,
      year: year ? Number(year) : undefined,
      availability,
      limit: limit ? Number(limit) : 20,
      cursor,
    });

    ok(res, data);
  } catch (err) {
    next(err);
  }
}

export async function suggestSkills(req, res, next) {
  try {
    const { prefix = '', limit = 10 } = req.query;
    const suggestions = await searchService.suggestSkills(
      prefix,
      Math.min(Number(limit) || 10, 20)
    );
    ok(res, { suggestions });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /search/people?q=
 * Same as searchUsers but capped to 5 results, shaped for the app-wide
 * search bar (lighter payload).
 */
export async function searchPeople(req, res, next) {
  try {
    const { q } = req.query;
    const data = await searchService.searchUsers({ q }, 5);
    ok(res, { people: data.results });
  } catch (err) {
    next(err);
  }
}
