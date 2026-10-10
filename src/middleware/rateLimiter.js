// src/middleware/rateLimiter.js
// Simple in-memory rate limiter for write endpoints.
// Uses express-rate-limit with an in-memory store (no Redis needed for MVP).
//
// Two limiters are exported:
//   writeLimiter   – general writes: 30 requests per minute
//   strictLimiter  – sensitive writes (connections, responses): 10 per minute

import rateLimit from 'express-rate-limit';

const handler = (req, res) => {
  res.status(429).json({
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please slow down and try again.',
    },
  });
};

/**
 * General write rate limiter: 30 req / 60 s per IP.
 */
export const writeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});

/**
 * Strict rate limiter for sensitive endpoints: 10 req / 60 s per IP.
 */
export const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});
