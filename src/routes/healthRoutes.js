// src/routes/healthRoutes.js
// Public health-check endpoints (no auth required).
import { Router } from 'express';
import { db } from '../config/firebase.js';
import { env } from '../config/env.js';

const router = Router();

router.get('/health', async (req, res) => {
  let firestoreStatus = 'ok';

  try {
    // Lightweight Firestore ping with a 3-second timeout.
    const ping = db.collection('_health').limit(1).get();
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 3000)
    );
    await Promise.race([ping, timeout]);
  } catch {
    firestoreStatus = 'unavailable';
  }

  const status = firestoreStatus === 'ok' ? 200 : 503;
  res.status(status).json({
    status: status === 200 ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    env: env.NODE_ENV,
    firestore: firestoreStatus,
  });
});

export default router;
