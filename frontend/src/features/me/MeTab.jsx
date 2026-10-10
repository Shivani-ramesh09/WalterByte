import { useState } from 'react'
import { Briefcase, LogOut } from 'lucide-react'
import { api, dateTimeOf, inr, useApi } from '../../lib/api'
import { useNav } from '../../lib/nav'
import { useSession } from '../../lib/session'
import { addItem, emptyCart, useCart } from '../../lib/cart'
import { Chips, Empty, ErrorBox, Loading, ScreenHeader, StatusBadge } from '../../components/ui'
import ProfileForm from './ProfileForm'
import FreelancerDashboard from '../freelancer/FreelancerDashboard'
import { ContactLine } from '../connect/PersonView'

export default function MeTab() {
  const { screen } = useNav()
  if (screen.name === 'freelancer') return <FreelancerDashboard />
  return <MeHome />
}

function MeHome() {
  const { go } = useNav()
  const { user, profile, signOut } = useSession()
  const [view, setView] = useState('orders')
  const [editing, setEditing] = useState(false)

  return (
    <div className="screen">
      <ScreenHeader
        title={profile?.name || 'Me'}
        subtitle={profile ? `${profile.department} · Year ${profile.year}` : user.email}
        action={<button className="icon-btn" onClick={signOut} aria-label="Sign out"><LogOut size={19} /></button>}
      />
      <button className="card card-button freelancer-cta" onClick={() => go('me', { name: 'freelancer' })}>
        <Briefcase size={20} />
        <div><strong>Freelancer studio</strong><small>Sell your skills with work samples, manage hire requests</small></div>
      </button>
      <Chips
        label="Me section"
        options={[{ value: 'orders', label: 'Orders' }, { value: 'hires', label: 'Hire requests' }, { value: 'connections', label: 'Connections' }, { value: 'profile', label: 'Profile' }]}
        value={view}
        onChange={(v) => v && setView(v)}
      />
      {view === 'orders' && <MyOrders />}
      {view === 'hires' && <MyHireRequests />}
      {view === 'connections' && <MyConnections />}
      {view === 'profile' && (editing
        ? <ProfileForm onDone={() => setEditing(false)} onCancel={() => setEditing(false)} />
        : <ProfileSummary onEdit={() => setEditing(true)} />)}
    </div>
  )
}

function ProfileSummary({ onEdit }) {
  const { profile } = useSession()
  return (
    <section className="card stack-sm">
      <p className="prose">{profile.bio || 'No bio yet.'}</p>
      <div className="tag-row">{(profile.skills || []).map((s) => <span key={s} className="tag">{s}</span>)}</div>
      <div className="card-row"><span className="muted">Contact</span><ContactLine contact={profile.contactMethod} /></div>
      <div className="card-row"><span className="muted">Profile visible</span><span>{profile.privacy?.profileVisible ? 'Yes' : 'No'}</span></div>
      <div className="card-row"><span className="muted">Contact public</span><span>{profile.privacy?.showContact ? 'Yes' : 'Connections only'}</span></div>
      <button className="btn ghost" onClick={onEdit}>Edit profile</button>
    </section>
  )
}

function MyOrders() {
  const { go } = useNav()
  const { setCart } = useCart()
  const { data, loading, error, reload } = useApi('/orders/mine')

  // Reorder: refill the cart; the menu screen drops anything since sold out
  const reorder = (order) => {
    const canteen = { id: order.canteenId, name: order.canteenName }
    let cart = emptyCart
    for (const i of order.items) {
      for (let n = 0; n < i.quantity; n++) cart = addItem(cart, canteen, { id: i.itemId, name: i.name, price: i.price })
    }
    setCart(cart)
    go('eat', { name: 'menu', canteenId: order.canteenId })
  }

  return (
    <div className="stack">
      {loading && <Loading />}
      <ErrorBox error={error} onRetry={reload} />
      {data && !data.orders.length && <Empty title="No orders yet" action={<button className="btn primary" onClick={() => go('eat', { name: 'list' })}>Order food</button>} />}
      {data?.orders.map((o) => (
        <article key={o.id} className="card stack-sm">
          <div className="card-row"><strong>{o.canteenName}</strong><StatusBadge status={o.status} /></div>
          <small className="muted">{dateTimeOf(o.createdAt)} · {o.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}</small>
          <div className="card-row">
            <strong>{inr(o.total)}</strong>
            <div className="row">
              <button className="btn ghost small" onClick={() => go('eat', { name: 'order', orderId: o.id })}>Track</button>
              <button className="btn primary small" onClick={() => reorder(o)}>Reorder</button>
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}

function MyHireRequests() {
  const { data, loading, error, reload } = useApi('/gig-requests/mine')
  return (
    <div className="stack">
      {loading && <Loading />}
      <ErrorBox error={error} onRetry={reload} />
      {data && !data.requests.length && <Empty title="No hire requests sent" text="Find a gig in Connect → Hire talent." />}
      {data?.requests.map((r) => (
        <article key={r.id} className="card stack-sm">
          <div className="card-row"><strong>{r.gigTitle}</strong><StatusBadge status={r.status} /></div>
          <small className="muted">{r.sellerName} · {dateTimeOf(r.createdAt)}</small>
          {r.sellerContact ? (
            <div className="contact-box">
              <span className="muted small">Contact {r.sellerName}:</span>
              <ContactLine contact={r.sellerContact.method} />
              {r.sellerContact.email && <a href={`mailto:${r.sellerContact.email}`}>{r.sellerContact.email}</a>}
            </div>
          ) : r.status === 'pending' && <small className="muted">Contact is shared once {r.sellerName} accepts.</small>}
        </article>
      ))}
    </div>
  )
}

function MyConnections() {
  const { go } = useNav()
  const { data, loading, error, reload } = useApi('/connections')
  const [actionError, setActionError] = useState(null)
  const respond = async (id, status) => {
    setActionError(null)
    try {
      await api(`/connections/${id}`, { method: 'PATCH', body: { status } })
      await reload(true)
    } catch (err) {
      setActionError(err)
    }
  }
  return (
    <div className="stack">
      {loading && <Loading />}
      <ErrorBox error={error || actionError} onRetry={reload} />
      {data && !data.connections.length && <Empty title="No connections yet" text="Connect with people from their profile." />}
      {data?.connections.map((c) => (
        <article key={c.id} className="card stack-sm">
          <div className="card-row">
            <button className="link-btn" onClick={() => go('connect', { name: 'person', uid: c.peer.uid })}>{c.peer.name || 'Student'}</button>
            <StatusBadge status={c.status} />
          </div>
          <small className="muted">{c.direction === 'received' ? 'Wants to connect with you' : 'You sent a request'}</small>
          {c.direction === 'received' && c.status === 'pending' && (
            <div className="row">
              <button className="btn ghost small" onClick={() => respond(c.id, 'declined')}>Decline</button>
              <button className="btn primary small" onClick={() => respond(c.id, 'accepted')}>Accept</button>
            </div>
          )}
        </article>
      ))}
    </div>
  )
}
