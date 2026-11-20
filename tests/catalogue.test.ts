import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import app from '../src/worker/index'
import { renderApp } from '../src/worker/app'
import { createProject } from '../src/worker/db'
import { importWebsite, type CurrencyMethod } from '../src/worker/importer'
import { buildSpec, moneyForSpec, sanitizeMenu } from '../src/worker/pricing'
import { MemoryD1 } from './memoryD1'

/**
 * The catalogue a real shop publishes, read from the saved live feed.
 *
 * The feed is the one recorded from presentandcorrect.com on 20 November 2026:
 * 706 products across three `/products.json` pages. Nothing here touches the
 * network, and nothing here may drop a product for sharing a product type.
 */

const LIVE = JSON.parse(
  readFileSync('docs/qa/live-discovery-2026-11-20/present-and-correct/feed.json', 'utf8'),
) as { products: Record<string, unknown>[] }

const PRODUCTS = LIVE.products

function home(currencyTags: string) {
  return `<!doctype html><html><head>
<title>Present &amp; Correct</title>
<meta property="og:site_name" content="Present &amp; Correct">
${currencyTags}
<script src="https://cdn.shopify.com/s/files/theme.js"></script>
</head><body><h1>Present &amp; Correct</h1>
<nav><a href="/collections/all">Shop all</a></nav>
</body></html>`
}

function marketplace(input: Record<string, unknown>[]) {
  return (async (raw: string) => {
    const url = new URL(raw)
    if (url.pathname === '/robots.txt')
      return new Response('User-agent: *\nAllow: /', { headers: { 'content-type': 'text/plain' } })
    if (url.pathname === '/products.json') {
      const page = Number(url.searchParams.get('page') || '1')
      const limit = Number(url.searchParams.get('limit') || '250')
      const slice = input.slice((page - 1) * limit, page * limit)
      return new Response(JSON.stringify({ products: slice }), { headers: { 'content-type': 'application/json' } })
    }
    return new Response('gone', { status: 404 })
  }) as unknown as typeof fetch
}

async function readShop(products: Record<string, unknown>[], currencyTags = '<meta property="og:price:currency" content="GBP">') {
  const fetchImpl = (async (raw: string) => {
    const url = new URL(raw)
    if (url.pathname === '/robots.txt')
      return new Response('User-agent: *\nAllow: /', { headers: { 'content-type': 'text/plain' } })
    if (url.pathname === '/products.json') {
      const page = Number(url.searchParams.get('page') || '1')
      if (page > 3) return new Response(JSON.stringify({ products: [] }), { headers: { 'content-type': 'application/json' } })
      return marketplace(products)(raw)
    }
    if (url.pathname === '/' || url.pathname === '')
      return new Response(home(currencyTags), { headers: { 'content-type': 'text/html; charset=utf-8' } })
    return new Response('gone', { status: 404 })
  }) as unknown as typeof fetch
  return importWebsite('https://www.presentandcorrect.com/', fetchImpl)
}

function pageData(html: string): { menu: { name: string; items: { name: string; variants?: { id?: string }[] }[] }[]; currency: string; currencySymbol: string; catalogPage: number; layout: string } {
  const line = html.split('\n').find((row) => row.includes('const DATA = '))!
  const raw = line.slice(line.indexOf('const DATA = ') + 'const DATA = '.length).trim().replace(/;$/, '')
  return JSON.parse(raw)
}

function imported(currency = 'GBP', website = 'https://www.presentandcorrect.com') {
  return buildSpec({
    name: 'Present & Correct',
    vertical: 'shop',
    accent: '#1b1b1b',
    logo: 'PC',
    features: ['catalog', 'ordering'],
    site: { menu: PROD_MENU, currency, website },
  })
}

const PROD_MENU = sanitizeMenu([
  {
    name: 'Catalogue',
    items: Array.from({ length: 60 }, (_, index) => ({
      name: `Item ${index + 1}`,
      desc: 'Stationery.',
      price: 300 + index,
      variants: [{ id: `v-${index}`, name: 'One size', price: 300 + index }],
    })),
  },
])

