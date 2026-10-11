import { useState } from 'react'
import { api, useApi } from '../../lib/api'
import { Empty, ErrorBox, Loading, ScreenHeader } from '../../components/ui'
import { Bars, DataNotes, Kpi, PeriodPicker, Section, SyntheticBanner, Table, day, num, pct } from './adminUi'

const feedbackCell = (f) => (f.average === null ? '–' : `${f.average.toFixed(1)} (${f.responses})`)

const EVENT_COLUMNS = [
  { key: 'title', label: 'Event' },
  { key: 'start', label: 'Date', format: day },
  { key: 'viewers', label: 'Viewers', format: num },
  { key: 'registrations', label: 'Registered', format: num },
  { key: 'attended', label: 'Attended', format: num },
  { key: 'conversion', label: 'Reg → attend', format: pct },
  { key: 'utilisation', label: 'Capacity used', format: pct },
  { key: 'feedback', label: 'Feedback', format: feedbackCell, sort: (r) => r.feedback.average },
]

export function ExploreAdmin({ ctx }) {
  const { data, loading, error, reload } = useApi(`/admin/explore?${ctx.query}`)
  return (
    <>
      <h2>Explore intelligence</h2>
      <PeriodPicker value={ctx.days} onChange={ctx.setDays} label={data && { current: data.period.label, previous: data.period.previous.label }} />
      {loading && <Loading />}
      <ErrorBox error={error} onRetry={reload} />
      {data && (
        <>
          <SyntheticBanner show={data.dataQuality.synthetic} />
          <div className="kpis">
            <Kpi label="Events" value={data.summary.current.events} previous={data.summary.previous.events} kind="observed" />
            <Kpi label="Viewers" value={data.summary.current.viewers} previous={data.summary.previous.viewers} kind="observed" definition="Students who opened an event's detail page, once per event." />
            <Kpi label="Registrations" value={data.summary.current.registrations} previous={data.summary.previous.registrations} kind="observed" />
            <Kpi label="Verified attendance" value={data.summary.current.attended} previous={data.summary.previous.attended} kind="observed" />
            <Kpi label="Repeat attendees" value={data.summary.current.repeatAttendees} previous={data.summary.previous.repeatAttendees} kind="derived" definition="Students with verified attendance at two or more events in the period." />
            <Kpi label="Reg → attend" value={data.summary.current.conversion} previous={data.summary.previous.conversion} format={pct} kind="derived" />
          </div>

          <Section title="Interest by category">
            <Bars
              caption="Registrations and verified attendance per event category, this period"
              series={[{ key: 'registrations', label: 'Registrations' }, { key: 'attended', label: 'Verified attendance' }, { key: 'previous', label: 'Previous period registrations' }]}
              rows={data.categories.map((c) => ({ label: c.category, registrations: c.current.registrations, attended: c.current.attended, previous: c.previous.registrations }))}
            />
          </Section>

          <Section title="Organisations">
            <Table
              rows={data.organisations}
              rowKey={(r) => r.orgId}
              onRowClick={(r) => ctx.go('organisation', { id: r.orgId })}
              initialSort={{ key: 'attended', dir: 'desc' }}
              columns={[
                { key: 'name', label: 'Organisation' },
                { key: 'events', label: 'Events', format: (_, r) => num(r.current.events), sort: (r) => r.current.events },
                { key: 'uniqueRegistrants', label: 'Unique registrants', format: (_, r) => num(r.current.uniqueRegistrants), sort: (r) => r.current.uniqueRegistrants },
                { key: 'attended', label: 'Verified attendance', format: (_, r) => `${num(r.current.attended)} (prev ${num(r.previous.attended)})`, sort: (r) => r.current.attended },
                { key: 'conversion', label: 'Reg → attend', format: (_, r) => pct(r.current.conversion), sort: (r) => r.current.conversion },
              ]}
            />
          </Section>

          <Section title="Events in this period">
            <Table rows={data.events} rowKey={(r) => r.eventId} onRowClick={(r) => ctx.go('attendance', { id: r.eventId, back: 'explore' })} initialSort={{ key: 'start', dir: 'desc' }} columns={EVENT_COLUMNS} />
          </Section>
          <DataNotes quality={data.dataQuality} />
        </>
      )}
    </>
  )
}

