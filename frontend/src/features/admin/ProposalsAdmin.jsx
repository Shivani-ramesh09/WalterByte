import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Circle } from 'lucide-react'
import { api, useApi } from '../../lib/api'
import { Empty, ErrorBox, Field, Loading, ScreenHeader } from '../../components/ui'
import { Kpi, Section, SyntheticBanner, Table, day, inr, num, pct, periodQuery } from './adminUi'

// Mirrors READINESS_CRITERIA in src/services/analytics/exploreAnalytics.js
const CRITERIA = [
  ['proposalComplete', 'Complete written proposal'],
  ['committeeConfirmed', 'Committee roles confirmed'],
  ['milestones', 'Planning milestones set'],
  ['venueFeasible', 'Venue and schedule feasible'],
  ['budgetRealistic', 'Itemised, realistic budget'],
  ['recruitmentEvidence', 'Recruitment or participation evidence'],
  ['riskPlan', 'Risk and contingency plan'],
]
const SUPPORT = { funding: 'Funding', venue: 'Venue', equipment: 'Equipment', publicity: 'Publicity', admin: 'Administrative help', pilot: 'Pilot first' }
const STATUS = { submitted: 'Submitted', needs_info: 'Needs information', pilot_supported: 'Pilot supported', approved: 'Approved', declined: 'Declined' }

export function ProposalList({ ctx }) {
  const { data, loading, error, reload } = useApi('/admin/proposals')
  return (
    <>
      <div className="card-row">
        <h2>Proposals</h2>
        <button className="btn primary small" onClick={() => ctx.go('new-proposal')}>New proposal</button>
      </div>
      <p className="muted small">Proposals are decided by central administration. WalterByte assembles the evidence; it never approves or rejects a proposal.</p>
      {loading && <Loading />}
      <ErrorBox error={error} onRetry={reload} />
      {data && (
        <Table
          rows={data.proposals}
          rowKey={(r) => r.id}
          onRowClick={(r) => ctx.go('proposal', { id: r.id })}
          initialSort={{ key: 'createdAt', dir: 'desc' }}
          empty="No proposals yet."
          columns={[
            { key: 'title', label: 'Proposal' },
            { key: 'orgId', label: 'Organisation' },
            { key: 'proposedStart', label: 'Proposed date', format: day },
            { key: 'budget', label: 'Requested', format: (b) => inr(b?.requested), sort: (r) => r.budget?.requested },
            { key: 'status', label: 'Status', format: (s) => <span className={`badge badge-${s}`}>{STATUS[s]}</span> },
            { key: 'createdAt', label: 'Submitted', format: day },
          ]}
        />
      )}
    </>
  )
}

