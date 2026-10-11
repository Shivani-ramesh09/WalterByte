import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator } from 'firebase/auth'

const env = import.meta.env

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY || 'demo-key',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'demo-genesis',
})

export const auth = getAuth(app)

// Local dev signs in against the Auth emulator unless explicitly turned off
if (env.VITE_USE_AUTH_EMULATOR !== 'false') {
  // Same origin, proxied to the emulator by vite.config.js, so forwarded/tunnelled URLs work from other devices
  connectAuthEmulator(auth, globalThis.location?.origin ?? 'http://127.0.0.1:9099', { disableWarnings: true })
}

/** Demo mode = local emulators with seeded sample data and demo logins. */
export const DEMO_MODE = env.VITE_USE_AUTH_EMULATOR !== 'false'
