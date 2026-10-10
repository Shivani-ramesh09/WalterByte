#!/usr/bin/env node
// scripts/seedEmulator.js
// Loads 10 realistic Indian student profiles, their projects, and 5 sample
// requests into Firestore.
//
// Usage:
//   npm run seed                    → seeds the Firestore EMULATOR
//   SEED_TARGET=prod npm run seed   → seeds a real Firebase project
//                                    (requires GOOGLE_APPLICATION_CREDENTIALS)
//
// The script is NEVER imported by the app — it is a standalone CLI tool.

import 'dotenv/config';
import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// ── Firebase init ─────────────────────────────────────────────────────────────
const isEmulator = process.env.SEED_TARGET !== 'prod';

if (isEmulator) {
  process.env.FIRESTORE_EMULATOR_HOST =
    process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST =
    process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
}

if (!admin.apps.length) {
  if (isEmulator) {
    admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'demo-genesis' });
  } else {
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!credPath) {
      console.error('[SEED] Set GOOGLE_APPLICATION_CREDENTIALS to seed a real project.');
      process.exit(1);
    }
    const serviceAccount = JSON.parse(readFileSync(credPath, 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID,
    });
  }
}

const db = admin.firestore();
const { Timestamp } = admin.firestore;

// ── Data ──────────────────────────────────────────────────────────────────────

const now = Timestamp.now();

