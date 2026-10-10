import { useState } from 'react'
import { Search } from 'lucide-react'
import { inr, useApi } from '../../lib/api'
import { useNav } from '../../lib/nav'
import { Chips, Empty, ErrorBox, Loading, ScreenHeader } from '../../components/ui'
import GigDetail from './GigDetail'
import PersonView from './PersonView'
import RequestsBoard from './RequestsBoard'
import FreelancerDashboard from '../freelancer/FreelancerDashboard'

export const SKILLS = ['photography', 'video editing', 'ui design', 'graphic design', 'web development', 'content writing']

export default function ConnectTab() {
  const { screen } = useNav()
  if (screen.name === 'gig') return <GigDetail gigId={screen.gigId} />
  if (screen.name === 'person') return <PersonView uid={screen.uid} />
  if (screen.name === 'freelancer') return <FreelancerDashboard />
  return <ConnectHome />
}

function ConnectHome() {
  const [section, setSection] = useState('gigs')
  return (
    <div className="screen">
      <ScreenHeader
        title="Connect"
        subtitle="Hire student talent, find teammates"
      />
      <Chips label="Connect section" options={[{ value: 'gigs', label: 'Hire talent' }, { value: 'people', label: 'People' }, { value: 'requests', label: 'Requests board' }]} value={section} onChange={(v) => v && setSection(v)} />
      {section === 'gigs' && <GigList />}
      {section === 'people' && <PeopleSearch />}
      {section === 'requests' && <RequestsBoard />}
    </div>
  )
}

export function GigCard({ gig }) {
  const { go } = useNav()
  const cover = gig.samples.find((s) => s.type === 'image')
  return (
    <button className="card card-button gig-card" onClick={() => go('connect', { name: 'gig', gigId: gig.id })}>
      {cover ? <img src={cover.url} alt={cover.caption || gig.title} loading="lazy" /> : <div className="gig-cover-fallback">{gig.skill}</div>}
      <div className="stack-xs">
        <small className="eyebrow-text">{gig.skill}</small>
        <strong>{gig.title}</strong>
        <small className="muted">{gig.sellerName} · {gig.sellerDepartment}</small>
        <div className="card-row small">
          <span>From <strong>{inr(gig.priceFrom)}</strong></span>
          <span className="muted">{gig.deliveryDays}-day delivery · {gig.samples.length} sample{gig.samples.length > 1 ? 's' : ''}</span>
        </div>
      </div>
    </button>
  )
}

function GigList() {
  const [skill, setSkill] = useState(null)
  const { data, loading, error, reload } = useApi(`/gigs${skill ? `?skill=${encodeURIComponent(skill)}` : ''}`)
  return (
    <div className="stack">
      <Chips label="Filter by skill" options={SKILLS} value={skill} onChange={setSkill} />
      {loading && <Loading label="Loading gigs…" />}
      <ErrorBox error={error} onRetry={reload} />
      {data && !data.gigs.length && <Empty title="No gigs here yet" text="Be the first: tap Sell your skills." />}
      {data?.gigs.map((g) => <GigCard key={g.id} gig={g} />)}
    </div>
  )
}

function PeopleSearch() {
  const { go } = useNav()
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [skill, setSkill] = useState(null)
  const params = new URLSearchParams({ ...(query && { q: query }), ...(skill && { skills: skill }) })
  const { data, loading, error, reload } = useApi(`/users/search?${params}`)

  return (
    <div className="stack">
      <form className="inline-search" onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()) }}>
        <Search size={16} aria-hidden="true" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, skill or interest" aria-label="Search people" />
      </form>
      <Chips label="Filter by skill" options={SKILLS} value={skill} onChange={setSkill} />
      {loading && <Loading label="Searching…" />}
      <ErrorBox error={error} onRetry={reload} />
      {data && !data.results.length && <Empty title="Nobody matches yet" text="Try another skill or name." />}
      {data?.results.map((p) => (
        <button key={p.uid} className="card card-button" onClick={() => go('connect', { name: 'person', uid: p.uid })}>
          <div className="card-row"><strong>{p.name}</strong><span className="badge">{p.availability.replace(/_/g, ' ')}</span></div>
          <small className="muted">{p.department} · Year {p.year}</small>
          <div className="tag-row">{p.skills.map((s) => <span key={s} className="tag">{s}</span>)}</div>
        </button>
      ))}
    </div>
  )
}
