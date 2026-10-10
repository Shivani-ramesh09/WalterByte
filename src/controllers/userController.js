// src/controllers/userController.js
import * as userService from '../services/userService.js';
import * as projectService from '../services/projectService.js';
import { ok, created, noContent } from '../utils/response.js';

// ── Profile ──────────────────────────────────────────────────────────────────

export async function upsertMyProfile(req, res, next) {
  try {
    const profile = await userService.upsertProfile(req.user.uid, req.body);
    created(res, profile);
  } catch (err) {
    next(err);
  }
}

export async function getMyProfile(req, res, next) {
  try {
    const profile = await userService.getMyProfile(req.user.uid);
    ok(res, profile);
  } catch (err) {
    next(err);
  }
}

export async function updateMyProfile(req, res, next) {
  try {
    const profile = await userService.updateProfile(req.user.uid, req.body);
    ok(res, profile);
  } catch (err) {
    next(err);
  }
}

export async function getUserProfile(req, res, next) {
  try {
    const profile = await userService.getPublicProfile(
      req.params.uid,
      req.user.uid
    );
    ok(res, profile);
  } catch (err) {
    next(err);
  }
}

// ── Projects ─────────────────────────────────────────────────────────────────

export async function addProject(req, res, next) {
  try {
    const project = await projectService.addProject(req.user.uid, req.body);
    created(res, project);
  } catch (err) {
    next(err);
  }
}

export async function updateProject(req, res, next) {
  try {
    const project = await projectService.updateProject(
      req.user.uid,
      req.params.id,
      req.body
    );
    ok(res, project);
  } catch (err) {
    next(err);
  }
}

export async function deleteProject(req, res, next) {
  try {
    await projectService.deleteProject(req.user.uid, req.params.id);
    noContent(res);
  } catch (err) {
    next(err);
  }
}