const users = [
  {
    uid: 'seed-uid-001',
    name: 'Aarav Mehta',
    email: 'aarav.mehta@campus.edu',
    department: 'Computer Science',
    year: 3,
    bio: 'Full-stack dev obsessed with React and Go. Love building tools that solve real campus problems.',
    skills: ['react', 'nodejs', 'go', 'postgresql', 'docker'],
    interests: ['open source', 'hackathons', 'chess'],
    availability: 'open_to_projects',
    contactMethod: { type: 'whatsapp', value: '+91-9000000001' },
    usuallyFoundAtPlaceId: null,
    privacy: { profileVisible: true, showLocation: false, showContact: true },
    links: { github: 'https://github.com/aaravmehta', portfolio: null, instagram: null, linkedin: null },
    projects: [
      {
        title: 'Campus Lost & Found',
        description: 'Mobile-first web app to report and claim lost items on campus.',
        link: 'https://github.com/aaravmehta/lost-found',
        tags: ['react', 'firebase', 'pwa'],
      },
      {
        title: 'Mess Menu Notifier',
        description: 'WhatsApp bot that sends daily mess menus every morning.',
        link: null,
        tags: ['nodejs', 'whatsapp-api'],
      },
    ],
  },
  {
    uid: 'seed-uid-002',
    name: 'Priya Nair',
    email: 'priya.nair@campus.edu',
    department: 'Design',
    year: 2,
    bio: 'UI/UX designer with a soft spot for motion design and design systems. Figma all day.',
    skills: ['ui design', 'figma', 'motion design', 'illustration', 'brand identity'],
    interests: ['typography', 'art', 'indie games'],
    availability: 'available',
    contactMethod: { type: 'instagram', value: '@priyanair.design' },
    usuallyFoundAtPlaceId: 'place-design-studio',
    privacy: { profileVisible: true, showLocation: true, showContact: true },
    links: { github: null, portfolio: 'https://priya.design', instagram: '@priyanair.design', linkedin: null },
    projects: [
      {
        title: 'Genesis Design System',
        description: 'Component library and design tokens for the Genesis campus super-app.',
        link: null,
        tags: ['figma', 'design system'],
      },
      {
        title: 'Fest Poster Collection',
        description: '20+ motion posters designed for Techfest 2025.',
        link: 'https://www.behance.net/priyanair',
        tags: ['motion design', 'poster', 'after effects'],
      },
    ],
  },
  {
    uid: 'seed-uid-003',
    name: 'Rohan Sharma',
    email: 'rohan.sharma@campus.edu',
    department: 'Electronics',
    year: 4,
    bio: 'Embedded systems + ML at the edge. Working on a smart attendance system using face recognition.',
    skills: ['python', 'machine learning', 'opencv', 'raspberry pi', 'c++'],
    interests: ['robotics', 'competitive programming', 'badminton'],
    availability: 'busy',
    contactMethod: { type: 'email', value: 'rohan.sharma@campus.edu' },
    usuallyFoundAtPlaceId: 'place-electronics-lab',
    privacy: { profileVisible: true, showLocation: true, showContact: false },
    links: { github: 'https://github.com/rohansharma', portfolio: null, instagram: null, linkedin: 'https://linkedin.com/in/rohansharma' },
    projects: [
      {
        title: 'Smart Attendance System',
        description: 'Face-recognition based attendance using Raspberry Pi + OpenCV.',
        link: 'https://github.com/rohansharma/smart-attendance',
        tags: ['python', 'opencv', 'raspberry pi', 'ml'],
      },
      {
        title: 'IoT Plant Monitor',
        description: 'Monitors soil moisture and sends alerts via Telegram.',
        link: null,
        tags: ['iot', 'python', 'telegram bot'],
      },
      {
        title: 'Edge ML Benchmark',
        description: 'Benchmarking TinyML models on microcontrollers for on-device inference.',
        link: null,
        tags: ['tinyml', 'c++', 'embedded'],
      },
    ],
  },
  {
    uid: 'seed-uid-004',
    name: 'Ananya Singh',
    email: 'ananya.singh@campus.edu',
    department: 'Media & Communication',
    year: 2,
    bio: 'Content writer and video editor. I tell stories through reels, documentaries, and blogs.',
    skills: ['content writing', 'video editing', 'premiere pro', 'copywriting', 'social media'],
    interests: ['films', 'travel', 'poetry'],
    availability: 'available',
    contactMethod: { type: 'instagram', value: '@ananya.creates' },
    usuallyFoundAtPlaceId: null,
    privacy: { profileVisible: true, showLocation: false, showContact: true },
    links: { github: null, portfolio: 'https://ananyasingh.in', instagram: '@ananya.creates', linkedin: null },
    projects: [
      {
        title: 'Campus Voices',
        description: 'A student documentary series about life in hostels.',
        link: 'https://youtube.com/@campusvoices',
        tags: ['video editing', 'documentary', 'premiere pro'],
      },
      {
        title: 'Tech for Bharat Blog',
        description: 'Weekly blog on how technology is transforming rural India.',
        link: 'https://techforbharat.substack.com',
        tags: ['content writing', 'blog'],
      },
    ],
  },
  {
    uid: 'seed-uid-005',
    name: 'Karthik Rajan',
    email: 'karthik.rajan@campus.edu',
    department: 'Computer Science',
    year: 1,
    bio: 'Freshman passionate about competitive programming and web3. Still figuring out everything else.',
    skills: ['c++', 'competitive programming', 'solidity', 'javascript'],
    interests: ['crypto', 'chess', 'anime'],
    availability: 'open_to_projects',
    contactMethod: { type: 'whatsapp', value: '+91-9000000005' },
    usuallyFoundAtPlaceId: 'place-cs-lab',
    privacy: { profileVisible: true, showLocation: true, showContact: true },
    links: { github: 'https://github.com/karthikrajan', portfolio: null, instagram: null, linkedin: null },
    projects: [
      {
        title: 'On-Chain Voting DApp',
        description: 'Decentralised voting application for student union elections.',
        link: 'https://github.com/karthikrajan/voting-dapp',
        tags: ['solidity', 'ethereum', 'web3'],
      },
    ],
  },
  {
    uid: 'seed-uid-006',
    name: 'Meera Pillai',
    email: 'meera.pillai@campus.edu',
    department: 'Fine Arts',
    year: 3,
    bio: 'Photographer and graphic designer. I shoot portraits, events, and anything with interesting light.',
    skills: ['photography', 'lightroom', 'photoshop', 'graphic design', 'illustration'],
    interests: ['street photography', 'exhibition design', 'zines'],
    availability: 'available',
    contactMethod: { type: 'instagram', value: '@meera.lens' },
    usuallyFoundAtPlaceId: 'place-arts-block',
    privacy: { profileVisible: true, showLocation: true, showContact: true },
    links: { github: null, portfolio: 'https://meeraphoto.co', instagram: '@meera.lens', linkedin: null },
    projects: [
      {
        title: 'Faces of Campus',
        description: 'Portrait series of 50 students across departments.',
        link: 'https://meeraphoto.co/faces',
        tags: ['photography', 'portrait'],
      },
      {
        title: 'Techfest 2025 Branding',
        description: 'Designed all event collaterals, banners, and merch for Techfest.',
        link: null,
        tags: ['graphic design', 'branding', 'photoshop'],
      },
    ],
  },
  {
    uid: 'seed-uid-007',
    name: 'Dev Patel',
    email: 'dev.patel@campus.edu',
    department: 'Computer Science',
    year: 4,
    bio: 'Backend engineer and ML enthusiast. Currently researching NLP for low-resource Indian languages.',
    skills: ['python', 'machine learning', 'nlp', 'fastapi', 'postgresql'],
    interests: ['research', 'linguistics', 'cricket'],
    availability: 'busy',
    contactMethod: { type: 'email', value: 'dev.patel@campus.edu' },
    usuallyFoundAtPlaceId: null,
    privacy: { profileVisible: true, showLocation: false, showContact: false },
    links: { github: 'https://github.com/devpatel', portfolio: null, instagram: null, linkedin: 'https://linkedin.com/in/devpatel' },
    projects: [
      {
        title: 'Hindi NER Model',
        description: 'Named entity recognition for Hindi news articles using fine-tuned BERT.',
        link: 'https://github.com/devpatel/hindi-ner',
        tags: ['nlp', 'python', 'transformers', 'hindi'],
      },
      {
        title: 'FastAPI Starter',
        description: 'Production-ready FastAPI template with JWT auth, Alembic, and Docker.',
        link: 'https://github.com/devpatel/fastapi-starter',
        tags: ['fastapi', 'python', 'docker'],
      },
    ],
  },
  {
    uid: 'seed-uid-008',
    name: 'Neha Kulkarni',
    email: 'neha.kulkarni@campus.edu',
    department: 'Management',
    year: 2,
    bio: 'Marketing + product management. I turn insights into campaigns and features people actually use.',
    skills: ['content writing', 'social media', 'product management', 'canva', 'market research'],
    interests: ['startups', 'podcasts', 'baking'],
    availability: 'open_to_projects',
    contactMethod: { type: 'whatsapp', value: '+91-9000000008' },
    usuallyFoundAtPlaceId: null,
    privacy: { profileVisible: true, showLocation: false, showContact: true },
    links: { github: null, portfolio: null, instagram: '@nehakulkarni', linkedin: 'https://linkedin.com/in/nehakulkarni' },
    projects: [
      {
        title: 'Campus Startup Digest',
        description: 'Monthly newsletter covering student startups and innovation on campus.',
        link: 'https://campusstartupdigest.in',
        tags: ['content writing', 'newsletter', 'startups'],
      },
    ],
  },
  {
    uid: 'seed-uid-009',
    name: 'Arjun Reddy',
    email: 'arjun.reddy@campus.edu',
    department: 'Civil Engineering',
    year: 5,
    bio: 'Final year civil. Building an app to map accessible routes for differently-abled students.',
    skills: ['python', 'gis', 'react', 'data analysis', 'autocad'],
    interests: ['urban planning', 'accessibility', 'football'],
    availability: 'open_to_projects',
    contactMethod: { type: 'email', value: 'arjun.reddy@campus.edu' },
    usuallyFoundAtPlaceId: 'place-civil-lab',
    privacy: { profileVisible: true, showLocation: true, showContact: true },
    links: { github: 'https://github.com/arjunreddy', portfolio: null, instagram: null, linkedin: 'https://linkedin.com/in/arjunreddy' },
    projects: [
      {
        title: 'AccessMap Campus',
        description: 'Mapping accessible routes and ramps on campus for wheelchair users.',
        link: 'https://github.com/arjunreddy/accessmap',
        tags: ['gis', 'python', 'accessibility'],
      },
      {
        title: 'Campus GHG Audit',
        description: 'Data analysis of campus energy consumption and carbon footprint.',
        link: null,
        tags: ['data analysis', 'python', 'sustainability'],
      },
    ],
  },
  {
    uid: 'seed-uid-010',
    name: 'Ishaan Bose',
    email: 'ishaan.bose@campus.edu',
    department: 'Computer Science',
    year: 3,
    bio: 'Game dev by night, web dev by day. Made a few Unity games and way too many Chrome extensions.',
    skills: ['unity', 'c#', 'javascript', 'react', 'video editing'],
    interests: ['game design', 'speedrunning', 'sci-fi'],
    availability: 'available',
    contactMethod: { type: 'whatsapp', value: '+91-9000000010' },
    usuallyFoundAtPlaceId: null,
    privacy: { profileVisible: true, showLocation: false, showContact: true },
    links: { github: 'https://github.com/ishaanbose', portfolio: 'https://ishaanbose.dev', instagram: null, linkedin: null },
    projects: [
      {
        title: 'Campus Rush',
        description: 'Top-down arcade game where you navigate a student through chaotic exam week.',
        link: 'https://ishaanbose.itch.io/campus-rush',
        tags: ['unity', 'c#', 'game dev'],
      },
      {
        title: 'Class Schedule Extension',
        description: 'Chrome extension that overlays your timetable on Google Calendar.',
        link: 'https://github.com/ishaanbose/schedule-ext',
        tags: ['javascript', 'chrome extension'],
      },
      {
        title: 'Fest Highlight Reel',
        description: 'Edited and published the 8-min highlight video for Culturals 2025.',
        link: 'https://youtube.com/watch?v=fake',
        tags: ['video editing', 'premiere pro'],
      },
    ],
  },
];

