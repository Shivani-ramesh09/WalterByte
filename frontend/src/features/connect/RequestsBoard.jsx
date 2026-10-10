import { useState } from 'react'
import { api, dateTimeOf, useApi } from '../../lib/api'
import { useSession } from '../../lib/session'
import { Chips, Empty, ErrorBox, Field, Loading } from '../../components/ui'

/** Open task and teammate requests (Connect requests board). */
export default function RequestsBoard() {
  const { user } = useSession()
  const [type, setType] = useState(null)
  const [posting, setPosting] = useState(false)
  const { data, loading, error, reload } = useApi(`/requests?status=open${type ? `&type=${type}` : ''}`)

  return (
    <div className="stack">
      <div className="card-row">
        <Chips label="Request type" options={[{ value: 'task', label: 'Tasks' }, { value: 'teammate', label: 'Teammates' }]} value={type} onChange={setType} />
        {!posting && <button className="btn small primary" onClick={() => setPosting(true)}>Post</button>}
      </div>
      {posting && <PostRequest onDone={() => { setPosting(false); reload() }} />}
      {loading && <Loading label="Loading requests…" />}
      <ErrorBox error={error} onRetry={reload} />
      {data && !data.results.length && <Empty title="No open requests" text="Post one to find help or teammates." />}
      {data?.results.map((r) => <RequestCard key={r.id} request={r} mine={r.authorId === user.uid} />)}
    </div>
  )
}

function RequestCard({ request: r, mine }) {
  const [reply, setReply] = useState('')
  const [state, setState] = useState(null)
  const respond = async (e) => {
    e.preventDefault()
    try {
      await api(`/requests/${r.id}/respond`, { method: 'POST', body: { message: reply.trim() } })
      setState({ ok: true })
    } catch (err) {
      setState({ error: err })
    }
  }
  const deadline = r.deadline?._seconds ? dateTimeOf(new Date(r.deadline._seconds * 1000).toISOString()) : null
  return (
    <article className="card stack-sm">
      <div className="card-row"><strong>{r.title}</strong><span className="badge">{r.type}</span></div>
      {r.description && <p className="prose small">{r.description}</p>}
      <div className="tag-row">{(r.skillsNeeded || []).map((s) => <span key={s} className="tag">{s}</span>)}</div>
      {deadline && <small className="muted">Deadline {deadline}</small>}
      {mine ? <small className="muted">Your request</small> : state?.ok ? (
        <p className="success-box" role="status">Response sent.</p>
      ) : (
        <form className="row" onSubmit={respond}>
          <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="I can help…" aria-label={`Respond to ${r.title}`} maxLength={1000} required />
          <button className="btn small primary">Respond</button>
        </form>
      )}
      <ErrorBox error={state?.error} />
    </article>
  )
}

function PostRequest({ onDone }) {
  const [error, setError] = useState(null)
  const submit = async (e) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const deadline = f.get('deadline')
    try {
      await api('/requests', {
        method: 'POST',
        body: {
          title: f.get('title').trim(),
          description: f.get('description').trim(),
          type: f.get('type'),
          skillsNeeded: f.get('skills').split(',').map((s) => s.trim()).filter(Boolean),
          deadline: deadline ? new Date(`${deadline}T23:59:00+05:30`).toISOString() : null,
        },
      })
      onDone()
    } catch (err) {
      setError(err)
    }
  }
  return (
    <form className="card stack-sm" onSubmit={submit}>
      <h3>Post a request</h3>
      <Field label="Title"><input name="title" required maxLength={200} placeholder="Need a photographer for Friday" /></Field>
      <Field label="Type">
        <select name="type"><option value="task">Task</option><option value="teammate">Teammate</option></select>
      </Field>
      <Field label="Skills needed" hint="Comma separated"><input name="skills" placeholder="photography" /></Field>
      <Field label="Details"><textarea name="description" rows={3} maxLength={2000} /></Field>
      <Field label="Deadline"><input name="deadline" type="date" /></Field>
      <ErrorBox error={error} />
      <div className="row"><button type="button" className="btn ghost" onClick={onDone}>Cancel</button><button className="btn primary">Post</button></div>
    </form>
  )
}