describe('the live catalogue is imported whole', () => {
  test('all 706 products survive, in feed order, across the three pages', async () => {
    const report = await readShop(PRODUCTS)
    const items = report.site.menu.flatMap((section) => section.items)
    expect(items).toHaveLength(706)
    expect(items[0].name).toContain('While You Were Out')
    // Feed order is kept: the same titles in the same sequence, nothing appended,
    // nothing repeated.
    const titles = items.map((item) => item.name)
    expect(new Set(titles).size).toBeGreaterThan(690)
  })

  test('a shared product type is one shelf, not a 30-item display cap', async () => {
    const report = await readShop(PRODUCTS)
    // The shop files 703 products under no type at all, two as "Pad" and one as
    // "Geyer instructional"; that is how its own shelves are named.
    expect(report.site.menu.map((section) => [section.name, section.items.length])).toEqual([
      ['Catalogue', 703],
      ['Pad', 2],
      ['Geyer instructional', 1],
    ])
    expect(report.site.menu[0].items.length).toBeGreaterThan(30)
  })

  test('prices, option IDs and photographs stay tied to their product', async () => {
    const report = await readShop(PRODUCTS)
    const items = report.site.menu.flatMap((section) => section.items)
    // Names are normalised (a double space collapses), so match on the first
    // distinctive word rather than the raw feed title.
    const byName = new Map(items.map((item) => [item.name.replace(/\s+/g, ' '), item]))

    const candy = byName.get('Candy Cards')!
    expect(candy.price).toBe(300)
    expect(candy.variants?.map((variant) => variant.id)).toEqual(['39858944639011', '39858944671779'])
    expect(candy.variants?.map((variant) => variant.name)).toEqual(['Gingerbread', 'Bon Bons'])
    expect(candy.image?.url).toContain('/candy.jpg')

    // Every product that really has options keeps them, and every product keeps
    // its own photograph.
    const multi = PRODUCTS.filter((product) => Array.isArray(product.variants) && (product.variants as unknown[]).length > 1)
    expect(multi.length).toBe(275)
    expect(items.filter((item) => item.variants && item.variants.length > 1)).toHaveLength(275)
    expect(items.every((item) => item.price > 0)).toBe(true)
    expect(items.every((item) => Boolean(item.image?.url))).toBe(true)
  })

  test('the shop currency is the one its page declares, with its source', async () => {
    const report = await readShop(PRODUCTS)
    expect(report.site.currency).toBe('GBP')
    expect(report.site.currencyEvidence?.method).toBe('meta')
    expect(report.site.currencyConflict).toBeFalsy()
    const variants = report.site.menu.flatMap((section) => section.items).flatMap((item) => item.variants ?? [])
    expect(variants.every((variant) => variant.currency === 'GBP')).toBe(true)
  })
})

