// src/controllers/canteenController.js
import * as canteenService from '../services/canteenService.js';
import { ok } from '../utils/response.js';

export async function listCanteens(req, res, next) {
  try {
    const canteens = await canteenService.listCanteens();
    ok(res, { canteens });
  } catch (err) {
    next(err);
  }
}

export async function getMenu(req, res, next) {
  try {
    const menu = await canteenService.getMenu(req.params.id, new Date(), req.user.uid);
    ok(res, menu);
  } catch (err) {
    next(err);
  }
}

export async function getSlots(req, res, next) {
  try {
    const data = await canteenService.getSlots(req.params.id, req.query.date);
    ok(res, data);
  } catch (err) {
    next(err);
  }
}
