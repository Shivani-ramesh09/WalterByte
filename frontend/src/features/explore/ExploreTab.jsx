import { useState } from 'react'
import { Bookmark, CalendarDays, CheckCircle2, Clock, Map, MapPin, MessageSquare, Sparkles, Star, Users } from 'lucide-react'
import { api, useApi } from '../../lib/api'
import { useSession } from '../../lib/session'
import { useNav } from '../../lib/nav'
import { Empty, ErrorBox, Loading, ScreenHeader } from '../../components/ui'
import { interestLabel, matchedInterests, recommendationReason, whenLabel } from './happenings'

export default function ExploreTab() {
  const { screen } = useNav()
  const { profile } = useSession()
  const interests = profile?.interests || []
  if (screen.name === 'event') return <EventDetail id={screen.id} interests={interests} />
  return <EventList interests={interests} />
}

function EventCard({ event, reason }) {
  const { go } = useNav()
  const { me } = event
  return (
    <button className="card card-button" onClick={() => go('explore', { name: 'event', id: event.id })}>
      <div className="card-row">
        <strong>{event.title}</strong>
        {me.attended ? <span className="badge badge-open">Attended</span> : me.registered ? <span className="badge badge-open">Going</span> : me.saved ? <span className="badge">Saved</span> : null}
      </div>
      {event.synthetic && <span className="badge badge-demo">Synthetic demo event</span>}
      {reason && <span className="reason"><Sparkles size={13} /> {reason}</span>}
      <span className="wait small muted"><CalendarDays size={13} /> {whenLabel(event)}</span>
      <span className="wait small muted"><MapPin size={13} /> {event.venue}</span>
      <span className="link-btn small">{me.attended && !me.feedbackGiven ? 'Rate this event →' : 'View event →'}</span>
    </button>
  )
}

function EventList({ interests }) {
  const { go } = useNav()
  const { data, loading, error, reload } = useApi('/events')
  const events = data?.upcoming || []
  const forYou = events.filter((e) => matchedInterests(e, interests).length)
  const others = events.filter((e) => !forYou.includes(e))
  const toRate = (data?.attended || []).filter((e) => !e.me.feedbackGiven)

  return (
    <div className="screen">
      <ScreenHeader title="Explore" subtitle="What's happening on campus" />
      <p className="notice small">Sample events for the demo. Dates and venues are placeholders until organisers confirm.</p>
      {loading && <Loading label="Loading events…" />}
      <ErrorBox error={error} onRetry={reload} />

      {toRate.length > 0 && (
        <>
          <h3><MessageSquare size={15} className="accent" /> How was it?</h3>
          {toRate.map((e) => <EventCard key={e.id} event={e} />)}
        </>
      )}

      {data && (
        <>
          <h3><Sparkles size={15} className="accent" /> For you</h3>
          {!interests.length ? (
            <Empty title="Pick your interests to get event picks" action={<button className="btn primary small" onClick={() => go('me', { name: 'home' })}>Add interests in Me → Profile</button>} />
          ) : forYou.length ? (
            forYou.map((e) => <EventCard key={e.id} event={e} reason={recommendationReason(e, interests)} />)
          ) : (
            <Empty title="Nothing matches your interests yet" text="New events show up here as clubs add them. Browse everything below." />
          )}

          {others.length > 0 && <h3><CalendarDays size={15} className="accent" /> Also happening</h3>}
          {others.map((e) => <EventCard key={e.id} event={e} />)}
          {!events.length && <Empty title="No upcoming events" text="Past events are hidden. Check back soon." />}
        </>
      )}

      <div className="card map-placeholder">
        <Map size={22} className="accent" />
        <strong>Campus map</strong>
        <small className="muted">Coming soon</small>
      </div>
    </div>
  )
}

