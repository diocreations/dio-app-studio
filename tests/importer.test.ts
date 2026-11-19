import { describe, expect, test } from 'bun:test'
import {
  assertPublicHost,
  cardProducts,
  cleanName,
  detectVertical,
  extractSite,
  hasProductMarkup,
  ImportError,
  importWebsite,
  linkedProducts,
  looksClientRendered,
  normaliseUrl,
  parseRobots,
  robotsAllows,
  sanitizeImported,
  toCents,
  MAX_PAGES,
} from '../src/worker/importer'
import { renderApp } from '../src/worker/app'
import { buildSpec } from '../src/worker/pricing'
import { SAMPLE_IMPORT, sampleSpec, sampleTotals } from '../src/worker/proof'
import { briefPage } from '../src/worker/views/brief'
import { marketingPage } from '../src/worker/views/marketing'

const SHOP = `<!doctype html>
<html><head>
<title>Loom &amp; Larder — Home</title>
<meta property="og:site_name" content="Loom &amp; Larder" />
<meta name="description" content="Hand-thrown stoneware and linen for the table, made in small batches in Bristol." />
<meta name="theme-color" content="#a8542b" />
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"ItemList","name":"Ceramics","itemListElement":[
 {"@type":"ListItem","position":1,"item":{"@type":"Product","name":"Speckled mug","description":"300ml stoneware","offers":{"@type":"Offer","price":"28.00","priceCurrency":"USD"}}},
 {"@type":"ListItem","position":2,"item":{"@type":"Product","name":"Serving bowl","description":"28cm","offers":{"@type":"Offer","price":"46.00","priceCurrency":"USD"}}},
 {"@type":"ListItem","position":3,"item":{"@type":"Product","name":"Bud vase","offers":{"@type":"Offer","price":"32.00","priceCurrency":"USD"}}},
 {"@type":"ListItem","position":4,"item":{"@type":"Product","name":"Linen throw","offers":{"@type":"Offer","price":"120.00","priceCurrency":"USD"}}}
]}
</script>
</head><body>
<h1>Loom &amp; Larder</h1><p>Add to cart · Free shipping over $75</p>
<a href="tel:+1 555 0163">Call the shop</a>
<a href="mailto:hello@loomlarder.com?subject=Hi">Email</a>
<a href="https://www.instagram.com/loomlarder/">Instagram</a>
<a href="https://www.facebook.com/sharer/sharer.php?u=loomlarder.com">Share</a>
<address>3 Lantern Court, Bristol</address>
</body></html>`

const SALON = `<!doctype html>
<html><head>
<title>Marlow &amp; Co | Hair Salon in Bath</title>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"HairSalon","name":"Marlow & Co",
 "description":"Colour specialists and precision cutting in the centre of Bath. Book an appointment online.",
 "telephone":"+1 555 0177",
 "address":{"@type":"PostalAddress","streetAddress":"22 Orchard Row","addressLocality":"Bath","postalCode":"BA1 2QJ"},
 "openingHoursSpecification":[
   {"@type":"OpeningHoursSpecification","dayOfWeek":["Tuesday","Wednesday","Thursday","Friday"],"opens":"09:00","closes":"19:00"},
   {"@type":"OpeningHoursSpecification","dayOfWeek":"Saturday","opens":"09:00","closes":"17:00"}],
 "sameAs":["https://instagram.com/marlowco","https://www.tiktok.com/@marlowco"]}
</script></head>
<body><h1>Marlow &amp; Co</h1><p>Hair, colour, balayage and blow dry. Book an appointment.</p></body></html>`

const RESTAURANT = `<!doctype html>
<html><head><title>Osteria Vela</title>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Restaurant","name":"Osteria Vela",
 "servesCuisine":"Italian","telephone":"+1 555 0142",
 "hasMenu":{"@type":"Menu","hasMenuSection":[
   {"@type":"MenuSection","name":"Starters","hasMenuItem":[
     {"@type":"MenuItem","name":"Burrata, blood orange","offers":{"price":"12.00","priceCurrency":"GBP"}}]},
   {"@type":"MenuSection","name":"Mains","hasMenuItem":[
     {"@type":"MenuItem","name":"Sea bass","offers":{"price":"24.00"}},
     {"@type":"MenuItem","name":"Lamb ragu","offers":{"price":"21.00"}}]}]}}
</script></head><body><p>Seasonal plates, cooked to order. Book a table.</p></body></html>`

const PLAIN = `<!doctype html><html><head><title>Bob's Plumbing</title></head>
<body><p>We fix boilers and leaks across the city. Call for a quote.</p></body></html>`

const PLAIN_URL = new URL('https://bobsplumbing.example-shop.com/')

describe('a shop URL becomes a shop app', () => {
  const site = extractSite(SHOP, new URL('https://loomlarder.com/'))

  test('reads the name, promise and brand colour', () => {
    expect(site.name).toBe('Loom & Larder')
    expect(site.tagline.length).toBeGreaterThan(10)
    expect(site.accent).toBe('#a8542b')
  })

  test('recognises the trade and turns products into a catalogue', () => {
    expect(site.vertical).toBe('shop')
    expect(site.verticalConfidence).toBe('detected')
    const items = site.menu.flatMap((section) => section.items)
    expect(site.menu.length).toBe(1)
    expect(items.map((item) => item.name)).toContain('Speckled mug')
    expect(items.find((item) => item.name === 'Speckled mug')?.price).toBe(2800)
    expect(items.length).toBe(4)
  })

  test('turns a shop into a cart build', () => {
    expect(site.features).toContain('catalog')
    expect(site.features).toContain('ordering')
  })

  test('collects contact details and only real social profiles', () => {
    expect(site.phone.replace(/\s/g, '')).toBe('+15550163')
    expect(site.email).toBe('hello@loomlarder.com')
    expect(site.socials.map((social) => social.label)).toEqual(['Instagram'])
    expect(site.menu[0].items.length).toBeGreaterThan(0)
  })
})

