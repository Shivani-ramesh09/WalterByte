// src/middleware/validate.js
// Generic Zod validation middleware factory.
// Usage:
//   router.post('/path', validate({ body: MySchema }), controller)
//   router.get('/path',  validate({ query: MySchema }), controller)
//
// On validation failure returns:
//   HTTP 422 { error: { code: "VALIDATION_ERROR", message, details: [ZodIssue] } }

import { ZodError } from 'zod';
import { ApiError } from '../utils/apiError.js';

/**
 * @param {{ body?: ZodSchema, query?: ZodSchema, params?: ZodSchema }} schemas
 */
export function validate(schemas) {
  return (req, res, next) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.query) {
        req.query = schemas.query.parse(req.query);
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }
      return next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(
          new ApiError(422, 'VALIDATION_ERROR', 'Request validation failed.', err.errors)
        );
      }
      return next(err);
    }
  };
}
