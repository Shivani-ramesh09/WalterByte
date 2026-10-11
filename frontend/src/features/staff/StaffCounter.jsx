import { useState } from 'react'
import { api, timeOf, useApi } from '../../lib/api'
import { Empty, ErrorBox, Loading } from '../../components/ui'

// One key per tap: a retried request is recognised by the server, never counted twice
const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`)
const REASONS = { extra_batch: 'Extra batch made', spoilage: 'Spoiled / dropped', correction: 'Count correction', staff_meal: 'Staff meal' }

/**
 * Counter panel for today's published menu: walk-in sales, people asking for
 * sold-out items (anonymous counts), stock adjustments and closing the day.
 * Built for speed at the billing counter: one tap per common action.
 */
export default function StaffCounter() {
  const { data, loading, error, reload } = useApi('/staff/counter', { pollMs: 10000 })
  const [busy, setBusy] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [flash, setFlash] = useState(null)

  const run = async (label, path, body, method = 'POST') => {
    setBusy(label)
    setActionError(null)
    try {
      const res = await api(path, { method, body })
      setFlash(res?.duplicate ? 'Already recorded; not counted twice.' : 'Recorded.')
      await reload(true)
    } catch (err) {
      setActionError(err)
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <Loading label="Loading counter…" />
  if (error) return <ErrorBox error={error} onRetry={reload} />
  if (!data.published) {
    return <Empty title="Today's menu is not published yet" text="Administration uploads and publishes the daily menu. Until then, use Menu & stock to mark items sold out." />
  }

  const ds = data.dataStatus
  return (
    <div className="stack">
      <p className="muted small">
        {data.businessDate} · menu v{data.menuVersion} · counter records: {ds.counterSource ? `${ds.counterSource}${ds.lastCounterAt ? `, last ${timeOf(ds.lastCounterAt)}` : ''}` : 'none yet today'}
        {ds.counterComplete && ' · day closed as complete'}
      </p>
      <ErrorBox error={actionError} />
      {flash && <p className="notice small" role="status">{flash}</p>}

      {data.items.map((item) => (
        <CounterItem key={item.itemId} item={item} busy={busy} run={run} />
      ))}

      <section className="card stack-sm">
        <h3>Requests for unavailable items today</h3>
        {data.requests.length ? (
          <ul className="plain stack-sm">
            {data.requests.map((r) => (
              <li key={r.id} className="card-row">
                <span className={r.status === 'void' ? 'muted strike' : undefined}>
                  {timeOf(r.at)} · {data.items.find((i) => i.itemId === r.itemId)?.name || r.itemId} · {r.quantity} {r.quantity === 1 ? 'person' : 'people'}
                  {r.status === 'void' && ` (voided: ${r.voidReason})`}
                </span>
                {r.status !== 'void' && (
                  <button
                    className="link-btn small"
                    disabled={Boolean(busy)}
                    onClick={() => {
                      const reason = window.prompt('Why void this record? (e.g. entered twice)')
                      if (reason && reason.trim().length >= 3) run(`void-${r.id}`, `/staff/unavailable-requests/${r.id}`, { reason: reason.trim() }, 'PATCH')
                    }}
                  >
                    Void
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">None recorded.</p>
        )}
      </section>

      <CloseDay items={data.items} run={run} busy={busy} closed={ds.counterComplete} />
    </div>
  )
}

function CounterItem({ item, busy, run }) {
  const [qty, setQty] = useState(1)
  const [adjusting, setAdjusting] = useState(false)
  const tracked = item.planned !== null
  return (
    <article className={item.soldOut ? 'card stack-sm sold-out-card' : 'card stack-sm'}>
      <div className="card-row">
        <strong>{item.name}</strong>
        {item.soldOut ? <span className="badge badge-closed">Out of stock</span> : tracked ? <span className="badge badge-open">{item.available} left</span> : <span className="badge">Not tracked</span>}
      </div>
      <small className="muted">
        {tracked ? `Planned ${item.planned}${item.adjustments ? ` ${item.adjustments > 0 ? '+' : ''}${item.adjustments}` : ''} · ` : ''}
        Counter {item.counterSold} · Online collected {item.onlineSold} · Reserved {item.reserved}
      </small>
      <div className="row wrap">
        <label className="sr-only" htmlFor={`qty-${item.itemId}`}>Quantity for {item.name}</label>
        <select id={`qty-${item.itemId}`} className="input input-small" value={qty} onChange={(e) => setQty(Number(e.target.value))}>
          {[1, 2, 3, 4, 5, 10].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <button className="btn small primary" disabled={Boolean(busy)} onClick={() => run(`sale-${item.itemId}`, '/staff/counter-sales', { txnId: newKey(), lines: [{ itemId: item.itemId, quantity: qty }] })}>
          Sold {qty}
        </button>
        {item.soldOut && (
          <button className="btn small" disabled={Boolean(busy)} onClick={() => run(`ask-${item.itemId}`, '/staff/unavailable-requests', { requestId: newKey(), itemId: item.itemId, quantity: qty })}>
            {qty} asked for it
          </button>
        )}
        {tracked && <button className="link-btn small" onClick={() => setAdjusting(!adjusting)}>Adjust stock</button>}
      </div>
      {adjusting && (
        <form
          className="row wrap"
          onSubmit={(e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            run(`adj-${item.itemId}`, `/staff/inventory/${item.itemId}/adjust`, { requestId: newKey(), delta: Number(f.get('delta')), reason: f.get('reason') })
            setAdjusting(false)
          }}
        >
          <input className="input input-small" name="delta" type="number" min={-1000} max={1000} required aria-label="Change in portions (negative to remove)" placeholder="+20 / -3" />
          <select className="input" name="reason" aria-label="Reason">
            {Object.entries(REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="btn small primary">Save</button>
        </form>
      )}
    </article>
  )
}

function CloseDay({ items, run, busy, closed }) {
  const [open, setOpen] = useState(false)
  if (!open) return <button className="btn ghost block" onClick={() => setOpen(true)}>{closed ? 'Update day close' : 'Close the day'}</button>
  return (
    <form
      className="card stack-sm"
      onSubmit={(e) => {
        e.preventDefault()
        const f = new FormData(e.currentTarget)
        const wastage = items
          .filter((i) => f.get(`w-${i.itemId}`) !== '')
          .map((i) => ({ itemId: i.itemId, quantity: Number(f.get(`w-${i.itemId}`)) }))
        run('close', '/staff/day-close', { wastage, counterComplete: f.get('complete') === 'on' })
        setOpen(false)
      }}
    >
      <h3>Close the day</h3>
      <p className="muted small">Enter portions thrown away unsold. Leave blank if not counted.</p>
      {items.filter((i) => i.planned !== null).map((i) => (
        <label key={i.itemId} className="card-row">
          <span>{i.name}</span>
          <input className="input input-small" name={`w-${i.itemId}`} type="number" min={0} max={10000} defaultValue={i.wastage ?? ''} />
        </label>
      ))}
      <label className="check"><input type="checkbox" name="complete" defaultChecked={closed} /> Every counter sale and unavailable request today has been recorded</label>
      <div className="row">
        <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
        <button className="btn primary" disabled={Boolean(busy)}>Save</button>
      </div>
    </form>
  )
}
