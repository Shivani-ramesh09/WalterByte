// src/middleware/requireStaff.js
// Restricts a route to canteen staff. Must run after requireAuth.
//
// Staff are listed in staff/{uid} = { canteenId, name }. That collection is
// written only by the server/seed script (Firestore rules deny all client
// access), unlike users/{uid}, which its owner can edit — so a student cannot
// promote themselves.
import { db } from '../config/firebase.js';
import { forbidden } from '../utils/apiError.js';

export async function requireStaff(req, res, next) {
  try {
    const snap = await db.collection('staff').doc(req.user.uid).get();
    if (!snap.exists) return next(forbidden('Canteen staff only.'));
    req.staff = { uid: req.user.uid, canteenId: snap.get('canteenId'), name: snap.get('name') || '' };
    return next();
  } catch (err) {
    return next(err);
  }
}
