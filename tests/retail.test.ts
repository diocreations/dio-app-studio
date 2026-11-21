import { describe, expect, test } from 'bun:test'
import { renderApp } from '../src/worker/app'
import { DIRECTIONS, directionFor, themeForDirection } from '../src/worker/directions'
import { docFromSpec } from '../src/worker/doc'
import { buildSpec } from '../src/worker/pricing'
import { VERTICAL_IDS } from '../src/worker/verticals'
import { sampleNotice } from '../src/worker/views/editor'

/**
 * The retail composition is a reusable direction, not a Present & Correct
 * special case: it is offered where a business sells objects, it is chosen by
 * the direction id, and the same renderer serves a shop or an online store.
 */

function retailSpec(vertical: 'shop' | 'ecommerce' = 'shop') {
  const spec = buildSpec({
    name: 'Paper & Co',
    vertical,
    accent: '#2f4a3f',
    logo: 'PC',
    features: [],
  })
  const first = spec.menu[0].items[0]
  first.image = { url: 'https://cdn.test/one.jpg', alt: first.name, method: 'public-data', source: 'website' }
  first.media = undefined
  const second = spec.menu[0].items[1]
  second.image = undefined
  second.media = undefined
  second.variants = [
    { id: 'a', name: 'Small', price: second.price },
    { id: 'b', name: 'Large', price: second.price + 300 },
  ]
  return spec
}

function retailDoc(spec: ReturnType<typeof retailSpec>, direction = 'editorial') {
  const base = docFromSpec(spec)
  return { ...base, design: { ...base.design, direction } }
}

function render(spec: ReturnType<typeof retailSpec>, direction = 'editorial', screen?: string) {
  return renderApp(spec, {
    token: 'retail-probe',
    live: false,
    flagship: true,
    doc: retailDoc(spec, direction),
    screen,
  })
}

/** The bytes between two screen sections, so a control's home page is known. */
function screenSlice(html: string, id: string, next: string): string {
  const start = html.indexOf(`data-screen="${id}"`)
  const end = html.indexOf(`data-screen="${next}"`, start)
  return start < 0 || end < 0 ? '' : html.slice(start, end)
}

describe('the retail direction', () => {
  test('is offered only to trades that sell objects', () => {
    const retail: string[] = []
    for (const id of VERTICAL_IDS) {
      for (const direction of DIRECTIONS[id]) {
        if (themeForDirection(id, direction.id).layout === 'retail') retail.push(`${id}:${direction.id}`)
      }
    }
    expect(retail.sort()).toEqual(['ecommerce:editorial', 'shop:editorial'])
  })

  test('a shop and an online store can both choose it, and keep their own trade', () => {
    for (const vertical of ['shop', 'ecommerce'] as const) {
      const theme = themeForDirection(vertical, directionFor(vertical, 'editorial').id)
      expect(theme.layout).toBe('retail')
      const html = render(retailSpec(vertical))
      expect(html).toContain('data-layout="retail"')
      expect(html).toContain('rl-grid')
      // The trade still owns its vocabulary and palette; only the composition changes.
      expect(html).toContain(`data-trade="${vertical}"`)
      expect(html).toContain('--accent: #2f4a3f;')
    }
  })

  test('other directions keep their own catalogue layout', () => {
    const html = render(retailSpec('shop'), 'minimal')
    const body = /<body [^>]*>/.exec(html)?.[0] ?? ''
    expect(body).not.toContain('data-layout="retail"')
    expect(html).not.toContain('class="shop-head"')
  })
})