export function ProposalDetail({ ctx, id }) {
  const { data: p, loading, error, reload } = useApi(`/admin/proposals/${encodeURIComponent(id)}`)
  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} onRetry={reload} />
  const a = p.assessment
  const h = a.historical
  return (
    <>
      <ScreenHeader title={p.title} subtitle={`${p.organisationName} · ${STATUS[p.status]}`} onBack={() => ctx.go('proposals')} />
      <SyntheticBanner show={p.synthetic} />
      <p className="prose">{p.summary}</p>
      <p className="muted small">
        {day(p.proposedStart)} to {day(p.proposedEnd)} · {p.leadershipTerm || 'Committee not stated'} · Support requested: {(p.supportRequested || []).map((s) => SUPPORT[s]).join(', ') || 'none'}
      </p>

      <Section title="1. Historical outcomes">
        <p className="muted small">Outcomes of this organisation's past events, by term and committee. Earlier leadership may not predict the current team.</p>
        {h.events ? (
          <>
            <div className="kpis">
              <Kpi label="Past events" value={h.events} kind="observed" />
              <Kpi label="Unique participants" value={h.uniqueAttendees} kind="derived" />
              <Kpi label="Reg → attend" value={h.conversion} format={pct} kind="derived" />
              <Kpi label="Average feedback" value={h.feedback.average} format={(x) => (x === null ? '–' : `${x.toFixed(1)} / 5`)} kind="observed" />
            </div>
            <Table
              rows={h.byTerm}
              rowKey={(r) => r.term}
              initialSort={{ key: 'term', dir: 'desc' }}
              columns={[
                { key: 'term', label: 'Term' },
                { key: 'leadershipTerms', label: 'Committee', format: (x) => (x.length ? x.join(', ') : 'Not recorded') },
                { key: 'events', label: 'Events', format: num },
                { key: 'attended', label: 'Attended', format: num },
                { key: 'conversion', label: 'Reg → attend', format: pct },
              ]}
            />
          </>
        ) : (
          <p className="notice small">No past events on record. A missing history is not evidence against the proposal.</p>
        )}
      </Section>

      <Section title="2. Current readiness">
        <p className="muted small">{a.readiness.met} of {a.readiness.total} criteria have documented evidence. This is a checklist, not a score, and the evidence is self-reported until verified.</p>
        <ul className="checklist">
          {a.readiness.criteria.map((c) => (
            <li key={c.key} className={c.met ? 'met' : 'unmet'}>
              {c.met ? <CheckCircle2 size={16} /> : <Circle size={16} />}
              <div><strong>{c.label}</strong><small className="muted">{c.evidence || 'No evidence provided'}</small></div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="3. Demand and comparable events">
        <div className="kpis">
          <Kpi label="Comparable past events" value={a.demand.comparableEvents} kind="observed" definition={`Past events in the ${p.category} category, across all organisations.`} />
          <Kpi label="Median registrations" value={a.demand.medianRegistrations} kind="derived" />
          <Kpi label="Median reg → attend" value={a.demand.medianConversion} format={pct} kind="derived" />
          <Kpi label="Expected participants" value={p.expectedParticipants} kind="estimate" definition="The organisation's own estimate in the proposal." />
        </div>
      </Section>

      <Section title="4. Budget and scenarios">
        <div className="kpis">
          <Kpi label="Requested budget" value={a.budget.requested} format={inr} kind="observed" />
          <Kpi label="Cost per expected participant" value={a.budget.costPerExpectedParticipant} format={inr} kind="derived" definition="Requested budget ÷ the proposal's expected participants." />
        </div>
        {p.budget?.items?.length > 0 && (
          <Table rows={p.budget.items} rowKey={(r) => r.item} initialSort={{ key: 'amount', dir: 'desc' }} columns={[{ key: 'item', label: 'Budget item' }, { key: 'amount', label: 'Amount', format: inr }]} />
        )}
        {a.scenarios ? (
          <Table
            rows={a.scenarios}
            rowKey={(r) => r.name}
            initialSort={{ key: 'attendance', dir: 'asc' }}
            columns={[
              { key: 'name', label: 'Scenario' },
              { key: 'conversion', label: 'Assumed reg → attend', format: pct },
              { key: 'attendance', label: 'Attendance', format: num },
              { key: 'costPerAttendee', label: 'Cost per attendee', format: inr },
            ]}
          />
        ) : null}
        <p className="muted small"><span className="kind kind-scenario">scenario</span> {a.scenarioNote}</p>
      </Section>

      <Section title="5. Risks">
        {a.risks.length ? (
          <ul className="risk-list">{a.risks.map((r) => <li key={r}><AlertTriangle size={14} /> {r}</li>)}</ul>
        ) : (
          <p className="muted small">No risks flagged from the recorded evidence.</p>
        )}
      </Section>

      <Section title="6. Success criteria and evaluation plan">
        <p className="muted small">After the event, these targets are compared with recorded attendance, verified spending and feedback.</p>
        <div className="kpis">
          <Kpi label="Target attendance" value={p.targets?.attendance ?? null} kind="target" />
          <Kpi label="Target registrations" value={p.targets?.registrations ?? null} kind="target" />
          <Kpi label="Target feedback" value={p.targets?.feedbackAverage ?? null} format={(x) => (x === null ? '–' : `${x} / 5`)} kind="target" />
        </div>
        {p.outcomeComparison && <OutcomeComparison o={p.outcomeComparison} />}
        <OutcomeForm ctx={ctx} p={p} onSaved={() => reload(true)} />
      </Section>

      {ctx.central ? (
        <DecisionForm p={p} onSaved={() => reload(true)} />
      ) : (
        p.decisionNote && <Section title="Decision"><p>{STATUS[p.status]}: {p.decisionNote}</p></Section>
      )}
    </>
  )
}

function OutcomeComparison({ o }) {
  const rows = [
    { label: 'Attendance', target: num(o.attendance.target), actual: num(o.attendance.actual) },
    { label: 'Registrations', target: num(o.registrations.target), actual: num(o.registrations.actual) },
    { label: 'Feedback', target: o.feedback.target ?? '–', actual: o.feedback.actual === null ? '–' : `${o.feedback.actual.toFixed(1)} (${o.feedback.responses})` },
    { label: 'Spending', target: inr(o.spend.planned), actual: o.spend.verified ? inr(o.spend.actual) : 'Not verified yet' },
    { label: 'Activities', target: o.activities.planned.join(', ') || '–', actual: o.activities.delivered.join(', ') || '–' },
  ]
  return (
    <>
      <h4>Planned against recorded</h4>
      <Table rows={rows} rowKey={(r) => r.label} initialSort={{ key: 'label', dir: 'asc' }} columns={[{ key: 'label', label: 'Measure' }, { key: 'target', label: 'Planned / target' }, { key: 'actual', label: 'Recorded' }]} />
      <p className="muted small">
        Financial ROI: {o.financialRoi === null ? 'not calculated. It needs verified spending and verified revenue; attendance and registrations are not monetary return.' : `${pct(o.financialRoi)} (verified revenue − verified spend) ÷ verified spend.`}
      </p>
      {o.notes && <p className="muted small">Notes: {o.notes}</p>}
    </>
  )
}

function OutcomeForm({ ctx, p, onSaved }) {
  const org = useApi(`/admin/organisations/${encodeURIComponent(p.orgId)}`)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  if (!open) return <button className="btn small" onClick={() => setOpen(true)}>Record outcome</button>
  const o = p.outcome || {}
  const submit = async (e) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const body = {
      ...(f.get('eventId') && { eventId: f.get('eventId') }),
      ...(f.get('actualSpend') !== '' && { actualSpend: Number(f.get('actualSpend')) }),
      ...(f.get('actualRevenue') !== '' && { actualRevenue: Number(f.get('actualRevenue')) }),
      deliveredActivities: String(f.get('delivered')).split('\n').map((s) => s.trim()).filter(Boolean),
      notes: String(f.get('notes')).trim(),
      ...(ctx.central && { spendVerified: f.get('spendVerified') === 'on', revenueVerified: f.get('revenueVerified') === 'on' }),
    }
    setBusy(true)
    setError(null)
    try {
      await api(`/admin/proposals/${encodeURIComponent(p.id)}/outcome`, { method: 'PATCH', body })
      setOpen(false)
      onSaved()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }
  const events = [...(org.data?.events || []).map((e) => ({ id: e.eventId, title: e.title, start: e.start })), ...(org.data?.upcoming || [])]
  return (
    <form className="card stack-sm" onSubmit={submit}>
      <Field label="Event this proposal became">
        <select className="input" name="eventId" defaultValue={o.eventId || ''}>
          <option value="">Not linked</option>
          {events.map((e) => <option key={e.id} value={e.id}>{e.title} · {day(e.start)}</option>)}
        </select>
      </Field>
      <Field label="Actual spending (₹)" hint={ctx.central ? undefined : 'Central administration verifies amounts before they count.'}>
        <input className="input" name="actualSpend" type="number" min="0" defaultValue={o.actualSpend ?? ''} />
      </Field>
      <Field label="Actual revenue (₹), if any"><input className="input" name="actualRevenue" type="number" min="0" defaultValue={o.actualRevenue ?? ''} /></Field>
      {ctx.central && (
        <>
          <label className="check"><input type="checkbox" name="spendVerified" defaultChecked={o.spendVerified} /> Spending verified against bills</label>
          <label className="check"><input type="checkbox" name="revenueVerified" defaultChecked={o.revenueVerified} /> Revenue verified</label>
        </>
      )}
      <Field label="Activities delivered (one per line)"><textarea className="input" name="delivered" rows={3} defaultValue={(o.deliveredActivities || []).join('\n')} /></Field>
      <Field label="Context (scheduling conflicts, leadership changes, capacity limits)"><textarea className="input" name="notes" rows={2} maxLength={2000} defaultValue={o.notes || ''} /></Field>
      <ErrorBox error={error} />
      <div className="row">
        <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save outcome'}</button>
        <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  )
}

function DecisionForm({ p, onSaved }) {
  const [status, setStatus] = useState(p.status === 'submitted' ? 'needs_info' : p.status)
  const [note, setNote] = useState(p.decisionNote || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api(`/admin/proposals/${encodeURIComponent(p.id)}/decision`, { method: 'PATCH', body: { status, note } })
      onSaved()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Section title="Administration decision">
      <form className="card stack-sm" onSubmit={submit}>
        <p className="muted small">A person decides. Record the reasoning so future reviews can see why.</p>
        <Field label="Decision">
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            {['needs_info', 'pilot_supported', 'approved', 'declined'].map((s) => <option key={s} value={s}>{STATUS[s]}</option>)}
          </select>
        </Field>
        <Field label="Reason"><textarea className="input" rows={3} required minLength={5} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {p.decidedAt && <small className="muted">Last decision recorded {day(p.decidedAt)}.</small>}
        <ErrorBox error={error} />
        <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Record decision'}</button>
      </form>
    </Section>
  )
}

const istIso = (local) => (local ? `${local}:00+05:30` : undefined)
const lines = (v) => String(v || '').split('\n').map((s) => s.trim()).filter(Boolean)
const optionalNumber = (v) => (v === '' || v === null ? undefined : Number(v))

export function ProposalForm({ ctx }) {
  const orgs = useApi(ctx.central ? `/admin/explore?${periodQuery(30)}` : null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const readiness = Object.fromEntries(
      CRITERIA.map(([key]) => [key, { met: f.get(`${key}-met`) === 'on', evidence: String(f.get(`${key}-evidence`) || '').trim() }])
    )
    const targets = Object.fromEntries(
      [['attendance', 'targetAttendance'], ['registrations', 'targetRegistrations'], ['feedbackAverage', 'targetFeedback']]
        .map(([k, name]) => [k, optionalNumber(f.get(name))])
        .filter(([, v]) => v !== undefined)
    )
    const body = {
      ...(ctx.central && { orgId: f.get('orgId') }),
      title: f.get('title'),
      summary: f.get('summary'),
      category: f.get('category'),
      leadershipTerm: f.get('leadershipTerm'),
      proposedStart: istIso(f.get('proposedStart')),
      proposedEnd: istIso(f.get('proposedEnd')),
      expectedParticipants: Number(f.get('expectedParticipants')),
      capacity: optionalNumber(f.get('capacity')) ?? null,
      budget: {
        requested: Number(f.get('budget')),
        items: lines(f.get('items')).map((l) => {
          const [item, amount] = l.split(':')
          return { item: item.trim(), amount: Number(amount) || 0 }
        }),
      },
      supportRequested: Object.keys(SUPPORT).filter((s) => f.get(`support-${s}`) === 'on'),
      plannedActivities: lines(f.get('activities')),
      targets,
      readiness,
    }
    setBusy(true)
    setError(null)
    try {
      const created = await api('/admin/proposals', { method: 'POST', body })
      ctx.go('proposal', { id: created.id })
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  if (ctx.central && orgs.loading) return <Loading />
  return (
    <>
      <ScreenHeader title="New proposal" subtitle="Evidence for an event or support request" onBack={() => ctx.go('proposals')} />
      <form className="stack-sm proposal-form" onSubmit={submit}>
        {ctx.central && (
          <Field label="Organisation">
            <select className="input" name="orgId" required>
              {(orgs.data?.organisations || []).map((o) => <option key={o.orgId} value={o.orgId}>{o.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Title"><input className="input" name="title" required minLength={5} maxLength={120} /></Field>
        <Field label="Summary" hint="What is planned and why it matters"><textarea className="input" name="summary" rows={4} required minLength={20} maxLength={3000} /></Field>
        <Field label="Category" hint="Used to find comparable past events, e.g. Debate & MUN"><input className="input" name="category" required minLength={2} maxLength={40} /></Field>
        <Field label="Committee / leadership term"><input className="input" name="leadershipTerm" maxLength={80} placeholder="2026-27 core committee" /></Field>
        <div className="row">
          <Field label="Starts (IST)"><input className="input" name="proposedStart" type="datetime-local" required /></Field>
          <Field label="Ends (IST)"><input className="input" name="proposedEnd" type="datetime-local" required /></Field>
        </div>
        <div className="row">
          <Field label="Expected participants"><input className="input" name="expectedParticipants" type="number" min="1" required /></Field>
          <Field label="Venue capacity"><input className="input" name="capacity" type="number" min="1" /></Field>
        </div>
        <Field label="Requested budget (₹)"><input className="input" name="budget" type="number" min="0" required /></Field>
        <Field label="Budget items (one per line, item: amount)"><textarea className="input" name="items" rows={3} placeholder={'Venue setup: 50000\nDelegate kits: 45000'} /></Field>
        <fieldset className="card stack-sm">
          <legend>Support requested</legend>
          {Object.entries(SUPPORT).map(([k, label]) => <label key={k} className="check"><input type="checkbox" name={`support-${k}`} /> {label}</label>)}
        </fieldset>
        <Field label="Planned activities (one per line)"><textarea className="input" name="activities" rows={3} /></Field>
        <div className="row">
          <Field label="Target attendance"><input className="input" name="targetAttendance" type="number" min="0" /></Field>
          <Field label="Target registrations"><input className="input" name="targetRegistrations" type="number" min="0" /></Field>
          <Field label="Target feedback (1-5)"><input className="input" name="targetFeedback" type="number" min="1" max="5" step="0.1" /></Field>
        </div>
        <fieldset className="card stack-sm">
          <legend>Readiness evidence</legend>
          <p className="muted small">A criterion counts only when it is ticked and backed by written evidence (documents, names, quotes, dates).</p>
          {CRITERIA.map(([key, label]) => (
            <div key={key} className="stack-sm">
              <label className="check"><input type="checkbox" name={`${key}-met`} /> {label}</label>
              <input className="input" name={`${key}-evidence`} maxLength={1000} placeholder="Evidence" />
            </div>
          ))}
        </fieldset>
        <ErrorBox error={error} />
        <button className="btn primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit proposal'}</button>
      </form>
      {!ctx.central && !ctx.admin.orgId && <Empty title="No organisation linked to your account" />}
    </>
  )
}
