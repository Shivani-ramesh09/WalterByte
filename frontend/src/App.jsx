import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useSession } from './lib/session'
import { DEMO_MODE } from './config/firebase'
import { NavProvider, useNav } from './lib/nav'
import { CartProvider } from './lib/cart'
import { ErrorBox, Loading, ScreenHeader } from './components/ui'
import BottomTabBar from './components/BottomTabBar'
import LoginPage from './features/auth/LoginPage'
import HomeTab from './features/home/HomeTab'
import ExploreTab from './features/explore/ExploreTab'
import EatTab from './features/eat/EatTab'
import ConnectTab from './features/connect/ConnectTab'
import MeTab from './features/me/MeTab'
import ProfileForm from './features/me/ProfileForm'
import StaffDashboard from './features/staff/StaffDashboard'
import SearchResults from './features/search/SearchResults'

const TABS = { home: HomeTab, explore: ExploreTab, eat: EatTab, connect: ConnectTab, me: MeTab }

export function Brand() {
  return (
    <a className="brand" href="#home" aria-label="Amrita Vishwa Vidyapeetham campus home">
      <img className="brand-amma" src="/amma.png" alt="Amma, Sri Mata Amritanandamayi Devi" />
      <span className="brand-logo"><img src="/amrita-logo-official.png" alt="Amrita Vishwa Vidyapeetham" /></span>
      {DEMO_MODE && <span className="badge badge-demo">Demo mode</span>}
    </a>
  )
}

function StudentApp({ theme, onToggleTheme }) {
  const { tab, search } = useNav()
  const Tab = TABS[tab]
  return (
    <>
      <header className="topbar app-topbar">
        <Brand />
        <button className="theme-toggle" type="button" onClick={onToggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
          {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
        </button>
      </header>
      <main className="app-content">{search !== null ? <SearchResults query={search} /> : <Tab />}</main>
      <BottomTabBar />
    </>
  )
}

export default function App() {
  const session = useSession()
  const [theme, setTheme] = useState(() => window.localStorage.getItem('amrita-theme') === 'dark' ? 'dark' : 'light')
  useEffect(() => { window.localStorage.setItem('amrita-theme', theme) }, [theme])

  let page
  if (session.status === 'loading') page = <Loading label="Signing you in…" />
  else if (session.status === 'signedOut') page = <><header className="topbar"><Brand /></header><LoginPage /></>
  else if (session.status === 'error') {
    page = (
      <div className="screen">
        <ErrorBox error={session.error} onRetry={session.retry} />
        <button className="btn ghost" onClick={session.signOut}>Sign out</button>
      </div>
    )
  }
  // Canteen staff get their own counter app, not the student app
  else if (session.staff) page = <><header className="topbar"><Brand /></header><div className="app-content"><StaffDashboard /></div></>
  else if (!session.profile) {
    page = (
      <div className="screen">
        <ScreenHeader title="Set up your profile" subtitle="So canteens and classmates know who you are" />
        <ProfileForm />
        <button className="btn ghost block" onClick={session.signOut}>Sign out</button>
      </div>
    )
  } else {
    page = (
      <NavProvider>
        <CartProvider>
          <StudentApp theme={theme} onToggleTheme={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')} />
        </CartProvider>
      </NavProvider>
    )
  }

  return <div className="device" data-theme={theme}>{page}</div>
}
