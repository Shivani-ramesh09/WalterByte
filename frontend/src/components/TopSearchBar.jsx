import { useState } from 'react'
import { Search, X } from 'lucide-react'
import { useNav } from '../lib/nav'

/** The one "Ask campus anything" box, shown on every tab. */
export default function TopSearchBar() {
  const { search, openSearch, closeSearch } = useNav()
  const [text, setText] = useState('')

  const submit = (e) => {
    e.preventDefault()
    if (text.trim()) openSearch(text.trim())
  }

  return (
    <form className="top-search" role="search" onSubmit={submit}>
      <Search size={17} aria-hidden="true" />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ask campus anything — coffee, photographer…"
        aria-label="Search food, gigs and people"
      />
      {search !== null && (
        <button type="button" className="icon-btn" aria-label="Close search" onClick={() => { setText(''); closeSearch() }}>
          <X size={17} />
        </button>
      )}
    </form>
  )
}
