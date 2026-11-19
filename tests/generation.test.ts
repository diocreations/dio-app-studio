import { describe, expect, test } from 'bun:test'
import app from '../src/worker/index'
import { importWebsite } from '../src/worker/importer'
import { buildSpec } from '../src/worker/pricing'
import { readPrompt } from '../src/worker/prompt'
import { renderApp } from '../src/worker/app'
import { briefPage } from '../src/worker/views/brief'
import { marketingPage } from '../src/worker/views/marketing'

/** A home page with no <a href> at all: the case a sitemap exists for. */
const SHELL_HOME = `<!doctype html><html><head><title>Butter &amp; Tales</title>
<meta property="og:site_name" content="Butter &amp; Tales" />
<meta name="description" content="Screen-free learning products and alphabet books for children." />
<meta property="og:description" content="Warm, imaginative, screen-free learning products for children." />
<meta name="theme-color" content="#5f8a6a" /></head>
<body><div id="root"></div><p>Explore our Malayalam alphabet book and learning games.</p></body></html>`

const productPage = (name: string, price: string, crumb: string) => `<!doctype html><html><head>
<title>${name} — Butter &amp; Tales</title>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"${name}",
 "description":"A set of ten books that makes alphabet learning easy.",
 "offers":{"@type":"Offer","price":"${price}","priceCurrency":"INR"}}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
 {"@type":"ListItem","position":1,"name":"Home","item":"https://butter.example/"},
 {"@type":"ListItem","position":2,"name":"${crumb}"},
 {"@type":"ListItem","position":3,"name":"${name}"}]}
</script></head><body><h1>${name}</h1><button>Add to cart</button></body></html>`

const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://butter.example/</loc></url>
  <url><loc>https://butter.example/shop/alphabet-book</loc></url>
  <url><loc>https://butter.example/shop/brain-game</loc></url>
  <url><loc>https://butter.example/policies/returns</loc></url>