export function OrganisationDetail({ ctx, id }) {
  const { data, loading, error, reload } = useApi(`/admin/organisations/${encodeURIComponent(id)}`)
  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} onRetry={reload} />
  const { organisation: org, summary } = data
  return (
    <>
      <ScreenHeader title={org.name} subtitle={`${org.category} · all events on record`} onBack={ctx.central ? () => ctx.go('explore') : undefined} />
      <SyntheticBanner show={org.synthetic || data.events.some((e) => e.synthetic)} />
      <div className="kpis">
        <Kpi label="Events held" value={summary.events} kind="observed" />
        <Kpi label="Unique participants" value={summary.uniqueAttendees} kind="derived" definition="Distinct students with verified attendance at any of this organisation's events." />
        <Kpi label="Repeat participants" value={summary.repeatAttendees} kind="derived" definition="Students who attended two or more of this organisation's events." />
        <Kpi label="Reg → attend" value={summary.conversion} format={pct} kind="derived" />
        <Kpi label="Average feedback" value={summary.feedback.average} format={(x) => (x === null ? '–' : `${x.toFixed(1)} / 5 (${summary.feedback.responses})`)} kind="observed" />
      </div>

      <Section title="History by academic term">
        <p className="muted small">Each term shows the committee recorded for its events. Past outcomes describe earlier teams and are context, not a verdict on the current one.</p>
        <Table
          rows={data.byTerm}
          rowKey={(r) => r.term}
          initialSort={{ key: 'term', dir: 'desc' }}
          columns={[
            { key: 'term', label: 'Term' },
            { key: 'leadershipTerms', label: 'Committee', format: (x) => (x.length ? x.join(', ') : 'Not recorded') },
            { key: 'events', label: 'Events', format: num },
            { key: 'registrations', label: 'Registered', format: num },
            { key: 'attended', label: 'Attended', format: num },
            { key: 'conversion', label: 'Reg → attend', format: pct },
          ]}
        />
      </Section>

      <Section title="Past events">
        <Table
          rows={data.events}
          rowKey={(r) => r.eventId}
          onRowClick={(r) => ctx.go('attendance', { id: r.eventId, back: 'organisation', backId: org.id })}
          initialSort={{ key: 'start', dir: 'desc' }}
          columns={[...EVENT_COLUMNS, { key: 'context', label: 'Context', format: (x) => x || '–' }]}
        />
      </Section>

      <Section title="Upcoming events">
        {data.upcoming.length ? (
          data.upcoming.map((e) => (
            <button key={e.id} className="card card-button card-row" onClick={() => ctx.go('attendance', { id: e.id, back: 'organisation', backId: org.id })}>
              <strong>{e.title}</strong>
              <small className="muted">{day(e.start)} · {e.registeredCount}{e.capacity ? `/${e.capacity}` : ''} registered</small>
            </button>
          ))
        ) : (
          <p className="muted small">No upcoming events.</p>
        )}
      </Section>

      <Section title="Proposals" action={<button className="btn small" onClick={() => ctx.go('new-proposal')}>New proposal</button>}>
        {data.proposals.length ? (
          data.proposals.map((p) => (
            <button key={p.id} className="card card-button card-row" onClick={() => ctx.go('proposal', { id: p.id })}>
              <strong>{p.title}</strong>
              <span className={`badge badge-${p.status}`}>{p.status.replace('_', ' ')}</span>
            </button>
          ))
        ) : (
          <p className="muted small">No proposals yet.</p>
        )}
      </Section>
    </>
  )
}

/** Registrants for one event; the organiser marks who actually attended. */
export function EventAttendance({ ctx, id, back = 'explore', backId }) {
  const { data, loading, error, reload } = useApi(`/admin/events/${encodeURIComponent(id)}/participants`)
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [selected, setSelected] = useState(new Set())
  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  const started = new Date(data.event.start) <= new Date()
  const toggle = (uid) => setSelected((s) => {
    const n = new Set(s)
    n.has(uid) ? n.delete(uid) : n.add(uid)
    return n
  })
  const mark = async (attended) => {
    setBusy(true)
    setSaveError(null)
    try {
      await api(`/admin/events/${encodeURIComponent(id)}/attendance`, { method: 'POST', body: { uids: [...selected], attended } })
      setSelected(new Set())
      await reload(true)
    } catch (err) {
      setSaveError(err)
    } finally {
      setBusy(false)
    }
  }
  const people = data.participants
  return (
    <>
      <ScreenHeader title={data.event.title} subtitle={`${day(data.event.start)} · ${people.filter((p) => p.registered).length} registered · ${people.filter((p) => p.attended).length} attended`} onBack={() => ctx.go(back, { id: backId })} />
      <p className="muted small">Names are shown only to this event's organiser and central administration, for marking attendance.</p>
      {!started && <p className="notice small">Attendance can be marked once the event starts.</p>}
      {people.length ? (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th><span className="sr-only">Select</span></th><th>Name</th><th>Department</th><th>Status</th></tr></thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.uid}>
                    <td><input type="checkbox" aria-label={`Select ${p.name}`} checked={selected.has(p.uid)} disabled={!started} onChange={() => toggle(p.uid)} /></td>
                    <td>{p.name}</td>
                    <td>{p.department || '–'}</td>
                    <td>{p.attended ? <span className="badge badge-open">Attended</span> : 'Registered'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ErrorBox error={saveError} />
          <div className="row">
            <button className="btn primary" disabled={!started || busy || !selected.size} onClick={() => mark(true)}>Mark {selected.size || ''} attended</button>
            <button className="btn ghost" disabled={!started || busy || !selected.size} onClick={() => mark(false)}>Mark not attended</button>
          </div>
        </>
      ) : (
        <Empty title="No registrations yet" />
      )}
    </>
  )
}