const requests = [
  {
    id: 'seed-req-001',
    authorId: 'seed-uid-004', // Ananya Singh
    title: 'Need a video editor for Techfest 2025 recap',
    description:
      'Looking for someone to edit a 5-minute recap of Techfest 2025. Raw footage is ready (about 40 GB). Must be comfortable with Premiere Pro or DaVinci Resolve. Deadline: 2 days after fest.',
    type: 'task',
    skillsNeeded: ['video editing'],
    deadline: Timestamp.fromDate(new Date('2026-10-15T23:59:00Z')),
    status: 'open',
  },
  {
    id: 'seed-req-002',
    authorId: 'seed-uid-001', // Aarav Mehta
    title: 'Hackathon teammates needed — Smart Campus track',
    description:
      'Forming a team of 4 for the Smart India Hackathon 2026. I have the full-stack covered. Need a designer, an ML person, and someone who can pitch well. The theme is accessibility and inclusion.',
    type: 'teammate',
    skillsNeeded: ['ui design', 'machine learning', 'content writing'],
    deadline: Timestamp.fromDate(new Date('2026-10-20T12:00:00Z')),
    status: 'open',
  },
  {
    id: 'seed-req-003',
    authorId: 'seed-uid-008', // Neha Kulkarni
    title: 'Writer needed for Campus Startup Digest — October issue',
    description:
      'Need a contributor to write a 600-word feature on a student startup. Must be engaging, research-backed, and delivered in 3 days. Minor edits expected.',
    type: 'task',
    skillsNeeded: ['content writing'],
    deadline: Timestamp.fromDate(new Date('2026-10-13T18:00:00Z')),
    status: 'open',
  },
  {
    id: 'seed-req-004',
    authorId: 'seed-uid-009', // Arjun Reddy
    title: 'Looking for a React dev to help with AccessMap Campus',
    description:
      'I have the GIS data and backend ready. Need a frontend dev to build the map UI with React + Leaflet.js. This is a meaningful project — will credit you on the paper.',
    type: 'teammate',
    skillsNeeded: ['react', 'javascript'],
    deadline: null,
    status: 'open',
  },
  {
    id: 'seed-req-005',
    authorId: 'seed-uid-006', // Meera Pillai
    title: 'Event photographer needed for Photography Club open house',
    description:
      'The Photography Club is hosting an open house next Friday (Oct 18). We need a photographer to cover the event for 3 hours. Should have their own camera. Small honorarium available.',
    type: 'task',
    skillsNeeded: ['photography'],
    deadline: Timestamp.fromDate(new Date('2026-10-18T17:00:00Z')),
    status: 'open',
  },
];

