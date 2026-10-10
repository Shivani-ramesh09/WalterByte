import { useState } from 'react'
import { api } from '../../lib/api'
import { useSession } from '../../lib/session'
import { ErrorBox, Field } from '../../components/ui'
import { INTERESTS, interestLabel } from '../explore/happenings'

const splitList = (text) => text.split(',').map((s) => s.trim()).filter(Boolean)

/** Create (onboarding) or edit the signed-in student's profile. */
export default function ProfileForm({ onDone, onCancel }) {
  const { user, profile, setProfile } = useSession()
  const p = profile || {}
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [interests, setInterests] = useState(p.interests || [])
  const toggleInterest = (i) => setInterests(interests.includes(i) ? interests.filter((x) => x !== i) : [...interests, i])

  const submit = async (event) => {
    event.preventDefault()
    const f = new FormData(event.currentTarget)
    const body = {
      name: f.get('name').trim(),
      department: f.get('department').trim(),
      year: Number(f.get('year')),
      bio: f.get('bio').trim(),
      skills: splitList(f.get('skills')),
      interests,
      availability: f.get('availability'),
      contactMethod: { type: f.get('contactType'), value: f.get('contactValue').trim() },
      privacy: {
        profileVisible: f.get('profileVisible') === 'on',
        showContact: f.get('showContact') === 'on',
        showLocation: false,
      },
    }
    if (!profile && !interests.length) return setError(new Error('Pick at least one interest so we can show happenings for you.'))
    setBusy(true)
    setError(null)
    try {
      const saved = profile
        ? await api('/users/me', { method: 'PATCH', body })
        : await api('/users/me', { method: 'POST', body: { ...body, email: user.email } })
      setProfile(saved)
      onDone?.()
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <Field label="Full name"><input name="name" required maxLength={100} defaultValue={p.name} /></Field>
      <Field label="Department"><input name="department" required maxLength={100} defaultValue={p.department} placeholder="e.g. Computer Science" /></Field>
      <Field label="Year">
        <select name="year" defaultValue={p.year || 1}>{[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>Year {y}</option>)}</select>
      </Field>
      <Field label="Bio"><textarea name="bio" maxLength={500} rows={3} defaultValue={p.bio} placeholder="What do you do, what are you into?" /></Field>
      <Field label="Skills" hint="Comma separated, e.g. photography, video editing"><input name="skills" defaultValue={(p.skills || []).join(', ')} /></Field>
      <fieldset className="field interests">
        <legend className="field-label">Your interests {profile ? '' : '(pick at least one)'}</legend>
        <small className="field-hint">We use these to show campus happenings for you in Explore.</small>
        <div className="chips wrap">
          {INTERESTS.map((i) => (
            <button key={i} type="button" className={interests.includes(i) ? 'chip selected' : 'chip'} aria-pressed={interests.includes(i)} onClick={() => toggleInterest(i)}>
              {interestLabel(i)}
            </button>
          ))}
        </div>
      </fieldset>
      <Field label="Availability">
        <select name="availability" defaultValue={p.availability || 'available'}>
          <option value="available">Available</option>
          <option value="open_to_projects">Open to projects</option>
          <option value="busy">Busy</option>
        </select>
      </Field>
      <div className="row">
        <Field label="Contact via">
          <select name="contactType" defaultValue={p.contactMethod?.type || 'whatsapp'}>
            <option value="whatsapp">WhatsApp</option>
            <option value="email">Email</option>
            <option value="instagram">Instagram</option>
            <option value="none">None</option>
          </select>
        </Field>
        <Field label="Contact"><input name="contactValue" maxLength={200} defaultValue={p.contactMethod?.value} placeholder="+91… or @handle" /></Field>
      </div>
      <label className="check"><input type="checkbox" name="profileVisible" defaultChecked={p.privacy?.profileVisible ?? true} /> Show my profile to other students</label>
      <label className="check"><input type="checkbox" name="showContact" defaultChecked={p.privacy?.showContact ?? false} /> Show my contact to everyone (otherwise only to connections and accepted hires)</label>
      <ErrorBox error={error} />
      <div className="row">
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>}
        <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : profile ? 'Save profile' : 'Create profile'}</button>
      </div>
    </form>
  )
}
