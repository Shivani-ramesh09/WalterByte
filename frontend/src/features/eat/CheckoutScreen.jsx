import { useState } from 'react'
import DemoQr from '../../components/DemoQr'
import { api, inr, timeOf, useApi } from '../../lib/api'
import { useNav } from '../../lib/nav'
import { cartTotals, emptyCart, removeItems, setQty, useCart } from '../../lib/cart'
import { Chips, Empty, ErrorBox, Loading, ScreenHeader, Stepper } from '../../components/ui'

const istDate = (offsetDays) =>
  new Date(Date.now() + offsetDays * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })


export default function CheckoutScreen() {
  const { go } = useNav()
  const { cart, setCart } = useCart()
  const { count, total } = cartTotals(cart)
  const [day, setDay] = useState('today')
  const [slotId, setSlotId] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const date = istDate(day === 'today' ? 0 : 1)
  const slots = useApi(cart.canteenId ? `/canteens/${cart.canteenId}/slots?date=${date}` : null)
  const upcoming = slots.data?.slots.filter((s) => new Date(s.start) > new Date()) || []

  if (!count) {
    return (
      <div className="screen">
        <ScreenHeader title="Checkout" onBack={() => go('eat', { name: 'list' })} />
        <Empty title="Your cart is empty" text="Add something from a canteen menu first." action={<button className="btn primary" onClick={() => go('eat', { name: 'list' })}>Browse canteens</button>} />
      </div>
    )
  }

  const pay = async () => {
    setBusy(true)
    setError(null)
    try {
      const order = await api('/orders', {
        method: 'POST',
        body: {
          canteenId: cart.canteenId,
          slotId,
          paymentMethod: 'upi_mock',
          items: Object.entries(cart.items).map(([itemId, i]) => ({ itemId, quantity: i.qty })),
        },
      })
      setCart(emptyCart)
      go('eat', { name: 'order', orderId: order.id, justPlaced: true })
    } catch (err) {
      setConfirming(false)
      setBusy(false)
      setError(err)
      if (err.code === 'ITEMS_UNAVAILABLE') setCart(removeItems(cart, err.details?.itemIds || []))
      if (err.code === 'SLOT_FULL' || err.code === 'SLOT_UNAVAILABLE') {
        setSlotId(null)
        slots.reload()
      }
    }
  }

  return (
    <div className="screen">
      <ScreenHeader title="Checkout" subtitle={cart.canteenName} onBack={() => go('eat', { name: 'menu', canteenId: cart.canteenId })} />

      <section className="card stack-sm">
        <h3>Your order</h3>
        {Object.entries(cart.items).map(([id, i]) => (
          <div key={id} className="card-row">
            <span>{i.name}</span>
            <Stepper value={i.qty} label={i.name} onChange={(q) => setCart(setQty(cart, id, q))} />
            <span className="price">{inr(i.price * i.qty)}</span>
          </div>
        ))}
        <div className="card-row total"><span>Total</span><strong>{inr(total)}</strong></div>
        <small className="muted">Final prices are confirmed by the canteen when you pay.</small>
      </section>

      <section className="card stack-sm">
        <h3>Pickup slot</h3>
        <Chips label="Pickup day" options={[{ value: 'today', label: 'Today' }, { value: 'tomorrow', label: 'Tomorrow' }]} value={day} onChange={(d) => { setDay(d || day); setSlotId(null) }} />
        {slots.loading && <Loading label="Loading slots…" />}
        <ErrorBox error={slots.error} onRetry={slots.reload} />
        {slots.data && !upcoming.length && <Empty title="No more slots on this day" text="Try tomorrow." />}
        <div className="slot-grid">
          {upcoming.map((s) => (
            <button
              key={s.id}
              type="button"
              className={slotId === s.id ? 'slot selected' : 'slot'}
              disabled={!s.available}
              aria-pressed={slotId === s.id}
              onClick={() => setSlotId(s.id)}
            >
              <strong>{timeOf(s.start)}</strong>
              <small>{s.available ? `${s.remaining} left` : 'Full'}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="card stack-sm">
        <h3>Pay with UPI <span className="badge badge-demo">Demo</span></h3>
        <p className="muted small">UPI is the only online payment the canteens accept. In this demo the UPI step is simulated: no QR to scan and no money moves.</p>
        <p className="muted small">Your order is prepared for your slot. Please collect it on time from the counter.</p>
      </section>

      <ErrorBox error={error} />
      <button className="btn primary block" disabled={!slotId || busy} onClick={() => setConfirming(true)}>
        {!slotId ? 'Pick a pickup slot' : `Pay ${inr(total)} with UPI (simulated)`}
      </button>

      {confirming && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="upi-title">
          <div className="modal">
            <h3 id="upi-title">Simulated UPI payment</h3>
            <p><strong>{inr(total)}</strong> to {cart.canteenName}</p>
            <div className="qr-frame">
              <DemoQr seed={`${cart.canteenId}-${slotId}-${total}`} />
            </div>
            <p className="muted small">In the live app this is where the canteen's UPI QR appears. This sample code is not scannable.</p>
            <p className="badge badge-demo">Sample QR · not a real payment code</p>
            <div className="row">
              <button className="btn ghost" onClick={() => setConfirming(false)} disabled={busy}>Cancel</button>
              <button className="btn primary" onClick={pay} disabled={busy}>{busy ? 'Placing order…' : 'Simulate successful payment'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