// Eat: canteens and menus only. Orders and slot bookings are never seeded,
// so every queue estimate and slot count comes from real orders.
// Prices are whole INR.
const veg = (id, name, category, price) => ({ id, name, category, price, isVeg: true, isAvailable: true });
const nonVeg = (id, name, category, price) => ({ id, name, category, price, isVeg: false, isAvailable: true });

// Non-veg at Sopanam and Samudra is eggs and chicken only.
const eggAndChicken = [
  nonVeg('boiled-eggs', 'Boiled Eggs (2 pc)', 'Egg', 20),
  nonVeg('omelette', 'Omelette', 'Egg', 25),
  nonVeg('bread-omelette', 'Bread Omelette', 'Egg', 40),
  nonVeg('chicken-biriyani', 'Chicken Biriyani', 'Chicken', 120),
  nonVeg('chicken-curry', 'Chicken Curry', 'Chicken', 90),
  nonVeg('chicken-sandwich', 'Chicken Sandwich', 'Chicken', 70),
];

const canteens = [
  {
    id: 'sopanam',
    name: 'Sopanam Canteen',
    description: 'South Indian, meals, eggs and chicken.',
    placeId: 'place-sopanam-canteen',
    openTime: '08:00',
    closeTime: '21:00',
    isActive: true,
    slotMinutes: 5,
    slotCapacity: 8,
    baseWaitMinutes: 6,
    perOrderMinutes: 1.5,
    menu: [
      veg('idli-vada', 'Idli Vada (2+1)', 'Breakfast', 40),
      veg('masala-dosa', 'Masala Dosa', 'Breakfast', 55),
      veg('veg-meals', 'Veg Meals', 'Meals', 80),
      ...eggAndChicken,
      veg('filter-coffee', 'Filter Coffee', 'Beverages', 20),
      veg('tea', 'Tea', 'Beverages', 15),
    ],
  },
  {
    id: 'prasada',
    name: 'Prasada Canteen (Pure Veg)',
    description: 'Pure vegetarian. Meals, dosas and snacks.',
    placeId: 'place-prasada-canteen',
    openTime: '08:00',
    closeTime: '20:00',
    isActive: true,
    slotMinutes: 5,
    slotCapacity: 8,
    baseWaitMinutes: 5,
    perOrderMinutes: 1.5,
    menu: [
      veg('pongal', 'Pongal', 'Breakfast', 40),
      veg('masala-dosa', 'Masala Dosa', 'Breakfast', 55),
      veg('veg-meals', 'Veg Meals', 'Meals', 80),
      veg('curd-rice', 'Curd Rice', 'Meals', 45),
      veg('veg-sandwich', 'Veg Sandwich', 'Snacks', 45),
      veg('samosa', 'Samosa (2 pc)', 'Snacks', 25),
      veg('filter-coffee', 'Filter Coffee', 'Beverages', 20),
      veg('tea', 'Tea', 'Beverages', 15),
    ],
  },
  {
    id: 'samudra',
    name: 'Samudra Canteen',
    description: 'Quick bites, eggs and chicken.',
    placeId: 'place-samudra-canteen',
    openTime: '08:00',
    closeTime: '20:00',
    isActive: true,
    slotMinutes: 5,
    slotCapacity: 6,
    baseWaitMinutes: 7,
    perOrderMinutes: 2,
    menu: [
      veg('veg-puffs', 'Veg Puffs', 'Snacks', 25),
      veg('veg-noodles', 'Veg Noodles', 'Snacks', 60),
      ...eggAndChicken,
      veg('cold-coffee', 'Cold Coffee', 'Beverages', 45),
      veg('lime-juice', 'Lime Juice', 'Beverages', 25),
    ],
  },
];

