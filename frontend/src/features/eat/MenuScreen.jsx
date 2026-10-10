import { useEffect, useState } from 'react'
import { ShoppingBag } from 'lucide-react'
import { inr, useApi } from '../../lib/api'
import { useNav } from '../../lib/nav'
import { addItem, cartTotals, pruneCart, setQty, useCart } from '../../lib/cart'
import { ErrorBox, Loading, ScreenHeader, Stepper, VegMark } from '../../components/ui'

export default function MenuScreen({ canteenId }) {
  const { go } = useNav()
  const { cart, setCart } = useCart()
  const [notice, setNotice] = useState(null)
  const { data, loading, error, reload } = useApi(`/canteens/${canteenId}/menu`)

  // Stale cart: drop items this canteen no longer sells or has sold out
  useEffect(() => {
    if (!data || cart.canteenId !== canteenId) return
    const { cart: fresh, removed } = pruneCart(cart, data.categories.flatMap((c) => c.items))
    if (removed.length) {
      setCart(fresh)
      setNotice(`Removed from your cart (no longer available): ${removed.join(', ')}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const add = (item) => {
    if (cart.canteenId && cart.canteenId !== canteenId && !window.confirm(`Your cart has items from ${cart.canteenName}. Start a new cart here?`)) return
    setCart(addItem(cart, { id: canteenId, name: data.canteen.name }, item))
  }

  const { count, total } = cartTotals(cart)
  const inThisCart = cart.canteenId === canteenId

  return (
    <div className="screen">
      <ScreenHeader
        title={data?.canteen.name || 'Menu'}
        subtitle={data && (data.canteen.isOpen ? 'Open now' : 'Closed now · you can still pre-order a later slot')}
        onBack={() => go('eat', { name: 'list' })}
      />
      {loading && <Loading label="Loading menu…" />}
      <ErrorBox error={error} onRetry={reload} />
      {notice && <p className="notice" role="status">{notice}</p>}
      {data?.categories.map((cat) => (
        <section key={cat.name} className="menu-section">
          <h3>{cat.name}</h3>
          {cat.items.map((item) => {
            const qty = inThisCart ? cart.items[item.id]?.qty || 0 : 0
            return (
              <div key={item.id} className={item.isAvailable ? 'menu-item' : 'menu-item sold-out'}>
                <VegMark isVeg={item.isVeg} />
                <div className="menu-item-text">
                  <strong>{item.name}</strong>
                  <span>{inr(item.price)}</span>
                </div>
                {!item.isAvailable ? (
                  <span className="badge badge-closed">Sold out</span>
                ) : qty ? (
                  <Stepper value={qty} label={item.name} onChange={(q) => setCart(setQty(cart, item.id, q))} />
                ) : (
                  <button className="btn small" onClick={() => add(item)}>Add</button>
                )}
              </div>
            )
          })}
        </section>
      ))}
      {inThisCart && count > 0 && (
        <button className="cart-bar" onClick={() => go('eat', { name: 'checkout' })}>
          <ShoppingBag size={18} /> {count} item{count > 1 ? 's' : ''} · {inr(total)}
          <span>Checkout</span>
        </button>
      )}
    </div>
  )
}