function EventDetail({ id, interests }) {
  const { go } = useNav()
  const back = () => go('explore', { name: 'home' })
  const { data: event, loading, error, reload } = useApi(`/events/${encodeURIComponent(id)}`)
  const [me, setMe] = useState(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(null)

  if (loading) return <div className="screen"><ScreenHeader title="Event" onBack={back} /><Loading /></div>
  if (error || !event) {
    return (
      <div className="screen">
        <ScreenHeader title="Event" onBack={back} />
        {error?.status === 404 ? (
          <Empty title="This event is no longer listed" action={<button className="btn primary" onClick={back}>See upcoming events</button>} />
        ) : (
          <ErrorBox error={error} onRetry={reload} />
        )}
      </div>
    )
  }

  const status = me || event.me
  const reason = recommendationReason(event, interests)
  const ended = new Date(event.end) <= new Date()
  // Count as of this page load, adjusted for the student's own change since
  const registeredCount = event.registeredCount + Number(status.registered) - Number(event.me.registered)
  const full = event.capacity && registeredCount >= event.capacity && !status.registered

  const update = async (patch) => {
    setBusy(true)
    setActionError(null)
    try {
      setMe(await api(`/events/${encodeURIComponent(id)}/me`, { method: 'PATCH', body: patch }))
    } catch (err) {
      setActionError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <ScreenHeader title={event.title} subtitle={`By ${event.organiser}`} onBack={back} />
      {event.synthetic && <span className="badge badge-demo">Synthetic demo event</span>}
      {reason && <span className="reason"><Sparkles size={13} /> {reason}</span>}
      <section className="card stack-sm">
        <span className="wait"><CalendarDays size={15} /> {whenLabel(event)}</span>
        <span className="wait"><MapPin size={15} /> {event.venue}</span>
        <span className="wait"><Users size={15} /> {event.organiser}{event.capacity ? ` · ${registeredCount}/${event.capacity} registered` : ''}</span>
      </section>
      <p className="prose">{event.description}</p>
      <div className="tag-row">{event.interests.map((i) => <span key={i} className="tag">{interestLabel(i)}</span>)}</div>

      {ended ? (
        status.attended ? (
          <FeedbackForm id={id} given={status.feedbackGiven} onDone={() => setMe({ ...status, feedbackGiven: true })} />
        ) : (
          <p className="notice">This event has ended.</p>
        )
      ) : (
        <div className="row">
          <button className={status.saved ? 'btn ghost' : 'btn'} disabled={busy} aria-pressed={status.saved} onClick={() => update({ saved: !status.saved })}>
            <Bookmark size={16} /> {status.saved ? 'Saved' : 'Save'}
          </button>
          <button className="btn primary" disabled={busy || full} aria-pressed={status.registered} onClick={() => update({ registered: !status.registered })}>
            <CheckCircle2 size={16} /> {status.registered ? "You're going · cancel" : full ? 'Event full' : 'Register'}
          </button>
        </div>
      )}
      <ErrorBox error={actionError} />
      {status.registered && !ended && (
        <p className="success-box" role="status"><Clock size={16} /> You're registered for {whenLabel(event)}. The organiser marks attendance on the day.</p>
      )}
    </div>
  )
}

function FeedbackForm({ id, given, onDone }) {
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  if (given) return <p className="success-box" role="status"><CheckCircle2 size={16} /> Thanks, your feedback was sent to the organisers.</p>

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api(`/events/${encodeURIComponent(id)}/feedback`, { method: 'POST', body: { rating, comment: comment.trim() || undefined } })
      onDone()
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  return (
    <form className="card stack-sm" onSubmit={submit}>
      <strong>You attended. How was it?</strong>
      <div className="row" role="radiogroup" aria-label="Rating out of 5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} className={n <= rating ? 'icon-btn accent' : 'icon-btn'} onClick={() => setRating(n)}>
            <Star size={20} fill={n <= rating ? 'currentColor' : 'none'} />
          </button>
        ))}
      </div>
      <textarea className="input" rows={3} maxLength={500} placeholder="Optional: what worked, what could be better" value={comment} onChange={(e) => setComment(e.target.value)} />
      <ErrorBox error={error} />
      <button className="btn primary" disabled={busy || !rating}>{busy ? 'Sending…' : 'Send feedback'}</button>
      <small className="muted">Optional. Only the organisers and campus administration see it.</small>
    </form>
  )
}
