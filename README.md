# WalterByte — Amrita Campus App

A mobile-first campus app for Amrita Vishwa Vidyapeetham, Coimbatore. One app, three jobs:

- **Eat** — pre-order from Sopanam, Prasada and Samudra canteens, pick a pickup slot, skip the queue.
- **Connect** — hire student freelancers who show real work samples, find people and teammates, find lab facilities.
- **Explore** — campus happenings picked for your interests.

Canteen staff get their own counter dashboard; freelancers get their own studio.

Stack: React + Vite frontend (`frontend/`), Node.js + Express API (`src/`), Firebase Auth + Firestore (local emulators for development), Zod validation.

---

## What is real, demo-only, and coming soon

| Area | Status |
|---|---|
| Sign up / sign in (email + password, Firebase Auth) | **Real** (runs against the Auth emulator in demo mode) |
| Canteen menus, carts, pickup slots with capacity limits, orders, live order tracker | **Real** — server-priced, slot capacity enforced in a transaction |
| Canteen staff dashboard: order queue, status updates, sold out, add items | **Real** — staff only see their own canteen |
| Daily menus uploaded as CSV by administration, versioned, with per-item stock | **Real.** The private digital-TV menu is **not** connected; menus come from authorised uploads. |
| Inventory ledger: online reservations, collections, cancellations, counter sales, adjustments, wastage | **Real** — concurrency-safe; an online reservation is deducted once and moves to sold on collection |
| Counter sales and "asked for a sold-out item" counts at the billing counter | **Real** — recorded by cashiers in the staff app, or imported from an authorised billing CSV. No billing-system integration exists. |
| "I wanted this" on sold-out items, failed online attempts | **Real** — explicit unmet-demand signals, kept separate by type |
| Administration dashboard: Explore, Connect and Eat analytics, proposals, recommendations, CSV reports | **Real** calculations; the history it shows in the demo is **synthetic** and labelled on every screen |
| Freelance gigs with work samples, hire requests, contact sharing on accept | **Real** |
| People search, connections, requests board | **Real** |
| UPI payment | **Simulated.** The QR shown at checkout is a sample image, not scannable; "Simulate successful payment" marks the order paid. No money moves. |
| Explore events (A-MUNSO Mock MUN, Hackathon) | **Sample data** seeded into Firestore; dates and the hackathon venue are placeholders. Registration, saves, attendance and feedback are real. |
| 3D printing in Combustion Research Lab | Listed in Connect → Labs & facilities; **exact location coming soon** |
| Campus map, "Show on map" | **Coming soon** |
| Demo logins and seeded profiles, gigs, menus | **Sample data**, created by the seed script in the emulator only |
| Analytics history (past events, skill requests, 28 days of canteen sales and demand signals) | **Synthetic**, emulator only, flagged `synthetic: true`. Not real Amrita statistics. |

The app shows a **Demo mode** badge whenever it runs against the local emulators.

---

## Run the demo

You need **Node.js 20+**, **Java 21** (`java -version`) and the **Firebase CLI** (`npm install -g firebase-tools`).

First time only:

```bash
npm install
cd frontend && npm install && cd ..
```

Then four terminals from the repo root.

**macOS / Linux / Git Bash**

```bash
# 1. Emulators: Firestore :8080, Auth :9099, Emulator UI :4000
npm run emulator

# 2. Seed sample data and demo logins (re-run after every emulator restart)
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npm run seed

# 3. API on :3000
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 DEV_BYPASS_AUTH=false npm run dev

# 4. Frontend on :5173 (proxies /api to :3000)
cd frontend && npm run dev
```

**Windows PowerShell** (terminals 2 and 3)

```powershell
$env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"; $env:FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"; $env:FIREBASE_PROJECT_ID="demo-genesis"
npm run seed

$env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"; $env:FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"; $env:FIREBASE_PROJECT_ID="demo-genesis"; $env:DEV_BYPASS_AUTH="false"
npm run dev
```

Open **http://localhost:5173**. The login page has **Start the demo** buttons that sign you in with one tap:

