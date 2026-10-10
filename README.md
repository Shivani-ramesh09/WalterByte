# WalterByte — Connect & Student Profile Backend

Backend service for the **Connect** and **Student Profile** modules of the Genesis campus application. Built with Node.js, Express (ES modules), Firebase Admin SDK (Firestore & Auth), and Zod.

---

## ⚡ Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Review the environment options:

```ini
PORT=3000
NODE_ENV=development
CORS_ORIGINS=http://localhost:5173

# --- Option A: Local Firebase Emulator (Default for dev) ---
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
FIREBASE_PROJECT_ID=demo-genesis

# --- Option B: Real Firebase Project ---
# GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
# FIREBASE_PROJECT_ID=your-actual-firebase-project-id

# --- Dev Auth Bypass (Instant frontend integration) ---
DEV_BYPASS_AUTH=true
```

---

## 🛠️ Running the Application

### Option A: With Local Firebase Emulator Suite

1. **Start Firebase Emulators** (Firestore on `8080`, Auth on `9099`, UI on `4000`):
   ```bash
   npm run emulator
   ```
   *(Requires Firebase CLI: `npm install -g firebase-tools`)*

2. **Seed Emulator Test Data**:
   ```bash
   npm run seed
   ```
   This loads 5 diverse student profiles, projects, requests, and active connections.

3. **Start the Express API Server**:
   ```bash
   npm run dev
   ```

### Option B: With a Real Firebase Project

1. Download a service account private key JSON from Firebase Console → Project Settings → Service accounts.
2. In `.env`:
   - Comment out `FIRESTORE_EMULATOR_HOST` and `FIREBASE_AUTH_EMULATOR_HOST`.
   - Set `GOOGLE_APPLICATION_CREDENTIALS` to the path of your JSON file.
   - Set `FIREBASE_PROJECT_ID` to your project ID.
3. Seed sample data to your real project (flag-gated):
   ```bash
   npm run seed:prod
   ```
4. Start the server:
   ```bash
   npm start
   ```

---

## 🔑 Authentication & Dev Bypass

### In Production / Staging
Endpoints require a valid Firebase ID token in the authorization header:
```http
Authorization: Bearer <firebase-id-token>
```

### In Development (`DEV_BYPASS_AUTH=true`)
Frontend developers can immediately test and build UI without logging in to Firebase Auth. Simply provide the `x-dev-uid` header:
```http
x-dev-uid: student_aarav
```
The server will synthesize `{ uid: "student_aarav", email: "dev@campus.edu" }`. Real `Bearer` tokens are still accepted even when bypass is enabled.

---

## 📱 Running the full app (backend + frontend)

Needs the Firebase CLI and Java 21 for the emulators.

```bash
# 1. Emulators (Firestore + Auth)
npm run emulator

# 2. Seed canteens, menus, staff, gigs, profiles and demo logins (emulator only)
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npm run seed

# 3. API on :3000, verifying real Firebase ID tokens from the Auth emulator
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 DEV_BYPASS_AUTH=false npm run dev

# 4. Frontend on :5173 (proxies /api to :3000)
cd frontend && npm install && npm run dev
```

Demo logins (emulator only, password `campus123`):

| Who | Email | Sees |
|---|---|---|
| Student / freelancer | `meera.pillai@campus.edu` | Student app + Freelancer studio (photography gig) |
| Student | `rohan.sharma@campus.edu` | Student app |
| Canteen staff | `staff-sopanam@campus.edu` | Counter dashboard for Sopanam Canteen |

New accounts can be created from the login screen; they set up a profile on first sign-in.

---

## 🧪 Testing

Run the automated test suite (Jest with native ESM and Supertest):

```bash
npm test
```

Tests cover:
- Health checks (`/health` and `/api/v1/health`)
- Authentication verification & `DEV_BYPASS_AUTH`
- Privacy masking rules (contact/email/location visibility and connection overrides)
- Zod schema validation (422 structured errors)
- Route ordering (`/users/search` precedence over `/users/:uid`)
- 404 handler
- Eat: queue estimate, slot grid, validation, server-side totals, slot capacity under concurrent orders, order ownership, staff queue/status/inventory

Firestore-backed Eat tests are skipped unless the emulator is running. To run everything (needs the Firebase CLI and Java 21, plus `DEV_BYPASS_AUTH=true` in `.env`):

```bash
npm run test:emulator
```

---

## 📡 API Endpoints Overview

