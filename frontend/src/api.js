// frontend/src/api.js
// Lightweight wrapper around fetch for the Campus Connect backend.
// All requests include x-dev-uid for dev-bypass auth.

const BASE = '/api/v1';

async function request(path, options = {}) {
  const uid = localStorage.getItem('devUid') || 'dev-user-1';
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-dev-uid': uid,
      ...options.headers,
    },
  });
  if (res.status === 204) return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(json?.error?.message || `Request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  // The backend currently returns resources directly; accept the wrapped shape too.
  return json.data ?? json;
}

// ── Search / Discovery ────────────────────────────────────────────────────────

export function searchUsers(params = {}) {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.skills) qs.set('skills', params.skills);
  if (params.department) qs.set('department', params.department);
  if (params.year) qs.set('year', params.year);
  if (params.availability) qs.set('availability', params.availability);
  if (params.limit) qs.set('limit', params.limit);
  if (params.cursor) qs.set('cursor', params.cursor);
  const query = qs.toString();
  return request(`/users/search${query ? `?${query}` : ''}`);
}

export function suggestSkills(prefix = '') {
  const qs = prefix ? `?prefix=${encodeURIComponent(prefix)}` : '';
  return request(`/skills/suggest${qs}`);
}

// ── Connections ───────────────────────────────────────────────────────────────

export function getMyConnections() {
  return request('/connections');
}

export function sendConnectionRequest(toUid) {
  return request('/connections', {
    method: 'POST',
    body: JSON.stringify({ toUid }),
  });
}

export function updateConnection(id, status) {
  return request(`/connections/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

// ── User profiles ─────────────────────────────────────────────────────────────

export function getMyProfile() {
  return request('/users/me');
}

export function upsertMyProfile(data) {
  return request('/users/me', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateMyProfile(data) {
  return request('/users/me', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function getUserProfile(uid) {
  return request(`/users/${uid}`);
}

// ── Requests ──────────────────────────────────────────────────────────────────

export function listRequests(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return request(`/requests${qs ? `?${qs}` : ''}`);
}

export function getMatchingRequests() {
  return request('/requests/matching');
}
