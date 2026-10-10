import { useState } from 'react'
import { BarChart3, CalendarDays, Download, FileText, Lightbulb, Network, Utensils } from 'lucide-react'
import { useApi } from '../../lib/api'
import { useSession } from '../../lib/session'
import { ErrorBox, Loading } from '../../components/ui'
import { DataNotes, Kpi, PeriodPicker, Section, SyntheticBanner, Table, downloadReport, num, pct, periodQuery } from './adminUi'
import { EventAttendance, ExploreAdmin, OrganisationDetail } from './ExploreAdmin'
import { ConnectAdmin } from './ConnectAdmin'
import { ProposalDetail, ProposalForm, ProposalList } from './ProposalsAdmin'
import { RecommendationsAdmin } from './RecommendationsAdmin'
import { EatAdmin, EatItem, EatMenus } from './EatAdmin'

const CENTRAL_NAV = [
  { name: 'overview', label: 'Overview', icon: BarChart3 },
  { name: 'explore', label: 'Explore', icon: CalendarDays },
  { name: 'connect', label: 'Connect', icon: Network },
  { name: 'eat', label: 'Eat', icon: Utensils },
  { name: 'proposals', label: 'Proposals', icon: FileText },
  { name: 'recommendations', label: 'Recommendations', icon: Lightbulb },
  { name: 'reports', label: 'Reports', icon: Download },
]
const ORG_NAV = [
  { name: 'organisation', label: 'My organisation', icon: CalendarDays },
  { name: 'explore', label: 'Event analytics', icon: BarChart3 },
  { name: 'proposals', label: 'Proposals', icon: FileText },
]

