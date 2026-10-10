// src/app.js
// Express application setup.
// Does NOT call app.listen() — that is done in server.js so tests can
// import the app without starting a server.
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import healthRouter from './routes/healthRoutes.js';
import apiV1Router from './routes/index.js';

const app = express();

// ── Security headers ────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS ────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: env.CORS_ORIGINS,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'x-dev-uid'],
    credentials: true,
  })
);

// ── Request logging ─────────────────────────────────────────────────────────
if (env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// ── Body parsing ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));

// ── Public routes (no auth required) ────────────────────────────────────────
app.use(healthRouter);         // GET /health
app.use('/api/v1', healthRouter); // GET /api/v1/health

// ── Protected API routes ────────────────────────────────────────────────────
app.use('/api/v1', apiV1Router);

// ── 404 catch-all for unmatched routes ──────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found.` },
  });
});

// ── Central error handler (must be last) ────────────────────────────────────
app.use(errorHandler);

export default app;
