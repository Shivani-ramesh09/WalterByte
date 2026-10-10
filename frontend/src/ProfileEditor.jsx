import React, { useEffect, useState } from 'react'
import { ArrowLeft, Check, UserRound } from 'lucide-react'
import * as api from './api.js'

const emptyProfile = (username = '') => ({
  name: username.replace(/[._-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
  department: '',
  year: 1,
  bio: '',
  skills: [],
  interests: [],
  availability: 'available',
})

const splitList = (value) => value.split(',').map((item) => item.trim()).filter(Boolean)

export default function ProfileEditor({ username, onBack }) {
  const [profile, setProfile] = useState(() => emptyProfile(username))
  const [hasProfile, setHasProfile] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let active = true
    api.getMyProfile()
      .then((data) => {
        if (!active) return
        setProfile({ ...emptyProfile(username), ...data })
        setHasProfile(true)
      })
      .catch((err) => {
        if (!active) return
        if (err.status !== 404) setError(err.message)
      })
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [username])

  async function handleSubmit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const body = {
      name: String(form.get('name')).trim(),
      department: String(form.get('department')).trim(),
      year: Number(form.get('year')),
      bio: String(form.get('bio')).trim(),
      skills: splitList(String(form.get('skills'))),
      interests: splitList(String(form.get('interests'))),
      availability: String(form.get('availability')),
    }

    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const result = hasProfile ? await api.updateMyProfile(body) : await api.upsertMyProfile(body)
      setProfile({ ...emptyProfile(username), ...result })
      setHasProfile(true)
      setSaved(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="profile-editor">
      <header className="profile-editor-header">
        <button className="connect-back" onClick={onBack} aria-label="Back to home"><ArrowLeft size={20} /></button>
        <div><span className="profile-kicker">AMRITA CAMPUS</span><h1>Edit profile</h1></div>
        <span className="profile-heading-icon"><UserRound size={19} /></span>
      </header>

      {loading ? <p className="profile-status">Loading your profile…</p> : (
        <form className="profile-form" onSubmit={handleSubmit}>
          <label>Full name<input name="name" required maxLength={100} defaultValue={profile.name} /></label>
          <label>Department<input name="department" required maxLength={100} placeholder="e.g. Computer Science" defaultValue={profile.department} /></label>
          <label>Year<select name="year" defaultValue={profile.year || 1}>{[1, 2, 3, 4, 5].map((year) => <option key={year} value={year}>Year {year}</option>)}</select></label>
          <label>Bio<textarea name="bio" maxLength={500} rows={3} placeholder="Tell people a little about yourself" defaultValue={profile.bio} /></label>
          <label>Skills<input name="skills" placeholder="e.g. design, photography" defaultValue={(profile.skills || []).join(', ')} /></label>
          <label>Interests<input name="interests" placeholder="e.g. music, robotics" defaultValue={(profile.interests || []).join(', ')} /></label>
          <label>Availability<select name="availability" defaultValue={profile.availability || 'available'}><option value="available">Available</option><option value="open_to_projects">Open to projects</option><option value="busy">Busy</option></select></label>
          {error && <p className="profile-error" role="alert">{error}</p>}
          {saved && <p className="profile-success" role="status"><Check size={15} /> Profile saved</p>}
          <button className="profile-save" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
        </form>
      )}
    </section>
  )
}