export default function AdminApp() {
  const { admin } = useSession()
  const central = admin.role === 'central'
  const nav = central ? CENTRAL_NAV : ORG_NAV
  const [view, setView] = useState({ name: nav[0].name })
  const [days, setDays] = useState(30)
  const go = (name, extra = {}) => setView({ name, ...extra })
  const ctx = { admin, central, go, query: periodQuery(days), days, setDays }

  const top = nav.some((n) => n.name === view.name) ? view.name : null
  return (
    <div className="admin">
      <nav className="admin-nav" aria-label="Administration sections">
        {nav.map(({ name, label, icon: Icon }) => (
          <button key={name} type="button" className={top === name ? 'admin-tab active' : 'admin-tab'} aria-current={top === name ? 'page' : undefined} onClick={() => go(name)}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </nav>
      <main className="admin-main">
        <p className="muted small">
          Signed in as {admin.name || 'administrator'} · {central ? 'Central administration' : 'Organisation representative'}
        </p>
        <View view={view} ctx={ctx} />
      </main>
    </div>
  )
}

function View({ view, ctx }) {
  switch (view.name) {
    case 'overview': return <Overview ctx={ctx} />
    case 'explore': return <ExploreAdmin ctx={ctx} />
    case 'organisation': return <OrganisationDetail ctx={ctx} id={view.id || ctx.admin.orgId} />
    case 'attendance': return <EventAttendance ctx={ctx} id={view.id} back={view.back} backId={view.backId} />
    case 'connect': return <ConnectAdmin ctx={ctx} />
    case 'eat': return <EatAdmin ctx={ctx} />
    case 'eat-item': return <EatItem ctx={ctx} canteenId={view.canteenId} itemId={view.itemId} />
    case 'eat-menus': return <EatMenus ctx={ctx} />
    case 'proposals': return <ProposalList ctx={ctx} />
    case 'proposal': return <ProposalDetail ctx={ctx} id={view.id} />
    case 'new-proposal': return <ProposalForm ctx={ctx} />
    case 'recommendations': return <RecommendationsAdmin ctx={ctx} />
    case 'reports': return <Reports ctx={ctx} />
    default: return null
  }
}

function Overview({ ctx }) {
  const { data, loading, error, reload } = useApi(`/admin/overview?${ctx.query}`)
  return (
    <>
      <h2>Overview</h2>
      <PeriodPicker value={ctx.days} onChange={ctx.setDays} label={data && { current: data.period.label, previous: data.period.previous.label }} />
      {loading && <Loading />}
      <ErrorBox error={error} onRetry={reload} />
      {data && (
        <>
          <SyntheticBanner show={data.synthetic} />
          <Section title="Explore: events" action={<button className="link-btn" onClick={() => ctx.go('explore')}>Details →</button>}>
            <div className="kpis">
              <Kpi label="Events held" value={data.explore.events} previous={data.explore.previous.events} kind="observed" definition="Published events that started in the period." />
              <Kpi label="Registrations" value={data.explore.registrations} previous={data.explore.previous.registrations} kind="observed" definition="Current registrations (cancellations excluded), one per student per event." />
              <Kpi label="Verified attendance" value={data.explore.attended} previous={data.explore.previous.attended} kind="observed" definition="Attendance marked by the organiser or administration. Registrations are not attendance." />
              <Kpi label="Unique attendees" value={data.explore.uniqueAttendees} previous={data.explore.previous.uniqueAttendees} kind="derived" definition="Distinct students with verified attendance at one or more events." />
              <Kpi label="Registration → attendance" value={data.explore.conversion} previous={data.explore.previous.conversion} format={pct} kind="derived" definition="Verified attendance ÷ registrations across all events in the period." />
              <Kpi label="Average feedback" value={data.explore.feedback.average} format={(x) => (x === null ? '–' : `${x.toFixed(1)} / 5 (${data.explore.feedback.responses})`)} kind="observed" definition="Mean rating from verified attendees who chose to give feedback; the number of responses is in brackets." />
            </div>
          </Section>
          <Section title="Connect: skills" action={<button className="link-btn" onClick={() => ctx.go('connect')}>Details →</button>}>
            <div className="kpis">
              <Kpi label="Collaboration requests" value={data.connect.requests} previous={data.connect.previousRequests} kind="observed" definition="Requests posted on Connect in the period." />
              <Kpi label="Gig hire requests" value={data.connect.hireRequests} previous={data.connect.previousHireRequests} kind="observed" definition="Hire requests sent to student freelancers in the period." />
              <Kpi label="Unanswered requests" value={data.connect.unansweredRequests} kind="derived" definition="Requests from the period still open with no responses." />
              <Kpi label="Unserved hire requests" value={data.connect.unservedHires} kind="derived" definition="Hire requests declined, or pending for more than 7 days." />
            </div>
            <h4>Largest skill-demand gaps</h4>
            <Table
              rows={data.connect.topGaps}
              rowKey={(r) => r.skill}
              onRowClick={() => ctx.go('connect')}
              initialSort={{ key: 'demand', dir: 'desc' }}
              columns={[
                { key: 'skill', label: 'Skill' },
                { key: 'demand', label: 'Requests', format: num },
                { key: 'activeProviders', label: 'Active providers', format: num },
                { key: 'demandToSupply', label: 'Demand ÷ supply', format: (x) => (x === null ? 'no providers' : x.toFixed(1)) },
              ]}
            />
          </Section>
          <Section title="Eat: canteens" action={<button className="link-btn" onClick={() => ctx.go('eat')}>Details →</button>}>
            <Table
              rows={data.eat.canteens}
              rowKey={(r) => r.canteenId}
              onRowClick={() => ctx.go('eat')}
              initialSort={{ key: 'gross', dir: 'desc' }}
              empty="No published daily menus in this period."
              columns={[
                { key: 'name', label: 'Canteen' },
                { key: 'sold', label: 'Portions sold', format: num },
                { key: 'gross', label: 'Gross sales (not profit)', format: (x) => `₹${num(x)}` },
                { key: 'counterSold', label: 'Counter / online', format: (x, r) => `${num(x)} / ${num(r.onlineSold)}` },
                { key: 'earlyStockouts', label: 'Early sell-outs', format: num },
                { key: 'signals', label: 'Failed attempts / counter requests', format: (s) => `${s.failedOnlineAttempts} / ${s.counterRequests}`, sort: (r) => r.signals.failedOnlineAttempts },
                { key: 'incompleteDays', label: 'Incomplete counter days', format: num },
              ]}
            />
          </Section>
          <Section title="Recommendations">
            <p>{data.openRecommendations} recommendation{data.openRecommendations === 1 ? '' : 's'} awaiting review. <button className="link-btn" onClick={() => ctx.go('recommendations')}>Review →</button></p>
          </Section>
        </>
      )}
    </>
  )
}

const REPORTS = [
  { kind: 'events', title: 'Events', text: 'One row per event: viewers, saves, registrations, verified attendance, conversion, utilisation and feedback.' },
  { kind: 'organisations', title: 'Organisations', text: 'Per organisation: events, unique registrants and attendees, repeat attendees, against the previous period.' },
  { kind: 'eat-items', title: 'Canteen items', text: 'Per canteen and item: sold by channel, gross sales (not profit), stockouts and each unmet-demand signal type, kept separate.' },
  { kind: 'skills', title: 'Skill demand', text: 'Per skill: requests, hire requests, unfulfilled, active providers and profiles listing the skill.' },
]

function Reports({ ctx }) {
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null)
  const download = async (kind) => {
    setBusy(kind)
    setError(null)
    try {
      await downloadReport(kind, ctx.query)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(null)
    }
  }
  return (
    <>
      <h2>Reports</h2>
      <PeriodPicker value={ctx.days} onChange={ctx.setDays} />
      <p className="muted small">CSV exports use the same calculations as the dashboard. Synthetic demonstration records are flagged in the events report.</p>
      <ErrorBox error={error} />
      {REPORTS.map((r) => (
        <div key={r.kind} className="card card-row">
          <div><strong>{r.title}</strong><p className="muted small">{r.text}</p></div>
          <button className="btn small" disabled={busy === r.kind} onClick={() => download(r.kind)}><Download size={15} /> {busy === r.kind ? 'Preparing…' : 'CSV'}</button>
        </div>
      ))}
      <DataNotes quality={{ notes: ['Reports contain aggregate counts only, never student names or ids.'] }} />
    </>
  )
}
