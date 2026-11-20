import { describe, expect, test } from 'bun:test'
import { buildDiscovery, discoverPlan } from '../src/worker/discovery'
import { extractSite } from '../src/worker/importer'
import { renderApp } from '../src/worker/app'
import app from '../src/worker/index'

/**
 * Website fixtures for the URL-first journey.
 *
 * These are captured page shapes, not live crawls: each one carries the
 * structured data the real site publishes (JSON-LD Product/Menu/LocalBusiness,
 * og tags, priced cards). The live crawl runs only with the owner's approval —
 * it spends the importer budget — so the deterministic half of the journey is
 * proven here, on pages that cannot change under the test.
 */

const BUTTERTALES = `<!doctype html><html><head>
<title>ButterTales — Children's bookshop</title>
<meta property="og:site_name" content="ButterTales">
<meta property="og:description" content="Picture books chosen by booksellers">
<meta name="theme-color" content="#c2410c">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"BookStore","name":"ButterTales","telephone":"+44 20 7946 0102","address":{"@type":"PostalAddress","streetAddress":"14 Bell Lane","addressLocality":"London"},"openingHours":"Mo-Sa 09:00-18:00"}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"The Whale and the Window","description":"A picture book about a girl who keeps the sea in a jar.","image":"https://buttertales.example/img/whale.jpg","offers":{"@type":"Offer","price":"12.00","priceCurrency":"GBP"}}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Mossy Boots","description":"A woodland counting book for three to five year olds.","image":"https://buttertales.example/img/mossy.jpg","offers":{"@type":"Offer","price":"9.50","priceCurrency":"GBP"}}</script>
</head><body><header><h1>ButterTales</h1></header>
<main><h2>Picture books</h2>
<article><h3>The Whale and the Window</h3><p>£12.00</p></article>
<article><h3>Mossy Boots</h3><p>£9.50</p></article></main>
<p>14 Bell Lane, London · Mo-Sa 09:00-18:00 · +44 20 7946 0102</p>
</body></html>`

const DISHOOM = `<!doctype html><html><head>
<title>Dishoom — Bombay cafe</title>
<meta property="og:site_name" content="Dishoom">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Restaurant","name":"Dishoom","servesCuisine":"Indian","telephone":"+44 20 7420 9322","address":{"@type":"PostalAddress","streetAddress":"12 Upper St Martin's Lane","addressLocality":"London"},"openingHours":"Mo-Th 08:00-23:00"}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"MenuItem","name":"Bacon naan roll","description":"Naan, smoked bacon, cream cheese, chilli.","offers":{"@type":"Offer","price":"9.90","priceCurrency":"GBP"}}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"MenuItem","name":"House black daal","description":"Cooked overnight, finished with butter.","offers":{"@type":"Offer","price":"8.50","priceCurrency":"GBP"}}</script>
</head><body><h1>Dishoom</h1><nav><a href="/menu">Menu</a><a href="/book">Book a table</a></nav>
<main><h2>Breakfast</h2>
<div><h3>Bacon naan roll</h3><p>Naan, smoked bacon, cream cheese, chilli.</p><span>£9.90</span></div>
<div><h3>House black daal</h3><p>Cooked overnight, finished with butter.</p><span>£8.50</span></div></main>
<footer>12 Upper St Martin's Lane, London · Open Mo-Th 08:00-23:00</footer></body></html>`

const PLUMBER = `<!doctype html><html><head>
<title>Hale & Sons — Emergency plumbers</title>
<meta property="og:site_name" content="Hale and Sons">
<meta name="theme-color" content="#1d4ed8">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Plumber","name":"Hale & Sons","telephone":"+44 161 496 0021","areaServed":"Manchester","openingHours":"Mo-Su 00:00-24:00"}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Emergency callout","description":"Burst pipes, leaks and overflows.","offers":{"@type":"Offer","price":"89.00","priceCurrency":"GBP"}}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Boiler service","description":"Annual service and safety check.","offers":{"@type":"Offer","price":"75.00","priceCurrency":"GBP"}}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Bathroom fit","description":"Full strip-out and refit.","offers":{"@type":"Offer","price":"2400.00","priceCurrency":"GBP"}}</script>
</head><body><h1>Hale &amp; Sons</h1><p>Emergency plumbing across Manchester, day or night.</p>
<main><h2>What we do</h2>
<ul>
<li><h3>Emergency callout</h3><p>Burst pipes, leaks and overflows.</p><span>from £89</span></li>
<li><h3>Boiler service</h3><p>Annual service and safety check.</p><span>£75</span></li>
<li><h3>Bathroom fit</h3><p>Full strip-out and refit.</p><span>from £2,400</span></li>
</ul></main>
<p>Call +44 161 496 0021 · Manchester</p></body></html>`

