import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { api, useApi } from '../../lib/api'
import { Chips, ErrorBox, Field, Loading, ScreenHeader } from '../../components/ui'
import { Bars, DataNotes, Kpi, PeriodPicker, Section, SyntheticBanner, Table, day, inr, num } from './adminUi'

const signalCell = (s) => `${s.failedOnlineAttempts} / ${s.counterRequests} / ${s.interestResponses}`
const SIGNAL_HELP = 'Failed online attempts / counter requests (anonymous) / "I wanted this". Separate measures: never add them up as unique people.'

export function EatAdmin({ ctx }) {
  const { data, loading, error, reload } = useApi(`/admin/eat?${ctx.query}`)
  const [canteenId, setCanteenId] = useState(null)
  const canteen = data?.canteens.find((c) => c.canteenId === canteenId) || data?.canteens[0]
  return (
    <>
      <div className="card-row">
        <h2>Eat intelligence</h2>
        <button className="btn small" onClick={() => ctx.go('eat-menus')}>Menus & billing imports</button>
      </div>
      <PeriodPicker value={ctx.days} onChange={ctx.setDays} label={data && { current: data.period.label, previous: data.period.previous.label }} />
      {loading && <Loading />}
      <ErrorBox error={error} onRetry={reload} />
      {data && (
        <>
          <SyntheticBanner show={data.dataQuality.synthetic} />
          {data.canteensWithoutMenus.length > 0 && <p className="muted small">No published daily menus in this period for: {data.canteensWithoutMenus.join(', ')}.</p>}

          <Section title="Canteens compared">
            <Bars
              caption="Gross sales value (₹) by channel. Gross sales are not profit."
              series={[{ key: 'counter', label: 'Counter' }, { key: 'online', label: 'Online pre-orders' }]}
              rows={data.canteens.map((c) => ({ label: c.name, counter: c.counterGross, online: c.onlineGross }))}
            />
          </Section>

          {canteen && (
            <Section title={canteen.name}>
              <Chips label="Canteen" options={data.canteens.map((c) => ({ value: c.canteenId, label: c.name }))} value={canteen.canteenId} onChange={(v) => v && setCanteenId(v)} />
              <div className="kpis">
                <Kpi label="Portions sold" value={canteen.sold} kind="observed" definition="Collected online portions plus counter portions." />
                <Kpi label="Gross sales" value={canteen.gross} format={inr} kind="derived" definition="Portions sold × that day's menu price. Not profit: costs are not recorded." />
                <Kpi label="Counter / online" value={canteen.counterSold} format={(x) => `${num(x)} / ${num(canteen.onlineSold)}`} kind="observed" />
                <Kpi label="Avg online order" value={canteen.averageOnlineOrder} format={inr} kind="derived" />
                <Kpi label="Avg counter bill" value={canteen.averageCounterTransaction} format={inr} kind="derived" />
                <Kpi label="Cancelled orders" value={canteen.cancelledOrders} kind="observed" />
                <Kpi label="Uncollected portions" value={canteen.uncollected} kind="observed" definition="Online portions reserved but never collected." />
                <Kpi label="Wastage recorded" value={canteen.wastage} kind="observed" definition="Unsold portions discarded, as entered at day close. Blank days are not counted." />
                <Kpi label="Early sell-outs" value={canteen.earlyStockouts} kind="observed" definition="Item-days that sold out with an hour or more of service left." />
              </div>
              <Bars
                caption="Portions by hour of day (IST): demand timing, online orders by when they were placed"
                series={[{ key: 'counter', label: 'Counter' }, { key: 'online', label: 'Online' }]}
                rows={canteen.byHour.map((h) => ({ label: `${String(h.hour).padStart(2, '0')}:00`, counter: h.counter, online: h.online }))}
              />
              <QualityNote q={canteen.quality} />
            </Section>
          )}

          <Section title="Items">
            <p className="muted small">Select an item for its sales history, stockouts, recorded unmet demand and preparation evidence. Signals column: {SIGNAL_HELP}</p>
            <Table
              rows={data.items.filter((i) => !canteen || i.canteenId === canteen.canteenId)}
              rowKey={(r) => `${r.canteenId}-${r.itemId}`}
              onRowClick={(r) => ctx.go('eat-item', { canteenId: r.canteenId, itemId: r.itemId })}
              initialSort={{ key: 'gross', dir: 'desc' }}
              columns={[
                { key: 'name', label: 'Item' },
                { key: 'daysOnMenu', label: 'Days', format: num },
                { key: 'sold', label: 'Sold', format: num },
                { key: 'gross', label: 'Gross', format: inr },
                { key: 'stockoutDays', label: 'Sold out (early)', format: (x, r) => `${x} (${r.earlyStockoutDays})`, sort: (r) => r.earlyStockoutDays },
                { key: 'medianStockoutTime', label: 'Median sell-out', format: (x) => x || '–' },
                { key: 'signals', label: 'Signals', format: signalCell, sort: (r) => r.signals.failedOnlineAttempts + r.signals.counterRequests },
                { key: 'wastage', label: 'Wastage', format: num },
              ]}
            />
          </Section>
          <DataNotes quality={data.dataQuality} />
        </>
      )}
    </>
  )
}

