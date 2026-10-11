# seed-data

Synthetic data for the **Connect › Discover** tab.
**Do not commit** real credentials or personal data here — all emails, phone numbers, and URLs are placeholders.

---

## Files

| File | Contents |
|------|----------|
| `users.json` | 12 student profiles — document IDs `demo_user_01` … `demo_user_12` |
| `projects.json` | 2–3 projects per user, keyed by uid (sub-collection `users/{uid}/projects`) |

---

## Method A — Firebase Console (manual, field-by-field)

> Best for inserting one or two profiles to quickly test the UI.

### Worked example: `demo_user_01` (Aditi Krishnamurthy)

1. Open [Firebase Console → Firestore](https://console.firebase.google.com/) → select your project → **Firestore Database**.
2. Click **Start collection** (or open the existing `users` collection).
3. Click **Add document**. Set the **Document ID** to `demo_user_01`.
4. Add the following fields. Use the **type selector** on the right of each field to pick the correct type:

   | Field | Type | Value |
   |-------|------|-------|
   | `name` | string | `Aditi Krishnamurthy` |
   | `email` | string | `aditi.krishnamurthy@example.edu` |
   | `department` | string | `AI & Data Science` |
   | `year` | number | `3` |
   | `bio` | string | `ML enthusiast working on recommender systems and NLP. Looking to collaborate on research projects and hackathons.` |
   | `availability` | string | `open_to_projects` |
   | `usuallyFoundAtPlaceId` | string | `place-ai-lab` |

5. **`skills`** — type **array**, then add each item as **string**:
   - `machine learning`
   - `python`
   - `data analysis`
   - `pytorch`
   - `sql`

6. **`interests`** — type **array**, string items:
   - `research`
   - `hackathons`
   - `badminton`

7. **`privacy`** — type **map**, then add three boolean sub-fields:
   - `profileVisible` → boolean → ✅ true
   - `showLocation` → boolean → ✅ true
   - `showContact` → boolean → ✅ true

8. **`contactMethod`** — type **map**, two string sub-fields:
   - `type` → string → `whatsapp`
   - `value` → string → `+91-9000010001`

9. **`links`** — type **map**, four string sub-fields:
   - `github` → string → `https://github.com/example-aditi`
   - `portfolio` → string → *(leave empty or type `null` — the console will store it as an empty string; see note below)*
   - `instagram` → string → *(empty)*
   - `linkedin` → string → `https://linkedin.com/in/example-aditi`

10. **`createdAt`** and **`updatedAt`** — type **timestamp** → click **Set to server timestamp** (the clock icon). Both fields should point to the current time.

11. Click **Save**.

> **Note on null links:** The Firestore console doesn't have a native `null` type in the UI. Either leave the field as an empty string `""`, or omit the field entirely. The backend reads `links.portfolio || null` so both work. If you want true `null`, use the Node snippet in Method B instead.

### Adding projects (sub-collection)
After saving the user document, click **Start collection** inside it → name the collection **`projects`** → add each project as a separate auto-ID document with fields:

| Field | Type | Value (example) |
|-------|------|-----------------|
| `title` | string | `Campus Recommender System` |
| `description` | string | `Built a collaborative filtering model…` |
| `link` | string | `https://github.com/example-aditi/campus-recommender` |
| `tags` | array (string items) | `machine learning`, `python`, `collaborative filtering` |
| `createdAt` | timestamp | server timestamp |

---

## Method B — Bulk import via Node snippet (paste into a scratch file outside the repo)

> Fastest way to insert all 12 profiles at once. Run this as a **standalone scratch file** anywhere outside the WalterByte repo. It talks to the local Firestore emulator.

```js
// scratch-seed.js  (run with: node scratch-seed.js)
// Place this file OUTSIDE the WalterByte repo.
// Requires: npm install firebase-admin   (in this scratch directory only)
import { readFileSync } from 'fs';
import admin from 'firebase-admin';

// ── Point at the local Firestore emulator ─────────────────────────────────────
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
admin.initializeApp({ projectId: 'demo-genesis' });

const db = admin.firestore();
const { Timestamp } = admin.firestore;
const now = Timestamp.now();

// ── Load the seed files (adjust paths to wherever you copied them) ─────────────
const users   = JSON.parse(readFileSync('./seed-data/users.json',    'utf8'));
const projects = JSON.parse(readFileSync('./seed-data/projects.json', 'utf8'));

async function run() {
  // 1. Write user documents
  const userBatch = db.batch();
  for (const user of users) {
    const { _docId, ...data } = user;
    userBatch.set(db.collection('users').doc(_docId), {
      ...data,
      createdAt: now,
      updatedAt: now,
    });
  }
  await userBatch.commit();
  console.log(`✓ ${users.length} user documents written`);

  // 2. Write projects sub-collection
  for (const [uid, projectList] of Object.entries(projects)) {
    const batch = db.batch();
    for (const project of projectList) {
      const ref = db.collection('users').doc(uid).collection('projects').doc();
      batch.set(ref, { ...project, createdAt: now });
    }
    await batch.commit();
  }
  const total = Object.values(projects).flat().length;
  console.log(`✓ ${total} project documents written`);

  console.log('All done!');
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
```

**Steps:**
1. Copy `seed-data/users.json` and `seed-data/projects.json` next to `scratch-seed.js`.
2. In the same directory: `npm init -y && npm install firebase-admin`
3. Make sure the emulator is already running: `npm run emulator` (from WalterByte/).
4. Run: `node scratch-seed.js`

> To target the **live Firebase project** instead of the emulator: remove the `FIRESTORE_EMULATOR_HOST` line and add a real service account credential (`admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: 'your-real-project-id' })`).

---

## Method C — Emulator UI import

If you have a previously exported Firestore snapshot (from `firebase emulators:export`):
1. Place the export folder somewhere on disk, e.g. `~/emulator-export/`.
2. Start emulators with: `firebase emulators:start --import=~/emulator-export/ --export-on-exit=~/emulator-export/`
3. The emulator UI at [http://localhost:4000](http://localhost:4000) will show the imported data.

> The seed-data files in this folder are **not** a Firebase export format — use Method A or B to create the data first, then export if needed.

---

## Verifying — curl test

After seeding, confirm the Discover tab has data with this curl:

```bash
# Returns up to 20 visible profiles (default page size)
curl -s "http://localhost:3000/api/v1/users/search" \
  -H "x-dev-uid: demo_user_01" | jq .
```

Filter by skill:
```bash
curl -s "http://localhost:3000/api/v1/users/search?skills=photography" \
  -H "x-dev-uid: demo_user_01" | jq .
```

Filter by department and availability:
```bash
curl -s "http://localhost:3000/api/v1/users/search?department=Design&availability=available" \
  -H "x-dev-uid: demo_user_01" | jq .
```

### What a correct response looks like

```json
{
  "status": "success",
  "data": {
    "results": [
      {
        "uid": "demo_user_01",
        "name": "Aditi Krishnamurthy",
        "department": "AI & Data Science",
        "year": 3,
        "skills": ["machine learning", "python", "data analysis", "pytorch", "sql"],
        "interests": ["research", "hackathons", "badminton"],
        "availability": "open_to_projects",
        "bio": "ML enthusiast working on recommender systems and NLP. Looking to collaborate on research projects and hackathons."
      }
    ],
    "nextCursor": null
  }
}
```

> **Note:** `searchService.toProfileCard()` returns only `uid, name, department, year, skills (top 5), interests (top 3), availability, bio (truncated to 120 chars)`. Fields like `email`, `contactMethod`, and `links` are intentionally excluded from search results.

---

## Troubleshooting — Discover tab shows "No people found"

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| API returns `[]` results | No documents in Firestore yet | Run Method A or B above |
| `401 Unauthorized` in browser console | `x-dev-uid` header not sent | Check `api.js` reads `localStorage.getItem('devUid')` — log in first via the app |
| `Network Error` or `Failed to fetch` | Wrong base URL | Vite proxy (`/api → localhost:3000`) only works when both servers are running; check `npm run dev` in both WalterByte/ and WalterByte/frontend/ |
| Profiles exist but none appear | `privacy.profileVisible` is `false` | `searchService.js` skips docs where `profileVisible !== true`; fix the flag in Firestore |
| Filters work but free-text `?q=` returns nothing | `_searchTokens` not present | The backend does in-memory substring match on `name + bio + skills + interests` — no token index needed; check the field values are populated |
| Emulator data doesn't show in production or vice versa | Emulator vs live mismatch | Check `.env`: `USE_FIREBASE_EMULATOR=true` → emulator, `false` → live project |
| `index … requires a composite index` error in logs | Combining `department`/`year`/`availability` filters | Open the link in the error message to create the index in Firebase Console, or reduce to a single Firestore filter and let in-memory handle the rest |
