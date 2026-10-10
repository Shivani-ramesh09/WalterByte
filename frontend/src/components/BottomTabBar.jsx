import { Home, UserRound, UsersRound, UtensilsCrossed } from 'lucide-react'
import { useNav } from '../lib/nav'
import { cartTotals, useCart } from '../lib/cart'

const TABS = [
  { id: 'home', label: 'Home', Icon: Home },
  { id: 'eat', label: 'Eat', Icon: UtensilsCrossed },
  { id: 'connect', label: 'Connect', Icon: UsersRound },
  { id: 'me', label: 'Me', Icon: UserRound },
]

export default function BottomTabBar() {
  const { tab, tapTab } = useNav()
  const { count } = cartTotals(useCart().cart)
  return (
    <nav className="tab-bar" aria-label="Main">
      {TABS.map(({ id, label, Icon }) => (
        <button key={id} className={tab === id ? 'tab active' : 'tab'} aria-current={tab === id ? 'page' : undefined} onClick={() => tapTab(id)}>
          <span className="tab-icon">
            <Icon size={21} />
            {id === 'eat' && count > 0 && <span className="tab-dot" aria-label={`${count} in cart`}>{count}</span>}
          </span>
          {label}
        </button>
      ))}
    </nav>
  )
}
