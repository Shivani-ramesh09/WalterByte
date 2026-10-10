// src/server.js
// Server entrypoint. Starts HTTP server and handles graceful shutdown.
import './config/env.js'; // Load env first
import app from './app.js';
import { env } from './config/env.js';

const server = app.listen(env.PORT, () => {
  console.log(`[Server] Listening on http://localhost:${env.PORT} [${env.NODE_ENV}]`);
});

// Graceful shutdown on SIGTERM (Docker, Kubernetes) and SIGINT (Ctrl-C)
const shutdown = (signal) => {
  console.log(`[Server] ${signal} received — shutting down gracefully.`);
  server.close(() => {
    console.log('[Server] HTTP server closed.');
    process.exit(0);
  });
  // Force exit after 10 s if connections linger
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Catch unhandled rejections so they don't silently fail
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled Rejection:', reason);
  process.exit(1);
});