// Counter staff, one per canteen. staff/{uid} is server-only (rules deny
// client access), so this script is how staff accounts are granted.
// With DEV_BYPASS_AUTH, send `x-dev-uid: staff-sopanam` to act as one.
const staff = [
  { uid: 'staff-sopanam', name: 'Sopanam counter', canteenId: 'sopanam' },
  { uid: 'staff-prasada', name: 'Prasada counter', canteenId: 'prasada' },
  { uid: 'staff-samudra', name: 'Samudra counter', canteenId: 'samudra' },
];

// Freelance gigs. Every gig carries at least one work sample.
// shortcut: sample images are placeholder photos from picsum.photos; replace with real student work before launch
const gigs = [
  {
    id: 'seed-gig-001',
    sellerId: 'seed-uid-006',
    title: 'Event & portrait photography with edited photos in 48h',
    skill: 'photography',
    description: 'Fests, club events, portraits and product shots. Includes colour-graded, edited photos delivered as a shared folder within two days.',
    priceFrom: 800,
    deliveryDays: 2,
    samples: [
      { type: 'image', url: 'https://picsum.photos/seed/meera-portrait/800/600', caption: 'Portrait series, Faces of Campus' },
      { type: 'image', url: 'https://picsum.photos/seed/meera-event/800/600', caption: 'Techfest 2025 main stage' },
      { type: 'link', url: 'https://meeraphoto.co', caption: 'Full portfolio' },
    ],
  },
  {
    id: 'seed-gig-002',
    sellerId: 'seed-uid-004',
    title: 'Reels and event recap videos edited in Premiere Pro',
    skill: 'video editing',
    description: 'Short-form reels and 2-5 minute recaps with music, captions and colour correction. Send raw footage, get a ready-to-post video.',
    priceFrom: 600,
    deliveryDays: 3,
    samples: [
      { type: 'video', url: 'https://youtube.com/@campusvoices', caption: 'Campus Voices documentary series' },
      { type: 'image', url: 'https://picsum.photos/seed/ananya-edit/800/600', caption: 'Reel thumbnail set' },
    ],
  },
  {
    id: 'seed-gig-003',
    sellerId: 'seed-uid-002',
    title: 'Posters, logos and UI screens designed in Figma',
    skill: 'ui design',
    description: 'Event posters, club logos, social media kits and app UI mockups. Two revision rounds included, source Figma file shared.',
    priceFrom: 500,
    deliveryDays: 4,
    samples: [
      { type: 'image', url: 'https://picsum.photos/seed/priya-poster/800/600', caption: 'Techfest motion poster' },
      { type: 'link', url: 'https://priya.design', caption: 'Design portfolio' },
    ],
  },
  {
    id: 'seed-gig-004',
    sellerId: 'seed-uid-010',
    title: 'Fest highlight reels and gaming montages',
    skill: 'video editing',
    description: 'Fast-paced highlight reels with motion text and sound design. I edited the Culturals 2025 highlight video.',
    priceFrom: 700,
    deliveryDays: 5,
    samples: [{ type: 'image', url: 'https://picsum.photos/seed/ishaan-reel/800/600', caption: 'Culturals 2025 highlight frame' }],
  },
];

