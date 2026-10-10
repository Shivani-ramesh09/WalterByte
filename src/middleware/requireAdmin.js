// src/middleware/requireAdmin.js
// Administration access. Must run after requireAuth.
//
// admins/{uid} = { role: "central" | "org", orgId?, name }
//   central – Amrita administration: every analytics view, decisions, reports
//   org     – an organisation/society representative: only their own
//             organisation's events, attendance and proposals
// Like staff/{uid}, the collection is server-only (rules deny clients), so a
// student cannot grant themselves access.
import { db } from '../config/firebase.js';
import { forbidden } from '../utils/apiError.js';

export async function requireAdmin(req, res, next) {
  try {
    const snap = await db.collection('admins').doc(req.user.uid).get();
    if (!snap.exists) return next(forbidden('Administration access only.'));
    const { role, orgId = null, name = '' } = snap.data();
    if (!['central', 'org'].includes(role) || (role === 'org' && !orgId)) return next(forbidden('Administration access only.'));
    req.admin = { uid: req.user.uid, role, orgId, name };
    return next();
  } catch (err) {
    return next(err);
  }
}

export function requireCentral(req, res, next) {
  return req.admin?.role === 'central' ? next() : next(forbidden('Central administration only.'));
}

/** Central admins see every organisation; representatives only their own. */
export const canAccessOrg = (admin, orgId) => admin.role === 'central' || admin.orgId === orgId;
