import { useState } from 'react'
import { api, dateTimeOf, inr, useApi } from '../../lib/api'
import { useNav } from '../../lib/nav'
import { useSession } from '../../lib/session'
import { Chips, Empty, ErrorBox, Loading, ScreenHeader, StatusBadge } from '../../components/ui'
import { ContactLine } from '../connect/PersonView'
import { SampleGallery } from '../connect/GigDetail'
import GigForm from './GigForm'
import ProfileForm from '../me/ProfileForm'

/** The freelancer's own studio: their gigs and the hire requests they receive. */
export default function FreelancerDashboard() {
  const { go } = useNav()
  const { profile } = useSession()
  const [view, setView] = useState('requests')
  const [editing, setEditing] = useState(null) // null | 'new' | gig
  const [actionError, setActionError] = useState(null)
  const { data, loading, error, reload } = useApi('/freelancer/dashboard', { pollMs: 15_000 })

  const act = async (path, method, body) => {
    setActionError(null)
    try {
      await api(path, { method, body })
      await reload(true)
    } catch (err) {
      setActionError(err)
    }
  }

  const back = () => go('me', { name: 'home' })

  if (!profile) {
    return (
      <div className="screen">
        <ScreenHeader title="Freelancer studio" onBack={back} />
        <p className="notice">Create your profile first. Buyers see your name and department on every gig.</p>
        <ProfileForm />
      </div>
    )
  }

  return (
    <div className="screen">
      <ScreenHeader title="Freelancer studio" subtitle="Your gigs and hire requests" onBack={back} />
      {loading && <Loading />}
      <ErrorBox error={error || actionError} onRetry={reload} />
      {data && (
        <>
          <div className="stats">
            <div><strong>{data.stats.activeGigs}</strong><span>Active gigs</span></div>
            <div><strong>{data.stats.pendingRequests}</strong><span>New requests</span></div>
            <div><strong>{data.stats.completedJobs}</strong><span>Jobs done</span></div>
          </div>
          <Chips label="Studio section" options={[{ value: 'requests', label: 'Requests' }, { value: 'gigs', label: 'My gigs' }]} value={view} onChange={(v) => v && setView(v)} />

          {view === 'requests' && (
            <div className="stack">
              {!data.requests.length && <Empty title="No hire requests yet" text="Requests from other students appear here." />}
              {data.requests.map((r) => (
                <article key={r.id} className="card stack-sm">
                  <div className="card-row"><strong>{r.buyerName}</strong><StatusBadge status={r.status} /></div>
                  <small className="muted">{r.gigTitle} · {dateTimeOf(r.createdAt)}</small>
                  <p className="prose small">“{r.message}”</p>
                  {r.buyerContact && (
                    <div className="contact-box">
                      <span className="muted small">Contact {r.buyerName}:</span>
                      <ContactLine contact={r.buyerContact.method} />
                      {r.buyerContact.email && <a href={`mailto:${r.buyerContact.email}`}>{r.buyerContact.email}</a>}
                    </div>
                  )}
                  <div className="row">
                    {r.status === 'pending' && (
                      <>
                        <button className="btn ghost small" onClick={() => act(`/freelancer/requests/${r.id}`, 'PATCH', { status: 'declined' })}>Decline</button>
                        <button className="btn primary small" onClick={() => act(`/freelancer/requests/${r.id}`, 'PATCH', { status: 'accepted' })}>Accept</button>
                      </>
                    )}
                    {r.status === 'accepted' && (
                      <button className="btn primary small" onClick={() => act(`/freelancer/requests/${r.id}`, 'PATCH', { status: 'completed' })}>Mark job done</button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}

          {view === 'gigs' && (
            <div className="stack">
              {editing ? (
                <GigForm gig={editing === 'new' ? null : editing} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); reload(true) }} />
              ) : (
                <button className="btn primary block" onClick={() => setEditing('new')}>+ New gig</button>
              )}
              {!data.gigs.length && !editing && <Empty title="No gigs yet" text="Publish a gig with a sample of your work to start getting hired." />}
              {data.gigs.map((g) => (
                <article key={g.id} className="card stack-sm">
                  <div className="card-row"><strong>{g.title}</strong><StatusBadge status={g.status} /></div>
                  <small className="muted">{g.skill} · from {inr(g.priceFrom)} · {g.deliveryDays}-day delivery</small>
                  <SampleGallery samples={g.samples.slice(0, 2)} />
                  <div className="row">
                    <button className="btn ghost small" onClick={() => setEditing(g)}>Edit</button>
                    <button className="btn ghost small" onClick={() => act(`/freelancer/gigs/${g.id}`, 'PATCH', { status: g.status === 'active' ? 'paused' : 'active' })}>
                      {g.status === 'active' ? 'Pause' : 'Resume'}
                    </button>
                    <button className="btn ghost small danger" onClick={() => window.confirm(`Delete "${g.title}"?`) && act(`/freelancer/gigs/${g.id}`, 'DELETE')}>Delete</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