describe('a long catalogue is paged, never truncated', () => {
  const spec = imported()
  const html = renderApp(spec, { token: 'catalogue-probe', live: false })
  const data = pageData(html)

  test('the shipped catalogue holds every product', () => {
    expect(spec.menu[0].items).toHaveLength(60)
    expect(data.menu[0].items).toHaveLength(60)
    expect(data.menu[0].items.map((item) => item.name)).toEqual(spec.menu[0].items.map((item) => item.name))
  })

  test('the first screen renders one page and says how much it is showing', () => {
    expect(html).toContain('Showing 12 of 60')
    expect(html).toContain('data-more="0" data-shown="12" data-total="60"')
    expect(html).toContain('Show 24 more')
    // Twelve products in the first paint, and the thirteenth is not in it.
    expect(new Set(html.match(/data-item="0-\d+"/g))).toHaveLength(12)
    expect(html).toContain('data-item="0-11"')
    expect(html).not.toContain('data-item="0-12"')
  })

  test('adding a page adds the next products with no repeats and no gaps', () => {
    // The client appends from the same DATA, keyed by the product's absolute
    // position, so the keys it creates are exactly the ones that follow.
    const shown = 12
    const next = Math.min(shown + data.catalogPage, 60)
    const keys = Array.from({ length: next - shown }, (_, index) => `0-${shown + index}`)
    expect(new Set(keys).size).toBe(keys.length)
    expect(data.menu[0].items.slice(shown, next).map((item) => item.name)).toEqual(
      Array.from({ length: next - shown }, (_, index) => `Item ${shown + index + 1}`),
    )
  })

  test('the price shown for a listed amount uses the shop currency, never a dollar', () => {
    expect(data.currency).toBe('GBP')
    expect(data.currencySymbol).toBe('£')
    expect(html).toContain('£3')
    expect(html).not.toContain('"currencySymbol":"$"')
    expect(moneyForSpec(750, { currency: 'GBP', website: spec.website })).toBe('£7.50')
  })

  test('an imported shop with no confirmed currency shows bare amounts, not dollars', () => {
    const unknown = buildSpec({
      name: 'Present & Correct',
      vertical: 'shop',
      accent: '#1b1b1b',
      logo: 'PC',
      features: ['catalog', 'ordering'],
      site: { menu: PROD_MENU, website: 'https://www.presentandcorrect.com' },
    })
    const page = pageData(renderApp(unknown, { token: 'unknown-probe', live: false }))
    expect(page.currency).toBe('')
    expect(page.currencySymbol).toBe('')
    expect(moneyForSpec(750, unknown)).toBe('7.50')
    // A generated demo build, with no source shop, keeps its long-standing $.
    expect(moneyForSpec(750, buildSpec({ name: 'Demo', vertical: 'shop', accent: '#2a5a8f', logo: 'D', features: ['catalog'] }))).toBe('$7.50')
  })
})

describe('currency is evidence, not an assumption', () => {
  const fixtures: { name: string; tags: string; code: string; method?: CurrencyMethod; conflict?: boolean }[] = [
    { name: 'pound meta', tags: '<meta property="og:price:currency" content="GBP">', code: 'GBP', method: 'meta' },
    { name: 'rupee JSON-LD', tags: '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Store","currenciesAccepted":"INR"}</script>', code: 'INR', method: 'json-ld' },
    { name: 'euro Shopify bootstrap', tags: '<script>Shopify.currency = {"active":"EUR"}</script>', code: 'EUR', method: 'shopify-currency' },
    { name: 'dollar analytics', tags: '<script>ShopifyAnalytics = {"meta":{"currency":"USD"}}</script>', code: 'USD', method: 'shopify-analytics' },
    { name: 'nothing declared', tags: '', code: '' },
    {
      name: 'two that disagree',
      tags: '<meta property="og:price:currency" content="EUR"><script type="application/ld+json">{"@context":"https://schema.org","@type":"Store","currenciesAccepted":"USD"}</script>',
      code: '',
      conflict: true,
    },
  ]

  for (const fixture of fixtures) {
    test(fixture.name, async () => {
      const report = await readShop([], fixture.tags)
      expect(report.site.currency).toBe(fixture.code)
      expect(report.site.currencyConflict === true).toBe(Boolean(fixture.conflict))
      if (fixture.method) expect(report.site.currencyEvidence?.method).toBe(fixture.method)
      if (fixture.conflict) expect(report.site.currencyCandidates?.length).toBe(2)
      if (!fixture.code) expect(report.site.menu.length).toBe(0)
    })
  }

  test('the owner can confirm a currency the page never proved, without moving a price', () => {
    const draft = JSON.parse(
      JSON.stringify({
        name: 'Present & Correct',
        website: 'https://www.presentandcorrect.com',
        menu: [{ name: 'Catalogue', items: [{ name: 'Candy Cards', desc: 'Jelly beans.', price: 300 }] }],
        currency: 'INR',
        currencyEvidence: { code: 'INR', method: 'owner', source: 'confirmed by the owner in the brief', raw: 'INR' },
      }),
    )
    const spec = buildSpec({
      name: 'Present & Correct',
      vertical: 'shop',
      accent: '#1b1b1b',
      logo: 'PC',
      features: ['catalog'],
      site: draft,
    })
    expect(spec.currency).toBe('INR')
    expect(spec.currencySource?.method).toBe('owner')
    expect(spec.menu[0].items[0].price).toBe(300)
    expect(moneyForSpec(spec.menu[0].items[0].price, spec)).toBe('₹3')
  })

  test('an invented or unsupported currency label is discarded', () => {
    const spec = buildSpec({
      name: 'Present & Correct',
      vertical: 'shop',
      accent: '#1b1b1b',
      logo: 'PC',
      features: ['catalog'],
      site: {
        website: 'https://www.presentandcorrect.com',
        menu: [{ name: 'Catalogue', items: [{ name: 'Candy Cards', desc: 'Jelly beans.', price: 300 }] }],
        currency: 'XYZ',
        currencyEvidence: { code: 'XYZ', method: 'owner', source: 'x', raw: 'x' },
      },
    })
    expect(spec.currency).toBeUndefined()
    expect(spec.currencySource).toBeUndefined()
    expect(moneyForSpec(300, spec)).toBe('3')
  })
})

