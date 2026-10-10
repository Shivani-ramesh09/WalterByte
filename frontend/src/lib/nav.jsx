import { createContext, useContext, useState } from 'react'

// Tiny in-app navigation: one current screen per tab, so switching tabs and
// coming back keeps your place (e.g. a half-finished checkout).
const START = {
  home: { name: 'home' },
  eat: { name: 'list' },
  connect: { name: 'home' },
  me: { name: 'home' },
}

const NavContext = createContext(null)

export function NavProvider({ children }) {
  const [nav, setNav] = useState({ tab: 'home', screens: START, search: null })

  const value = {
    tab: nav.tab,
    screen: nav.screens[nav.tab],
    search: nav.search,
    /** Switch tab, optionally opening a screen in it. */
    go: (tab, screen) =>
      setNav((n) => ({ tab, search: null, screens: screen ? { ...n.screens, [tab]: screen } : n.screens })),
    /** Tab bar tap: re-tapping the current tab goes back to its start screen. */
    tapTab: (tab) =>
      setNav((n) => ({
        tab,
        search: null,
        screens: n.tab === tab && !n.search ? { ...n.screens, [tab]: START[tab] } : n.screens,
      })),
    openSearch: (query) => setNav((n) => ({ ...n, search: query })),
    closeSearch: () => setNav((n) => ({ ...n, search: null })),
  }
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>
}

export const useNav = () => useContext(NavContext)