const CANDLE_STORE = `<!doctype html><html><head>
<title>Wick & Clay — Hand-poured candles</title>
<meta property="og:site_name" content="Wick & Clay">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Store","name":"Wick & Clay","currenciesAccepted":"USD","telephone":"+1 503 555 0148","address":{"@type":"PostalAddress","streetAddress":"88 Alder St","addressLocality":"Portland"}}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Cedar + Smoke","image":"https://wick.example/img/cedar.jpg","offers":{"@type":"Offer","price":"28.00","priceCurrency":"USD","availability":"https://schema.org/InStock"}}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Fig Leaf","image":"https://wick.example/img/fig.jpg","offers":{"@type":"Offer","price":"32.00","priceCurrency":"USD"}}</script>
</head><body><h1>Wick &amp; Clay</h1>
<main><h2>Candles</h2>
<article><h3>Cedar + Smoke</h3><p>$28.00</p></article>
<article><h3>Fig Leaf</h3><p>$32.00</p></article>
</main><p>88 Alder St, Portland · +1 503 555 0148</p></body></html>`

const COMPLEX = `<!doctype html><html><head>
<title>Ridgeway Garden Centre — Plants, café and landscaping</title>
<meta property="og:site_name" content="Ridgeway Garden Centre">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"GardenStore","name":"Ridgeway Garden Centre","telephone":"+44 118 496 0044","openingHours":"Mo-Su 09:00-17:30"}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Monstera","offers":{"@type":"Offer","price":"24.00","priceCurrency":"GBP"}}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Snake plant","offers":{"@type":"Offer","price":"18.00","priceCurrency":"GBP"}}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Garden design visit","offers":{"@type":"Offer","price":"120.00","priceCurrency":"GBP"}}</script>
</head><body><h1>Ridgeway</h1>
<nav><a href="/plants">Plants</a><a href="/cafe">Café</a><a href="/landscaping">Landscaping</a><a href="/visit">Visit</a></nav>
<main>
<h2>Indoor plants</h2>
<div><h3>Monstera</h3><p>£24.00</p></div>
<div><h3>Snake plant</h3><p>£18.00</p></div>
<h2>Café</h2>
<div><h3>Pot of tea</h3><p>£3.20</p></div>
<h2>Landscaping</h2>
<div><h3>Garden design visit</h3><p>£120.00</p></div>
</main><p>Open 09:00-17:30 · +44 118 496 0044</p></body></html>`

const CASES = [
  { id: 'buttertales', html: BUTTERTALES, url: 'https://buttertales.example/', vertical: 'shop', currency: 'GBP', item: 'The Whale and the Window', price: 1200 },
  { id: 'dishoom', html: DISHOOM, url: 'https://dishoom.example/', vertical: 'restaurant', currency: 'GBP', item: 'Bacon naan roll', price: 990 },
  { id: 'plumber', html: PLUMBER, url: 'https://hale.example/', vertical: 'trades', currency: 'GBP', item: 'Emergency callout', price: 8900 },
  { id: 'store', html: CANDLE_STORE, url: 'https://wick.example/', vertical: 'shop', currency: 'USD', item: 'Cedar + Smoke', price: 2800 },
  { id: 'complex', html: COMPLEX, url: 'https://ridgeway.example/', vertical: 'cafe', currency: 'GBP', item: 'Monstera', price: 2400 },
] as const

function conceptDirection(html: string, index: number, plan: { concepts: { doc: { design?: { direction?: string } } }[] }): string {
  const direction = plan.concepts[index]?.doc.design?.direction ?? ''
  return html.includes(`data-direction="${direction}"`) || html.includes(direction) ? direction : ''
}

function discover(entry: (typeof CASES)[number]) {
  const site = extractSite(entry.html, new URL(entry.url))
  const discovery = buildDiscovery({ site, source: entry.url, html: entry.html })
  return { site, discovery, plan: discoverPlan(discovery, site) }
}