describe('the retail catalogue', () => {
  const spec = retailSpec()
  const html = render(spec)

  test('one product per row is the composition, not a wider card', () => {
    expect(html).toContain('.rl-grid { display: grid; grid-template-columns: 1fr;')
    expect(html).toContain('html body[data-layout="retail"] .chips > .chip { border-radius: 0 !important; }')
    // Borders and boxed containers are removed rather than enlarged.
    expect(html).toContain('.rl-card { display: flex; flex-direction: column; min-width: 0; background: none; border: 0;')
  })

  test("each card shows the photograph's own shape, exactly as recorded", () => {
    expect(html).toContain('<img class="rl-photo" src="https://cdn.test/one.jpg"')
    expect(html).toContain('alt="' + spec.menu[0].items[0].name + '"')
    expect(html).toContain('height: auto')
  })

  test('a product with no photograph gets a quiet blank frame, never artwork', () => {
    expect(html).toContain('Photograph to come')
    expect(html).toContain('media-missing-icon')
    expect(html).toContain('media-missing-label')
    const second = html.slice(html.indexOf('data-item="0-1"'), html.indexOf('data-item="0-2"'))
    expect(second).not.toContain('<img')
    expect(second).not.toContain('class="mono"')
    expect(second).not.toContain('class="thumb')
  })

  test('the card carries name, price and the option count, with no repeated category label in the shop', () => {
    expect(html).toContain('<span class="rl-price">')
    expect(html).toContain('2 options')
    expect(html).toContain('.shop-list .rl-kicker { display: none; }')
  })
})

describe('the Shop destination', () => {
  const spec = retailSpec()
  const html = render(spec)

  test('has its own heading, search, count, sort, categories and listing', () => {
    const shop = screenSlice(html, 'catalog', 'search')
    expect(shop).toContain('shop-head')
    expect(shop).toContain('data-shop-search')
    expect(shop).toContain('data-shop-count')
    expect(shop).toContain('data-shop-sort')
    expect(shop).toContain('data-filters')
    expect(shop).toContain('data-shop-list')
    expect(shop).toContain('price-asc')
    expect(shop).toContain('price-desc')
    expect(shop).toContain('>A–Z</option>')
  })

  test('Home is a different destination, not the same shelf again', () => {
    const home = screenSlice(html, 'home', 'catalog')
    expect(home.length).toBeGreaterThan(100)
    expect(home).not.toContain('shop-head')
    expect(home).not.toContain('data-shop-search')
    expect(home).not.toContain('data-shop-list')
    expect(home).toContain('New in')
  })

  test('a later page is rendered by the same retail card renderer', () => {
    const cards = renderApp(spec, {
      token: 'retail-probe',
      live: false,
      doc: retailDoc(spec),
      cards: { section: 0, from: 1, count: 3 },
    })
    expect(cards).not.toContain('<html')
    expect(cards).toContain('class="rl-card"')
    expect(cards).not.toContain('class="r-row"')
    expect(cards).toContain('data-item="0-1"')
    expect(cards).toContain('data-item="0-2"')
    expect(cards).not.toContain('data-item="0-0"')
  })

  test('the detail chooser prices each option and the bag receives the choice', () => {
    expect(html).toContain('function retailDetailHtml')
    expect(html).toContain('retailPrice')
    expect(html).toContain('data-add')
    expect(html).toContain('data-cart-open')
    // The retail detail is wired from the same product and variant data.
    expect(html).toContain('chosenVariant')
  })
})

describe('sample messaging follows the data, not the trade', () => {
  test('verified catalogue with remaining sample extras names only those extras', () => {
    const notice = sampleNotice({ menu: false, contact: true, offers: true, story: false })
    expect(notice?.menu).toBe(false)
    expect(notice?.compact).toBe(true)
    expect(notice?.groups).toEqual(['offers', 'contact details'])
    expect(notice?.text).not.toContain('catalogue, prices and photographs below are examples')
    expect(notice?.text).toContain('Your catalogue, prices and photographs are your own.')
  })

  test('a fully verified business shows no notice at all', () => {
    expect(sampleNotice({ menu: false, contact: false, offers: false, story: false, tagline: false })).toBeNull()
    expect(sampleNotice(undefined)).toBeNull()
  })

  test('a generated catalogue still says so', () => {
    const notice = sampleNotice({ menu: true, contact: false, story: false, offers: false })
    expect(notice?.menu).toBe(true)
    expect(notice?.compact).toBe(false)
    expect(notice?.text).toContain('are examples')
  })
})
