// src/utils/response.js
// Thin wrappers around res.json() for consistent response shapes.

/**
 * Send a 200 OK response with data.
 */
export const ok = (res, data, status = 200) => res.status(status).json(data);

/**
 * Send a 201 Created response.
 */
export const created = (res, data) => res.status(201).json(data);

/**
 * Send a 204 No Content response.
 */
export const noContent = (res) => res.status(204).end();
