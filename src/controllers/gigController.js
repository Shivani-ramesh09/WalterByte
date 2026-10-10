// src/controllers/gigController.js
import * as gigService from '../services/gigService.js';
import { ok, created, noContent } from '../utils/response.js';

export async function listGigs(req, res, next) {
  try {
    ok(res, { gigs: await gigService.listGigs(req.query) });
  } catch (err) {
    next(err);
  }
}

export async function getGig(req, res, next) {
  try {
    ok(res, await gigService.getGig(req.user.uid, req.params.id));
  } catch (err) {
    next(err);
  }
}

export async function requestGig(req, res, next) {
  try {
    created(res, await gigService.requestGig(req.user.uid, req.params.id, req.body.message));
  } catch (err) {
    next(err);
  }
}

export async function listMyRequests(req, res, next) {
  try {
    ok(res, { requests: await gigService.listMyRequests(req.user.uid) });
  } catch (err) {
    next(err);
  }
}

export async function getDashboard(req, res, next) {
  try {
    ok(res, await gigService.getDashboard(req.user.uid));
  } catch (err) {
    next(err);
  }
}

export async function createGig(req, res, next) {
  try {
    created(res, await gigService.createGig(req.user.uid, req.body));
  } catch (err) {
    next(err);
  }
}

export async function updateGig(req, res, next) {
  try {
    ok(res, await gigService.updateGig(req.user.uid, req.params.id, req.body));
  } catch (err) {
    next(err);
  }
}

export async function deleteGig(req, res, next) {
  try {
    await gigService.deleteGig(req.user.uid, req.params.id);
    noContent(res);
  } catch (err) {
    next(err);
  }
}

export async function updateRequestStatus(req, res, next) {
  try {
    ok(res, await gigService.updateRequestStatus(req.user.uid, req.params.id, req.body.status));
  } catch (err) {
    next(err);
  }
}
