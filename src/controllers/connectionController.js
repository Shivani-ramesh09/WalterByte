// src/controllers/connectionController.js
import * as connectionService from '../services/connectionService.js';
import { ok, created } from '../utils/response.js';
import { badRequest } from '../utils/apiError.js';

export async function sendConnectionRequest(req, res, next) {
  try {
    const { toUid } = req.body;
    const connection = await connectionService.sendConnectionRequest(req.user.uid, toUid);
    created(res, connection);
  } catch (err) {
    next(err);
  }
}

export async function getMyConnections(req, res, next) {
  try {
    const connections = await connectionService.getMyConnections(req.user.uid);
    ok(res, { connections });
  } catch (err) {
    next(err);
  }
}

export async function updateConnection(req, res, next) {
  try {
    const { status } = req.body;
    const connection = await connectionService.updateConnectionStatus(
      req.user.uid,
      req.params.id,
      status
    );
    ok(res, connection);
  } catch (err) {
    next(err);
  }
}
