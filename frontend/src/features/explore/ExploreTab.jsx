import { CalendarDays, Clock, Map, MapPin } from 'lucide-react'
import { useSession } from '../../lib/session'
import { Empty, ScreenHeader } from '../../components/ui'
import { HAPPENINGS, forInterests, interestLabel } from './happenings'

function HappeningCard({ h }) {
  return (
    <article className="card stack-sm">
      <div className="card-row"><strong>{h.title}</strong><span className="badge badge-open">Today</span></div>
      <p className="prose small">{h.description}</p>
      <div className="card-row small muted">
        <span className="wait"><MapPin size={13} /> {h.venue}</span>
        <span className="wait"><Clock size={13} /> {h.time}</span>
      </div>
      <div className="tag-row">{h.interests.map((i) => <span key={i} className="tag">{interestLabel(i)}</span>)}</div>
    </article>
  )
}

export default function ExploreTab() {
  const { profile } = useSession()
  const mine = forInterests(profile?.interests)
  const others = HAPPENINGS.filter((h) => !mine.includes(h))

  return (
    <div className="screen">
      <ScreenHeader title="Explore" subtitle="What's happening on campus" />

      <h3><CalendarDays size={15} className="accent" /> For you</h3>
      {mine.length ? mine.map((h) => <HappeningCard key={h.id} h={h} />) : (
        <Empty title="Nothing matching your interests today" text="Add interests in Me → Profile to see picks here." />
      )}

      {others.length > 0 && <h3>Also happening</h3>}
      {others.map((h) => <HappeningCard key={h.id} h={h} />)}

      <div className="card map-placeholder">
        <Map size={22} className="accent" />
        <strong>Campus map</strong>
        <small className="muted">Coming soon</small>
      </div>
    </div>
  )
}