All endpoints below are prefixed with `/api/v1` unless noted:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` *(public)* | Service status & Firestore ping |
| `POST` | `/users/me` | Create or upsert own student profile |
| `GET` | `/users/me` | Get own full student profile |
| `PATCH` | `/users/me` | Partial update of own profile |
| `GET` | `/users/:uid` | Get public view of a student (privacy-masked) |
| `POST` | `/users/me/projects` | Add project to subcollection |
| `PATCH` | `/users/me/projects/:id` | Update project |
| `DELETE`| `/users/me/projects/:id` | Delete project |
| `GET` | `/users/search` | Search & filter profiles (`q`, `skills`, `dept`, `year`, `availability`) |
| `GET` | `/skills/suggest` | Autocomplete skill tags by prefix |
| `GET` | `/search/people` | Fast search for navbar / search modal (capped at 5) |
| `POST` | `/requests` | Post task or teammate request |
| `GET` | `/requests` | Browse requests with optional filter |
| `GET` | `/requests/matching` | Get open requests matching caller's profile skills |
| `GET` | `/requests/:id` | Get single request details |
| `PATCH` | `/requests/:id` | Update request (author only) |
| `DELETE`| `/requests/:id` | Delete request (author only) |
| `POST` | `/requests/:id/respond`| Submit response to request |
| `GET` | `/requests/:id/responses`| View all responses (author only) |
| `POST` | `/connections` | Send connection request |
| `GET` | `/connections` | List incoming & outgoing connections |
| `PATCH` | `/connections/:id` | Accept or decline connection request |
| `GET` | `/canteens` | **Eat:** canteens with open status and estimated queue time |
| `GET` | `/canteens/:id/menu` | **Eat:** menu grouped by category (price, veg, availability) |
| `GET` | `/canteens/:id/slots?date=YYYY-MM-DD` | **Eat:** pickup slots with remaining capacity |
| `POST` | `/orders` | **Eat:** place an order (mock UPI, server-priced, capacity-checked) |
| `GET` | `/orders/mine` | **Eat:** my orders, newest first |
| `GET` | `/orders/:id` | **Eat:** one of my orders (tracker) |
| `GET` | `/staff/me` | **Eat staff:** my canteen |
| `GET` | `/staff/orders?status=` | **Eat staff:** my canteen's order queue |
| `PATCH` | `/staff/orders/:id` | **Eat staff:** placed → preparing → ready → collected |
| `POST` | `/staff/menu` | **Eat staff:** add a menu item |
| `PATCH` | `/staff/menu/:itemId` | **Eat staff:** edit an item / mark sold out (`isAvailable: false`) |

### Eat: roles

- **Students** order and track their own orders.
- **Canteen staff** are listed in the server-only `staff/{uid}` collection (`{ canteenId, name }`). Staff only see and change their own canteen's orders and menu. The seed script creates `staff-sopanam`, `staff-prasada` and `staff-samudra`; with `DEV_BYPASS_AUTH=true`, send `x-dev-uid: staff-sopanam` to act as Sopanam's counter.
- Payment is a **demo mock** (`paymentMethod: "upi_mock"`). No money moves.

### Connect: freelance gigs

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/gigs?skill=&q=` | Active gigs, newest first |
| `GET` | `/gigs/:id` | One gig with its work samples |
| `POST` | `/gigs/:id/requests` | Send a hire request (`{ message }`) |
| `GET` | `/gig-requests/mine` | My sent hire requests (seller contact once accepted) |
| `GET` | `/freelancer/dashboard` | My gigs, incoming requests and stats |
| `POST` | `/freelancer/gigs` | Publish a gig; **at least one https work sample required** |
| `PATCH` | `/freelancer/gigs/:id` | Edit, pause (`status: "paused"`) or resume a gig |
| `DELETE` | `/freelancer/gigs/:id` | Delete a gig |
| `PATCH` | `/freelancer/requests/:id` | `pending → accepted/declined`, `accepted → completed` |

Any student with a profile can become a freelancer by publishing a gig. Contact details are exchanged only when the freelancer accepts a request.

The complete OpenAPI 3.0 specification is available in [`openapi.yaml`](./openapi.yaml).

---

## 🔒 Security Rules & Indexes

- **Security Rules**: Defined in [`firestore.rules`](./firestore.rules) covering `users`, `projects`, `requests`, `responses`, and `connections`.
- **Composite Indexes**: Defined in [`firestore.indexes.json`](./firestore.indexes.json).
- Deploy to Firebase:
  ```bash
  firebase deploy --only firestore:rules,firestore:indexes
  ```

---

## 📁 Repository Structure

```
├── firebase.json            # Emulators & Firestore deployment configuration
├── firestore.rules          # Firestore security rules
├── firestore.indexes.json   # Composite indexes for complex queries
├── openapi.yaml             # Complete OpenAPI 3.0 specification
├── package.json
├── scripts/
│   └── seedEmulator.js      # Seed utility (supports local emulator and prod target)
├── tests/
│   └── api.test.js          # Jest + Supertest test suite
└── src/
    ├── app.js               # Express app setup (middleware, CORS, routes)
    ├── server.js            # HTTP server entrypoint
    ├── config/              # env.js, firebase.js
    ├── controllers/         # user, search, request, connection controllers
    ├── middleware/          # auth, errorHandler, rateLimiter, validate
    ├── routes/              # index.js, health, user, search, request, connection
    ├── services/            # Firestore interaction & business logic
    └── utils/               # apiError.js, normalize.js
```
