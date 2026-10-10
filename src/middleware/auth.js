// src/middleware/auth.js
// Firebase ID token verification middleware.
//
// DEV_BYPASS_AUTH mode (local dev / demo):
//   - Set DEV_BYPASS_AUTH=true in .env
//   - Pass header: x-dev-uid: <any_uid>
//   - req.user will be { uid, email: 'dev@campus.edu', dev: true }
//   - No Authorization header needed (but it's still accepted and verified
//     when present, so the frontend can test real token flows too)
//
// Normal mode:
//   - Pass header: Authorization: Bearer <firebase-id-token>
//   - req.user will be the decoded token payload

import { auth } from '../config/firebase.js';
import { env } from '../config/env.js';
import { unauthorized } from '../utils/apiError.js';

export async function requireAuth(req, res, next) {
  try {
    // ── DEV BYPASS ────────────────────────────────────────────────
    if (env.DEV_BYPASS_AUTH) {
      const devUid = req.headers['x-dev-uid'];
      if (devUid) {
        req.user = { uid: String(devUid), email: 'dev@campus.edu', dev: true };
        return next();
      }
      // Fall through to normal token verification if no x-dev-uid header
      // (allows frontend to test real tokens even with bypass enabled)
    }

    // ── NORMAL TOKEN VERIFICATION ─────────────────────────────────
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return next(unauthorized('Missing or malformed Authorization header.'));
    }

    const idToken = authHeader.slice(7);
    const decoded = await auth.verifyIdToken(idToken);
    req.user = { uid: decoded.uid, email: decoded.email };
    return next();
  } catch (err) {
    // Firebase throws specific error codes for expired / invalid tokens
    if (err.code === 'auth/id-token-expired') {
      return next(unauthorized('Token has expired.'));
    }
    if (
      err.code === 'auth/id-token-revoked' ||
      err.code === 'auth/invalid-id-token' ||
      err.code === 'auth/argument-error'
    ) {
      return next(unauthorized('Invalid authentication token.'));
    }
    return next(err);
  }
}
