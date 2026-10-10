import { describe, expect, it } from 'vitest'
import { addItem, cartTotals, emptyCart, pruneCart, removeItems, setQty } from './cart'
import { errorMessage } from './api'

const central = { id: 'central', name: 'Central Canteen' }
const dosa = { id: 'dosa', name: 'Masala Dosa', price: 55 }
const coffee = { id: 'coffee', name: 'Filter Coffee', price: 20 }

describe('cart', () => {
  it('adds items and totals them', () => {
    let cart = addItem(emptyCart, central, dosa)
    cart = addItem(cart, central, dosa)
    cart = addItem(cart, central, coffee)
    expect(cartTotals(cart)).toEqual({ count: 3, total: 130 })
  })

  it('caps quantity at 10 and removes at 0', () => {
    let cart = addItem(emptyCart, central, dosa)
    cart = setQty(cart, 'dosa', 50)
    expect(cart.items.dosa.qty).toBe(10)
    expect(setQty(cart, 'dosa', 0)).toEqual(emptyCart)
  })

  it('starts a new cart when ordering from another canteen', () => {
    const cart = addItem(addItem(emptyCart, central, dosa), { id: 'cafe', name: 'Library Café' }, coffee)
    expect(cart.canteenId).toBe('cafe')
    expect(Object.keys(cart.items)).toEqual(['coffee'])
  })

  it('drops sold-out and deleted items and refreshes prices', () => {
    const cart = addItem(addItem(emptyCart, central, dosa), central, coffee)
    const { cart: fresh, removed } = pruneCart(cart, [{ ...dosa, price: 60, isAvailable: true }])
    expect(removed).toEqual(['Filter Coffee'])
    expect(cartTotals(fresh)).toEqual({ count: 1, total: 60 })
    expect(removeItems(fresh, ['dosa'])).toEqual(emptyCart)
  })
})

describe('errorMessage', () => {
  it('shows the first validation issue with its field', () => {
    const body = { error: { code: 'VALIDATION_ERROR', details: [{ path: ['items', 0, 'quantity'], message: 'Too big' }] } }
    expect(errorMessage(body)).toBe('items.0.quantity: Too big')
  })

  it('falls back to the server message', () => {
    expect(errorMessage({ error: { code: 'SLOT_FULL', message: 'That pickup slot just filled up.' } })).toBe(
      'That pickup slot just filled up.'
    )
  })
})
