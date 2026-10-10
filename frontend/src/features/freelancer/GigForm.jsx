import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { api } from '../../lib/api'
import { ErrorBox, Field } from '../../components/ui'
import { SKILLS } from '../connect/ConnectTab'

const blankSample = { type: 'image', url: '', caption: '' }

/** Create or edit a gig. At least one work sample is required. */
export default function GigForm({ gig, onDone, onCancel }) {
  const [samples, setSamples] = useState(gig?.samples?.length ? gig.samples : [blankSample])
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const setSample = (i, patch) => setSamples(samples.map((s, j) => (j === i ? { ...s, ...patch } : s)))

  const submit = async (e) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const body = {
      title: f.get('title').trim(),
      skill: f.get('skill').trim(),
      description: f.get('description').trim(),
      priceFrom: Number(f.get('priceFrom')),
      deliveryDays: Number(f.get('deliveryDays')),
      samples: samples.filter((s) => s.url.trim()).map((s) => ({ ...s, url: s.url.trim(), caption: s.caption.trim() })),
    }
    if (!body.samples.length) return setError(new Error('Add at least one work sample so buyers can see your work.'))
    setBusy(true)
    setError(null)
    try {
      await api(gig ? `/freelancer/gigs/${gig.id}` : '/freelancer/gigs', { method: gig ? 'PATCH' : 'POST', body })
      onDone()
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  return (
    <form className="card stack-sm" onSubmit={submit}>
      <h3>{gig ? 'Edit gig' : 'New gig'}</h3>
      <Field label="Title"><input name="title" required minLength={5} maxLength={100} defaultValue={gig?.title} placeholder="Event photography with edited photos in 48h" /></Field>
      <Field label="Skill">
        <input name="skill" required list="gig-skills" minLength={2} maxLength={50} defaultValue={gig?.skill} />
        <datalist id="gig-skills">{SKILLS.map((s) => <option key={s} value={s} />)}</datalist>
      </Field>
      <Field label="Description" hint="At least 20 characters: what you deliver, what's included">
        <textarea name="description" required minLength={20} maxLength={1500} rows={4} defaultValue={gig?.description} />
      </Field>
      <div className="row">
        <Field label="Price from (₹)"><input name="priceFrom" type="number" min={0} max={100000} required defaultValue={gig?.priceFrom ?? 500} /></Field>
        <Field label="Delivery (days)"><input name="deliveryDays" type="number" min={1} max={60} required defaultValue={gig?.deliveryDays ?? 3} /></Field>
      </div>

      <h3>Work samples</h3>
      <small className="muted">Show real work. Use https links to an image, a video (YouTube, Drive) or your portfolio. Up to 6.</small>
      {samples.map((s, i) => (
        <div key={i} className="sample-editor">
          <div className="row">
            <select value={s.type} onChange={(e) => setSample(i, { type: e.target.value })} aria-label={`Sample ${i + 1} type`}>
              <option value="image">Image</option>
              <option value="video">Video</option>
              <option value="link">Link</option>
            </select>
            <input type="url" value={s.url} onChange={(e) => setSample(i, { url: e.target.value })} placeholder="https://…" aria-label={`Sample ${i + 1} link`} pattern="https://.*" />
            {samples.length > 1 && (
              <button type="button" className="icon-btn" onClick={() => setSamples(samples.filter((_, j) => j !== i))} aria-label={`Remove sample ${i + 1}`}><Trash2 size={16} /></button>
            )}
          </div>
          <input value={s.caption} onChange={(e) => setSample(i, { caption: e.target.value })} placeholder="Caption, e.g. Techfest main stage" maxLength={120} aria-label={`Sample ${i + 1} caption`} />
          {s.type === 'image' && s.url.startsWith('https://') && <img className="sample-preview" src={s.url} alt={`Preview of sample ${i + 1}`} />}
        </div>
      ))}
      {samples.length < 6 && <button type="button" className="btn ghost small" onClick={() => setSamples([...samples, blankSample])}>+ Add another sample</button>}

      <ErrorBox error={error} />
      <div className="row">
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : gig ? 'Save gig' : 'Publish gig'}</button>
      </div>
    </form>
  )
}