function QualityNote({ q }) {
  const issues = [
    q.incompleteDays.length && `${q.incompleteDays.length} of ${q.daysWithMenu} days are not marked complete for counter records`,
    q.daysWithoutCounterData.length && `no counter data on ${q.daysWithoutCounterData.join(', ')}`,
    q.oversoldDays.length && `${q.oversoldDays.length} item-days sold more than the recorded stock (stock counts were off)`,
  ].filter(Boolean)
  return (
    <p className={issues.length ? 'notice small' : 'muted small'}>
      {issues.length ? <><AlertTriangle size={13} /> Data quality: {issues.join('; ')}.</> : 'Counter records complete for every day in the period.'}{' '}
      Sources: {q.counterLiveDays} days recorded live at the counter, {q.counterImportDays} from billing imports.
    </p>
  )
}

export function EatItem({ ctx, canteenId, itemId }) {
  const [scenario, setScenario] = useState({ portions: '', unitCost: '' })
  const [applied, setApplied] = useState({})
  const q = new URLSearchParams(ctx.query)
  if (applied.portions) q.set('portions', applied.portions)
  if (applied.unitCost !== '' && applied.unitCost !== undefined) q.set('unitCost', applied.unitCost)
  const { data, loading, error, reload } = useApi(`/admin/eat/items/${canteenId}/${itemId}?${q}`)
  if (loading && !data) return <Loading />
  if (error) return <ErrorBox error={error} onRetry={reload} />
  const s = data.summary
  const sig = s.signals
  const f = data.forecast
  return (
    <>
      <ScreenHeader title={data.item.name} subtitle={`${data.canteen.name} · ${data.period.label}`} onBack={() => ctx.go('eat')} />
      <SyntheticBanner show={data.synthetic} />

      <Section title="Observed supply and sales">
        <div className="kpis">
          <Kpi label="Days on menu" value={s.daysOnMenu} kind="observed" />
          <Kpi label="Prepared (planned)" value={s.planned} kind="observed" />
          <Kpi label="Sold" value={s.sold} kind="observed" definition="Collected online plus counter portions." />
          <Kpi label="Gross sales" value={s.gross} format={inr} kind="derived" definition="Not profit." />
          <Kpi label="Sold out / early" value={s.stockoutDays} format={(x) => `${x} / ${s.earlyStockoutDays}`} kind="observed" definition="Early = sold out with an hour or more of the service period (or the item's window) left." />
          <Kpi label="Median sell-out time" value={s.medianStockoutTime} format={(x) => x || '–'} kind="observed" />
        </div>
        <Table
          rows={data.days}
          rowKey={(r) => r.businessDate}
          initialSort={{ key: 'businessDate', dir: 'desc' }}
          columns={[
            { key: 'businessDate', label: 'Date' },
            { key: 'planned', label: 'Prepared', format: (x, r) => (x === null ? 'not tracked' : `${x}${r.adjustments ? ` ${r.adjustments > 0 ? '+' : ''}${r.adjustments}` : ''}`) },
            { key: 'counterSold', label: 'Counter', format: num },
            { key: 'onlineSold', label: 'Online', format: num },
            { key: 'stockoutAt', label: 'Sold out at', format: (x, r) => (x ? `${new Date(x).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })} (${r.minutesLeftAtStockout} min left)` : '–') },
            { key: 'signals', label: 'Failed / counter / interest', format: signalCell, sort: (r) => r.signals.failedOnlineAttempts + r.signals.counterRequests },
            { key: 'wastage', label: 'Wastage', format: num },
          ]}
        />
      </Section>

      <Section title="Recorded unmet-demand signals">
        <p className="muted small">Each row is a different kind of evidence. They are not added together, and none of them comes from the stockout itself.</p>
        <div className="kpis">
          <Kpi label="Failed online attempts" value={sig.failedOnlineAttempts} kind="observed" definition="Orders rejected because the item had sold out. Strong signal." />
          <Kpi label="Counter requests" value={sig.counterRequests} kind="observed" definition="People asking at the counter after it sold out, logged by the cashier as anonymous counts. Not unique people." />
          <Kpi label='"I wanted this"' value={sig.interestResponses} kind="observed" definition="Voluntary taps in the app, one per student per day." />
          <Kpi label="Said they chose something else" value={sig.substitutions} kind="observed" />
          <Kpi label="Said they left without buying" value={sig.noPurchase} kind="observed" />
          <Kpi label="Outcome unknown" value={sig.unknownOutcome} kind="observed" definition="No one recorded what happened next. Not assumed to be lost sales." />
        </div>
      </Section>

      <Section title="Data quality">
        <ul className="small">
          <li>Channels: {data.quality.signalChannels.join('; ')}.</li>
          <li>{data.quality.uniquePeopleNote}</li>
          <li>Counter records complete on {data.quality.counterCompleteDays} of {data.quality.daysWithMenu} days{data.quality.daysWithoutCounterData.length ? `; no counter data on ${data.quality.daysWithoutCounterData.join(', ')}` : ''}.</li>
          {data.quality.oversoldDays.length > 0 && <li>Sold beyond recorded stock on: {data.quality.oversoldDays.join(', ')}.</li>}
        </ul>
      </Section>

      <Section title="Interpretation">
        <h4>What the evidence supports</h4>
        <ul className="small">{data.interpretation.supports.map((l) => <li key={l}>{l}</li>)}</ul>
        <h4>What remains unknown</h4>
        <ul className="small">{data.interpretation.unknown.map((l) => <li key={l}>{l}</li>)}</ul>
        <p><span className="kind kind-recommendation">next measurement</span> {data.interpretation.nextStep}</p>
      </Section>

      <Section title="Demand range">
        {f.sufficient ? (
          <>
            <p><span className="kind kind-estimate">estimate</span> Plausible demand: <strong>{f.low}–{f.high} portions per day</strong>, from {f.observations} comparable days. {f.note}</p>
            <h4>Evidence used</h4>
            <ul className="small">{f.evidence.map((e) => <li key={e}>{e}</li>)}</ul>
            <h4>Assumptions</h4>
            <ul className="small">{f.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
          </>
        ) : (
          <p className="notice">{f.message} {f.reason}</p>
        )}
      </Section>

      <Section title="Scenario">
        <form className="row wrap" onSubmit={(e) => { e.preventDefault(); setApplied(scenario) }}>
          <Field label="Additional portions"><input className="input input-small" type="number" min={1} max={10000} required value={scenario.portions} onChange={(e) => setScenario({ ...scenario, portions: e.target.value })} /></Field>
          <Field label="Cost per portion (₹, optional)" hint="Your assumption; not recorded anywhere"><input className="input input-small" type="number" min={0} value={scenario.unitCost} onChange={(e) => setScenario({ ...scenario, unitCost: e.target.value })} /></Field>
          <button className="btn small primary">Calculate</button>
        </form>
        {data.scenario && <p><span className="kind kind-scenario">scenario</span> {data.scenario.statement}</p>}
      </Section>
    </>
  )
}

/** Authorised daily-menu upload (preview → save draft → publish) and billing imports. */
export function EatMenus({ ctx }) {
  const canteens = useApi('/canteens')
  const istToday = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)
  const inTwoWeeks = new Date(Date.now() + (330 + 14 * 1440) * 60000).toISOString().slice(0, 10)
  const twoWeeksAgo = new Date(Date.now() + (330 - 14 * 1440) * 60000).toISOString().slice(0, 10)
  const list = useApi(`/admin/eat/menus?from=${twoWeeksAgo}&to=${inTwoWeeks}`)
  const [form, setForm] = useState({ canteenId: '', businessDate: istToday, csv: '', fileName: '' })
  const [preview, setPreview] = useState(null)
  const [record, setRecord] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [billing, setBilling] = useState(null)

  const readFile = (e, cb) => {
    const file = e.target.files[0]
    if (!file) return
    if (!/\.csv$/i.test(file.name)) {
      setError(new Error('Upload a .csv file. In Excel, use File → Save As → CSV.'))
      return
    }
    file.text().then((csv) => cb(csv, file.name))
  }
  const call = async (fn) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }
  const body = { canteenId: form.canteenId, businessDate: form.businessDate, csv: form.csv, fileName: form.fileName }

  return (
    <>
      <ScreenHeader title="Menus & billing imports" subtitle="Authorised uploads only; the digital-TV menu is not connected" onBack={() => ctx.go('eat')} />
      <ErrorBox error={error} />

      <Section title="Upload a daily menu">
        <p className="muted small">
          CSV columns: canteen_id, business_date, item_id, name, category, price, is_veg, planned_quantity, preorder, available_from, available_to. Menus are per day; nothing repeats by weekday. Keep item_id stable across days.
        </p>
        <div className="row wrap">
          <Field label="Canteen">
            <select className="input" value={form.canteenId} onChange={(e) => { setForm({ ...form, canteenId: e.target.value }); setPreview(null) }} required>
              <option value="">Choose…</option>
              {(canteens.data?.canteens || []).map((c) => <option key={c.id} value={c.id}>{c.name} ({c.id})</option>)}
            </select>
          </Field>
          <Field label="Business date"><input className="input" type="date" value={form.businessDate} onChange={(e) => { setForm({ ...form, businessDate: e.target.value }); setPreview(null) }} /></Field>
          <Field label="CSV file"><input className="input" type="file" accept=".csv,text/csv" onChange={(e) => readFile(e, (csv, fileName) => { setForm({ ...form, csv, fileName }); setPreview(null) })} /></Field>
        </div>
        <div className="row wrap">
          <button className="btn small" disabled={busy || !form.canteenId || !form.csv} onClick={() => call(async () => setPreview(await api('/admin/eat/menus/validate', { method: 'POST', body })))}>Validate</button>
          <button className="btn small" disabled={busy || !preview || preview.errors.length > 0} onClick={() => call(async () => setRecord(await api('/admin/eat/menus', { method: 'POST', body })))}>Save as draft</button>
          <button className="btn small primary" disabled={busy || !record?.draft} onClick={() => call(async () => { setRecord(await api(`/admin/eat/menus/${form.canteenId}/${form.businessDate}/publish`, { method: 'POST' })); list.reload(true) })}>Publish</button>
        </div>
        {preview && (
          <>
            <p className={preview.errors.length ? 'notice small' : 'muted small'}>{preview.accepted} valid rows, {preview.errors.length} problem(s){preview.errors.length ? '. Fix every problem before saving; no row is dropped silently.' : '.'}</p>
            {preview.errors.length > 0 && (
              <Table rows={preview.errors.map((e, i) => ({ ...e, i }))} rowKey={(r) => r.i} initialSort={{ key: 'line', dir: 'asc' }} columns={[{ key: 'line', label: 'Line' }, { key: 'field', label: 'Column', format: (x) => x || '–' }, { key: 'message', label: 'Problem' }]} />
            )}
            {preview.items.length > 0 && (
              <Table
                rows={preview.items}
                rowKey={(r) => r.itemId}
                initialSort={{ key: 'category', dir: 'asc' }}
                columns={[
                  { key: 'itemId', label: 'Item id' },
                  { key: 'name', label: 'Name' },
                  { key: 'category', label: 'Category' },
                  { key: 'price', label: 'Price', format: inr },
                  { key: 'planned', label: 'Planned', format: (x) => (x === null ? 'not tracked' : x) },
                  { key: 'preorder', label: 'Pre-order', format: (x) => (x ? 'yes' : 'counter only') },
                ]}
              />
            )}
          </>
        )}
        {record && <p className="success-box small">{record.published ? `Published version ${record.published.version} (${record.published.items.length} items).` : 'Draft saved.'} {record.draft ? 'A draft is waiting to be published.' : ''}</p>}
      </Section>

      <Section title="Menus around today">
        {list.loading ? <Loading /> : (
          <Table
            rows={list.data?.menus || []}
            rowKey={(r) => `${r.canteenId}-${r.businessDate}`}
            initialSort={{ key: 'businessDate', dir: 'desc' }}
            empty="No menus uploaded for these dates."
            columns={[
              { key: 'businessDate', label: 'Date' },
              { key: 'canteenId', label: 'Canteen' },
              { key: 'publishedVersion', label: 'Published', format: (x) => (x ? `v${x}` : 'not yet') },
              { key: 'items', label: 'Items', format: num },
              { key: 'hasDraft', label: 'Draft', format: (x) => (x ? 'waiting' : '–') },
              { key: 'synthetic', label: 'Data', format: (x) => (x ? 'synthetic demo' : 'uploaded') },
            ]}
          />
        )}
      </Section>

      <Section title="Import billing-counter sales">
        <p className="muted small">Authorised billing export as CSV with columns txn_id, time (HH:mm IST), item_id, quantity. Re-importing the same file skips transactions already recorded.</p>
        <form
          className="stack-sm"
          onSubmit={(e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            const file = f.get('file')
            call(async () => {
              const csv = await file.text()
              setBilling(await api('/admin/eat/counter-imports', { method: 'POST', body: { canteenId: f.get('canteenId'), businessDate: f.get('date'), csv, fileName: file.name, complete: f.get('complete') === 'on' } }))
            })
          }}
        >
          <div className="row wrap">
            <Field label="Canteen">
              <select className="input" name="canteenId" required>
                {(canteens.data?.canteens || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Business date"><input className="input" name="date" type="date" defaultValue={istToday} required /></Field>
            <Field label="CSV file"><input className="input" name="file" type="file" accept=".csv,text/csv" required /></Field>
          </div>
          <label className="check"><input type="checkbox" name="complete" /> This file contains every counter transaction for the day</label>
          <button className="btn small primary" disabled={busy}>Import</button>
        </form>
        {billing && (
          <div className="card stack-sm">
            <p className="small">
              Imported {day(billing.importedAt)}: {billing.accepted} accepted, {billing.duplicates} duplicates skipped, {billing.rejected} rejected
              {billing.complete ? ' · marked complete' : ' · marked incomplete'}.
            </p>
            {billing.errors.length > 0 && (
              <Table rows={billing.errors.map((e, i) => ({ ...e, i }))} rowKey={(r) => r.i} initialSort={{ key: 'line', dir: 'asc' }} columns={[{ key: 'line', label: 'Line' }, { key: 'field', label: 'Column', format: (x) => x || '–' }, { key: 'message', label: 'Problem' }]} />
            )}
          </div>
        )}
      </Section>
    </>
  )
}