| Role | Email (password `campus123`) | Try this |
|---|---|---|
| Student | `rohan.sharma@campus.edu` | Explore picks, order a bread omelette at Sopanam, hire Meera |
| Student freelancer | `meera.pillai@campus.edu` | Me → Freelancer studio: accept Rohan's request, publish a gig |
| Canteen staff | `staff-sopanam@campus.edu` | Move Rohan's order to Preparing → Ready → Collected; Counter tab: record walk-in sales and requests for sold-out items |
| Campus administration | `admin@campus.edu` | Overview, Explore, Connect and Eat analytics, proposals, recommendations, menu uploads, reports |
| Society representative | `munso.rep@campus.edu` | A-MUNSO's own event history, attendance marking and proposals only |

Also seeded: `staff-prasada@campus.edu`, `staff-samudra@campus.edu`, and 8 more student profiles. New accounts can sign up from the login page; they pick interests and set up a profile on first sign-in.

### Suggested 2-minute demo path

1. **Rohan** → Explore: "For you" shows the Hackathon with *Matches your interest in Coding & Hackathons*; open it and RSVP.
2. Eat → Sopanam Canteen → add a bread omelette → Checkout → pick a slot → simulated UPI payment → order tracker.
3. Connect → Hire talent → Meera's photography gig → view work samples → send a hire request.
4. **Sopanam staff** → the order appears in the queue → Start preparing → Mark ready. Rohan's tracker updates by itself.
5. **Meera** → Me → Freelancer studio → accept the request → Rohan's contact appears (and Meera's appears for Rohan).
6. **Administration** → Eat → Samudra → Chicken Biriyani: sales, sell-out times, each unmet-demand signal kept separate, data quality, a demand range (or "insufficient data") and a gross-sales scenario that is not profit.
7. **Administration** → Proposals → A-MUNSO Annual Conference: past results and current readiness side by side; the decision stays with a person.

---

## Tests

```bash
# Backend: Jest + Supertest (Firestore-backed tests are skipped without the emulator)
npm test

# Backend with a fresh Firestore emulator: runs everything (needs Java 21 + Firebase CLI,
# and DEV_BYPASS_AUTH=true in .env)
npm run test:emulator

# Frontend: Vitest (cart maths, error messages, Explore recommendations, Connect reasons)
cd frontend && npm test
```

Backend tests cover health, auth and the dev bypass, privacy masking, validation, route ordering, Eat (queue estimate, slot grid, server-side totals, no overbooking under 6 concurrent orders, order ownership, staff queue/status/inventory) and gigs (work samples required, hire-request flow, contact sharing only on accept, owner-only edits).

---

## Configuration

### Backend (`.env`, copy from `.env.example`)

| Variable | Purpose |
|---|---|
| `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST` | Use the local emulators (demo mode) |
| `FIREBASE_PROJECT_ID` | `demo-genesis` for the emulators, or your real project ID |
| `GOOGLE_APPLICATION_CREDENTIALS` | Service-account key for a real Firebase project |
| `DEV_BYPASS_AUTH` | `true` lets tests send `x-dev-uid: <uid>` instead of a token. Never in production (the server refuses to start) |
| `CORS_ORIGINS` | Allowed frontend origins (default `http://localhost:5173`) |

### Frontend (`frontend/.env.local`, copy from `frontend/.env.example`)

| Variable | Purpose |
|---|---|
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID` | Firebase web config (defaults work with the emulators) |
| `VITE_USE_AUTH_EMULATOR` | `false` to use a real Firebase project; also hides Demo mode and the demo logins |
| `VITE_API_BASE` | API base URL (default `/api/v1`) |

### Moving to a real Firebase project

1. Create the project, enable **Authentication → Email/Password** and **Firestore**.
2. Backend: set `GOOGLE_APPLICATION_CREDENTIALS` and `FIREBASE_PROJECT_ID`, remove the emulator hosts.
3. Frontend: fill in the web config and set `VITE_USE_AUTH_EMULATOR=false`.
4. `firebase deploy --only firestore:rules,firestore:indexes`
5. `npm run seed:prod` seeds canteens, menus, staff records and gigs (no login accounts). Staff sign up in the app, then link their uid in `staff/{uid}`.

---

## API

All endpoints are under `/api/v1` and need `Authorization: Bearer <Firebase ID token>`, except `GET /health`. Errors are `{ error: { code, message, details? } }`. Full spec: [`openapi.yaml`](./openapi.yaml).

### Profiles, search, requests, connections

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

### Eat

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/canteens` | Canteens with open status and estimated queue time |
| `GET` | `/canteens/:id/menu` | Menu grouped by category (price, veg, availability) |
| `GET` | `/canteens/:id/slots?date=YYYY-MM-DD` | Pickup slots with remaining capacity |
| `POST` | `/orders` | Place an order (simulated UPI, server-priced, capacity-checked) |
| `GET` | `/orders/mine` | My orders, newest first |
| `GET` | `/orders/:id` | One of my orders (tracker) |
| `GET` | `/staff/me` | **Staff:** my canteen |
| `GET` | `/staff/orders?status=` | **Staff:** my canteen's order queue |
| `PATCH` | `/staff/orders/:id` | **Staff:** placed → preparing → ready → collected |
| `POST` | `/staff/menu` | **Staff:** add a menu item |
| `PATCH` | `/staff/menu/:itemId` | **Staff:** edit an item / mark sold out (`isAvailable: false`) |

