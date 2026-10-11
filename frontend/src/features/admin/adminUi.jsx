import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, FlaskConical, Info } from 'lucide-react'
import { auth } from '../../config/firebase'
import { ApiError } from '../../lib/api'

// Shared pieces for the administration dashboard.

export const pct = (x) => (x === null || x === undefined ? '–' : `${Math.round(x * 100)}%`)
// Table passes (value, row): digits must be a number to count
export const num = (x, digits) => (x === null || x === undefined ? '–' : Number(x).toLocaleString('en-IN', { maximumFractionDigits: typeof digits === 'number' ? digits : 0 }))
export const inr = (x) => (x === null || x === undefined ? '–' : `₹${Math.round(x).toLocaleString('en-IN')}`)
export const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '–')

const istToday = () => new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10)
const minusDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) - n * 864e5).toISOString().slice(0, 10)

export const PERIODS = [
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
  { days: 180, label: 'Last 180 days' },
  { days: 365, label: 'Last 365 days' },
]

/** Query string for the last `days` whole IST days, ending today. */
export function periodQuery(days) {
  const to = istToday()
  return `from=${minusDays(to, days - 1)}&to=${to}`
}

export function PeriodPicker({ value, onChange, label }) {
  return (
    <div className="period">
      <label>
        <span className="sr-only">Reporting period</span>
        <select className="input" value={value} onChange={(e) => onChange(Number(e.target.value))}>
          {PERIODS.map((p) => <option key={p.days} value={p.days}>{p.label}</option>)}
        </select>
      </label>
      {label && <small className="muted">{label.current} · compared with {label.previous}</small>}
    </div>
  )
}

/** A KPI with its definition one tap away, and the change against the comparison period. */
export function Kpi({ label, value, previous, definition, format = num, kind }) {
  const delta = previous !== undefined && previous !== null && typeof value === 'number' && previous > 0 ? (value - previous) / previous : null
  return (
    <div className="kpi card">
      <span className="kpi-label">
        {label}
        {kind && <span className={`kind kind-${kind}`}>{kind}</span>}
      </span>
      <strong className="kpi-value">{format(value)}</strong>
      {previous !== undefined && (
        <small className="muted">
          {delta === null ? `Previous: ${format(previous)}` : (
            <span className={delta >= 0 ? 'delta up' : 'delta down'}>
              {delta >= 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
              {pct(Math.abs(delta))} vs {format(previous)}
            </span>
          )}
        </small>
      )}
      {definition && (
        <details className="definition">
          <summary><Info size={12} /> Definition</summary>
          <p>{definition}</p>
        </details>
      )}
    </div>
  )
}

/** Paired horizontal bars, scaled to the largest value in the chart. */
export function Bars({ rows, series, caption }) {
  const max = Math.max(1, ...rows.flatMap((r) => series.map((s) => r[s.key] || 0)))
  return (
    <figure className="bars">
      {caption && <figcaption>{caption}</figcaption>}
      <div className="bars-legend">
        {series.map((s, i) => <span key={s.key}><i className={`swatch s${i}`} /> {s.label}</span>)}
      </div>
      {rows.map((r) => (
        <div className="bar-row" key={r.label}>
          <span className="bar-label">{r.label}</span>
          <div className="bar-stack">
            {series.map((s, i) => (
              <div key={s.key} className="bar-line">
                <div className={`bar s${i}`} style={{ width: `${((r[s.key] || 0) / max) * 100}%` }} />
                <span className="bar-value">{num(r[s.key])}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </figure>
  )
}

/** Sortable table. columns: [{ key, label, format?, sort?(row) }] */
export function Table({ columns, rows, rowKey, onRowClick, initialSort, empty = 'No records in this period.' }) {
  const [sort, setSort] = useState(initialSort || { key: columns[0].key, dir: 'desc' })
  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort.key)
    const val = (r) => (col?.sort ? col.sort(r) : r[sort.key])
    return [...rows].sort((a, b) => {
      const x = val(a)
      const y = val(b)
      if (x === y) return 0
      if (x === null || x === undefined) return 1
      if (y === null || y === undefined) return -1
      return (x > y ? 1 : -1) * (sort.dir === 'asc' ? 1 : -1)
    })
  }, [rows, sort, columns])
  if (!rows.length) return <p className="muted small">{empty}</p>
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                <button type="button" onClick={() => setSort({ key: c.key, dir: sort.key === c.key && sort.dir === 'desc' ? 'asc' : 'desc' })}>
                  {c.label}{sort.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={rowKey(r)} className={onRowClick ? 'clickable' : undefined} onClick={onRowClick ? () => onRowClick(r) : undefined} tabIndex={onRowClick ? 0 : undefined} onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(r) : undefined}>
              {columns.map((c) => <td key={c.key}>{c.format ? c.format(r[c.key], r) : r[c.key] ?? '–'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function SyntheticBanner({ show }) {
  if (!show) return null
  return (
    <p className="notice synthetic-banner" role="note">
      <FlaskConical size={15} /> Includes <strong>synthetic demonstration data</strong>. These figures are generated for the demo and are not real Amrita statistics.
    </p>
  )
}

export function DataNotes({ quality }) {
  if (!quality) return null
  return (
    <details className="data-notes">
      <summary><Info size={13} /> Data quality and definitions</summary>
      <ul>
        {quality.truncated && <li><strong>Possibly incomplete:</strong> a query reached its size limit, so some records may be missing.</li>}
        {quality.notes.map((n) => <li key={n}>{n}</li>)}
      </ul>
    </details>
  )
}

export function Section({ title, children, action }) {
  return (
    <section className="admin-section">
      <div className="card-row"><h3>{title}</h3>{action}</div>
      {children}
    </section>
  )
}

/** Download a CSV report with the signed-in user's token. */
export async function downloadReport(kind, query) {
  const token = await auth.currentUser?.getIdToken()
  const res = await fetch(`${import.meta.env.VITE_API_BASE || '/api/v1'}/admin/reports/${kind}?${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body.error?.code, body.error?.message || 'Could not download the report.')
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || `${kind}.csv`
  const url = URL.createObjectURL(await res.blob())
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  URL.revokeObjectURL(url)
}
