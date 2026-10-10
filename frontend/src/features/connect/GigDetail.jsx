import { useState } from 'react'
import { ExternalLink, PlayCircle } from 'lucide-react'
import { api, inr, useApi } from '../../lib/api'
import { useNav } from '../../lib/nav'
import { useSession } from '../../lib/session'
import { ErrorBox, Loading, ScreenHeader } from '../../components/ui'

export function SampleGallery({ samples }) {
  return (
    <div className="samples">
      {samples.map((s, i) =>
        s.type === 'image' ? (
          <figure key={i}>
            <img src={s.url} alt={s.caption || `Work sample ${i + 1}`} loading="lazy" />
            {s.caption && <figcaption>{s.caption}</figcaption>}
          </figure>
        ) : (
          <a key={i} className="sample-link" href={s.url} target="_blank" rel="noopener noreferrer">
            {s.type === 'video' ? <PlayCircle size={18} /> : <ExternalLink size={18} />}
            <span>{s.caption || (s.type === 'video' ? 'Watch video sample' : 'Open portfolio link')}</span>
          </a>
        )
      )}
    </div>
  )
}

export default function GigDetail({ gigId }) {
  const { go } = useNav()
  const { user } = useSession()
  const { data: gig, loading, error, reload } = useApi(`/gigs/${gigId}`)
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sendError, setSendError] = useState(null)

  const hire = async (e) => {
    e.preventDefault()
    setBusy(true)
    setSendError(null)
    try {
      await api(`/gigs/${gigId}/requests`, { method: 'POST', body: { message: message.trim() } })
      setSent(true)
    } catch (err) {
      setSendError(err)
    }
    setBusy(false)
  }

  return (
    <div className="screen">
      <ScreenHeader title="Gig" onBack={() => go('connect', { name: 'home' })} />
      {loading && <Loading />}
      <ErrorBox error={error} onRetry={reload} />
      {gig && (
        <>
          <small className="eyebrow-text">{gig.skill}</small>
          <h2 className="gig-title">{gig.title}</h2>
          <button className="link-btn" onClick={() => go('connect', { name: 'person', uid: gig.sellerId })}>
            by {gig.sellerName} · {gig.sellerDepartment}
          </button>
          <div className="card-row gig-facts">
            <span>From <strong>{inr(gig.priceFrom)}</strong></span>
            <span>{gig.deliveryDays}-day delivery</span>
          </div>
          <h3>Work samples</h3>
          <SampleGallery samples={gig.samples} />
          <h3>About this gig</h3>
          <p className="prose">{gig.description}</p>

          {gig.sellerId === user.uid ? (
            <p className="notice">This is your gig. Manage it in your freelancer studio.</p>
          ) : sent ? (
            <p className="success-box" role="status">Request sent. You'll see {gig.sellerName}'s contact in Me → Hire requests once they accept.</p>
          ) : (
            <form className="card stack-sm" onSubmit={hire}>
              <h3>Request to hire</h3>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={1000} required placeholder="What do you need, and by when?" aria-label="Message to the freelancer" />
              <ErrorBox error={sendError} />
              <button className="btn primary" disabled={busy || !message.trim()}>{busy ? 'Sending…' : 'Send request'}</button>
              <small className="muted">Contact details are shared only after the freelancer accepts.</small>
            </form>
          )}
        </>
      )}
    </div>
  )
}