describe('a salon URL becomes an appointment app', () => {
  const site = extractSite(SALON, new URL('https://marlowandco.com/'))

  test('detects the trade from the copy, not the URL', () => {
    expect(site.vertical).toBe('salon')
  })

  test('reads opening hours and the address from structured data', () => {
    expect(site.hours).toBe('Tue–Fri 09:00–19:00 · Sat 09:00–17:00')
    expect(site.address).toBe('22 Orchard Row, Bath, BA1 2QJ')
    expect(site.phone).toBe('+1 555 0177')
  })

  test('offers booking because the site does', () => {
    expect(site.features).toContain('booking')
  })

  test('keeps both social profiles', () => {
    expect(site.socials.map((social) => social.label).sort()).toEqual(['Instagram', 'TikTok'])
  })
})

describe('a restaurant menu keeps its sections', () => {
  const site = extractSite(RESTAURANT, new URL('https://osteriavela.com/'))

  test('sections and prices survive', () => {
    expect(site.vertical).toBe('restaurant')
    expect(site.menu.map((section) => section.name)).toEqual(['Starters', 'Mains'])
    expect(site.menu[1].items.map((item) => item.price)).toEqual([2400, 2100])
    expect(site.features).toContain('booking')
  })

  test('the currency comes from the menu data', () => {
    expect(site.currency).toBe('GBP')
  })
})

describe('a site with nothing to read still produces a brief', () => {
  test('falls back to the title and the trade default colour', async () => {
    const site = extractSite(PLAIN, PLAIN_URL)
    expect(site.name).toBe("Bob's Plumbing")
    expect(site.vertical).toBe('trades')
    expect(site.menu).toEqual([])
    expect(site.accent).toBe('')
  })

  test('says what is missing instead of inventing it', async () => {
    const fetchImpl = (async () =>
      new Response(PLAIN, { headers: { 'content-type': 'text/html' } })) as unknown as typeof fetch
    const report = await importWebsite('https://bobsplumbing.example-shop.com', fetchImpl)
    expect(report.site.accent).toBe('#a8741a')
    expect(report.missing.join(' ')).toContain('catalogue')
    expect(report.missing.join(' ')).toContain('opening hours')
    expect(report.missing.join(' ')).toContain('trade default')
    expect(report.notes.length).toBeGreaterThan(0)
    expect(report.found.some((line) => line.startsWith('name:'))).toBe(true)
    // A plumber with no catalogue is not a shop hiding one in JavaScript.
    expect(report.notes.join(' ')).not.toContain('client-rendered')
  })
})

describe('a page cut off mid-bundle is not read as page copy', () => {
  const cutOff = `<html><head><title>Butter Tales</title></head><body>
    <p>Warm, screen-free learning products for children.</p>
    <script>var contact={supportEmail:\`hello@buttertales.in (Placeholder)\`,
      phone:\`+91 98765 43210 (Support Desk Placeholder)\`,whatsapp:\`+91 98765 43210\`}`

  test('the unclosed script yields no contact details', () => {
    const site = extractSite(cutOff, new URL('https://buttertales.example.com/'))
    expect(site.phone).toBe('')
    expect(site.email).toBe('')
  })

  test('leftover JavaScript cannot name the trade either', () => {
    const site = extractSite(cutOff, new URL('https://buttertales.example.com/'))
    expect(site.vertical).not.toBe('property')
    expect(site.category).not.toBe('Property & estate agency')
  })

  test('a guess does not assert a category', () => {
    const site = extractSite(
      '<html><head><title>Butter Tales</title></head><body><p>Warm, imaginative learning products.</p></body></html>',
      new URL('https://buttertales.example.com/'),
    )
    expect(site.verticalConfidence).toBe('guessed')
    expect(site.category).toBe('')
    expect(site.categoryBasis).toContain('nothing on the page named')
  })

  test('one generic word in the copy cannot settle the trade', () => {
    const html = `<html><head><title>Butter Tales</title>
      <meta name="description" content="Warm, screen-free learning products for children.">
      </head><body><p>Intellectual property notice: our property is protected.</p></body></html>`
    const site = extractSite(html, new URL('https://buttertales.example.com/'))
    expect(site.vertical).not.toBe('property')
  })

  test('contact details published as placeholders are dropped', () => {
    const html = `<html><head><title>Paper Lane</title></head><body>
      <p>Call +44 20 7946 0958 (Placeholder)</p>
      <p>Email hello@example.com</p></body></html>`
    const site = extractSite(html, new URL('https://paperlane.example.com/'))
    expect(site.phone).toBe('')
    expect(site.email).toBe('')
  })

  test('a real tel: or mailto: link is still read', () => {
    const html = `<html><head><title>Paper Lane</title></head><body>
      <a href="tel:+442079460958">Call the shop</a>
      <a href="mailto:shop@paperlane.co.uk?subject=Hi">Email us</a></body></html>`
    const site = extractSite(html, new URL('https://paperlane.example.com/'))
    expect(site.phone).toBe('+442079460958')
    expect(site.email).toBe('shop@paperlane.co.uk')
  })
})

