// frontend/src/ConnectPage.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { ArrowLeft, Search, UserPlus, Check, X, Loader2, Users, Zap, ChevronDown, ChevronUp, MessageCircle } from 'lucide-react'
import * as api from './api.js'

// ── Tabs ──────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'discover', label: 'Discover', icon: Search },
  { id: 'connections', label: 'My Network', icon: Users },
]

export default function ConnectPage({ onBack }) {
  const [activeTab, setActiveTab] = useState('discover')

  return (
    <section className="connect-page">
      <header className="connect-topbar">
        <button className="connect-back" onClick={onBack} aria-label="Back to home">
          <ArrowLeft size={20} />
        </button>
        <h2 className="connect-title">Connect</h2>
        <div style={{ width: 36 }} />
      </header>

      <nav className="connect-tabs">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`connect-tab${activeTab === id ? ' active' : ''}`}
            onClick={() => setActiveTab(id)}
          >
            <Icon size={15} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {activeTab === 'discover' && <DiscoverTab />}
      {activeTab === 'connections' && <ConnectionsTab />}
    </section>
  )
}

// ── Discover Tab ──────────────────────────────────────────────────────────────
function DiscoverTab() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [sentRequests, setSentRequests] = useState(new Set())
  const [skillSuggestions, setSkillSuggestions] = useState([])
  const [selectedSkill, setSelectedSkill] = useState(null)
  const debounceRef = useRef(null)

  // Load initial suggestions and results
  useEffect(() => {
    loadSkills()
    doSearch('', null)
  }, [])

  async function loadSkills() {
    try {
      const data = await api.suggestSkills()
      setSkillSuggestions(data?.suggestions || [])
    } catch { /* ignore */ }
  }

  const doSearch = useCallback(async (q, skill) => {
    setLoading(true)
    setError(null)
    try {
      const params = {}
      if (q.trim()) params.q = q.trim()
      if (skill) params.skills = skill
      params.limit = '20'
      const data = await api.searchUsers(params)
      setResults(data?.results || [])
    } catch (err) {
      setError(err.message)
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  function handleQueryChange(e) {
    const val = e.target.value
    setQuery(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(val, selectedSkill), 350)
  }

  function handleSkillClick(skill) {
    const next = selectedSkill === skill ? null : skill
    setSelectedSkill(next)
    doSearch(query, next)
  }

  async function handleConnect(uid) {
    try {
      await api.sendConnectionRequest(uid)
      setSentRequests(prev => new Set([...prev, uid]))
    } catch (err) {
      alert(err.message)
    }
  }

  return (
    <div className="connect-body">
      {/* Search bar */}
      <div className="connect-search-wrap">
        <Search size={16} className="connect-search-icon" />
        <input
          type="text"
          className="connect-search"
          placeholder="Search by name, skill, or interest…"
          value={query}
          onChange={handleQueryChange}
        />
      </div>

      {/* Skill filter chips */}
      {skillSuggestions.length > 0 && (
        <div className="connect-skill-chips">
          {skillSuggestions.slice(0, 8).map(skill => (
            <button
              key={skill}
              className={`connect-chip${selectedSkill === skill ? ' active' : ''}`}
              onClick={() => handleSkillClick(skill)}
            >
              {skill}
            </button>
          ))}
        </div>
      )}

      {/* Results */}
      {loading && (
        <div className="connect-loading">
          <Loader2 size={22} className="spin" />
          <span>Searching campus…</span>
        </div>
      )}

      {error && <div className="connect-error">{error}</div>}

      {!loading && !error && results.length === 0 && (
        <div className="connect-empty">
          <Users size={36} />
          <p>No people found. Try a different search or filter.</p>
        </div>
      )}

      <div className="connect-results">
        {results.map(user => (
          <PersonCard
            key={user.uid}
            user={user}
            sent={sentRequests.has(user.uid)}
            onConnect={() => handleConnect(user.uid)}
          />
        ))}
      </div>
    </div>
  )
}

// ── Person Card ───────────────────────────────────────────────────────────────
function PersonCard({ user, sent, onConnect }) {
  const initials = (user.name || '?')
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const availability = {
    available: { label: 'Available', cls: 'avail-green' },
    busy: { label: 'Busy', cls: 'avail-red' },
    open_to_projects: { label: 'Open to Projects', cls: 'avail-blue' },
  }[user.availability] || { label: user.availability, cls: '' }

  return (
    <div className="person-card">
      <div className="person-avatar">{initials}</div>
      <div className="person-info">
        <strong className="person-name">{user.name}</strong>
        <span className="person-dept">{user.department}{user.year ? ` · Year ${user.year}` : ''}</span>
        {user.bio && <p className="person-bio">{user.bio}</p>}
        {user.skills?.length > 0 && (
          <div className="person-skills">
            {user.skills.map(s => <span key={s} className="person-skill-tag">{s}</span>)}
          </div>
        )}
        <span className={`person-avail ${availability.cls}`}>{availability.label}</span>
      </div>
      <button
        className={`connect-btn${sent ? ' sent' : ''}`}
        onClick={onConnect}
        disabled={sent}
        aria-label={sent ? 'Request sent' : `Connect with ${user.name}`}
      >
        {sent ? <><Check size={14} /><span>Sent</span></> : <><UserPlus size={14} /><span>Connect</span></>}
      </button>
    </div>
  )
}

// ── Connections Tab ───────────────────────────────────────────────────────────
function ConnectionsTab() {
  const [connections, setConnections] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all') // 'all' | 'pending' | 'accepted'

  useEffect(() => { loadConnections() }, [])

  async function loadConnections() {
    setLoading(true)
    try {
      const data = await api.getMyConnections()
      setConnections(data?.connections || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleRespond(id, status) {
    try {
      await api.updateConnection(id, status)
      // Update local state
      setConnections(prev =>
        prev.map(c => c.id === id ? { ...c, status } : c)
      )
    } catch (err) {
      alert(err.message)
    }
  }

  const filtered = connections.filter(c => {
    if (filter === 'pending') return c.status === 'pending'
    if (filter === 'accepted') return c.status === 'accepted'
    return true
  })

  const pendingCount = connections.filter(c => c.status === 'pending' && c.direction === 'received').length

  return (
    <div className="connect-body">
      {/* Sub-filter */}
      <div className="connect-sub-filters">
        {['all', 'pending', 'accepted'].map(f => (
          <button
            key={f}
            className={`sub-filter${filter === f ? ' active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : f === 'pending' ? `Pending${pendingCount ? ` (${pendingCount})` : ''}` : 'Connected'}
          </button>
        ))}
      </div>

      {loading && (
        <div className="connect-loading">
          <Loader2 size={22} className="spin" />
          <span>Loading your network…</span>
        </div>
      )}

      {error && <div className="connect-error">{error}</div>}

      {!loading && !error && filtered.length === 0 && (
        <div className="connect-empty">
          <Zap size={36} />
          <p>{filter === 'pending' ? 'No pending requests.' : filter === 'accepted' ? 'No connections yet.' : 'Your network is empty. Discover people to connect with!'}</p>
        </div>
      )}

      <div className="connect-results">
        {filtered.map(conn => (
          <ConnectionCard
            key={conn.id}
            conn={conn}
            onAccept={() => handleRespond(conn.id, 'accepted')}
            onDecline={() => handleRespond(conn.id, 'declined')}
          />
        ))}
      </div>
    </div>
  )
}

// ── Connection Card ───────────────────────────────────────────────────────────
function ConnectionCard({ conn, onAccept, onDecline }) {
  const peer = conn.peer || {}
  const initials = (peer.name || '?')
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const isPendingIncoming = conn.status === 'pending' && conn.direction === 'received'
  const isPendingOutgoing = conn.status === 'pending' && conn.direction === 'sent'

  return (
    <div className={`person-card${conn.status === 'accepted' ? ' connected' : ''}`}>
      <div className={`person-avatar${conn.status === 'accepted' ? ' avatar-connected' : ''}`}>
        {initials}
      </div>
      <div className="person-info">
        <strong className="person-name">{peer.name || peer.uid}</strong>
        {peer.department && <span className="person-dept">{peer.department}</span>}
        <span className={`conn-status status-${conn.status}`}>
          {conn.status === 'accepted' && '✓ Connected'}
          {conn.status === 'declined' && '✗ Declined'}
          {isPendingOutgoing && '⏳ Pending'}
          {isPendingIncoming && '📩 Wants to connect'}
        </span>
      </div>
      {isPendingIncoming && (
        <div className="conn-actions">
          <button className="conn-accept" onClick={onAccept} aria-label="Accept">
            <Check size={16} />
          </button>
          <button className="conn-decline" onClick={onDecline} aria-label="Decline">
            <X size={16} />
          </button>
        </div>
      )}
      {conn.status === 'accepted' && (
        <div className="conn-connected-badge">
          <MessageCircle size={16} />
        </div>
      )}
    </div>
  )
}