// Login accounts, created in the Auth EMULATOR only (password: campus123).
// Never created for a real project: known passwords must not exist there.
const DEMO_PASSWORD = 'campus123';

// ── Seed functions ─────────────────────────────────────────────────────────────

async function seedAuthUsers() {
  if (!isEmulator) {
    console.log('[Seed] Skipping login accounts (real project).');
    return;
  }
  console.log('[Seed] Seeding emulator login accounts...');
  const accounts = [
    ...users.map((u) => ({ uid: u.uid, email: u.email, displayName: u.name })),
    ...staff.map((s) => ({ uid: s.uid, email: `${s.uid}@campus.edu`, displayName: s.name })),
  ];
  for (const account of accounts) {
    await admin.auth().deleteUser(account.uid).catch(() => {});
    await admin.auth().createUser({ ...account, password: DEMO_PASSWORD });
  }
  console.log(`[Seed] ✓ ${accounts.length} logins written (password: ${DEMO_PASSWORD}).`);
}

async function seedGigs() {
  console.log('[Seed] Seeding gigs...');
  const batch = db.batch();
  for (const { id, sellerId, ...gig } of gigs) {
    const seller = users.find((u) => u.uid === sellerId);
    batch.set(db.collection('gigs').doc(id), {
      ...gig,
      sellerId,
      sellerName: seller.name,
      sellerDepartment: seller.department,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
  }
  await batch.commit();
  console.log(`[Seed] ✓ ${gigs.length} gigs written.`);
}

async function seedUsers() {
  console.log('[Seed] Seeding users...');
  const batch = db.batch();

  for (const user of users) {
    const { uid, projects, ...profile } = user;
    const ref = db.collection('users').doc(uid);
    batch.set(ref, { ...profile, createdAt: now, updatedAt: now });
  }

  await batch.commit();
  console.log(`[Seed] ✓ ${users.length} users written.`);
}

async function seedProjects() {
  console.log('[Seed] Seeding projects...');
  let totalProjects = 0;

  for (const user of users) {
    const { uid, projects } = user;
    if (!projects || projects.length === 0) continue;

    const batch = db.batch();
    for (const project of projects) {
      const ref = db.collection('users').doc(uid).collection('projects').doc();
      batch.set(ref, { ...project, createdAt: now });
      totalProjects++;
    }
    await batch.commit();
  }

  console.log(`[Seed] ✓ ${totalProjects} projects written.`);
}

async function seedRequests() {
  console.log('[Seed] Seeding requests...');
  const batch = db.batch();

  for (const req of requests) {
    const { id, ...data } = req;
    const ref = db.collection('requests').doc(id);
    batch.set(ref, { ...data, createdAt: now, updatedAt: now });
  }

  await batch.commit();
  console.log(`[Seed] ✓ ${requests.length} requests written.`);
}

async function seedCanteens() {
  console.log('[Seed] Seeding canteens...');
  const batch = db.batch();
  let totalItems = 0;

  for (const canteen of canteens) {
    const { id, menu, ...data } = canteen;
    const ref = db.collection('canteens').doc(id);
    batch.set(ref, { ...data, createdAt: now, updatedAt: now });
    for (const { id: itemId, ...item } of menu) {
      batch.set(ref.collection('menu').doc(itemId), item);
      totalItems++;
    }
  }

  for (const { uid, ...data } of staff) {
    batch.set(db.collection('staff').doc(uid), { ...data, createdAt: now });
  }

  await batch.commit();
  console.log(`[Seed] ✓ ${canteens.length} canteens, ${totalItems} menu items, ${staff.length} staff written.`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {
  const target = isEmulator ? 'Firestore EMULATOR' : 'REAL Firebase project';
  console.log(`[Seed] Target: ${target}`);
  console.log('[Seed] Starting...\n');

  try {
    await seedUsers();
    await seedProjects();
    await seedRequests();
    await seedCanteens();
    await seedGigs();
    await seedAuthUsers();
    console.log('\n[Seed] ✅ All done!');
  } catch (err) {
    console.error('[Seed] ❌ Failed:', err.message);
    process.exit(1);
  }

  process.exit(0);
})();
