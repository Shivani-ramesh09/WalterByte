import { useState } from 'react'
import { useApi } from '../../lib/api'
import { ErrorBox, Loading } from '../../components/ui'
import { Bars, DataNotes, Kpi, PeriodPicker, Section, SyntheticBanner, Table, num, pct } from './adminUi'

const ratioCell = (x) => (x === null ? 'no providers' : x.toFixed(1))

export function ConnectAdmin({ ctx }) {
  const { data, loading, error, reload } = useApi(`/admin/connect?${ctx.query}`)
  const [skill, setSkill] = useState(null)
  const selected = data?.skills.find((s) => s.skill === skill)
  return (
    <>
      <h2>Connect intelligence</h2>
      <PeriodPicker value={ctx.days} onChange={ctx.setDays} label={data && { current: data.period.label, previous: data.period.previous.label }} />
      {loading && <Loading />}
      <ErrorBox error={error} onRetry={reload} />
      {data && (
        <>
          <SyntheticBanner show={data.dataQuality.synthetic} />
          <div className="kpis">
            <Kpi label="Collaboration requests" value={data.totals.requests} previous={data.totals.previousRequests} kind="observed" />
            <Kpi label="Gig hire requests" value={data.totals.hireRequests} previous={data.totals.previousHireRequests} kind="observed" />
            <Kpi label="Completed hires" value={data.totals.completedHires} kind="observed" definition="Hire requests from the period the freelancer marked completed." />
            <Kpi label="Unanswered requests" value={data.totals.unansweredRequests} kind="derived" />
            <Kpi label="Unserved hire requests" value={data.totals.unservedHires} kind="derived" />
          </div>

          <Section title="Demand against supply">
            <Bars
              caption="Requests for each skill against students actively offering it (top 8 by demand)"
              series={[{ key: 'demand', label: 'Requests (demand)' }, { key: 'activeProviders', label: 'Active providers (supply)' }]}
              rows={data.skills.slice(0, 8).map((s) => ({ label: s.skill, demand: s.demand, activeProviders: s.activeProviders }))}
            />
          </Section>

          <Section title="Skill demand">
            <p className="muted small">Select a skill to see the evidence behind it.</p>
            <Table
              rows={data.skills}
              rowKey={(r) => r.skill}
              onRowClick={(r) => setSkill(r.skill)}
              initialSort={{ key: 'demand', dir: 'desc' }}
              columns={[
                { key: 'skill', label: 'Skill' },
                { key: 'demand', label: 'Requests', format: num },
                { key: 'growth', label: 'Change', format: (x) => (x === null ? 'new' : `${x >= 0 ? '+' : '−'}${pct(Math.abs(x))}`) },
                { key: 'unfulfilled', label: 'Unfulfilled', format: num },
                { key: 'activeProviders', label: 'Active providers', format: num },
                { key: 'demandToSupply', label: 'Demand ÷ supply', format: ratioCell, sort: (r) => (r.demandToSupply === null ? Infinity : r.demandToSupply) },
                { key: 'listedInProfiles', label: 'On profiles', format: num },
              ]}
            />
          </Section>

          {selected && (
            <Section title={`Evidence: ${selected.skill}`} action={<button className="link-btn" onClick={() => setSkill(null)}>Close</button>}>
              <div className="kpis">
                <Kpi label="Collaboration requests" value={selected.requests} kind="observed" />
                <Kpi label="Hire requests" value={selected.hireRequests} kind="observed" />
                <Kpi label="Previous period" value={selected.previousDemand} kind="observed" />
                <Kpi label="Unfulfilled" value={selected.unfulfilled} kind="derived" />
                <Kpi label="Active providers" value={selected.activeProviders} kind="observed" definition="Distinct students with an active gig in this skill." />
                <Kpi label="Open to projects" value={selected.availableProfiles} kind="observed" definition="Profiles listing the skill and marked open to projects. Capacity and experience are not recorded." />
              </div>
              {selected.resourceHint ? (
                <p className="notice">
                  Possible institutional resource to <strong>evaluate</strong>: {selected.resourceHint}. Check existing capacity, utilisation, cost and feasibility first. Request counts alone do not justify a purchase.
                </p>
              ) : (
                <p className="muted small">No institutional resource is mapped to this skill.</p>
              )}
            </Section>
          )}

          <Section title="Skills requested together">
            <Table
              rows={data.pairs}
              rowKey={(r) => r.pair}
              initialSort={{ key: 'count', dir: 'desc' }}
              columns={[{ key: 'pair', label: 'Skills' }, { key: 'count', label: 'Requests', format: num }]}
              empty="No requests named more than one skill in this period."
            />
          </Section>
          <DataNotes quality={data.dataQuality} />
        </>
      )}
    </>
  )
}
