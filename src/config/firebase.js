// src/config/firebase.js
// Initialises Firebase Admin SDK once.
// Supports three modes:
//   1. Emulator mode (FIRESTORE_EMULATOR_HOST set): no credentials needed.
//   2. Service-account file (GOOGLE_APPLICATION_CREDENTIALS set): reads JSON key.
//   3. Application Default Credentials: used in GCP-hosted environments.
import admin from 'firebase-admin';
import { env, isEmulatorMode } from './env.js';

// Set emulator environment variables BEFORE initializing the SDK.
// These must be process-level env vars, not just JS vars.
if (env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = env.FIRESTORE_EMULATOR_HOST;
}
if (env.FIREBASE_AUTH_EMULATOR_HOST) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = env.FIREBASE_AUTH_EMULATOR_HOST;
}

let app;

if (!admin.apps.length) {
  if (isEmulatorMode) {
    // Emulator: no real credentials; use a demo project ID.
    app = admin.initializeApp({
      projectId: env.FIREBASE_PROJECT_ID,
    });
    console.log(
      `[Firebase] Emulator mode — project: ${env.FIREBASE_PROJECT_ID}`,
      `| Firestore: ${env.FIRESTORE_EMULATOR_HOST || 'off'}`,
      `| Auth: ${env.FIREBASE_AUTH_EMULATOR_HOST || 'off'}`
    );
  } else {
    // Real Firebase project.
    // admin.initializeApp() automatically picks up GOOGLE_APPLICATION_CREDENTIALS
    // or Application Default Credentials when no credential is specified.
    const initOptions = { projectId: env.FIREBASE_PROJECT_ID };
    if (env.GOOGLE_APPLICATION_CREDENTIALS) {
      const { readFileSync } = await import('fs');
      const serviceAccount = JSON.parse(
        readFileSync(env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8')
      );
      initOptions.credential = admin.credential.cert(serviceAccount);
    }
    app = admin.initializeApp(initOptions);
    console.log(`[Firebase] Production mode — project: ${env.FIREBASE_PROJECT_ID}`);
  }
} else {
  app = admin.apps[0];
}

export const db = admin.firestore();
export const auth = admin.auth();
export default app;
