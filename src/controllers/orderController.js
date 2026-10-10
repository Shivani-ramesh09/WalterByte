// src/controllers/orderController.js
import * as orderService from '../services/orderService.js';
import { ok, created } from '../utils/response.js';

export async function createOrder(req, res, next) {
  try {
    const order = await orderService.createOrder(req.user.uid, req.body);
    created(res, order);
  } catch (err) {
    next(err);
  }
}

export async function listMyOrders(req, res, next) {
  try {
    const orders = await orderService.listMyOrders(req.user.uid);
    ok(res, { orders });
  } catch (err) {
    next(err);
  }
}

export async function getOrder(req, res, next) {
  try {
    const order = await orderService.getOrder(req.user.uid, req.params.id);
    ok(res, order);
  } catch (err) {
    next(err);
  }
}

export async function cancelOrder(req, res, next) {
  try {
    ok(res, await orderService.cancelOrder(req.user.uid, req.params.id));
  } catch (err) {
    next(err);
  }
}
