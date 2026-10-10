import { useState } from 'react'
import { api, useApi } from '../../lib/api'
import { useNav } from '../../lib/nav'
import { useSession } from '../../lib/session'
import { ErrorBox, Loading, ScreenHeader } from '../../components/ui'
import { GigCard } from './ConnectTab'

export function ContactLine({ contact }) {
  if (!contact?.value || contact.type === 'none') return null
  const href = contact.type === 'whatsapp'
    ? `https://wa.me/${contact.value.replace(/\D/g, '')}`
    : contact.type === 'email' ? `mailto:${contact.value}`
      : contact.type === 'instagram' ? `https://instagram.com/${contact.value.replace(/^@/, '')}` : null
  return href
    ? <a className="contact-link" href={href} target="_blank" rel="noopener noreferrer">{contact.type}: {contact.value}</a>
    : <span>{contact.type}: {contact.value}</span>
}

export default function PersonView({ uid }) {
  const { go } = useNav()
  const { user } = useSession()
  const { data: person, loading, error, reload } = useApi(`/users/${uid}`)
  const gigs = useApi('/gigs')
  const [connectState, setConnectState] = useState(null)

  const connect = async () => {
    try {
      await api('/connections', { method: 'POST', body: { toUid: uid } })
      setConnectState({ ok: 'Connection request sent.' })
    } catch (err) {
      setConnectState({ error: err })
    }
  }

  const theirGigs = gigs.data?.gigs.filter((g) => g.sellerId === uid) || []

  return (
    <div className="screen">
      <ScreenHeader title={person?.name || 'Profile'} subtitle={person && `${person.department} · Year ${person.year}`} onBack={() => go('connect', { name: 'home' })} />
      {loading && <Loading />}
      <ErrorBox error={error} onRetry={reload} />
      {person && (
        <>
          <p className="prose">{person.bio}</p>
          <div className="tag-row">{(person.skills || []).map((s) => <span key={s} className="tag">{s}</span>)}</div>
          <section className="card stack-sm">
            <div className="card-row"><span className="muted">Availability</span><span>{(person.availability || '').replace(/_/g, ' ')}</span></div>
            {person.contactMethod?.value
              ? <div className="card-row"><span className="muted">Contact</span><ContactLine contact={person.contactMethod} /></div>
              : <small className="muted">Contact details are shared once you connect.</small>}
            {Object.entries(person.links || {}).filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="card-row"><span className="muted">{k}</span><a href={v.startsWith('http') ? v : `https://instagram.com/${v.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer">{v}</a></div>
            ))}
          </section>
          {uid !== user.uid && (
            <>
              <button className="btn primary block" onClick={connect} disabled={Boolean(connectState?.ok)}>Connect</button>
              {connectState?.ok && <p className="success-box" role="status">{connectState.ok}</p>}
              <ErrorBox error={connectState?.error} />
            </>
          )}
          {theirGigs.length > 0 && <h3>Gigs by {person.name}</h3>}
          {theirGigs.map((g) => <GigCard key={g.id} gig={g} />)}
        </>
      )}
    </div>
  )
}
