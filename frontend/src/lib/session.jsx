import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth'
import { auth } from '../config/firebase'
import { api } from './api'

const SessionContext = createContext(null)

const AUTH_MESSAGES = {
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/email-already-in-use': 'An account with this email already exists. Sign in instead.',
  'auth/weak-password': 'Use a password with at least 6 characters.',
  'auth/network-request-failed': 'Cannot reach the sign-in service. Check your connection.',
  'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
}
export const authMessage = (err) => AUTH_MESSAGES[err?.code] || 'Could not sign you in. Try again.'

/**
 * Who is signed in and what they can do:
 *   staff   – a canteen counter account (from GET /staff/me), or null
 *   profile – the student's Connect profile (GET /users/me), or null before onboarding
 */
export function SessionProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null, staff: null, profile: null, error: null })

  const loadRoles = useCallback(async (user) => {
    const [staff, profile] = await Promise.allSettled([api('/staff/me'), api('/users/me')])
    const failed = [staff, profile].find((r) => r.status === 'rejected' && ![403, 404].includes(r.reason.status))
    setState({
      status: failed ? 'error' : 'ready',
      user,
      staff: staff.status === 'fulfilled' ? staff.value : null,
      profile: profile.status === 'fulfilled' ? profile.value : null,
      error: failed ? failed.reason : null,
    })
  }, [])

  useEffect(
    () =>
      onAuthStateChanged(auth, (user) => {
        if (!user) return setState({ status: 'signedOut', user: null, staff: null, profile: null, error: null })
        setState((s) => ({ ...s, status: 'loading' }))
        loadRoles(user)
      }),
    [loadRoles]
  )

  const value = {
    ...state,
    signIn: (email, password) => signInWithEmailAndPassword(auth, email, password),
    signUp: (email, password) => createUserWithEmailAndPassword(auth, email, password),
    signOut: () => firebaseSignOut(auth),
    retry: () => state.user && loadRoles(state.user),
    setProfile: (profile) => setState((s) => ({ ...s, profile })),
  }
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export const useSession = () => useContext(SessionContext)