Canteen staff are listed in the server-only `staff/{uid}` collection (`{ canteenId, name }`), which no client can write. The seed script creates `staff-sopanam`, `staff-prasada` and `staff-samudra`.

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

Any student with a profile becomes a freelancer by publishing a gig. Contact details are exchanged only when the freelancer accepts a request.

---

### Administration (Explore, Connect, Eat)

All under `/api/v1/admin/*` and require an `admins/{uid}` record (server-only). `central` admins see everything; `org` representatives only their own organisation's events, attendance and proposals.

| Method | Path | Notes |
|---|---|---|
| GET | `/admin/overview?from&to` | KPIs across modules, against the previous equal period (IST days) |
| GET | `/admin/explore` · `/admin/connect` · `/admin/eat` | Module analytics for the period |
| GET | `/admin/eat/items/:canteenId/:itemId?portions&unitCost` | Item evidence: sales, stockouts, signals, data quality, demand range, scenario |
| POST | `/admin/eat/menus/validate` · `/admin/eat/menus` · `/admin/eat/menus/:canteenId/:date/publish` | Daily menu CSV: preview with row errors, draft, versioned publish |
| POST | `/admin/eat/counter-imports` | Billing CSV import, idempotent by transaction id |
| GET/POST/PATCH | `/admin/proposals…` | Proposals, evidence pack, human decision, post-event outcome |
| GET/PATCH | `/admin/recommendations…` | Rule-based recommendations and their review status |
| GET | `/admin/reports/:kind` | CSV: `events`, `organisations`, `skills`, `eat-items` |

Counter (staff): `GET /staff/counter`, `POST /staff/counter-sales`, `POST /staff/unavailable-requests`, `PATCH /staff/unavailable-requests/:id` (void with reason), `POST /staff/inventory/:itemId/adjust`, `POST /staff/day-close`.
Students: `POST /orders/:id/cancel`, `POST|DELETE /canteens/:id/menu/:itemId/interest`, `GET /events`, `PATCH /events/:id/me`, `POST /events/:id/feedback`.

## Security rules & indexes

- [`firestore.rules`](./firestore.rules): users, projects, requests, responses and connections; canteens, orders, staff, gigs and gig requests are server-only (all access goes through the API).
- [`firestore.indexes.json`](./firestore.indexes.json): composite indexes.
- Deploy: `firebase deploy --only firestore:rules,firestore:indexes`

---

## Repository structure

```
├── frontend/                 # React + Vite app
│   ├── public/               # Amma photo, Amrita logo, campus images
│   └── src/
│       ├── App.jsx           # Sign-in, onboarding, staff vs student app, tabs
│       ├── config/firebase.js
│       ├── lib/              # api client, session, cart, navigation
│       ├── components/       # shared UI, search bar, tab bar, sample QR
│       └── features/         # auth, home, explore, eat, staff, connect, freelancer, me, search
├── src/                      # Express API
│   ├── config/  controllers/  middleware/  routes/  services/  utils/
├── scripts/seedEmulator.js   # Sample data + emulator-only demo logins
├── tests/                    # Jest + Supertest
├── firebase.json  firestore.rules  firestore.indexes.json  openapi.yaml
```
