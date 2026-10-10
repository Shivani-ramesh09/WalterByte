import { useEffect, useState } from 'react'
import { ShoppingBag } from 'lucide-react'
import { api, inr, useApi } from '../../lib/api'
import { useNav } from '../../lib/nav'
import { addItem, cartTotals, pruneCart, setQty, useCart } from '../../lib/cart'
import { ErrorBox, Loading, ScreenHeader, Stepper, VegMark } from '../../components/ui'

const LOW_STOCK = 5

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
  const available = data ? data.categories.flatMap((c) => c.items).filter((i) => i.isAvailable) : []

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
      {data?.source === 'daily' && <p className="muted small">Today's menu · stock updates as the counter and online orders sell.</p>}
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
                  <span>
                    {inr(item.price)}
                    {item.isAvailable && item.remaining !== null && item.remaining !== undefined && item.remaining <= LOW_STOCK && <> · <em className="low-stock">only {item.remaining} left</em></>}
                    {item.availableFrom && <> · {item.availableFrom}–{item.availableTo || 'close'}</>}
                  </span>
                  {item.soldOut && <WantedThis canteenId={canteenId} item={item} alternatives={available} />}
                </div>
                {item.soldOut ? (
                  <span className="badge badge-closed">Out of stock</span>
                ) : item.counterOnly ? (
                  <span className="badge">Counter only</span>
                ) : !item.isAvailable ? (
                  <span className="badge badge-closed">Sold out</span>
                ) : qty ? (
                  <Stepper value={qty} label={item.name} max={Math.min(10, item.remaining ?? 10)} onChange={(q) => setCart(setQty(cart, item.id, q))} />
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

/**
 * Voluntary "I wanted this" for a sold-out item. Counted once per student per
 * day. The follow-up question is optional and asked once, never repeated.
 */
function WantedThis({ canteenId, item, alternatives }) {
  const [wanted, setWanted] = useState(item.wanted)
  const [askFollowUp, setAskFollowUp] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const path = `/canteens/${canteenId}/menu/${item.id}/interest`

  const send = async (method, body) => {
    setBusy(true)
    setError(null)
    try {
      await api(path, { method, body })
      return true
    } catch (err) {
      setError(err)
      return false
    } finally {
      setBusy(false)
    }
  }

  if (!wanted) {
    return (
      <>
        <button type="button" className="link-btn small" disabled={busy} onClick={async () => { if (await send('POST', {})) { setWanted(true); setAskFollowUp(true) } }}>
          I wanted this
        </button>
        <ErrorBox error={error} />
      </>
    )
  }
  return (
    <div className="wanted stack-sm" role="status">
      <small className="muted">
        Noted, it helps the canteen plan how much to make.{' '}
        <button type="button" className="link-btn small" disabled={busy} onClick={async () => { if (await send('DELETE')) { setWanted(false); setAskFollowUp(false) } }}>Undo</button>
      </small>
      {askFollowUp && (
        <div className="stack-sm">
          <small>Optional: what did you do instead?</small>
          <div className="row wrap">
            {alternatives.length > 0 && (
              <select className="input input-small" aria-label="What you chose instead" defaultValue="" onChange={async (e) => { if (e.target.value && (await send('POST', { outcome: 'substituted', substituteItemId: e.target.value }))) setAskFollowUp(false) }}>
                <option value="" disabled>Chose…</option>
                {alternatives.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}
            <button type="button" className="btn small ghost" disabled={busy} onClick={async () => { if (await send('POST', { outcome: 'no_purchase' })) setAskFollowUp(false) }}>Didn't buy anything</button>
            <button type="button" className="btn small ghost" onClick={() => setAskFollowUp(false)}>Skip</button>
          </div>
        </div>
      )}
      <ErrorBox error={error} />
    </div>
  )
}
