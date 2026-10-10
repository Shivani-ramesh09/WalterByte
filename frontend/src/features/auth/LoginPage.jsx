import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { authMessage, useSession } from '../../lib/session'
import { DEMO_MODE } from '../../config/firebase'

// Seeded by scripts/seedEmulator.js (emulator only, password campus123)
const DEMO_PASSWORD = 'campus123'
const DEMO_ACCOUNTS = [
  { role: 'Student', who: 'Rohan Sharma', shows: 'order food, explore events, hire a freelancer', email: 'rohan.sharma@campus.edu' },
  { role: 'Student freelancer', who: 'Meera Pillai', shows: 'photography gigs and hire requests', email: 'meera.pillai@campus.edu' },
  { role: 'Canteen staff', who: 'Sopanam counter', shows: 'live order queue and menu stock', email: 'staff-sopanam@campus.edu' },
]

export default function LoginPage() {
  const { signIn, signUp } = useSession()
  const [mode, setMode] = useState('signin')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError(null)
    try {
      await (mode === 'signin' ? signIn : signUp)(form.get('email'), form.get('password'))
    } catch (err) {
      setError(authMessage(err))
      setBusy(false)
    }
  }

  const demoSignIn = async (email) => {
    setBusy(true)
    setError(null)
    try {
      await signIn(email, DEMO_PASSWORD)
    } catch (err) {
      setError(`${authMessage(err)} Did you run the seed script?`)
      setBusy(false)
    }
  }

  return (
    <section className="login-page" aria-labelledby="login-title">
      <div className="eyebrow"><span className="eyebrow-line" /> COIMBATORE CAMPUS</div>
      <h1 id="login-title">{mode === 'signin' ? <>Welcome<br /><em>back.</em></> : <>Join<br /><em>campus.</em></>}</h1>
      <p className="intro">{mode === 'signin' ? 'Sign in with your campus account.' : 'Create your campus account.'}<br />Students, freelancers and canteen staff all sign in here.</p>
      <div className="login-art"><img src="/campus-hero.jpg.jpeg" alt="Illustrated view of the Amrita Coimbatore campus" /></div>
      <form className="login-form" onSubmit={submit}>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" placeholder="you@campus.edu" required />
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} placeholder="At least 6 characters" minLength={6} required />
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="login-submit" type="submit" disabled={busy}>
          <span>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}</span><ArrowRight size={18} />
        </button>
      </form>
      <button className="link-btn login-switch" type="button" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null) }}>
        {mode === 'signin' ? 'New here? Create an account' : 'Already have an account? Sign in'}
      </button>
      {DEMO_MODE && (
        <section className="demo-accounts" aria-labelledby="demo-title">
          <h2 id="demo-title">Start the demo <span className="badge badge-demo">Sample data</span></h2>
          <p className="muted small">One tap signs you in to a seeded account. Each shows a different role.</p>
          {DEMO_ACCOUNTS.map((a) => (
            <button key={a.email} type="button" className="card card-button demo-account" disabled={busy} onClick={() => demoSignIn(a.email)}>
              <strong>{a.role}</strong>
              <small className="muted">{a.who} · {a.shows}</small>
            </button>
          ))}
        </section>
      )}
      <div className="login-note"><span className="footer-dot" /> FOR THE AMRITA COMMUNITY</div>
    </section>
  )
}
