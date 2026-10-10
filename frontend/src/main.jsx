import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowRight, Menu, X } from 'lucide-react'
import ConnectPage from './ConnectPage.jsx'
import './style.css'

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [currentView, setCurrentView] = useState('home') // 'home' | 'connect'
  const [username, setUsername] = useState('')

  function handleLogin(event) {
    event.preventDefault()
    const uid = event.target.username.value || 'dev-user-1'
    localStorage.setItem('devUid', uid)
    setUsername(uid)
    setIsLoggedIn(true)
  }

  function handleBubbleClick(label) {
    if (label === 'Connect') {
      setCurrentView('connect')
    }
  }

  // ── Connect page ──────────────────────────────────────────────────────────
  if (isLoggedIn && currentView === 'connect') {
    return (
      <main className="device">
        <ConnectPage onBack={() => setCurrentView('home')} />
      </main>
    )
  }

  // ── Main app ──────────────────────────────────────────────────────────────
  return (
    <main className="device">
      <header className="topbar">
        {!isLoggedIn && <a className="brand" href="#home" aria-label="Amrita campus home">
          <span className="brand-mark">A</span>
          <span className="brand-copy"><strong>AMRITA</strong><small>VISHWA VIDYAPEETHAM</small></span>
        </a>}
        {isLoggedIn && <button className="menu-button" aria-label={menuOpen ? 'Close menu' : 'Open menu'} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={25} /> : <Menu size={29} />}</button>}
      </header>

      {!isLoggedIn ? (
        <section className="login-page" aria-labelledby="login-title">
          <div className="eyebrow"><span className="eyebrow-line" /> COIMBATORE CAMPUS</div>
          <h1 id="login-title">Welcome<br /><em>back.</em></h1>
          <p className="intro">Sign in with your Amrita account<br />to find your way around campus.</p>
          <div className="login-art"><img src="/campus-hero.jpg.jpeg" alt="Illustrated view of the Amrita Coimbatore campus" /></div>
          <form className="login-form" onSubmit={handleLogin}>
            <label htmlFor="username">Username</label>
            <input id="username" name="username" type="text" autoComplete="username" placeholder="Enter your username" required />
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" autoComplete="current-password" placeholder="Enter your password" required />
            <button className="login-submit" type="submit"><span>Sign in</span><ArrowRight size={18} /></button>
          </form>
          <div className="login-note"><span className="footer-dot" /> FOR THE AMRITA COMMUNITY</div>
        </section>
      ) : <>
        {menuOpen && <nav className="hero-menu"><a href="#discover" onClick={() => setMenuOpen(false)}>Discover</a><a href="#" onClick={(e) => { e.preventDefault(); setMenuOpen(false); setCurrentView('connect') }}>Connect</a><a href="#campus" onClick={() => setMenuOpen(false)}>Campus</a></nav>}
        <section className="network-hero" id="home">
          <div className="network-kicker">PEOPLE <i>/</i> SKILLS <i>/</i> PROJECTS <i>/</i> OPPORTUNITIES</div>
          <h1>The campus<br />network for<br /><em>ideas and people.</em></h1>
          <p className="network-intro">Discover skills, find collaborators, join projects and connect with the amazing talent across Amrita Vishwa Vidyapeetham.</p>
          <div className="hero-bubbles" aria-label="Campus destinations">
            <button type="button">Campus Map</button>
            <button type="button">Canteen</button>
            <button type="button" onClick={() => handleBubbleClick('Connect')}>Connect</button>
          </div>
          <div className="network-stats" id="people"><div><strong>3K+</strong><span>AMRITA STUDENTS</span></div><div><strong>300+</strong><span>SKILLS</span></div><div><strong>200+</strong><span>PROJECTS</span></div></div>
        </section>
        <section className="campus-photo" id="campus" aria-label="Amrita Coimbatore campus"><img src="/campus-hero.jpg.jpeg" alt="Amrita Vishwa Vidyapeetham campus in Coimbatore" /></section>
        <footer><span className="footer-dot" /> MADE FOR THE AMRITA COMMUNITY <span>COIMBATORE, INDIA</span></footer>
      </>}
    </main>
  )
}

createRoot(document.getElementById('root')).render(<App />)
