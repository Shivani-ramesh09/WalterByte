import { useCallback, useEffect, useState } from 'react'
import { auth } from '../config/firebase'

const BASE = import.meta.env.VITE_API_BASE || '/api/v1'
const TIMEOUT_MS = 10_000

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

/** Turn the backend's { error: { code, message, details } } into one readable line. */
export function errorMessage(body) {
  const err = body?.error
  if (!err) return 'Something went wrong. Try again.'
  if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details) && err.details[0]) {
    const issue = err.details[0]
    return issue.path?.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message
  }
  return err.message || 'Something went wrong. Try again.'
}

export async function api(path, { method = 'GET', body } = {}) {
  const token = await auth.currentUser?.getIdToken()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    })
    if (res.status === 204) return null
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new ApiError(res.status, data.error?.code, errorMessage(data), data.error?.details)
    return data
  } catch (err) {
    if (err instanceof ApiError) throw err
    if (err.name === 'AbortError') throw new ApiError(0, 'TIMEOUT', 'This is taking too long. Check your connection and try again.')
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection and try again.')
  } finally {
    clearTimeout(timer)
  }
}

/** GET a path on mount and whenever it changes. Pass null to skip. */
export function useApi(path, { pollMs } = {}) {
  const [state, setState] = useState({ data: null, loading: Boolean(path), error: null })

  const load = useCallback(
    async (quiet = false) => {
      if (!path) return
      // Clear old data so a stale result (e.g. the previous day's slots) is never clickable
      if (!quiet) setState({ data: null, loading: true, error: null })
      try {
        const data = await api(path)
        setState({ data, loading: false, error: null })
      } catch (error) {
        // A failed background poll keeps showing the last good data
        setState((s) => ({ data: quiet ? s.data : null, loading: false, error }))
      }
    },
    [path]
  )

  useEffect(() => {
    load()
    if (!pollMs) return undefined
    const id = setInterval(() => load(true), pollMs)
    return () => clearInterval(id)
  }, [load, pollMs])

  return { ...state, reload: load }
}

export const inr = (amount) => `₹${Number(amount).toLocaleString('en-IN')}`

export const timeOf = (iso) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })

export const dateTimeOf = (iso) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })
