import { describe, expect, test } from 'bun:test'
import { importWebsite } from '../src/worker/importer'
import { sanitizeMenu } from '../src/worker/pricing'

/**
 * A multi-variant product, read from a storefront feed fixture.
 *
 * A product with sizes is not one price: every option keeps its own price and
 * the shop's currency, the option the published figure came from is marked, and
 * a long option list is not cut down to the first few.
 */

const HOME = `<!doctype html><html><head>
<title>Marlow Supply — Linen and paper</title>
<meta property="og:site_name" content="Marlow Supply">
<script>window.Shopify = { theme: { name: 'Dawn' } }</script>
<script src="https://cdn.shopify.com/s/files/theme.js"></script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Store","name":"Marlow Supply","currenciesAccepted":"GBP"}</script>
</head><body><h1>Marlow Supply</h1>
<nav><a href="/collections/all">Shop all</a></nav>
<p>Free shipping on orders over £40.</p>
</body></html>`

function variant(title: string, price: string, id?: string) {
  return id ? { id, title, price, sku: title.toUpperCase() } : { title, price, sku: title.toUpperCase() }
}

const FEED = {
  products: [
    {
      id: 1,
      title: 'Linen Shirt',
      handle: 'linen-shirt',
      body_html: '<p>Washed linen, cut loose.</p>',
      product_type: 'Shirts',
      variants: [variant('Small', '42.00', 'vp-small'), variant('Medium', '58.00', 'vp-medium'), variant('Large', '49.00', 'vp-large')],
      images: [{ src: 'https://cdn.shopify.com/s/files/1/0001/products/linen-shirt.jpg?v=1' }],
    },
    {
      id: 2,
      title: 'Pocket Notebook',
      handle: 'pocket-notebook',
      body_html: '<p>Forty pages, sewn.</p>',
      product_type: 'Paper',
      variants: Array.from({ length: 12 }, (_, index) => variant(`Pack of ${index + 1}`, (3 + index).toFixed(2))),
      images: [{ src: 'https://cdn.shopify.com/s/files/1/0001/products/pocket-notebook.jpg?v=1' }],
    },
    {
      // Two options at the same lowest price: exactly one may be marked as the
      // option the published figure came from.
      id: 4,
      title: 'Day Pass',
      handle: 'day-pass',
      body_html: '<p>One day, any day.</p>',
      product_type: 'Tickets',
      variants: [variant('Early entry', '30.00', 'vp-early'), variant('Late entry', '30.00', 'vp-late'), variant('Week pass', '45.00', 'vp-week')],
      images: [{ src: 'https://cdn.shopify.com/s/files/1/0001/products/day-pass.jpg?v=1' }],
    },
    {
      id: 3,
      title: 'Canvas Tote',
      handle: 'canvas-tote',
      body_html: '<p>Heavy canvas, one size.</p>',
      product_type: 'Bags',
      variants: [variant('Default Title', '24.00')],
      images: [{ src: 'https://cdn.shopify.com/s/files/1/0001/products/canvas-tote.jpg?v=1' }],
    },
  ],
}

async function readShop() {
  const fetchImpl = (async (input: string) => {
    const url = new URL(input)
    if (url.pathname === '/products.json')
      return new Response(JSON.stringify(FEED), { headers: { 'content-type': 'application/json' } })
    if (url.pathname === '/robots.txt') return new Response('User-agent: *\nAllow: /', { headers: { 'content-type': 'text/plain' } })
    if (url.pathname === '/') return new Response(HOME, { headers: { 'content-type': 'text/html; charset=utf-8' } })
    return new Response('gone', { status: 404 })
  }) as unknown as typeof fetch
  return importWebsite('https://marlow.example/', fetchImpl)
}

function itemNamed(report: Awaited<ReturnType<typeof readShop>>, name: string) {
  return report.site.menu.flatMap((section) => section.items).find((item) => item.name === name)!
}

describe('a product with several variants', () => {
  test('every variant keeps its own price and the shop currency', async () => {
    const report = await readShop()
    const shirt = itemNamed(report, 'Linen Shirt')
    expect(shirt.variants?.map((variant) => variant.name)).toEqual(['Small', 'Medium', 'Large'])
    expect(shirt.variants?.map((variant) => variant.price)).toEqual([4200, 5800, 4900])
    expect(shirt.variants?.every((variant) => variant.currency === 'GBP')).toBe(true)
  })

  test('the variant behind the published price is marked and named', async () => {
    const report = await readShop()
    const shirt = itemNamed(report, 'Linen Shirt')
    const selected = shirt.variants?.filter((variant) => variant.selected) ?? []
    expect(selected).toHaveLength(1)
    expect(selected[0].name).toBe('Small')
    expect(shirt.price).toBe(4200)
    expect(shirt.priceEvidence?.variant).toBe('Small')
    expect(shirt.priceEvidence?.raw).toBe('42.00')
    expect(shirt.priceEvidence?.method).toBe('shopify-variant')
    expect(shirt.priceEvidence?.source).toStartWith('/products.json?limit=250&page=1')
  })

  test('a long option list is kept, not trimmed to a handful', async () => {
    const report = await readShop()
    const notebook = itemNamed(report, 'Pocket Notebook')
    expect(notebook.variants).toHaveLength(12)
    expect(notebook.variants?.filter((variant) => variant.selected)).toHaveLength(1)
    expect(notebook.variants?.[0].name).toBe('Pack of 1')
    expect(notebook.price).toBe(300)
  })

  test('each product keeps its own photograph', async () => {
    const report = await readShop()
    expect(itemNamed(report, 'Linen Shirt').image?.url).toContain('/linen-shirt.jpg')
    expect(itemNamed(report, 'Pocket Notebook').image?.url).toContain('/pocket-notebook.jpg')
    expect(itemNamed(report, 'Canvas Tote').image?.url).toContain('/canvas-tote.jpg')
  })

  test('when two variants share the cheapest price, exactly one is selected', async () => {
    const report = await readShop()
    const pass = itemNamed(report, 'Day Pass')
    const selected = pass.variants?.filter((variant) => variant.selected) ?? []
    expect(selected).toHaveLength(1)
    expect(selected[0].name).toBe('Early entry')
    expect(pass.price).toBe(3000)
    // The feed's own option IDs survive, so an order can name the exact option.
    expect(pass.variants?.map((variant) => variant.id)).toEqual(['vp-early', 'vp-late', 'vp-week'])
  })

  test('a build keeps feed option IDs and drops ones that are not usable', () => {
    const long = 'x'.repeat(41)
    const menu = sanitizeMenu([
      {
        name: 'Tickets',
        items: [
          {
            name: 'Day Pass',
            price: 3000,
            variants: [
              { id: 'vp-early', name: 'Early entry', price: 3000, selected: true },
              { id: '  vp-late  ', name: 'Late entry', price: 3000 },
              { id: long, name: 'Week pass', price: 4500 },
              { id: 42, name: 'Broken id', price: 4500 },
            ],
          },
        ],
      },
    ])
    expect(menu[0].items[0].variants).toEqual([
      { id: 'vp-early', name: 'Early entry', price: 3000, selected: true },
      { id: 'vp-late', name: 'Late entry', price: 3000 },
      { name: 'Week pass', price: 4500 },
      { name: 'Broken id', price: 4500 },
    ])
  })

  test('the build stores variants with their selection but not the evidence sources', () => {
    const menu = sanitizeMenu([
      {
        name: 'Shirts',
        items: [
          {
            name: 'Linen Shirt',
            price: 4200,
            priceEvidence: { method: 'shopify-variant', source: '/products.json', raw: '42.00', currency: 'GBP', validated: true },
            variants: [
              { name: 'Small', price: 4200, currency: 'GBP', selected: true },
              { name: 'Medium', price: 5800, currency: 'GBP' },
              { name: 'Large', price: 4900, currency: 'GBP', selected: 'yes' },
              { name: '', price: 100 },
              { name: 'Broken', price: -4 },
            ],
          },
        ],
      },
    ])
    const item = menu[0].items[0] as Record<string, unknown>
    expect(item.variants).toEqual([
      { name: 'Small', price: 4200, currency: 'GBP', selected: true },
      { name: 'Medium', price: 5800, currency: 'GBP' },
      { name: 'Large', price: 4900, currency: 'GBP' },
    ])
    // Public build data: the internal source of each price stays out of the spec.
    expect(item.priceEvidence).toBeUndefined()
  })
})
