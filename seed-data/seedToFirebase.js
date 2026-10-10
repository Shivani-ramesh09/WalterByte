// seed-data/seedToFirebase.js
// Bulk-imports the 12 synthetic Discover users & their projects into live Firebase Firestore.
//
// Usage (run from WalterByte/):
//   node seed-data/seedToFirebase.js

import 'dotenv/config';
import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 1. Resolve credentials
const credPath =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  '/Users/shivanir/Downloads/walterbyte-a3da0-firebase-adminsdk-fbsvc-06784f0370.json';

if (!existsSync(credPath)) {
  console.error(`❌ Credentials file not found at: ${credPath}`);
  console.error('Please verify GOOGLE_APPLICATION_CREDENTIALS or ensure the key file is present.');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(credPath, 'utf8'));
// Always use the real project_id defined inside the service account key file
const projectId = serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID || 'walterbyte-a3da0';

console.log(`[Seed] Connecting to project: ${projectId}`);
console.log(`[Seed] Using credentials: ${credPath}`);

// Ensure emulator env vars do NOT interfere with live Firestore
delete process.env.FIRESTORE_EMULATOR_HOST;
delete process.env.FIREBASE_AUTH_EMULATOR_HOST;

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: projectId,
});

const db = admin.firestore();
const { Timestamp } = admin.firestore;
const now = Timestamp.now();

// 2. Load JSON files
const usersPath = join(__dirname, 'users.json');
const projectsPath = join(__dirname, 'projects.json');

const users = JSON.parse(readFileSync(usersPath, 'utf8'));
const projects = JSON.parse(readFileSync(projectsPath, 'utf8'));

async function seed() {
  console.log(`\n⏳ Writing ${users.length} user documents to 'users' collection...`);
  
  const userBatch = db.batch();
  for (const user of users) {
    const { _docId, ...data } = user;
    const docRef = db.collection('users').doc(_docId);
    userBatch.set(docRef, {
      ...data,
      createdAt: now,
      updatedAt: now,
    });
  }
  await userBatch.commit();
  console.log(`✅ Successfully wrote ${users.length} users!`);

  console.log(`\n⏳ Writing project subcollections ('users/{uid}/projects')...`);
  let totalProjects = 0;

  for (const [uid, projectList] of Object.entries(projects)) {
    const projectBatch = db.batch();
    for (const project of projectList) {
      const projRef = db.collection('users').doc(uid).collection('projects').doc();
      projectBatch.set(projRef, {
        ...project,
        createdAt: now,
      });
      totalProjects++;
    }
    await projectBatch.commit();
  }
  console.log(`✅ Successfully wrote ${totalProjects} projects across ${Object.keys(projects).length} users!`);

  console.log('\n🎉 Finished! Live Firestore database has been seeded successfully.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Error during seeding:', err);
  process.exit(1);
});