</urlset>`

function mockSite(pages: Record<string, string>, options: { robots?: string } = {}) {
  const seen: string[] = []
  const fetchImpl = (async (input: string) => {
    const url = new URL(String(input))
    seen.push(url.pathname)
    if (url.pathname === '/robots.txt')
      return new Response(options.robots ?? 'User-agent: *\nAllow: /\n', {
        headers: { 'content-type': 'text/plain' },
      })
    if (url.pathname === '/sitemap.xml')
      return new Response(SITEMAP, { headers: { 'content-type': 'application/xml' } })
    const html = pages[url.pathname]
    return html
      ? new Response(html, { headers: { 'content-type': 'text/html' } })
      : new Response('gone', { status: 404, headers: { 'content-type': 'text/html' } })
  }) as unknown as typeof fetch
  return { fetchImpl, seen }
}

describe('a sitemap reaches the products the home page never links to', () => {
  const pages = {
    '/': SHELL_HOME,
    '/shop/alphabet-book': productPage('Alphabet Book', '999.00', 'Learning'),
    '/shop/brain-game': productPage('Brain Game', '499.00', 'Learning'),
    '/policies/returns': SHELL_HOME,
  }

  test('reads each product page and keeps the real name and price', async () => {
    const { fetchImpl } = mockSite(pages)
    const report = await importWebsite('https://butter.example/', fetchImpl)
    const items = report.site.menu.flatMap((section) => section.items)

    expect(report.usedSitemap).toBe(true)
    expect(items.map((item) => item.name).sort()).toEqual(['Alphabet Book', 'Brain Game'])
    expect(items.find((item) => item.name === 'Alphabet Book')?.price).toBe(99900)
    expect(report.site.currency).toBe('INR')
    expect(report.site.vertical).toBe('shop')
    expect(report.pagesRead).toContain('/shop/alphabet-book')
    expect(report.found.join(' ')).toContain('sitemap')
  })

  test('names the section after the shop, not after the old guessed trade', async () => {
    const { fetchImpl } = mockSite(pages)
    const report = await importWebsite('https://butter.example/', fetchImpl)
    // The owner's category comes from the page copy; the section comes from
    // their breadcrumb. Neither may be the guessed trade's word ("Services").
    expect(report.site.category).toBe("Children's learning")
    expect(['Learning', report.site.category]).toContain(report.site.menu[0]?.name)
    expect(report.site.menu[0]?.name).not.toBe('Services')
    expect(report.site.features).toContain('ordering')
  })

  test('never reads a sitemap page robots.txt excludes', async () => {
    const { fetchImpl, seen } = mockSite(pages, {
      robots: 'User-agent: *\nDisallow: /shop/\n',
    })
    const report = await importWebsite('https://butter.example/', fetchImpl)
    expect(seen).not.toContain('/shop/alphabet-book')
    expect(report.site.menu).toEqual([])
    expect(report.missing.join(' ')).toContain('catalogue')
  })
})

describe('a café brief becomes a café app', () => {
  const prompt =
    'I need a mobile app for my café with a digital menu, online ordering, table reservations, loyalty rewards and contact information.'

  test('detects the trade and every workflow the owner asked for', () => {
    const read = readPrompt(prompt)
    expect(read.vertical).toBe('cafe')
    expect(read.features).toEqual(
      expect.arrayContaining(['catalog', 'ordering', 'booking', 'loyalty']),
    )
  })

  test('the rendered app carries the café menu, ordering, booking, loyalty and contact', () => {
    const read = readPrompt(prompt)
    const spec = buildSpec({
      name: 'Good Day Cafe',
      vertical: read.vertical,
      accent: '#5a3b28',
      logo: 'GD',
      features: read.features,
      tagline: 'Slow coffee, warm bread, all day.',
      category: 'Café',
    })
    const html = renderApp(spec, { token: 'test-cafe', live: false }).toLowerCase()

    expect(html).toContain('good day cafe')
    expect(html).toContain('slow coffee, warm bread')
    expect(html).toMatch(/flat white|espresso|croissant/)
    expect(html).toContain('reserve')
    expect(html).toMatch(/cart|bag/)
    expect(html).toMatch(/loyalty|rewards|stamps/)
    expect(html).toMatch(/hours|visit|phone/)
  })
})

describe('design previews show the owner’s own business', () => {
  const url = (params: Record<string, string>) =>
    `https://plattr.example/demo/app?biz=shop&${new URLSearchParams(params).toString()}`

  test('the name, category, colour and first catalogue row are the owner’s', async () => {
    const response = await app.request(
      url({
        name: 'Butter Tales',
        cat: 'Children’s learning',
        accent: '#5f8a6a',
        logo: 'BT',
        items: 'Alphabet Book~999;Brain Game~499',
        feat: 'catalog,ordering',
      }),
    )
    expect(response.status).toBe(200)
    const html = (await response.text()).toLowerCase()
    expect(html).toContain('butter tales')
    expect(html).toContain('children’s learning')
    expect(html).toContain('alphabet book')
    expect(html).toContain('#5f8a6a')
  })

  test('the three concepts differ structurally, not only in colour', async () => {
    const designs = [
      'variant=0&density=cozy&corners=sharp&hero=image&order=catalog&heroScale=immersive&buttons=square&cards=square',
      'variant=1&density=roomy&corners=round&hero=centered&order=visit&heroScale=tall&buttons=round&cards=round',
      'variant=2&density=standard&corners=soft&hero=split&order=offers&heroScale=compact&buttons=soft&cards=soft',
    ]
    const html = await Promise.all(
      designs.map(async (query) =>
        (await (await app.request(`https://plattr.example/demo/app?biz=shop&${query}`)).text()),
      ),
    )
    expect(new Set(html.map((page) => page.length)).size).toBeGreaterThan(1)
    expect(html[0]).not.toBe(html[1])
    expect(html[1]).not.toBe(html[2])
    // A layout axis is visible in the markup, not just in a style variable.
    expect(html[0]).toMatch(/is-(image|split|centered)/)
    expect(html[1]).toMatch(/is-(image|split|centered)/)
  })
})

describe('the brief is honest about what was read', () => {
  test('the receipt has sections for catalogue, pages and missing details', () => {
    const html = briefPage()
    expect(html).toContain('Pages inspected')
    expect(html).toContain('No catalogue found')
    expect(html).toContain('Not found — please confirm')
    expect(html).toContain('identityPreview')
  })
})

describe('the landing page example and its preview agree', () => {
  test('the typed example and the first preview are the same trade', () => {
    const html = marketingPage()
    expect(html).toContain('I need an app for my coffee shop')
    expect(html).toContain('/demo/app?biz=cafe')
    expect(html).toContain('data-demo="cafe" aria-pressed="true"')
  })
})