describe('the site names its own category', () => {
  test('a schema BookStore is a bookshop, and says why', () => {
    const html = `<html><head><title>Ink & Paper</title>
      <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"BookStore","name":"Ink & Paper","telephone":"+1 555 0101"}
      </script></head><body><p>Add to cart</p></body></html>`
    const site = extractSite(html, new URL('https://inkpaper.example.com/'))
    expect(site.vertical).toBe('shop')
    expect(site.category).toBe('Bookshop')
    expect(site.categoryBasis).toContain('BookStore')
  })

  test('page words name a shop the schema does not', () => {
    const html = `<html><head><title>Fern's Flowers</title></head><body>
      <p>Seasonal bouquets and wedding flowers, delivered same day. Add to cart.</p></body></html>`
    const site = extractSite(html, new URL('https://fernsflowers.example.com/'))
    expect(site.category).toBe('Florist')
    expect(site.categoryBasis).toBe('the words on the page')
  })

  test('a non-shop keeps its trade name rather than a retail noun', () => {
    const html = `<html><head><title>Vela</title><script type="application/ld+json">
      {"@type":"Restaurant","name":"Vela","servesCuisine":"Italian"}
      </script></head><body><p>Book a table. We sell gift cards and coffee.</p></body></html>`
    const site = extractSite(html, new URL('https://vela.example.com/'))
    expect(site.vertical).toBe('restaurant')
    expect(site.category).toBe('Restaurant')
  })

  test('detection shows the words that decided it', () => {
    const guess = detectVertical({
      strong: 'Ironworks gym',
      body: 'Strength and conditioning, personal training, timetable.',
      products: 0,
    })
    expect(guess.id).toBe('gym')
    expect(guess.evidence).toContain('gym')
  })
})

describe('the trade label in the app is the category, not the shape', () => {
  test('a free-text category reaches the rendered app', () => {
    const html = renderApp(
      buildSpec({
        name: 'Ink & Paper',
        vertical: 'shop',
        accent: '#8a5a2b',
        logo: 'IP',
        features: ['catalog'],
        category: 'Bookshop and reading room',
      }),
      { token: 't', live: false },
    )
    expect(html).toContain('Bookshop and reading room')
    expect(html).toContain('data-splash')
  })

  test('with no category the trade name is used', () => {
    const html = renderApp(
      buildSpec({ name: 'Vela', vertical: 'restaurant', accent: '', logo: '', features: [] }),
      { token: 't', live: false },
    )
    expect(html).toContain('Restaurant')
  })
})

describe('the read is always the live page', () => {
  test('asks every hop for a fresh copy', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const fetchImpl = (async (input: string, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} })
      return new Response(PLAIN, { headers: { 'content-type': 'text/html' } })
    }) as unknown as typeof fetch

    await importWebsite('https://bobsplumbing.example-shop.com', fetchImpl)

    // The robots.txt check is not the page read; the page read must be fresh.
    const pageCall = calls.find((call) => !call.url.endsWith('/robots.txt'))
    expect(pageCall).toBeDefined()
    expect(pageCall?.init.cache).toBe('no-store')
    const headers = pageCall?.init.headers as Record<string, string>
    expect(headers['cache-control']).toContain('no-cache')
    expect(headers.pragma).toBe('no-cache')
  })
})

describe('a page background is not a brand colour', () => {
  test('a white theme-color is ignored', () => {
    const html = `<html><head><title>Papier</title><meta name="theme-color" content="#ffffff" /></head><body><p>Stationery shop</p></body></html>`
    expect(extractSite(html, new URL('https://papier.test/')).accent).toBe('')
  })

  test('a saturated theme-color is kept', () => {
    const html = `<html><head><title>Ink</title><meta name="theme-color" content="#0d5c63" /></head><body><p>Shop</p></body></html>`
    expect(extractSite(html, new URL('https://ink.test/')).accent).toBe('#0d5c63')
  })
})

