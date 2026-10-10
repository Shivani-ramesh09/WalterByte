import { Clock, ShoppingBag } from 'lucide-react'
import { inr, useApi } from '../../lib/api'
import { useNav } from '../../lib/nav'
import { cartTotals, useCart } from '../../lib/cart'
import { Empty, ErrorBox, Loading, ScreenHeader } from '../../components/ui'
import MenuScreen from './MenuScreen'
import CheckoutScreen from './CheckoutScreen'
import OrderTracker from './OrderTracker'

export default function EatTab() {
  const { screen } = useNav()
  if (screen.name === 'menu') return <MenuScreen canteenId={screen.canteenId} />
  if (screen.name === 'checkout') return <CheckoutScreen />
  if (screen.name === 'order') return <OrderTracker orderId={screen.orderId} justPlaced={screen.justPlaced} />
  return <CanteenList />
}

function CanteenList() {
  const { go } = useNav()
  const { cart } = useCart()
  const { count, total } = cartTotals(cart)
  const { data, loading, error, reload } = useApi('/canteens', { pollMs: 30_000 })

  return (
    <div className="screen">
      <ScreenHeader title="Eat" subtitle="Pre-order, pick a slot, skip the queue" />
      {loading && <Loading label="Loading canteens…" />}
      <ErrorBox error={error} onRetry={reload} />
      {data && !data.canteens.length && <Empty title="No canteens yet" text="Canteens appear here once they are set up." />}
      <div className="stack">
        {data?.canteens.map((c) => (
          <button key={c.id} className="card card-button" onClick={() => go('eat', { name: 'menu', canteenId: c.id })}>
            <div className="card-row">
              <strong>{c.name}</strong>
              <span className={c.isOpen ? 'badge badge-open' : 'badge badge-closed'}>{c.isOpen ? 'Open' : 'Closed'}</span>
            </div>
            <small className="muted">{c.description}</small>
            <div className="card-row muted small">
              <span>{c.openTime}–{c.closeTime}</span>
              <span className="wait">
                <Clock size={13} />
                {c.queue ? `~${c.queue.estimatedWaitMinutes} min wait (estimate)` : 'No wait estimate while closed'}
              </span>
            </div>
          </button>
        ))}
      </div>
      {count > 0 && (
        <button className="cart-bar" onClick={() => go('eat', { name: 'checkout' })}>
          <ShoppingBag size={18} /> {count} item{count > 1 ? 's' : ''} from {cart.canteenName} · {inr(total)}
          <span>Checkout</span>
        </button>
      )}
    </div>
  )
}
