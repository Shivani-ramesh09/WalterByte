// src/config/env.js
// Load and validate all environment variables at startup.
// Fail fast if a required variable is missing in production.
import 'dotenv/config';

export const env = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',

  // Comma-separated list of allowed CORS origins
  CORS_ORIGINS: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim()),

  // Firebase / Firestore
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || 'demo-genesis',
  FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST || null,
  FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST || null,
  GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS || null,

  // When true: skip token verification, read uid from x-dev-uid header
  DEV_BYPASS_AUTH: process.env.DEV_BYPASS_AUTH === 'true',
};

// Safety check: never allow DEV_BYPASS_AUTH in production
if (env.DEV_BYPASS_AUTH && env.NODE_ENV === 'production') {
  console.error('[FATAL] DEV_BYPASS_AUTH must not be true in production. Exiting.');
  process.exit(1);
}

export const isEmulatorMode = !!(
  env.FIRESTORE_EMULATOR_HOST || env.FIREBASE_AUTH_EMULATOR_HOST
);
