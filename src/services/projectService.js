// src/services/projectService.js
// CRUD for the users/{uid}/projects subcollection.
import { db } from '../config/firebase.js';
import { notFound, forbidden } from '../utils/apiError.js';
import admin from 'firebase-admin';

const { Timestamp } = admin.firestore;

function projectsRef(uid) {
  return db.collection('users').doc(uid).collection('projects');
}

export async function addProject(uid, body) {
  const ref = projectsRef(uid).doc();
  const now = Timestamp.now();
  const data = {
    title: body.title,
    description: body.description || '',
    link: body.link || null,
    tags: Array.isArray(body.tags)
      ? body.tags.map((t) => t.trim().toLowerCase()).filter(Boolean)
      : [],
    createdAt: now,
  };
  await ref.set(data);
  return { id: ref.id, ...data };
}

export async function updateProject(uid, projectId, body) {
  const ref = projectsRef(uid).doc(projectId);
  const snap = await ref.get();
  if (!snap.exists) throw notFound('Project');

  const update = {};
  if (body.title !== undefined) update.title = body.title;
  if (body.description !== undefined) update.description = body.description;
  if (body.link !== undefined) update.link = body.link;
  if (body.tags !== undefined) {
    update.tags = body.tags.map((t) => t.trim().toLowerCase()).filter(Boolean);
  }

  await ref.update(update);
  const updated = await ref.get();
  return { id: projectId, ...updated.data() };
}

export async function deleteProject(uid, projectId) {
  const ref = projectsRef(uid).doc(projectId);
  const snap = await ref.get();
  if (!snap.exists) throw notFound('Project');
  await ref.delete();
}

export async function listProjects(uid) {
  const snap = await projectsRef(uid).orderBy('createdAt', 'desc').get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
