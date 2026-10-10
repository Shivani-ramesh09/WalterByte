import { useEffect, useState } from 'react'
import { api, inr } from '../../lib/api'
import { useNav } from '../../lib/nav'
import { Chips, Empty, ErrorBox, Loading, ScreenHeader, VegMark } from '../../components/ui'
import { GigCard } from '../connect/ConnectTab'

// Everyday words → the terms our data uses
const SYNONYMS = {
  photographer: 'photography',
  photos: 'photography',
  'video editor': 'video editing',
  editor: 'editing',
  designer: 'design',
  developer: 'development',
  coder: 'development',
  writer: 'writing',
  tea: 'chai',
  meal: 'thali',
  lunch: 'thali',
  juice: 'juice',
}

/** Expand a query into the search terms to try. */
export function expandQuery(query) {
  const q = query.trim().toLowerCase()
  const terms = new Set([q])
  for (const [word, term] of Object.entries(SYNONYMS)) if (q.includes(word)) terms.add(q.replace(word, term))
  return [...terms]
}

async function searchFood(terms) {
  const { canteens } = await api('/canteens')
  const menus = await Promise.all(canteens.map((c) => api(`/canteens/${c.id}/menu`).catch(() => null)))
  return menus.flatMap((m, i) =>
    (m?.categories || []).flatMap((cat) =>
      cat.items
        .filter((item) => terms.some((t) => `${item.name} ${cat.name}`.toLowerCase().includes(t)))
        .map((item) => ({ ...item, canteenId: canteens[i].id, canteenName: canteens[i].name }))
    )
  )
}

const uniqueBy = (list, key) => [...new Map(list.map((x) => [x[key], x])).values()]

export default function SearchResults({ query }) {
  const { go, closeSearch } = useNav()
  const [filter, setFilter] = useState(null)
  const [state, setState] = useState({ loading: true })

  useEffect(() => {
    let live = true
    const terms = expandQuery(query)
    setState({ loading: true })
    Promise.allSettled([
      searchFood(terms),
      Promise.all(terms.map((t) => api(`/gigs?q=${encodeURIComponent(t)}`))).then((r) => uniqueBy(r.flatMap((x) => x.gigs), 'id')),
      Promise.all(terms.map((t) => api(`/search/people?q=${encodeURIComponent(t)}`))).then((r) => uniqueBy(r.flatMap((x) => x.people), 'uid')),
    ]).then(([food, gigs, people]) => {
      if (!live) return
      const failed = [food, gigs, people].find((r) => r.status === 'rejected')
      setState({
        loading: false,
        food: food.value || [],
        gigs: gigs.value || [],
        people: people.value || [],
        error: failed?.reason,
      })
    })
    return () => { live = false }
  }, [query])

  const show = (group) => !filter || filter === group
  const total = (state.food?.length || 0) + (state.gigs?.length || 0) + (state.people?.length || 0)

  return (
    <div className="screen">
      <ScreenHeader title={`“${query}”`} subtitle="Food, gigs and people" onBack={closeSearch} />
      <Chips
        label="Result type"
        options={[
          { value: 'food', label: `Food ${state.food ? `(${state.food.length})` : ''}` },
          { value: 'gigs', label: `Gigs ${state.gigs ? `(${state.gigs.length})` : ''}` },
          { value: 'people', label: `People ${state.people ? `(${state.people.length})` : ''}` },
        ]}
        value={filter}
        onChange={setFilter}
      />
      {state.loading && <Loading label="Searching campus…" />}
      <ErrorBox error={state.error} />
      {!state.loading && !total && <Empty title="Nothing found" text="Try a dish, a skill like photography, or a name." />}

      {show('food') && state.food?.length > 0 && <h3>Food</h3>}
      {show('food') && state.food?.map((item) => (
        <button key={`${item.canteenId}-${item.id}`} className="card card-button menu-item" onClick={() => go('eat', { name: 'menu', canteenId: item.canteenId })}>
          <VegMark isVeg={item.isVeg} />
          <div className="menu-item-text"><strong>{item.name}</strong><span>{item.canteenName} · {inr(item.price)}</span></div>
          {!item.isAvailable && <span className="badge badge-closed">Sold out</span>}
        </button>
      ))}

      {show('gigs') && state.gigs?.length > 0 && <h3>Gigs</h3>}
      {show('gigs') && state.gigs?.map((g) => <GigCard key={g.id} gig={g} />)}

      {show('people') && state.people?.length > 0 && <h3>People</h3>}
      {show('people') && state.people?.map((p) => (
        <button key={p.uid} className="card card-button" onClick={() => go('connect', { name: 'person', uid: p.uid })}>
          <strong>{p.name}</strong>
          <small className="muted">{p.department}</small>
          <div className="tag-row">{(p.skills || []).map((s) => <span key={s} className="tag">{s}</span>)}</div>
        </button>
      ))}
    </div>
  )
}