describe('URL-first discovery', () => {
  for (const entry of CASES) {
    test(`${entry.id}: identifies the business, its trade and its prices`, () => {
      const { discovery } = discover(entry)
      expect(discovery.business.name.value.length).toBeGreaterThan(1)
      expect(discovery.host).toBe(new URL(entry.url).host)
      // A trade is always chosen, and always with the evidence that chose it.
      expect(discovery.business.trade.value).toBe(entry.vertical as never)
      expect(discovery.tradeCandidates[0].evidence.length).toBeGreaterThan(0)
      if (entry.id === 'complex') {
        // Two businesses in one site is a question, not a silent pick.
        expect(discovery.tradeCandidates.length).toBeGreaterThan(1)
        expect(discovery.questions.some((question) => question.field === 'trade')).toBe(true)
      }

      const items = discovery.commerce.sections.flatMap((section) => section.items)
      const found = items.find((item) => item.name.toLowerCase().includes(entry.item.toLowerCase().split(' ')[0].toLowerCase()))
      expect(found, `${entry.id} catalogue`).toBeTruthy()
      expect(found!.price).toBe(entry.price)
      expect(discovery.commerce.currency.value).toBe(entry.currency)
      expect(discovery.commerce.priced).toBeGreaterThan(0)
    })

    test(`${entry.id}: every extracted fact carries a source and a confidence`, () => {
      const { discovery } = discover(entry)
      for (const field of Object.values(discovery.business)) {
        // An absent value has no source, and says so rather than borrowing one.
        if (field.value === '' || field.value === null) continue
        expect(field.source).toBeTruthy()
        expect(['structured-data', 'metadata', 'visible-text', 'inferred']).toContain(field.method)
        expect(['verified', 'likely', 'guess']).toContain(field.confidence)
      }
    })

    test(`${entry.id}: three concepts are three real documents, not three colours`, () => {
      const { plan, discovery } = discover(entry)
      expect(plan.concepts.length).toBe(3)
      expect(new Set(plan.concepts.map((concept) => concept.id)).size).toBe(3)
      expect(new Set(plan.concepts.map((concept) => concept.doc.design?.direction)).size).toBe(3)

      const rendered = plan.concepts.map((concept) =>
        renderApp(concept.spec, { token: `discovery-${entry.id}-${concept.id}`, live: false, flagship: true, doc: concept.doc }),
      )
      expect(new Set(rendered).size).toBe(3)
      for (const [index, html] of rendered.entries()) {
        // The customer's own facts, not the demo shop and not the trade sample.
        expect(html).toContain(discovery.business.name.value.split('&')[0].trim())
        if (discovery.commerce.priced > 0) {
          const price = entry.price / 100
          expect(html.replace(/,/g, '')).toContain(String(price))
        }
        // A document is the product of a direction, and says which one.
        expect(conceptDirection(html, index, plan)).toBeTruthy()
      }
    })

    test(`${entry.id}: never asks for a fact it already read`, () => {
      const { plan, discovery } = discover(entry)
      const asked = new Set([...plan.blockers, ...plan.confirmations].map((question) => question.field))
      if (discovery.business.name.value) expect(asked.has('name')).toBe(false)
      if (discovery.commerce.currency.value) expect(asked.has('currency')).toBe(false)
      if (discovery.commerce.products > 0) expect(asked.has('catalogue')).toBe(false)
      // The buyer's own name and email are not the business's, so they are never
      // reported as missing from the site.
      expect(asked.has('email')).toBe(false)
      expect(asked.has('ownerEmail')).toBe(false)
    })
  }

  test('a JavaScript shell is reported, not filled with invented products', () => {
    const shell = `<!doctype html><html><head><title>Loading…</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>`
    const site = extractSite(shell, new URL('https://js.example/'))
    const discovery = buildDiscovery({ site, source: 'https://js.example/', html: shell, clientRendered: true })
    expect(discovery.clientRendered).toBe(true)
    expect(discovery.commerce.products).toBe(0)
    expect(discovery.questions.some((question) => question.field === 'catalogue')).toBe(true)
    // A name was invented by nobody: it is a guess and says so.
    expect(discovery.business.name.confidence).not.toBe('verified')
  })

  test('missing information is asked about once, as a question with a reason', () => {
    const thin = `<!doctype html><html><head><title>A studio</title><meta property="og:site_name" content="Kite Studio"></head><body><h1>Kite Studio</h1><p>We make things.</p></body></html>`
    const site = extractSite(thin, new URL('https://kite.example/'))
    const discovery = buildDiscovery({ site, source: 'https://kite.example/', html: thin })
    const plan = discoverPlan(discovery, site)
    expect(plan.confirmations.some((question) => question.field === 'catalogue')).toBe(true)
    for (const question of [...plan.blockers, ...plan.confirmations]) expect(question.why.length).toBeGreaterThan(10)
    // No blockers means a build can proceed with what was read.
    expect(discovery.business.name.value).toBe('Kite Studio')
  })

  test('two readings of the name are surfaced as a conflict', () => {
    const conflict = `<!doctype html><html><head><title>X</title><meta property="og:site_name" content="North Star Bakery">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Bakery","name":"Northstar Bakehouse"}</script>
</head><body><h1>North Star Bakes</h1><p>Bread.</p></body></html>`
    const site = extractSite(conflict, new URL('https://northstar.example/'))
    const discovery = buildDiscovery({ site, source: 'https://northstar.example/', html: conflict })
    expect(discovery.conflicts.some((entry) => entry.field === 'name')).toBe(true)
  })
})

describe('the discover route is guarded before it spends a crawl', () => {
  test('a foreign origin is refused', async () => {
    const response = await app.request(
      'https://plattr.example/api/discover',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://elsewhere.example' },
        body: JSON.stringify({ url: 'https://buttertales.example' }),
      },
      {},
    )
    expect(response.status).toBe(403)
  })

  test('a non-JSON body is refused', async () => {
    const response = await app.request(
      'https://plattr.example/api/discover',
      { method: 'POST', headers: { 'content-type': 'text/plain', origin: 'https://plattr.example' }, body: 'url=x' },
      {},
    )
    expect(response.status).toBe(415)
  })

  test('a junk URL is refused before the importer budget is touched', async () => {
    const response = await app.request(
      'https://plattr.example/api/discover',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://plattr.example' },
        body: JSON.stringify({ url: 'http://127.0.0.1:8080' }),
      },
      {},
    )
    expect([400, 422]).toContain(response.status)
    const payload = (await response.json()) as { error?: { code?: string } }
    expect(payload.error?.code).toBeTruthy()
  })
})
