// src/controllers/staffController.js
// Every handler is scoped to req.staff.canteenId (set by requireStaff).
import * as staffService from '../services/staffService.js';
import { ok, created } from '../utils/response.js';

export function getMe(req, res) {
  ok(res, req.staff);
}

export async function listOrders(req, res, next) {
  try {
    const orders = await staffService.listCanteenOrders(req.staff.canteenId, req.query.status);
    ok(res, { canteenId: req.staff.canteenId, orders });
  } catch (err) {
    next(err);
  }
}

export async function updateOrderStatus(req, res, next) {
  try {
    const order = await staffService.updateOrderStatus(req.staff.canteenId, req.params.id, req.body.status);
    ok(res, order);
  } catch (err) {
    next(err);
  }
}

export async function addMenuItem(req, res, next) {
  try {
    const item = await staffService.addMenuItem(req.staff.canteenId, req.body);
    created(res, item);
  } catch (err) {
    next(err);
  }
}

export async function updateMenuItem(req, res, next) {
  try {
    const item = await staffService.updateMenuItem(req.staff.canteenId, req.params.itemId, req.body);
    ok(res, item);
  } catch (err) {
    next(err);
  }
}
