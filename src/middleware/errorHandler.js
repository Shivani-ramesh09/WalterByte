// src/middleware/errorHandler.js
// Central error-handling middleware. Must be registered LAST in the Express
// app so it catches errors forwarded by next(err) from any route or middleware.
import { ApiError } from '../utils/apiError.js';

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // Log unexpected errors for debugging
  if (!(err instanceof ApiError) || err.status >= 500) {
    console.error('[ERROR]', err);
  }

  if (err instanceof ApiError) {
    const body = { error: { code: err.code, message: err.message } };
    if (err.details !== undefined) body.error.details = err.details;
    return res.status(err.status).json(body);
  }

  // Firestore / Firebase errors
  if (err.code && typeof err.code === 'string') {
    // e.g. "not-found", "permission-denied"
    const status = firestoreStatusMap[err.code] || 500;
    return res.status(status).json({
      error: { code: err.code.toUpperCase().replace(/-/g, '_'), message: err.message },
    });
  }

  // Fallback for unhandled errors
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
  });
}

const firestoreStatusMap = {
  'not-found': 404,
  'already-exists': 409,
  'permission-denied': 403,
  unauthenticated: 401,
  'invalid-argument': 400,
  'resource-exhausted': 429,
};
