import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { api, dateTimeOf, inr, timeOf, useApi } from '../../lib/api'
import { useSession } from '../../lib/session'
import { Chips, Empty, ErrorBox, Field, Loading, StatusBadge, VegMark } from '../../components/ui'

const NEXT = { placed: 'preparing', preparing: 'ready', ready: 'collected' }
const ACTION = { placed: 'Start preparing', preparing: 'Mark ready', ready: 'Mark collected' }

/** Separate canteen-counter app shown to staff accounts instead of the student app. */
export default function StaffDashboard() {
  const { staff, signOut } = useSession()
  const [view, setView] = useState('orders')
  return (
    <div className="screen staff">
      <header className="staff-header">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> COUNTER DASHBOARD</div>
          <h2>{staff.name || 'Canteen staff'}</h2>
        </div>
        <button className="icon-btn" onClick={signOut} aria-label="Sign out"><LogOut size={19} /></button>
      </header>
      <Chips label="Dashboard section" options={[{ value: 'orders', label: 'Orders' }, { value: 'history', label: 'Collected' }, { value: 'menu', label: 'Menu & stock' }]} value={view} onChange={(v) => v && setView(v)} />
      {view === 'menu' ? <StaffMenu canteenId={staff.canteenId} /> : <StaffOrders history={view === 'history'} />}
    </div>
  )
}

function StaffOrders({ history }) {
  const { data, loading, error, reload } = useApi(history ? '/staff/orders?status=collected' : '/staff/orders', { pollMs: 5000 })
  const [busyId, setBusyId] = useState(null)
  const [actionError, setActionError] = useState(null)

  const advance = async (order) => {
    setBusyId(order.id)
    setActionError(null)
    try {
      await api(`/staff/orders/${order.id}`, { method: 'PATCH', body: { status: NEXT[order.status] } })
      await reload(true)
    } catch (err) {
      setActionError(err)
    }
    setBusyId(null)
  }

  return (
    <div className="stack">
      {loading && <Loading label="Loading orders…" />}
      <ErrorBox error={error || actionError} onRetry={reload} />
      {data && !data.orders.length && <Empty title={history ? 'No collected orders yet' : 'No orders in the queue'} text={history ? null : 'New orders show up here automatically.'} />}
      {data?.orders.map((o) => (
        <article key={o.id} className="card stack-sm">
          <div className="card-row">
            <strong>{o.customerName || 'Student'} · {o.paymentReference}</strong>
            <StatusBadge status={o.status} />
          </div>
          <div className="card-row small muted">
            <span>Pickup {dateTimeOf(o.pickupSlot.start)}–{timeOf(o.pickupSlot.end)}</span>
            <span>Ordered {dateTimeOf(o.createdAt)}</span>
          </div>
          <ul className="plain">
            {o.items.map((i) => <li key={i.itemId}><strong>{i.quantity} ×</strong> {i.name}</li>)}
          </ul>
          <div className="card-row">
            <span className="badge badge-open">{o.paymentStatus === 'paid' ? `Paid ${inr(o.total)} (demo UPI)` : 'Unpaid'}</span>
            {NEXT[o.status] && (
              <button className="btn primary small" disabled={busyId === o.id} onClick={() => advance(o)}>
                {busyId === o.id ? 'Updating…' : ACTION[o.status]}
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  )
}

function StaffMenu({ canteenId }) {
  const { data, loading, error, reload } = useApi(`/canteens/${canteenId}/menu`)
  const [actionError, setActionError] = useState(null)
  const [adding, setAdding] = useState(false)

  const update = async (itemId, body) => {
    setActionError(null)
    try {
      await api(`/staff/menu/${itemId}`, { method: 'PATCH', body })
      await reload(true)
    } catch (err) {
      setActionError(err)
    }
  }

  const add = async (event) => {
    event.preventDefault()
    const f = new FormData(event.currentTarget)
    setActionError(null)
    try {
      await api('/staff/menu', {
        method: 'POST',
        body: { name: f.get('name').trim(), category: f.get('category').trim(), price: Number(f.get('price')), isVeg: f.get('isVeg') === 'on' },
      })
      setAdding(false)
      await reload(true)
    } catch (err) {
      setActionError(err)
    }
  }

  return (
    <div className="stack">
      {loading && <Loading label="Loading menu…" />}
      <ErrorBox error={error || actionError} onRetry={reload} />
      {adding ? (
        <form className="card stack-sm" onSubmit={add}>
          <h3>New item</h3>
          <Field label="Name"><input name="name" required maxLength={80} /></Field>
          <div className="row">
            <Field label="Category"><input name="category" required maxLength={40} placeholder="e.g. Snacks" /></Field>
            <Field label="Price (₹)"><input name="price" type="number" min={1} max={5000} required /></Field>
          </div>
          <label className="check"><input type="checkbox" name="isVeg" defaultChecked /> Vegetarian</label>
          <div className="row">
            <button type="button" className="btn ghost" onClick={() => setAdding(false)}>Cancel</button>
            <button className="btn primary">Add item</button>
          </div>
        </form>
      ) : (
        <button className="btn primary block" onClick={() => setAdding(true)}>+ Add menu item</button>
      )}
      {data?.categories.map((cat) => (
        <section key={cat.name} className="menu-section">
          <h3>{cat.name}</h3>
          {cat.items.map((item) => (
            <div key={item.id} className={item.isAvailable ? 'menu-item' : 'menu-item sold-out'}>
              <VegMark isVeg={item.isVeg} />
              <div className="menu-item-text">
                <strong>{item.name}</strong>
                <PriceEditor price={item.price} onSave={(price) => update(item.id, { price })} />
              </div>
              <button className={item.isAvailable ? 'btn small ghost' : 'btn small primary'} onClick={() => update(item.id, { isAvailable: !item.isAvailable })}>
                {item.isAvailable ? 'Mark sold out' : 'Back in stock'}
              </button>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}

function PriceEditor({ price, onSave }) {
  const [editing, setEditing] = useState(false)
  if (!editing) return <button className="link-btn" onClick={() => setEditing(true)} aria-label={`Edit price, now ${inr(price)}`}>{inr(price)} · edit</button>
  return (
    <form className="row" onSubmit={(e) => { e.preventDefault(); onSave(Number(new FormData(e.currentTarget).get('price'))); setEditing(false) }}>
      <input name="price" type="number" min={1} max={5000} defaultValue={price} aria-label="New price in rupees" className="input-small" autoFocus />
      <button className="btn small primary">Save</button>
    </form>
  )
}
