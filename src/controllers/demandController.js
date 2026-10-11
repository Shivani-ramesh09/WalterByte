// src/controllers/demandController.js
import * as demandService from '../services/eat/demandService.js';
import { ok } from '../utils/response.js';

export async function registerInterest(req, res, next) {
  try {
    ok(res, await demandService.registerInterest(req.user.uid, req.params.id, req.params.itemId, req.body));
  } catch (err) {
    next(err);
  }
}

export async function withdrawInterest(req, res, next) {
  try {
    ok(res, await demandService.withdrawInterest(req.user.uid, req.params.id, req.params.itemId));
  } catch (err) {
    next(err);
  }
}