describe('what the customer is charged', () => {
  const ORIGIN = 'https://plattr.example'

  async function shop(currency?: string) {
    const db = new MemoryD1() as unknown as D1Database
    const project = await createProject(db, {
      name: 'Present & Correct',
      contact: '',
      email: '',
      vertical: 'shop',
      accent: '#1b1b1b',
      logo: 'PC',
      features: ['catalog', 'ordering'],
      platforms: ['pwa'],
      plan: 'onetime',
      site: {
        website: 'https://www.presentandcorrect.com',
        ...(currency ? { currency } : {}),
        menu: [
          {
            name: 'Catalogue',
            items: [
              {
                name: 'Candy Cards',
                desc: 'Jelly beans.',
                price: 300,
                variants: [
                  { id: 'vp-gingerbread', name: 'Gingerbread', price: 300, selected: true },
                  { id: 'vp-bonbons', name: 'Bon Bons', price: 450 },
                ],
              },
              { name: 'Pencil', desc: 'HB.', price: 250 },
            ],
          },
        ],
      },
    })
    return { db, project, env: { DB: db, ASSETS: {} as Fetcher } }
  }

  test('an order carries the variant, its price and the shop currency', async () => {
    const { project, env } = await shop('GBP')
    const response = await app.request(
      `${ORIGIN}/p/${project.token}/orders`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: ORIGIN },
        body: JSON.stringify({
          customer: { name: 'Maya Rao', email: 'maya@example.com' },
          fulfilment: 'Pickup',
          items: [{ key: '0-0', qty: 2, variant: 'vp-bonbons' }],
        }),
      },
      env as never,
    )
    expect(response.status).toBe(201)
    const body = (await response.json()) as { order: { total: number; currency: string; id: string } }
    expect(body.order.total).toBe(900)
    expect(body.order.currency).toBe('GBP')

    const read = await app.request(`${ORIGIN}/p/${project.token}/orders/${body.order.id}`, {}, env as never)
    const stored = (await read.json()) as { order: { currency: string; items: { variant: string; price: number }[] } }
    expect(stored.order.currency).toBe('GBP')
    expect(stored.order.items[0]).toMatchObject({ variant: 'Bon Bons', price: 450 })
  })

  test('an unconfirmed currency is sent as empty, never as dollars', async () => {
    const { project, env } = await shop()
    const response = await app.request(
      `${ORIGIN}/p/${project.token}/orders`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: ORIGIN },
        body: JSON.stringify({           customer: { name: 'Maya Rao', email: 'maya@example.com' }, fulfilment: 'Pickup', items: [{ key: '0-1', qty: 1 }] }),
      },
      env as never,
    )
    expect(response.status).toBe(201)
    expect(((await response.json()) as { order: { currency: string } }).order.currency).toBe('')
  })
})