describe('the crawl goes past the page that was pasted', () => {
  const listing = (title: string, entries: [string, string][]) =>
    `<html><head><title>${title} | Clay &amp; Co</title></head><body><h1>${title}</h1>` +
    entries
      .map(
        ([name, price]) =>
          `<article class="product-card"><div class="product-info">` +
          `<a href="/products/${name.toLowerCase().replace(/ /g, '-')}" title="${name}">${name}</a>` +
          `<span class="price">£${price}</span></div></article>`,
      )
      .join('') +
    '</body></html>'

  const home = `<html><head><title>Clay &amp; Co</title><meta name="theme-color" content="#8a5a2b" /></head><body>
    <nav>
      <a href="/collections/mugs">Ceramic mugs</a>
      <a href="/collections/bowls">Bowls</a>
      <a href="/collections/plates">Plates</a>
      <a href="/cart">Cart</a>
      <a href="/about">About us</a>
      <a href="https://other-shop.example.com/collections/mugs">A shop we like</a>
    </nav>
    <p>Hand-thrown stoneware. Free shipping over £75.</p>
  </body></html>`

  const pages: Record<string, string> = {
    '/': home,
    '/collections/mugs': listing('Ceramic mugs', [
      ['Speckled mug', '28.00'],
      ['Tall mug', '32.00'],
      ['Espresso cup', '18.00'],
    ]),
    '/collections/bowls': listing('Bowls', [
      ['Serving bowl', '46.00'],
      ['Cereal bowl', '24.00'],
      ['Pasta bowl', '26.00'],
    ]),
  }

  test('follows the aisle links and merges their catalogues', async () => {
    const seen: string[] = []
    const fetchImpl = (async (input: string) => {
      const path = new URL(input).pathname
      seen.push(path)
      const html = pages[path]
      return html
        ? new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
        : new Response('gone', { status: 404, headers: { 'content-type': 'text/html' } })
    }) as unknown as typeof fetch

    const report = await importWebsite('https://clayandco.example.com/', fetchImpl)
    const names = report.site.menu.flatMap((section) => section.items.map((item) => item.name))

    expect(report.pages).toBe(3)
    expect(report.site.menu.map((section) => section.name)).toEqual(['Ceramic mugs', 'Bowls'])
    expect(names).toContain('Serving bowl')
    expect(names.length).toBe(6)
    expect(report.site.menu[0].items[0].price).toBe(2800)
    expect(report.found.join(' ')).toContain('read from 3 pages')
  })

  test('never wanders off the origin or into the cart', async () => {
    const seen: string[] = []
    const fetchImpl = (async (input: string) => {
      const url = new URL(input)
      seen.push(url.origin + url.pathname)
      const html = url.origin === 'https://clayandco.example.com' ? pages[url.pathname] : undefined
      return html
        ? new Response(html, { headers: { 'content-type': 'text/html' } })
        : new Response('gone', { status: 404, headers: { 'content-type': 'text/html' } })
    }) as unknown as typeof fetch

    await importWebsite('https://clayandco.example.com/', fetchImpl)
    expect(seen.every((entry) => entry.startsWith('https://clayandco.example.com/'))).toBe(true)
    expect(seen).not.toContain('https://clayandco.example.com/cart')
    expect(seen).not.toContain('https://clayandco.example.com/about')
    expect(seen).not.toContain('https://other-shop.example.com/collections/mugs')
  })

  test('stops at the page budget and says so', async () => {
    const many = `<html><head><title>Big shop</title></head><body><nav>` +
      Array.from({ length: 14 }, (_, index) => `<a href="/collections/aisle-${index}">Shop aisle ${index}</a>`).join('') +
      '</nav><p>Shop all products</p></body></html>'
    const aisle = (index: number) =>
      `<html><head><title>Aisle ${index}</title></head><body><h1>Aisle ${index}</h1>` +
      Array.from(
        { length: 4 },
        (_, n) =>
          `<article class="product-card"><div class="product-info"><a href="/products/${index}-${n}" title="Piece ${index}-${n}">Piece ${index}-${n}</a><span>£10.00</span></div></article>`,
      ).join('') +
      `<a href="/collections/aisle-${index + 1}">Next aisle</a></body></html>`

    const seen: string[] = []
    const fetchImpl = (async (input: string) => {
      const path = new URL(input).pathname
      seen.push(path)
      const html = path === '/' ? many : path.startsWith('/collections/aisle-') ? aisle(Number(path.split('-').pop())) : undefined
      return html
        ? new Response(html, { headers: { 'content-type': 'text/html' } })
        : new Response('gone', { status: 404, headers: { 'content-type': 'text/html' } })
    }) as unknown as typeof fetch

    const report = await importWebsite('https://bigshop.example.com/', fetchImpl)
    // robots.txt is a policy check and sitemap.xml is metadata, not pages.
    const pageViews = seen.filter(
      (path) => path !== '/robots.txt' && !path.startsWith('/sitemap'),
    )
    expect(report.pages).toBeLessThanOrEqual(MAX_PAGES)
    expect(pageViews.length).toBeLessThanOrEqual(MAX_PAGES)
    expect(report.notes.join(' ')).toContain(`capped at ${MAX_PAGES} pages`)
  })

  test('a listing page is not a product, even when it calls itself Shop All Products', async () => {
    const home = `<html><head><title>Butter Tales</title></head><body>
      <nav><a href="/shop">Shop All Products</a></nav>
      <p>Screen-free learning.</p></body></html>`
    const products = ['letterloo', 'releaf', 'alphabet-book']
    const sitemap =
      '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      ['/shop', ...products.map((slug) => `/shop/${slug}`)]
        .map((path) => `<url><loc>https://buttertales.example.com${path}</loc></url>`)
        .join('') +
      '</urlset>'
    const productPage = (slug: string) =>
      `<html><head><title>${slug} — Butter Tales</title>` +
      '<meta property="og:price:amount" content="522" /></head><body><h1>' +
      `${slug}</h1></body></html>`
    // A shop's “see everything” page, with a shipping threshold that looks like
    // a price: the sitemap lists it, and it used to become an item of its own.
    const listingPage =
      '<html><head><title>Shop All Products — Butter Tales</title>' +
      '<meta property="og:price:amount" content="2048" /></head>' +
      '<body><p>Free shipping over ₹2048.</p></body></html>'

    const fetchImpl = (async (input: string) => {
      const path = new URL(input).pathname
      if (path === '/robots.txt')
        return new Response('', { status: 404, headers: { 'content-type': 'text/plain' } })
      const slug = products.find((entry) => path === `/shop/${entry}`)
      const html =
        path === '/sitemap.xml'
          ? sitemap
          : path === '/'
            ? home
            : path === '/shop'
              ? listingPage
              : slug
                ? productPage(slug)
                : ''
      return html
        ? new Response(html, { headers: { 'content-type': 'text/html' } })
        : new Response('gone', { status: 404, headers: { 'content-type': 'text/html' } })
    }) as unknown as typeof fetch

    const report = await importWebsite('https://buttertales.example.com/', fetchImpl)
    const names = report.site.menu.flatMap((group) => group.items.map((item) => item.name))

    expect(names).toHaveLength(3)
    expect(names.join(' | ')).not.toMatch(/shop all/i)
  })
})

