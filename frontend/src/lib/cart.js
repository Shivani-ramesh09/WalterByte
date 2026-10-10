import { createContext, createElement, useContext, useEffect, useState } from 'react'

// One cart, for one canteen at a time. Prices here are display-only:
// the server recomputes the total from its own menu on checkout.

export const MAX_QTY = 10
export const emptyCart = { canteenId: null, canteenName: '', items: {} }

/** Add one of an item. Adding from a different canteen starts a new cart. */
export function addItem(cart, canteen, item) {
  const base = cart.canteenId === canteen.id ? cart : { canteenId: canteen.id, canteenName: canteen.name, items: {} }
  const qty = Math.min(MAX_QTY, (base.items[item.id]?.qty || 0) + 1)
  return { ...base, items: { ...base.items, [item.id]: { name: item.name, price: item.price, qty } } }
}

export function setQty(cart, itemId, qty) {
  const items = { ...cart.items }
  if (qty <= 0) delete items[itemId]
  else if (items[itemId]) items[itemId] = { ...items[itemId], qty: Math.min(MAX_QTY, qty) }
  return Object.keys(items).length ? { ...cart, items } : emptyCart
}

export function cartTotals(cart) {
  return Object.values(cart.items).reduce(
    (t, i) => ({ count: t.count + i.qty, total: t.total + i.qty * i.price }),
    { count: 0, total: 0 }
  )
}

/**
 * Reconcile the cart with a freshly loaded menu: drop items that no longer
 * exist or are sold out, and refresh names and prices.
 * @returns {{ cart, removed: string[] }} removed = names of dropped items
 */
export function pruneCart(cart, menuItems) {
  const byId = new Map(menuItems.map((i) => [i.id, i]))
  const removed = []
  const items = {}
  for (const [id, line] of Object.entries(cart.items)) {
    const fresh = byId.get(id)
    if (!fresh || !fresh.isAvailable) removed.push(line.name)
    else items[id] = { ...line, name: fresh.name, price: fresh.price }
  }
  return { cart: Object.keys(items).length ? { ...cart, items } : emptyCart, removed }
}

/** Remove specific item ids (e.g. after the server reports them unavailable). */
export function removeItems(cart, itemIds) {
  return itemIds.reduce((c, id) => setQty(c, id, 0), cart)
}

const STORAGE_KEY = 'walterbyte.cart'

function loadCart() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    return saved?.items ? saved : emptyCart
  } catch {
    return emptyCart
  }
}

const CartContext = createContext(null)

/** Cart shared by every Eat screen and kept across tabs and reloads. */
export function CartProvider({ children }) {
  const [cart, setCart] = useState(loadCart)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cart))
    } catch {
      // Storage blocked (private mode): the cart still works for this session
    }
  }, [cart])
  return createElement(CartContext.Provider, { value: { cart, setCart } }, children)
}

export const useCart = () => useContext(CartContext)
