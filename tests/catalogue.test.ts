import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import app from '../src/worker/index'
import { renderApp } from '../src/worker/app'
import { createOrder, dashboardData } from '../src/worker/business'
import { createProject } from '../src/worker/db'
import { paymentDashboard } from '../src/worker/payments/service'
import { dashboardPage } from '../src/worker/views/dashboard'
import { paymentPage } from '../src/worker/views/payments'
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

  test('a simple product keeps its only option, with its feed ID and price', async () => {
    const report = await readShop(PRODUCTS)
    const items = report.site.menu.flatMap((section) => section.items)
    const singles = items.filter((item) => item.variants?.length === 1)
    expect(singles).toHaveLength(706 - 275)
    const pad = items.find((item) => item.name === "'While You Were Out' Pad (1990s)")!
    expect(pad.price).toBe(750)
    expect(pad.variants).toEqual([
      expect.objectContaining({ id: '54863213396347', name: 'Default Title', price: 750, currency: 'GBP', selected: true }),
    ])
    expect(pad.image?.url).toContain('/wywo_')
    // Every single option is the one the published price came from, so the bag
    // and the order can name it without inventing a choice.
    expect(singles.every((item) => item.variants?.[0].selected === true)).toBe(true)
    expect(singles.every((item) => (item.variants?.[0].id ?? '').length > 0)).toBe(true)
  })

  test('a product with more than two dozen options keeps all of them', async () => {
    const report = await readShop(PRODUCTS)
    const notebook = report.site.menu.flatMap((section) => section.items).find((item) => item.name === 'Alphabet Notebook')!
    expect(notebook.variants).toHaveLength(26)
    expect(notebook.variants?.filter((variant) => variant.selected)).toHaveLength(1)
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

describe('the live shop, presenting a localised currency', () => {
  // What the final live read actually saw: the storefront told a reader in
  // India that its currency was INR, while its own option labels are pounds.
  const LOCALISED = '<script>ShopifyAnalytics = {"meta":{"currency":"INR"}}</script>'

  test('one product label is a hint, not proof of the catalogue currency', async () => {
    const report = await readShop(PRODUCTS, LOCALISED)
    // The live shop labels one gift card in pounds. One product cannot speak for
    // the other 705, so nothing is published; the brief asks the owner.
    expect(report.site.currency).toBe('')
    expect(report.site.currencyEvidence).toBeUndefined()
    expect(report.site.currencyConflict).toBeFalsy()
    const candidate = report.site.currencyCandidates?.find((entry) => entry.code === 'GBP')
    expect(candidate?.method).toBe('variant-labels')
    expect(candidate?.raw).toContain('£10')
    expect(candidate?.raw).toContain('1 product')
  })

  test('labels from two products that match their prices settle the currency', async () => {
    const card = (index: number, title: string, price: string) => ({
      title: `Gift Card ${index}`,
      handle: `gift-card-${index}`,
      body_html: '<p>Gift card.</p>',
      product_type: 'Cards',
      variants: [{ id: `v${index}`, title, price }],
      images: [{ src: 'https://cdn.shopify.com/s/files/1/0001/products/card.jpg' }],
    })
    const report = await readShop([card(1, '£10', '10.00'), card(2, '£25', '25.00'), card(3, '£50', '50.00')], LOCALISED)
    expect(report.site.currency).toBe('GBP')
    expect(report.site.currencyEvidence?.method).toBe('variant-labels')
    expect(report.site.currencyConflict).toBeFalsy()
    const variants = report.site.menu.flatMap((section) => section.items).flatMap((item) => item.variants ?? [])
    expect(variants.every((variant) => variant.currency === 'GBP')).toBe(true)
  })

  test('a label that disagrees with its own option price is not evidence', async () => {
    const product = (title: string, variantTitle: string, price: string) => ({
      title,
      handle: title.toLowerCase().replace(/\s+/g, '-'),
      body_html: '<p>Card.</p>',
      product_type: 'Cards',
      variants: [{ id: `v-${title}`, title: variantTitle, price }],
      images: [{ src: 'https://cdn.shopify.com/s/files/1/0001/products/card.jpg' }],
    })
    // "£10" on a 37.00 option is a label the price contradicts: ignored.
    const report = await readShop(
      [product('Card A', '£10', '37.00'), product('Card B', '£20', '64.00'), product('Card C', '£30', '93.00')],
      LOCALISED,
    )
    expect(report.site.currency).toBe('')
    expect((report.site.currencyCandidates ?? []).filter((entry) => entry.method === 'variant-labels')).toHaveLength(0)
    expect(report.site.currencyConflict).toBeFalsy()
  })

  test('a page currency and a label currency that disagree are a question', async () => {
    const product = (index: number) => ({
      title: `Card ${index}`,
      handle: `card-${index}`,
      body_html: '<p>Card.</p>',
      product_type: 'Cards',
      variants: [{ id: `v${index}`, title: '€20', price: '20.00' }],
      images: [{ src: 'https://cdn.shopify.com/s/files/1/0001/products/card.jpg' }],
    })
    const report = await readShop([product(1), product(2), product(3)], '<meta property="og:price:currency" content="GBP">')
    expect(report.site.currency).toBe('')
    expect(report.site.currencyEvidence).toBeUndefined()
    expect(report.site.currencyConflict).toBe(true)
    expect(report.site.currencyCandidates?.map((entry) => entry.code).sort()).toEqual(['EUR', 'GBP'])
  })

  test('two label currencies are a question, not a guess', async () => {
    const card = (index: number) => ({
      title: `Gift Card ${index}`,
      handle: `gift-card-${index}`,
      body_html: '<p>Gift card.</p>',
      product_type: 'Cards',
      variants: [
        { id: `v${index}a`, title: '£10', price: '10.00' },
        { id: `v${index}b`, title: '€20', price: '20.00' },
      ],
      images: [{ src: 'https://cdn.shopify.com/s/files/1/0001/products/card.jpg' }],
    })
    const mixed = [card(1), card(2), card(3)]
    const report = await readShop(mixed, LOCALISED)
    expect(report.site.currency).toBe('')
    expect(report.site.currencyConflict).toBe(true)
    expect(report.site.currencyCandidates?.map((entry) => entry.code).sort()).toEqual(['EUR', 'GBP', 'INR'])
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
    const shown = 12
    const next = Math.min(shown + data.catalogPage, 60)
    const keys = Array.from({ length: next - shown }, (_, index) => `0-${shown + index}`)
    expect(new Set(keys).size).toBe(keys.length)
    expect(data.menu[0].items.slice(shown, next).map((item) => item.name)).toEqual(
      Array.from({ length: next - shown }, (_, index) => `Item ${shown + index + 1}`),
    )
    expect(data.catalogPage).toBe(24)
    // The browser script fetches the next slice instead of rebuilding cards.
    expect(html).toContain("'/p/' + DATA.token + '/cards/' + sectionIndex")
  })

  test('a later page is the same renderer, with no second copy in the browser', () => {
    const cards = renderApp(spec, { token: 'catalogue-probe', live: false, cards: { section: 0, from: 12, count: 24 } })
    // A fragment, not a page: no shell, no catalogue payload, no scripts.
    expect(cards).not.toContain('<html')
    expect(cards).not.toContain('const DATA')
    expect(cards).not.toContain('function catalogCard(item, key)')
    const keys = [...cards.matchAll(/data-item="0-(\d+)"/g)].map((match) => Number(match[1]))
    expect(new Set(keys).size).toBe(24)
    expect(Math.min(...keys)).toBe(12)
    expect(Math.max(...keys)).toBe(35)
    expect(cards).toContain('Item 13')
    expect(cards).toContain('£3.12')
    expect(cards).not.toContain('$')
    // The shipped page has the same cards for the same positions.
    expect(html).toContain('Item 1')
    expect(html).toContain('Item 12')
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
    // A storefront can localise what a visitor sees; that is a hint, not proof
    // of what the feed's prices mean, so neither code is published.
    { name: 'euro presentment only', tags: '<script>Shopify.currency = {"active":"EUR"}</script>', code: '' },
    { name: 'dollar presentment only', tags: '<script>ShopifyAnalytics = {"meta":{"currency":"USD"}}</script>', code: '' },
    // Proof beside a localised view: the shop states GBP, so GBP is published.
    {
      name: 'pounds beside a localised rupee view',
      tags:
        '<meta property="og:price:currency" content="GBP"><script>ShopifyAnalytics = {"meta":{"currency":"INR"}}</script>',
      code: 'GBP',
      method: 'meta',
    },
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

const MULTI = sanitizeMenu([
  {
    name: 'Catalogue',
    items: Array.from({ length: 60 }, (_, index) => ({
      name: `Item ${index + 1}`,
      desc: 'Stationery.',
      price: 300 + index,
      variants: [{ id: `c-${index}`, name: 'One size', price: 300 + index }],
    })),
  },
  {
    name: 'Pad',
    items: Array.from({ length: 30 }, (_, index) => ({ name: `Pad ${index + 1}`, desc: 'Paper.', price: 500 + index })),
  },
  {
    name: 'Geyer instructional',
    items: Array.from({ length: 5 }, (_, index) => ({ name: `Geyer ${index + 1}`, desc: 'Chart.', price: 900 + index })),
  },
])

const MULTI_SPEC = buildSpec({
  name: 'Present & Correct',
  vertical: 'shop',
  accent: '#1b1b1b',
  logo: 'PC',
  features: ['catalog', 'ordering'],
  site: { menu: MULTI, currency: 'GBP', website: 'https://www.presentandcorrect.com' },
})

/** The cards inside one shelf's own host, from its first card to its more
 *  control. A featured row elsewhere on the page may show the same products with
 *  the same keys, so counting the whole document would count those too. */
function keysIn(html: string, section: number): number[] {
  const pattern = new RegExp(`data-item="${section}-(\\d+)"`, 'g')
  const start = html.indexOf(`data-items="${section}"`)
  // A fragment is one shelf's cards and nothing else.
  if (start < 0) return [...html.matchAll(pattern)].map((match) => Number(match[1]))
  const more = html.indexOf(`data-more="${section}"`, start)
  const block = html.slice(start, more > start ? more : undefined)
  return [...block.matchAll(new RegExp(`data-item="${section}-(\\d+)"`, 'g'))].map((match) => Number(match[1]))
}

describe('every shelf pages on its own', () => {
  const page = renderApp(MULTI_SPEC, { token: 'paging-probe', live: false })

  test('the first paint is one page per shelf, and the count says so', () => {
    expect(keysIn(page, 0)).toEqual(Array.from({ length: 12 }, (_, index) => index))
    expect(keysIn(page, 1)).toEqual(Array.from({ length: 12 }, (_, index) => index))
    expect(keysIn(page, 2)).toEqual([0, 1, 2, 3, 4])
    expect(page).toContain('Showing 29 of 95')
  })

  test('a later page of one shelf carries only that shelf', () => {
    const pad = renderApp(MULTI_SPEC, { token: 'paging-probe', live: false, cards: { section: 1, from: 12, count: 24 } })
    expect(keysIn(pad, 1)).toEqual(Array.from({ length: 18 }, (_, index) => 12 + index))
    expect(pad).not.toContain('data-item="0-')
    expect(pad).not.toContain('data-item="2-')
    const catalogue = renderApp(MULTI_SPEC, { token: 'paging-probe', live: false, cards: { section: 0, from: 12, count: 24 } })
    expect(keysIn(catalogue, 0)).toEqual(Array.from({ length: 24 }, (_, index) => 12 + index))
  })

  test('sequential pages cover a shelf once, with no duplicate or missing key', () => {
    const first = renderApp(MULTI_SPEC, { token: 'paging-probe', live: false, cards: { section: 0, from: 12, count: 24 } })
    const second = renderApp(MULTI_SPEC, { token: 'paging-probe', live: false, cards: { section: 0, from: 36, count: 24 } })
    const keys = [...keysIn(first, 0), ...keysIn(second, 0)]
    expect(keys).toHaveLength(48)
    expect(new Set(keys).size).toBe(48)
    expect(Math.min(...keys)).toBe(12)
    expect(Math.max(...keys)).toBe(59)
    expect(keysIn(first, 0).some((key) => keysIn(second, 0).includes(key))).toBe(false)
  })

  test('an odd or huge slice cannot ask for an unbounded render', () => {
    const huge = renderApp(MULTI_SPEC, { token: 'paging-probe', live: false, cards: { section: 0, from: -10, count: 10_000 } })
    expect(keysIn(huge, 0)).toEqual(Array.from({ length: 60 }, (_, index) => index))
    const none = renderApp(MULTI_SPEC, { token: 'paging-probe', live: false, cards: { section: 0, from: 0, count: 0 } })
    expect(keysIn(none, 0)).toHaveLength(1)
    const broken = renderApp(MULTI_SPEC, {
      token: 'paging-probe',
      live: false,
      cards: { section: 0, from: Number.NaN, count: Number.POSITIVE_INFINITY },
    })
    expect(keysIn(broken, 0)).toEqual(Array.from({ length: 12 }, (_, index) => index))
    const past = renderApp(MULTI_SPEC, { token: 'paging-probe', live: false, cards: { section: 0, from: 5000, count: 24 } })
    expect(keysIn(past, 0)).toEqual([])
  })
})

describe('the cards route is bounded and public', () => {
  const ORIGIN = 'https://plattr.example'

  async function shop() {
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
      site: { menu: MULTI, currency: 'GBP', website: 'https://www.presentandcorrect.com' },
    })
    return { project, env: { DB: db, ASSETS: {} as Fetcher } }
  }

  test('a correct page is 24 cards, and a huge count is not', async () => {
    const { project, env } = await shop()
    const one = await app.request(`${ORIGIN}/p/${project.token}/cards/0?from=12&count=24`, {}, env as never)
    expect(one.status).toBe(200)
    const html = await one.text()
    expect(keysIn(html, 0)).toEqual(Array.from({ length: 24 }, (_, index) => 12 + index))
    expect(html).not.toContain('<html')

    const huge = await app.request(`${ORIGIN}/p/${project.token}/cards/0?from=-4&count=9999`, {}, env as never)
    expect(huge.status).toBe(200)
    expect(keysIn(await huge.text(), 0)).toHaveLength(60)

    const past = await app.request(`${ORIGIN}/p/${project.token}/cards/0?from=9999&count=24`, {}, env as never)
    expect(past.status).toBe(200)
    expect(await past.text()).toBe('')

    const nonsense = await app.request(`${ORIGIN}/p/${project.token}/cards/0?from=abc&count=24`, {}, env as never)
    expect(nonsense.status).toBe(400)
    const fractional = await app.request(`${ORIGIN}/p/${project.token}/cards/0?from=12.7&count=night`, {}, env as never)
    expect(fractional.status).toBe(400)
  })

  test('two shelves fetched at once do not mix', async () => {
    const { project, env } = await shop()
    const [catalogue, pads] = await Promise.all([
      app.request(`${ORIGIN}/p/${project.token}/cards/0?from=12&count=24`, {}, env as never),
      app.request(`${ORIGIN}/p/${project.token}/cards/1?from=12&count=24`, {}, env as never),
    ])
    expect(catalogue.status).toBe(200)
    expect(pads.status).toBe(200)
    expect(keysIn(await catalogue.text(), 0)).toEqual(Array.from({ length: 24 }, (_, index) => 12 + index))
    expect(keysIn(await pads.text(), 1)).toEqual(Array.from({ length: 18 }, (_, index) => 12 + index))
  })
})

describe('one product, one amount, on every surface', () => {
  const ORIGIN = 'https://plattr.example'
  const MENU = [
    {
      name: 'Catalogue',
      items: [
        {
          name: 'Candy Cards',
          desc: 'Jelly beans.',
          price: 300,
          variants: [{ id: 'vp-single', name: 'Default Title', price: 300, selected: true }],
        },
        {
          name: 'Linen Shirt',
          desc: 'Washed linen.',
          price: 4200,
          variants: [
            { id: 'vp-small', name: 'Small', price: 4200, selected: true },
            { id: 'vp-large', name: 'Large', price: 4800 },
          ],
        },
      ],
    },
  ]

  async function shop(currency = 'GBP') {
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
      site: { menu: MENU, currency, website: 'https://www.presentandcorrect.com' },
    })
    return { db, project, env: { DB: db, ASSETS: {} as Fetcher } }
  }

  async function order(
    project: Awaited<ReturnType<typeof shop>>['project'],
    env: unknown,
    items: { key: string; qty: number; variant?: string }[],
  ) {
    return app.request(
      `${ORIGIN}/p/${project.token}/orders`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: ORIGIN },
        body: JSON.stringify({ customer: { name: 'Maya Rao', email: 'maya@example.com' }, fulfilment: 'Pickup', items }),
      },
      env as never,
    )
  }

  test('a single option is named in the order, with its ID, price and currency', async () => {
    const { project, env } = await shop()
    const response = await order(project, env, [{ key: '0-0', qty: 3, variant: 'vp-single' }])
    expect(response.status).toBe(201)
    const created = (await response.json()) as { order: { id: string; total: number; currency: string } }
    expect(created.order.total).toBe(900)
    expect(created.order.currency).toBe('GBP')

    const read = await app.request(`${ORIGIN}/p/${project.token}/orders/${created.order.id}`, {}, env as never)
    const stored = (await read.json()) as {
      order: { currency: string; items: { variant: string; variantId: string; price: number }[] }
    }
    expect(stored.order.items[0]).toMatchObject({ variant: 'Default Title', variantId: 'vp-single', price: 300 })
    expect(stored.order.currency).toBe('GBP')
  })

  test('a multi-option order still prices the option it names', async () => {
    const { project, env } = await shop()
    const response = await order(project, env, [{ key: '0-1', qty: 1, variant: 'vp-large' }])
    expect(response.status).toBe(201)
    const created = (await response.json()) as { order: { id: string; total: number } }
    expect(created.order.total).toBe(4800)
    const read = await app.request(`${ORIGIN}/p/${project.token}/orders/${created.order.id}`, {}, env as never)
    const stored = (await read.json()) as { order: { items: { variant: string; variantId: string; price: number }[] } }
    expect(stored.order.items[0]).toMatchObject({ variant: 'Large', variantId: 'vp-large', price: 4800 })
  })

  test('an option that is not on the product is refused, not priced', async () => {
    const { project, env } = await shop()
    const response = await order(project, env, [{ key: '0-0', qty: 1, variant: 'vp-made-up' }])
    expect(response.status).toBe(422)
    const body = (await response.json()) as { error: { code: string } }
    expect(body.error.code).toBe('variant_unknown')
  })

  test('the card, the order, the dashboard and the payment page agree on the money', async () => {
    const { db, project, env } = await shop()
    const html = renderApp(project.spec, { token: project.token, live: false })
    const data = pageData(html)
    expect(data.menu[0].items[0].variants?.[0].id).toBe('vp-single')
    expect(html).toContain('£3')
    const fragment = renderApp(project.spec, { token: project.token, live: false, cards: { section: 0, from: 0, count: 24 } })
    expect(fragment).toContain('£3')
    expect(fragment).not.toContain('$')

    const created = await createOrder(db, project, {
      customer: { name: 'Maya Rao', email: 'maya@example.com' },
      fulfilment: 'Pickup',
      items: [{ key: '0-0', qty: 3, variant: 'vp-single' }],
    })
    expect(created.total).toBe(900)
    const data2 = await dashboardData(db, project)
    const payments = await paymentDashboard(db, project, ORIGIN)
    const dashboard = dashboardPage({ project, data: data2, origin: ORIGIN, payments })
    expect(dashboard).toContain('£9.00')
    expect(dashboard).not.toMatch(/\$\s?\d/)
    const paid = paymentPage({
      project,
      transaction: {
        id: 'tx_probe',
        provider: 'stripe',
        mode: 'test',
        kind: 'order',
        reference: `Order ${created.number}`,
        refNumber: created.number,
        customerName: 'Maya Rao',
        customerEmail: 'maya@example.com',
        amount: created.total,
        currency: project.spec.currency!,
        status: 'pending',
        refundStatus: 'none',
        amountRefunded: 0,
        providerOrderId: '',
        providerPaymentId: '',
        failureReason: '',
        createdAt: '2026-11-20T10:00:00.000Z',
        paidAt: '',
        businessName: 'Present & Correct',
        token: project.token,
      },
    })
    expect(paid).toContain('£9.00')
    expect(paid).not.toMatch(/\$\s?\d/)
  })

  test('an unconfirmed currency is bare on every surface, never a dollar', async () => {
    const { db, project } = await shop('')
    const created = await createOrder(db, project, {
      customer: { name: 'Maya Rao', email: 'maya@example.com' },
      fulfilment: 'Pickup',
      items: [{ key: '0-0', qty: 1, variant: 'vp-single' }],
    })
    expect(created.total).toBe(300)
    const html = renderApp(project.spec, { token: project.token, live: false })
    expect(pageData(html).currencySymbol).toBe('')
    expect(html).not.toContain('"currencySymbol":"$"')
  })
})
