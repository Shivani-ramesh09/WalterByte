import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react'

export function ScreenHeader({ title, subtitle, onBack, action }) {
  return (
    <div className="screen-header">
      {onBack && (
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
      )}
      <div className="screen-title">
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="state" role="status">
      <Loader2 className="spin" size={22} />
      <span>{label}</span>
    </div>
  )
}

export function ErrorBox({ error, onRetry }) {
  if (!error) return null
  return (
    <div className="error-box" role="alert">
      <span>{error.message || String(error)}</span>
      {onRetry && (
        <button className="link-btn" onClick={() => onRetry()}>
          <RefreshCw size={14} /> Retry
        </button>
      )}
    </div>
  )
}

export function Empty({ title, text, action }) {
  return (
    <div className="state empty">
      <strong>{title}</strong>
      {text && <span>{text}</span>}
      {action}
    </div>
  )
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  )
}

export function Chips({ options, value, onChange, label }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => {
        const id = typeof o === 'string' ? o : o.value
        const text = typeof o === 'string' ? o : o.label
        return (
          <button key={id} type="button" className={value === id ? 'chip selected' : 'chip'} aria-pressed={value === id} onClick={() => onChange(value === id ? null : id)}>
            {text}
          </button>
        )
      })}
    </div>
  )
}

export function Stepper({ value, onChange, max = 10, label }) {
  return (
    <div className="stepper" aria-label={label}>
      <button type="button" onClick={() => onChange(value - 1)} aria-label={`Remove one ${label}`}>−</button>
      <span aria-live="polite">{value}</span>
      <button type="button" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={`Add one ${label}`}>+</button>
    </div>
  )
}

export function VegMark({ isVeg }) {
  return <span className={isVeg ? 'veg-mark veg' : 'veg-mark nonveg'} aria-label={isVeg ? 'Vegetarian' : 'Non-vegetarian'} title={isVeg ? 'Veg' : 'Non-veg'} />
}

export function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{status.replace('_', ' ')}</span>
}
