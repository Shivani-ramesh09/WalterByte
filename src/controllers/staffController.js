// src/controllers/staffController.js
// Every handler is scoped to req.staff.canteenId (set by requireStaff).
import * as staffService from '../services/staffService.js';
import * as counterService from '../services/eat/counterService.js';
import * as demandService from '../services/eat/demandService.js';
import { ok, created } from '../utils/response.js';

const handle = (fn, send = ok) => async (req, res, next) => {
  try {
    send(res, await fn(req));
  } catch (err) {
    next(err);
  }
};

export const getCounter = handle((req) => counterService.counterView(req.staff.canteenId));
export const recordSale = handle((req) => counterService.recordSale(req.staff, req.body), created);
export const recordUnavailableRequest = handle((req) => demandService.recordCounterRequest(req.staff, req.body), created);
export const voidUnavailableRequest = handle((req) => demandService.voidCounterRequest(req.staff, req.params.id, req.body.reason));
export const adjustStock = handle((req) => counterService.adjustStock(req.staff, req.params.itemId, req.body));
export const closeDay = handle((req) => counterService.closeDay(req.staff, req.body));

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
