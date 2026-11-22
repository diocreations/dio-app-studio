import { describe, expect, test } from 'bun:test'
import { renderApp } from '../src/worker/app'
import { buildSpec, sanitizeMenu } from '../src/worker/pricing'

const spec = buildSpec({
  name: 'Riverside Market',
  vertical: 'marketplace',
  accent: '#d98324',
  logo: 'RM',
  features: ['catalog', 'ordering', 'delivery'],
})
const html = renderApp(spec, { token: 'marketplace-probe', live: false })

describe('the marketplace catalogue', () => {
  test('every listing names the store it comes from', () => {
    for (const item of spec.menu.flatMap((section) => section.items)) {
      expect(item.vendor, item.name).toBeTruthy()
    }
    expect(spec.menu[0].items[0].vendor).toBe('Food Square')
    expect(html).toContain('Food Square')
  })

  test('a catalogue edit keeps the seller', () => {
    const [section] = sanitizeMenu([
      { name: 'Groceries', items: [{ name: 'Milk', price: 300, vendor: 'Fresh Mart Grocery' }] },
    ])
    expect(section.items[0].vendor).toBe('Fresh Mart Grocery')
  })

  test('items are items in a shop, not listings with a viewing agent', () => {
    expect(html).toContain('Shop the market')
    expect(html).toContain('"listingSpecLabel":"Delivery"')
    // The item links to its seller's store; the agent panel is property-only.
    expect(html).toContain('class="agent store-link"')
  })

  test('sellers get a store page, linked from the catalogue and the item', () => {
    expect(html).toContain('data-screen="store"')
    expect(html).toContain('class="store-rail"')
    expect(html).toContain('data-store="Food Square"')
    expect(html).toContain("function openStore(vendor)")
    expect(html).toContain("if (item.vendor === vendor) keys.push")
    // No sellers, no rail: the rest of the trades keep their catalogue.
    const shop = renderApp(
      buildSpec({ name: 'Probe Shop', vertical: 'shop', accent: '#2a5a8f', logo: 'PS', features: ['catalog'] }),
      { token: 'shop-probe', live: false },
    )
    expect(shop).not.toContain('class="store-rail"')
    expect(shop).not.toContain('data-screen="store" data-title="Store"')
  })

  test('item prices use the catalogue formatter, not a fixed two decimals', () => {
    // A product whose options are priced differently leads with its cheapest;
    // a single price is still just that price.
    expect(html).toContain("const price = differs ? 'From ' + money(Math.min.apply(null, prices)) : item.price > 0 ? money(item.price) : ''")
    // A price the import could not read stays blank; it is never dressed up as
    // “On request”, which is a claim only the business can make.
    expect(html).not.toContain("'On request'")
    expect(html).toContain("toLocaleString('en-US')")
    expect(html).not.toContain('toFixed(2)')
  })

  test('a priced item is added to the order, not booked', () => {
    expect(spec.menu[0].items[0].price).toBeGreaterThan(0)
    expect(html).toContain("DATA.ordering && item.price > 0")
    expect(html).toContain('Add to cart')
  })
})
