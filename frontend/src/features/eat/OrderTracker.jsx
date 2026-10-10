import { CheckCircle2, MapPin } from 'lucide-react'
import { dateTimeOf, inr, timeOf, useApi } from '../../lib/api'
import { useNav } from '../../lib/nav'
import { ErrorBox, Loading, ScreenHeader } from '../../components/ui'

const STEPS = ['placed', 'preparing', 'ready', 'collected']
const LABELS = { placed: 'Placed', preparing: 'Preparing', ready: 'Ready', collected: 'Collected' }

export default function OrderTracker({ orderId, justPlaced }) {
  const { go } = useNav()
  // Poll until collected so staff updates show up without a refresh
  const { data: order, loading, error, reload } = useApi(`/orders/${orderId}`, { pollMs: 5000 })
  const current = order ? STEPS.indexOf(order.status) : -1

  return (
    <div className="screen">
      <ScreenHeader title="Your order" subtitle={order?.canteenName} onBack={() => go('eat', { name: 'list' })} />
      {justPlaced && order && (
        <div className="success-box" role="status">
          <CheckCircle2 size={20} /> Order placed. Demo payment {order.paymentReference} marked paid.
        </div>
      )}
      {loading && <Loading label="Loading order…" />}
      <ErrorBox error={error} onRetry={reload} />
      {order && (
        <>
          <ol className="tracker" aria-label="Order progress">
            {STEPS.map((s, i) => (
              <li key={s} className={i <= current ? 'done' : ''} aria-current={i === current ? 'step' : undefined}>
                <span className="tracker-dot" />
                {LABELS[s]}
                {order[s === 'placed' ? 'createdAt' : `${s}At`] && <small>{timeOf(order[s === 'placed' ? 'createdAt' : `${s}At`])}</small>}
              </li>
            ))}
          </ol>
          {order.status === 'ready' && <p className="notice">Ready for pickup. Show order {order.paymentReference} at the counter.</p>}

          <section className="card stack-sm">
            <div className="card-row"><span className="muted">Pickup slot</span><strong>{dateTimeOf(order.pickupSlot.start)}–{timeOf(order.pickupSlot.end)}</strong></div>
            <div className="card-row"><span className="muted">Ordered</span><span>{dateTimeOf(order.createdAt)}</span></div>
            <div className="card-row"><span className="muted">Payment</span><span>UPI (demo) · {order.paymentStatus}</span></div>
            <hr />
            {order.items.map((i) => (
              <div key={i.itemId} className="card-row"><span>{i.quantity} × {i.name}</span><span>{inr(i.lineTotal)}</span></div>
            ))}
            <div className="card-row total"><span>Total</span><strong>{inr(order.total)}</strong></div>
          </section>

          <button className="btn ghost block" disabled title="The campus map is coming soon">
            <MapPin size={16} /> Show on map · coming soon
          </button>
        </>
      )}
    </div>
  )
}
