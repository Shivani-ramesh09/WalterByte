// src/utils/apiError.js
// Custom error class used throughout the app.
// The central error handler in middleware/errorHandler.js maps these to
// consistent { error: { code, message, details? } } JSON responses.

export class ApiError extends Error {
  /**
   * @param {number} status  HTTP status code (400, 401, 403, 404, 409, 422, 500…)
   * @param {string} code    Machine-readable error code (e.g. "PROFILE_NOT_FOUND")
   * @param {string} message Human-readable message
   * @param {any}    [details] Optional structured details (e.g. Zod field errors)
   */
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// ─── Convenience factories ─────────────────────────────────────────────────
export const notFound = (resource = 'Resource') =>
  new ApiError(404, 'NOT_FOUND', `${resource} not found.`);

export const unauthorized = (msg = 'Authentication required.') =>
  new ApiError(401, 'UNAUTHORIZED', msg);

export const forbidden = (msg = 'You are not allowed to perform this action.') =>
  new ApiError(403, 'FORBIDDEN', msg);

export const conflict = (msg) =>
  new ApiError(409, 'CONFLICT', msg);

export const badRequest = (msg, details) =>
  new ApiError(400, 'BAD_REQUEST', msg, details);
