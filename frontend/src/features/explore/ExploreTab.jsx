import { useEffect, useState } from 'react'
import { Bookmark, CalendarDays, CheckCircle2, Clock, Map, MapPin, Sparkles, Users } from 'lucide-react'
import { useSession } from '../../lib/session'
import { useNav } from '../../lib/nav'
import { Empty, ScreenHeader } from '../../components/ui'
import { HAPPENINGS, interestLabel, matchedInterests, recommendationReason, upcoming, whenLabel } from './happenings'

// shortcut: RSVPs and saves live in this browser only, move to the backend with the events collection
function useMyEvents(uid) {
  const key = `walterbyte.events.${uid}`
  const [mine, setMine] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(key)) || {}
    } catch {
      return {}
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(mine))
    } catch {
      // Storage blocked: choices last for this session only
    }
  }, [key, mine])
  const toggle = (id, kind) => setMine((m) => ({ ...m, [id]: { ...m[id], [kind]: !m[id]?.[kind] } }))
  return [mine, toggle]
}

export default function ExploreTab() {
  const { screen } = useNav()
  const { user, profile } = useSession()
  const [mine, toggle] = useMyEvents(user.uid)
  const interests = profile?.interests || []
  if (screen.name === 'event') {
    const event = HAPPENINGS.find((h) => h.id === screen.id)
    return <EventDetail event={event} interests={interests} status={mine[event?.id] || {}} toggle={toggle} />
  }
  return <EventList interests={interests} mine={mine} />
}

function EventCard({ event, reason, status }) {
  const { go } = useNav()
  return (
    <button className="card card-button" onClick={() => go('explore', { name: 'event', id: event.id })}>
      <div className="card-row">
        <strong>{event.title}</strong>
        {status.going ? <span className="badge badge-open">Going</span> : status.saved ? <span className="badge">Saved</span> : null}
      </div>
      {reason && <span className="reason"><Sparkles size={13} /> {reason}</span>}
      <span className="wait small muted"><CalendarDays size={13} /> {whenLabel(event)}</span>
      <span className="wait small muted"><MapPin size={13} /> {event.venue}</span>
      <span className="link-btn small">View event →</span>
    </button>
  )
}

function EventList({ interests, mine }) {
  const { go } = useNav()
  const events = upcoming()
  const forYou = events.filter((e) => matchedInterests(e, interests).length)
  const others = events.filter((e) => !forYou.includes(e))

  return (
    <div className="screen">
      <ScreenHeader title="Explore" subtitle="What's happening on campus" />
      <p className="notice small">Sample events for the demo. Dates and venues are placeholders until organisers confirm.</p>

      <h3><Sparkles size={15} className="accent" /> For you</h3>
      {!interests.length ? (
        <Empty title="Pick your interests to get event picks" action={<button className="btn primary small" onClick={() => go('me', { name: 'home' })}>Add interests in Me → Profile</button>} />
      ) : forYou.length ? (
        forYou.map((e) => <EventCard key={e.id} event={e} reason={recommendationReason(e, interests)} status={mine[e.id] || {}} />)
      ) : (
        <Empty title="Nothing matches your interests yet" text="New events show up here as clubs add them. Browse everything below." />
      )}

      {others.length > 0 && <h3><CalendarDays size={15} className="accent" /> Also happening</h3>}
      {others.map((e) => <EventCard key={e.id} event={e} status={mine[e.id] || {}} />)}
      {!events.length && <Empty title="No upcoming events" text="Past events are hidden. Check back soon." />}

      <div className="card map-placeholder">
        <Map size={22} className="accent" />
        <strong>Campus map</strong>
        <small className="muted">Coming soon</small>
      </div>
    </div>
  )
}

function EventDetail({ event, interests, status, toggle }) {
  const { go } = useNav()
  const back = () => go('explore', { name: 'home' })
  if (!event) {
    return (
      <div className="screen">
        <ScreenHeader title="Event" onBack={back} />
        <Empty title="This event is no longer listed" action={<button className="btn primary" onClick={back}>See upcoming events</button>} />
      </div>
    )
  }
  const reason = recommendationReason(event, interests)
  const ended = new Date(event.end) <= new Date()

  return (
    <div className="screen">
      <ScreenHeader title={event.title} subtitle={`By ${event.organiser}`} onBack={back} />
      {reason && <span className="reason"><Sparkles size={13} /> {reason}</span>}
      <section className="card stack-sm">
        <span className="wait"><CalendarDays size={15} /> {whenLabel(event)}</span>
        <span className="wait"><MapPin size={15} /> {event.venue}</span>
        <span className="wait"><Users size={15} /> {event.organiser}</span>
      </section>
      <p className="prose">{event.description}</p>
      <div className="tag-row">{event.interests.map((i) => <span key={i} className="tag">{interestLabel(i)}</span>)}</div>

      {ended ? (
        <p className="notice">This event has ended.</p>
      ) : (
        <div className="row">
          <button className={status.saved ? 'btn ghost' : 'btn'} aria-pressed={Boolean(status.saved)} onClick={() => toggle(event.id, 'saved')}>
            <Bookmark size={16} /> {status.saved ? 'Saved' : 'Save'}
          </button>
          <button className="btn primary" aria-pressed={Boolean(status.going)} onClick={() => toggle(event.id, 'going')}>
            <CheckCircle2 size={16} /> {status.going ? "You're going · undo" : 'RSVP'}
          </button>
        </div>
      )}
      {status.going && !ended && (
        <p className="success-box" role="status"><Clock size={16} /> You're on the list for {whenLabel(event)}.</p>
      )}
      <small className="muted">RSVPs are saved on this device for the demo; organisers don't receive them yet.</small>
    </div>
  )
}
