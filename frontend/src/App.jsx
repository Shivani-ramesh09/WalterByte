import { useSession } from './lib/session'
import { NavProvider, useNav } from './lib/nav'
import { CartProvider } from './lib/cart'
import { ErrorBox, Loading, ScreenHeader } from './components/ui'
import TopSearchBar from './components/TopSearchBar'
import BottomTabBar from './components/BottomTabBar'
import LoginPage from './features/auth/LoginPage'
import HomeTab from './features/home/HomeTab'
import EatTab from './features/eat/EatTab'
import ConnectTab from './features/connect/ConnectTab'
import MeTab from './features/me/MeTab'
import ProfileForm from './features/me/ProfileForm'
import StaffDashboard from './features/staff/StaffDashboard'
import SearchResults from './features/search/SearchResults'

const TABS = { home: HomeTab, eat: EatTab, connect: ConnectTab, me: MeTab }

function Brand() {
  return (
    <a className="brand" href="#home" aria-label="Amrita campus home">
      <span className="brand-mark">A</span>
      <span className="brand-copy"><strong>AMRITA</strong><small>VISHWA VIDYAPEETHAM</small></span>
    </a>
  )
}

function StudentApp() {
  const { tab, search } = useNav()
  const Tab = TABS[tab]
  return (
    <>
      <header className="topbar app-topbar"><Brand /></header>
      <TopSearchBar />
      <main className="app-content">{search !== null ? <SearchResults query={search} /> : <Tab />}</main>
      <BottomTabBar />
    </>
  )
}

export default function App() {
  const session = useSession()

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
  else if (session.staff) page = <StaffDashboard />
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
          <StudentApp />
        </CartProvider>
      </NavProvider>
    )
  }

  return <div className="device">{page}</div>
}
