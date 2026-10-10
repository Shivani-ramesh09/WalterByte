// src/controllers/requestController.js
import * as requestService from '../services/requestService.js';
import { ok, created, noContent } from '../utils/response.js';

export async function createRequest(req, res, next) {
  try {
    const request = await requestService.createRequest(req.user.uid, req.body);
    created(res, request);
  } catch (err) {
    next(err);
  }
}

export async function listRequests(req, res, next) {
  try {
    const data = await requestService.listRequests(req.query);
    ok(res, data);
  } catch (err) {
    next(err);
  }
}

export async function getMatchingRequests(req, res, next) {
  try {
    const data = await requestService.getMatchingRequests(req.user.uid);
    ok(res, data);
  } catch (err) {
    next(err);
  }
}

export async function getRequest(req, res, next) {
  try {
    const request = await requestService.getRequest(req.params.id);
    ok(res, request);
  } catch (err) {
    next(err);
  }
}

export async function updateRequest(req, res, next) {
  try {
    const request = await requestService.updateRequest(
      req.user.uid,
      req.params.id,
      req.body
    );
    ok(res, request);
  } catch (err) {
    next(err);
  }
}

export async function deleteRequest(req, res, next) {
  try {
    await requestService.deleteRequest(req.user.uid, req.params.id);
    noContent(res);
  } catch (err) {
    next(err);
  }
}

export async function respondToRequest(req, res, next) {
  try {
    const response = await requestService.respondToRequest(
      req.user.uid,
      req.params.id,
      req.body
    );
    created(res, response);
  } catch (err) {
    next(err);
  }
}

export async function listResponses(req, res, next) {
  try {
    const responses = await requestService.listResponses(req.user.uid, req.params.id);
    ok(res, { responses });
  } catch (err) {
    next(err);
  }
}