describe('robots.txt decides what the importer may read', () => {
  const listing = (title: string, entries: string[]) =>
    `<html><head><title>${title}</title></head><body><h1>${title}</h1>` +
    entries
      .map(
        (name) =>
          `<article class="product-card"><div class="product-info">` +
          `<a href="/products/${name.toLowerCase().replace(/ /g, '-')}" title="${name}">${name}</a>` +
          `<span class="price">£20.00</span></div></article>`,
      )
      .join('') +
    '</body></html>'

  test('our own group beats the wildcard group', () => {
    const groups = parseRobots(
      'User-agent: *\nDisallow: /\n\nUser-agent: PlattrImporter\nDisallow: /account\nAllow: /\n',
    )
    expect(robotsAllows(groups, '/collections/mugs')).toBe(true)
    expect(robotsAllows(groups, '/account/profile')).toBe(false)
  })

  test('a wildcard-only file applies to us too', () => {
    expect(robotsAllows(parseRobots('User-agent: *\nDisallow: /\n'), '/')).toBe(false)
    expect(robotsAllows(parseRobots('User-agent: *\nDisallow:\n'), '/shop')).toBe(true)
  })

  test('the longest rule wins, and an allow wins a tie', () => {
    const groups = parseRobots(
      'User-agent: *\nDisallow: /shop\nAllow: /shop/outlet\nDisallow: /cart\nAllow: /cart\n',
    )
    expect(robotsAllows(groups, '/shop/outlet')).toBe(true)
    expect(robotsAllows(groups, '/shop/new')).toBe(false)
    expect(robotsAllows(groups, '/cart')).toBe(true)
  })

  test('wildcards and an end anchor work', () => {
    const groups = parseRobots('User-agent: *\nDisallow: /*.pdf$\nDisallow: /*/private/\n')
    expect(robotsAllows(groups, '/menu.pdf')).toBe(false)
    expect(robotsAllows(groups, '/menu.pdf?print=1')).toBe(true)
    expect(robotsAllows(groups, '/shop/private/list')).toBe(false)
  })

  test('a byte-order mark does not swallow the first group', () => {
    const groups = parseRobots('\uFEFFUser-agent: *\nDisallow: /shop\n')
    expect(robotsAllows(groups, '/shop/new')).toBe(false)
  })

  test('a group that names us with no rules means no restrictions', () => {
    const groups = parseRobots('User-agent: *\nDisallow: /\n\nUser-agent: PlattrImporter\n')
    expect(robotsAllows(groups, '/collections/mugs')).toBe(true)
  })

  test('a versioned agent line still matches us', () => {
    const groups = parseRobots(
      'User-agent: *\nDisallow: /\n\nUser-agent: PlattrImporter/1.0\nDisallow: /cart\n',
    )
    expect(robotsAllows(groups, '/shop')).toBe(true)
    expect(robotsAllows(groups, '/cart')).toBe(false)
  })

  test('a site that excludes us is never fetched, and says why', async () => {
    const seen: string[] = []
    const fetchImpl = (async (input: string) => {
      const path = new URL(input).pathname
      seen.push(path)
      if (path === '/robots.txt')
        return new Response('User-agent: PlattrImporter\nDisallow: /\n', {
          headers: { 'content-type': 'text/plain' },
        })
      return new Response(SHOP, { headers: { 'content-type': 'text/html' } })
    }) as unknown as typeof fetch

    let thrown: unknown = null
    try {
      await importWebsite('https://loomlarder.com/', fetchImpl)
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(ImportError)
    expect((thrown as ImportError).code).toBe('robots_disallowed')
    expect((thrown as ImportError).message).toContain('robots.txt')
    expect((thrown as ImportError).message).toContain('PlattrImporter')
    // The home page itself was never requested.
    expect(seen).toEqual(['/robots.txt'])
  })

  test('excluded pages behind the entry are skipped with a note', async () => {
    const home = `<html><head><title>Clay &amp; Co</title></head><body><nav>
      <a href="/collections/open">Open shelves</a>
      <a href="/collections/closed">Closed shelves</a>
    </nav><p>Hand-thrown stoneware. Shop all.</p></body></html>`
    const pages: Record<string, string> = {
      '/': home,
      '/collections/open': listing('Open shelves', ['Open mug', 'Open bowl', 'Open plate']),
      '/collections/closed': listing('Closed shelves', ['Closed mug', 'Closed bowl', 'Closed plate']),
    }

    const fetchImpl = (async (input: string) => {
      const path = new URL(input).pathname
      if (path === '/robots.txt')
        return new Response('User-agent: *\nDisallow: /collections/closed\n', {
          headers: { 'content-type': 'text/plain' },
        })
      const html = pages[path]
      return html
        ? new Response(html, { headers: { 'content-type': 'text/html' } })
        : new Response('gone', { status: 404, headers: { 'content-type': 'text/html' } })
    }) as unknown as typeof fetch

    const report = await importWebsite('https://clayandco.example.com/', fetchImpl)
    const names = report.site.menu.flatMap((section) => section.items.map((item) => item.name))

    expect(names).toContain('Open mug')
    expect(names).not.toContain('Closed mug')
    expect(report.notes.join(' ')).toContain('robots.txt excludes PlattrImporter from 1 page')
  })
})

describe('products are read from their links when the card class is hashed', () => {
  const linkedPage = (entries: [string, string][]) =>
    '<html><head><title>Logo Hats</title></head><body><div class="_list_1g7b0_10">' +
    entries
      .map(
        ([slug, price]) =>
          `<div role="presentation" class="_card_hvnxy_10">` +
          `<a class="_cardLink_hvnxy_34" href="/collections/logo-hats/products/${slug}">` +
          `<div class="_imageWrapper_hvnxy_96"><div class="_skeleton_hvnxy_112"></div></div></a>` +
          `<span class="_price_hvnxy_50">$${price}</span></div>`,
      )
      .join('') +
    '</div></body></html>'

  test('names come from the slug and prices from beside the link', () => {
    const items = linkedProducts(
      linkedPage([
        ['logo-embossed-hat-bubblegum', '45.00'],
        ['small-carry-bag-oxblood', '120.00'],
        ['logo-hat-black', '40.00'],
      ]),
      new URL('https://www.telfar.net/collections/logo-hats'),
    )
    expect(items.map((item) => item.name)).toEqual([
      'Logo Embossed Hat Bubblegum',
      'Small Carry Bag Oxblood',
      'Logo Hat Black',
    ])
    expect(items[0].price).toBe(4500)
  })

  test('a card with no price cannot inherit the next card’s', () => {
    const card = (slug: string, price: string) =>
      `<div class="_card_hvnxy_10"><a class="_cardLink_hvnxy_34" href="/collections/x/products/${slug}">` +
      `<div class="_skeleton_hvnxy_112"></div></a>${price ? `<span class="_price">${price}</span>` : ''}</div>`
    const html = `<html><body>${card('plain-hat', '')}${card('priced-hat', '$40.00')}</body></html>`

    const items = linkedProducts(html, new URL('https://telfar.example.com/collections/x'))
    expect(items.map((item) => item.name)).toEqual(['Plain Hat', 'Priced Hat'])
    expect(items[0].price).toBe(0)
    expect(items[1].price).toBe(4000)
  })

  test('bare numbers and stock codes are not product names', () => {
    const html = `<html><body>
      <a href="/products/12345">12345</a>
      <a href="/products/sku-90210">SKU 90210</a>
      <a href="/products/logo-hat">Logo hat</a>
    </body></html>`

    const names = linkedProducts(html, new URL('https://shop.example.com/')).map((item) => item.name)
    expect(names).toEqual(['Logo hat'])
  })

  test('a card buried under hundreds of characters of skeleton still counts', () => {
    const heavy =
      '<html><body>' +
      Array.from(
        { length: 3 },
        (_, index) =>
          `<div class="_card_hvnxy_10"><a class="_cardLink_hvnxy_34" href="/collections/logo-hats/products/hat-${index}">` +
          `<div class="_skeleton_hvnxy_112">${'<div class="_spinner_157hd_1"></div>'.repeat(20)}</div></a>` +
          `<span class="_price_hvnxy_50">$40.00</span></div>`,
      ).join('') +
      '</body></html>'

    const items = linkedProducts(heavy, new URL('https://www.telfar.net/collections/logo-hats'))
    expect(items.map((item) => item.name)).toEqual(['Hat 0', 'Hat 1', 'Hat 2'])
    expect(items[0].price).toBe(4000)
  })

  test('a collection page of hashed cards becomes a catalogue', async () => {
    const home = `<html><head><title>Telfar</title></head><body>
      <nav><a href="/collections/logo-hats">Logo hats</a></nav>
      <p>Bags and hats, made in New York.</p></body></html>`
    const collection = linkedPage([
      ['logo-embossed-hat-bubblegum', '45.00'],
      ['logo-hat-black', '40.00'],
      ['logo-hat-cream', '40.00'],
    ])

    const fetchImpl = (async (input: string) => {
      const path = new URL(input).pathname
      if (path === '/robots.txt')
        return new Response('', { status: 404, headers: { 'content-type': 'text/plain' } })
      return new Response(path === '/' ? home : collection, {
        headers: { 'content-type': 'text/html' },
      })
    }) as unknown as typeof fetch

    const report = await importWebsite('https://telfar.example.com/', fetchImpl)
    const names = report.site.menu.flatMap((section) => section.items.map((item) => item.name))

    expect(names).toContain('Logo Embossed Hat Bubblegum')
    expect(names).toHaveLength(3)
    expect(report.notes.join(' ')).not.toContain('client-rendered')
  })

  test('one or two links are not a catalogue', async () => {
    const home = `<html><head><title>Paper Lane</title></head><body>
      <a href="/products/pocket-notebook" title="Pocket notebook">Pocket notebook</a>
      <p>Notebooks printed in Leeds.</p></body></html>`
    const fetchImpl = (async (input: string) => {
      if (new URL(input).pathname.startsWith('/products/'))
        return new Response('gone', { status: 404, headers: { 'content-type': 'text/html' } })
      return new Response(home, { headers: { 'content-type': 'text/html' } })
    }) as unknown as typeof fetch
    const report = await importWebsite('https://paperlane.example.com/', fetchImpl)

    expect(report.site.menu).toEqual([])
    expect(report.missing.join(' ')).toContain('catalogue')
  })
})

describe('a thin catalogue says when it was drawn in the browser', () => {
  test('a framework shell is recognised, a server-rendered page is not', () => {
    expect(looksClientRendered('<html><body><div id="root"></div></body></html>')).toBe(true)
    expect(looksClientRendered('<html><body><div id="__next"></div></body></html>')).toBe(true)
    expect(
      looksClientRendered(
        '<html><body><script id="__NEXT_DATA__" type="application/json">{}</script></body></html>',
      ),
    ).toBe(true)

    const serverRendered =
      '<html><body><h1>Loom &amp; Larder</h1>' +
      '<article class="product-card"><a title="Mug">Mug</a><span class="price">£28.00</span></article>' +
      '<p>Hand-thrown stoneware, made in Bristol. Add to cart.</p></body></html>'
    expect(looksClientRendered(serverRendered)).toBe(false)
  })

  test('a shell shop reports a client-rendered catalogue, not invented items', async () => {
    const home = `<html><head><title>Nightshade</title></head><body>
      <nav><a href="/collections/all">Shop all</a><a href="/collections/new">New in</a></nav>
      <p>Fragrance, made in small batches.</p>
      <div id="root"></div>
      <script>window.__INITIAL_STATE__={}</script>
    </body></html>`
    const shell = (title: string) =>
      `<html><head><title>${title}</title></head><body>
        <div id="root"></div><script>window.__INITIAL_STATE__={}</script></body></html>`

    const fetchImpl = (async (input: string) => {
      const path = new URL(input).pathname
      if (path === '/robots.txt')
        return new Response('', { status: 404, headers: { 'content-type': 'text/plain' } })
      return new Response(path === '/' ? home : shell(path), {
        headers: { 'content-type': 'text/html' },
      })
    }) as unknown as typeof fetch

    const report = await importWebsite('https://nightshade.example.com/', fetchImpl)

    expect(report.site.menu).toEqual([])
    expect(report.missing.join(' ')).toContain('draws its product grid in the browser')
    expect(report.notes.join(' ')).toContain('client-rendered')
    // The gap is explained, never filled with guessed products.
    expect(report.found.join(' ')).not.toContain('catalogue')
  })

  test('a storefront with no shell markers keeps the ordinary missing line', async () => {
    const home = `<html><head><title>Nightshade</title></head><body>
      <nav><a href="/collections/all">Shop all</a></nav>
      <p>Fragrance, made in small batches. Free shipping over $50.</p>
    </body></html>`
    const aisle =
      '<html><head><title>Shop all</title></head><body><h1>Shop all</h1><p>Loading the shelves.</p></body></html>'

    const fetchImpl = (async (input: string) => {
      const path = new URL(input).pathname
      if (path === '/robots.txt')
        return new Response('', { status: 404, headers: { 'content-type': 'text/plain' } })
      return new Response(path === '/' ? home : aisle, {
        headers: { 'content-type': 'text/html' },
      })
    }) as unknown as typeof fetch

    const report = await importWebsite('https://nightshade.example.com/', fetchImpl)

    expect(report.site.menu).toEqual([])
    expect(report.missing.join(' ')).toContain('add items in the app editor')
    expect(report.notes.join(' ')).not.toContain('client-rendered')
  })

  test('a product-grid container or an image preload is not product markup', () => {
    expect(hasProductMarkup('<div class="section-template__product-grid-padding"></div>')).toBe(false)
    expect(
      hasProductMarkup(
        '<link rel="preload" href="https://cdn.shopify.com/s/files/1/1/products/hat.jpg" />',
      ),
    ).toBe(false)
    expect(hasProductMarkup('<div class="product-card"></div>')).toBe(true)
    expect(hasProductMarkup('<a href="/collections/hats/products/logo-hat">Logo hat</a>')).toBe(true)
  })

  test('a small server-rendered shop gets the ordinary missing-catalogue line', async () => {
    const home = `<html><head><title>Paper Lane</title></head><body>
      <p>Notebooks and cards, printed in Leeds.</p>
      <article class="product-card"><a title="Pocket notebook">Pocket notebook</a><span class="price">£9.00</span></article>
      <article class="product-card"><a title="Letterpress card">Letterpress card</a><span class="price">£3.50</span></article>
    </body></html>`

    const fetchImpl = (async () =>
      new Response(home, { headers: { 'content-type': 'text/html' } })) as unknown as typeof fetch
    const report = await importWebsite('https://paperlane.example.com/', fetchImpl)

    expect(report.missing.join(' ')).toContain('add items in the app editor')
    expect(report.notes.join(' ')).not.toContain('client-rendered')
  })
})

describe('the importer refuses to be a proxy into the network', () => {
  const blocked = [
    'http://127.0.0.1/',
    'http://localhost:8080/admin',
    'http://169.254.169.254/latest/meta-data/',
    'http://10.1.2.3/',
    'http://192.168.0.4/',
    'http://172.20.1.1/',
    'http://[::1]/',
    'http://2130706433/',
    'http://intranet/',
    'http://printer.local/',
  ]

  for (const url of blocked) {
    test(`blocks ${url}`, () => {
      expect(() => assertPublicHost(normaliseUrl(url))).toThrow(ImportError)
      try {
        assertPublicHost(normaliseUrl(url))
      } catch (error) {
        expect((error as ImportError).code).toBe('blocked_host')
      }
    })
  }

  test('rejects other protocols', () => {
    expect(() => normaliseUrl('file:///etc/passwd')).toThrow(ImportError)
    expect(() => normaliseUrl('javascript:alert(1)')).toThrow(ImportError)
    expect(() => normaliseUrl('')).toThrow(ImportError)
  })

  test('accepts ordinary public addresses, with or without a scheme', () => {
    expect(normaliseUrl('example.com/shop').toString()).toBe('https://example.com/shop')
    expect(() => assertPublicHost(normaliseUrl('https://books.toscrape.com/'))).not.toThrow()
  })

  test('checks every redirect hop, not just the first', async () => {
    const fetchImpl = (async () =>
      new Response(null, { status: 302, headers: { location: 'http://127.0.0.1:9000/' } })) as unknown as typeof fetch
    await expect(importWebsite('https://example.com', fetchImpl)).rejects.toThrow(ImportError)
  })
})

describe('prices and copy are read the way people write them', () => {
  test('handles dollar, euro and thousand separators', () => {
    expect(toCents('$1,234.50')).toBe(123450)
    expect(toCents('1.234,50 €')).toBe(123450)
    expect(toCents('£24')).toBe(2400)
    expect(toCents('28,00')).toBe(2800)
    expect(toCents('1.234')).toBe(123400)
    expect(toCents('')).toBe(0)
  })

  test('splits a shop title at its separators', () => {
    expect(cleanName('Home | Loom & Larder')).toBe('Loom & Larder')
    expect(cleanName('Marlow & Co — Hair Salon')).toBe('Marlow & Co')
    expect(cleanName('')).toBe('')
  })

})

describe('plain shop markup', () => {
  const card = (name: string, price: string) =>
    `<article class="product_pod"><div class="image_container">` +
    `<a href="/p/${name}"><img alt="${name}"></a></div>` +
    `<h3><a href="/p/${name}" title="${name}">${name.slice(0, 8)}...</a></h3>` +
    `<div class="product_price"><p class="price_color">${price}</p></div></article>`

  test('a price wrapper does not eat the card it belongs to', () => {
    const items = cardProducts(card('A Light in the Attic', '£51.77') + card('Tipping the Velvet', '£53.74') + card('Soumission', '£50.10'))
    expect(items.map((item) => item.name)).toEqual([
      'A Light in the Attic',
      'Tipping the Velvet',
      'Soumission',
    ])
    expect(items[0].price).toBe(5177)
  })
})

describe('trade detection picks the closest fit', () => {
  test('a gym timetable is a gym, not a shop', () => {
    expect(
      detectVertical({
        strong: 'Ironworks',
        body: 'Strength and conditioning gym. Class timetable, memberships and personal training.',
        products: 0,
      }).id,
    ).toBe('gym')
  })

  test('a product feed defaults to retail', () => {
    expect(detectVertical({ strong: 'Acme', body: 'Some things for sale.', products: 12 }).id).toBe(
      'shop',
    )
  })

  test('nothing to go on is flagged as a guess', () => {
    const result = detectVertical({ strong: 'Acme', body: 'Hello.', products: 0 })
    expect(result.confidence).toBe('guessed')
  })
})

describe('what the browser sends back is not trusted', () => {
  test('drops unsafe links and clamps the catalogue', () => {
    const clean = sanitizeImported({
      name: '  Acme  ',
      website: 'javascript:alert(1)',
      socials: [
        { label: 'Instagram', url: 'https://instagram.com/acme' },
        { label: 'Bad', url: 'javascript:alert(1)' },
      ],
      menu: [
        { name: 'S', items: Array.from({ length: 40 }, (_, index) => ({ name: `Item ${index}`, price: 500 })) },
      ],
      features: ['catalog', 'ordering', 'not_a_feature'],
    })
    expect(clean?.name).toBe('Acme')
    expect(clean?.website).toBe('')
    expect(clean?.socials).toEqual([{ label: 'Instagram', url: 'https://instagram.com/acme' }])
    expect(clean?.menu?.[0].items.length).toBe(30)
  })

  test('ignores anything that is not an object', () => {
    expect(sanitizeImported('nope')).toBeUndefined()
    expect(sanitizeImported(null)).toBeUndefined()
    expect(sanitizeImported([])).toBeUndefined()
  })
})

describe('the landing page proves a real run', () => {
  test('the snapshot is a real capture, not typed sample data', () => {
    expect(SAMPLE_IMPORT.host).toBe('books.toscrape.com')
    expect(SAMPLE_IMPORT.pages).toBeGreaterThan(1)
    expect(SAMPLE_IMPORT.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const totals = sampleTotals()
    expect(totals.items).toBeGreaterThan(30)
    expect(totals.sections).toBeGreaterThan(1)
    expect(totals.priced).toBe(totals.items)
  })

  test('the app shown on the page is rendered from that capture', () => {
    const html = renderApp(sampleSpec(), { token: 'proof-books', live: false })
    expect(html).toContain('A Light in the Attic')
    expect(html).toContain('£51.77')
    expect(html).toContain('Books to Scrape')
  })

  test('the marketing page shows the URL, the numbers and the app', () => {
    const html = marketingPage()
    expect(html).toContain('id="proof"')
    expect(html).toContain(SAMPLE_IMPORT.source)
    expect(html).toContain('/proof/app')
    expect(html).toContain('Re-run this URL live')
    expect(html).toContain(`read ${sampleTotals().items} items`)
  })

  test('the brief points at the proof before anyone starts', () => {
    const html = briefPage()
    expect(html).toContain('See that URL and the app it produced')
    expect(html).toContain(`Try it on ${SAMPLE_IMPORT.host}`)
    expect(html).toContain(`data-import-sample="${SAMPLE_IMPORT.source}"`)
  })
})

describe('the pages offer the URL route', () => {
  test('the brief has a paste-a-website field', () => {
    const html = briefPage()
    expect(html).toContain('Start from their website')
    expect(html).toContain('id="site-url"')
    expect(html).toContain('/api/import')
    expect(html).toContain('data-import-report')
  })

  test('the landing page posts a URL straight into the brief', () => {
    const html = marketingPage()
    expect(html).toContain('action="/brief"')
    expect(html).toContain('name="url"')
  })
})
