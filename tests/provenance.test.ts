import { describe, expect, test } from 'bun:test'
import { buildDiscovery, discoverPlan } from '../src/worker/discovery'
import { cardProducts, extractSite, importWebsite, ImportError, type ImportedSite } from '../src/worker/importer'
import { applyApproval } from '../src/worker/reimport'
import type { MenuItem, MenuSection } from '../src/worker/types'

/**
 * Stage 2: discovery provenance.
 *
 * Each case proves three things separately, because they are three different
 * product promises: what Plattr read, what it refused to invent, and what it
 * asks the owner to settle. A test that only checks the first would pass on a
 * build that quietly filled in the rest.
 */

function site(overrides: Partial<ImportedSite> = {}): ImportedSite {
  return {
    name: 'Wick & Clay',
    tagline: 'Hand-poured candles',
    story: '',
    vertical: 'shop',
    verticalConfidence: 'detected',
    category: 'Candlemaker',
    categoryBasis: 'structured data on the home page',
    accent: '#7a4a2b',
    logo: 'WC',
    phone: '+1 503 555 0148',
    email: '',
    address: '88 Alder St, Portland',
    hours: '',
    website: 'https://wick.example/',
    currency: 'USD',
    socials: [],
    features: [],
    menu: [],
    nameSource: 'structured-data',
    ...overrides,
  }
}

function item(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    name: 'Cedar + Smoke',
    desc: 'Cedarwood, smoke and a little sweetness.',
    price: 2800,
    sourceUrl: 'https://wick.example/products/cedar-smoke',
    sourceMethod: 'structured-data',
    priceEvidence: {
      method: 'json-ld',
      source: 'https://wick.example/products/cedar-smoke',
      raw: '28.00',
      currency: 'USD',
      validated: true,
    },
    image: { url: 'https://wick.example/img/cedar.jpg', source: 'website', method: 'structured-data' },
    ...overrides,
  }
}

function discover(overrides: Partial<ImportedSite> = {}, html = '') {
  const facts = site(overrides)
  return buildDiscovery({ site: facts, source: facts.website, html })
}

describe('field-level provenance', () => {
  test('every catalogue field says where it came from and how sure the read is', () => {
    const discovery = discover({ menu: [{ name: 'Candles', items: [item()] }] })
    const entry = discovery.commerce.sections[0].items[0]
    for (const [name, fields] of Object.entries(entry.fields)) {
      expect(fields, name).toBeTruthy()
      expect(['structured-data', 'metadata', 'visible-text', 'inferred']).toContain(fields.method)
      expect(['verified', 'likely', 'guess']).toContain(fields.confidence)
      expect(Array.isArray(fields.conflicts)).toBe(true)
      expect(typeof fields.needsConfirmation).toBe('boolean')
    }
    // The JSON-LD reading is proven by the source's own record, and says which
    // path proved it.
    expect(entry.fields.price.confidence).toBe('verified')
    expect(entry.fields.price.reference).toBe('json-ld:offers.price')
    expect(entry.fields.price.source).toBe('https://wick.example/products/cedar-smoke')
    expect(entry.fields.image.reference).toBe('json-ld:image')
    expect(entry.fields.category.value).toBe('Candles')
  })

  test('identity and contact fields carry their source page, method and reference', () => {
    const html = `<!doctype html><html><head><title>Wick & Clay</title>
      <meta property="og:site_name" content="Wick & Clay">
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"Store","name":"Wick & Clay","telephone":"+1 503 555 0148","address":{"@type":"PostalAddress","streetAddress":"88 Alder St","addressLocality":"Portland"}}</script>
      </head><body><h1>Wick & Clay</h1><a href="tel:+15035550148">Call</a><a href="/shipping">Shipping policy</a></body></html>`
    const discovery = discover({}, html)
    expect(discovery.business.name.confidence).toBe('verified')
    expect(discovery.business.name.reference).toBe('json-ld:name')
    expect(discovery.business.phone.reference).toBe('json-ld:telephone')
    expect(discovery.business.address.reference).toBe('json-ld:address')
    // A policy link is read as a link, not summarised into copy nobody read.
    expect(discovery.policies).toHaveLength(1)
    expect(discovery.policies[0].kind).toBe('shipping')
    expect(discovery.policies[0].url).toBe('https://wick.example/shipping')
    expect(discovery.policies[0].label.needsConfirmation).toBe(true)
    expect(discovery.policies[0].label.reference).toContain('a[href=')
  })
})

describe('conflicting prices', () => {
  test('two readings are kept side by side and nothing is published', () => {
    const facts = site({
      menu: [
        {
          name: 'Candles',
          items: [
            item({
              // The importer withdraws a conflicted price rather than choosing.
              price: 0,
              priceEvidence: undefined,
            }),
          ],
        },
      ],
      priceConflicts: [
        {
          name: 'Cedar + Smoke',
          page: 2800,
          feed: 3200,
          pageSource: 'https://wick.example/products/cedar-smoke',
          feedSource: 'https://wick.example/api/products.json',
        },
      ],
    })
    const discovery = buildDiscovery({ site: facts, source: facts.website })
    const entry = discovery.commerce.sections[0].items[0]

    // Extracted: both readings, with the page each came from.
    expect(entry.fields.price.conflicts.map((reading) => reading.value)).toEqual(['28.00', '32.00'])
    expect(entry.fields.price.conflicts[0].source).toBe('https://wick.example/products/cedar-smoke')
    expect(entry.fields.price.conflicts[1].source).toBe('https://wick.example/api/products.json')
    // Cannot extract: one true price. The row is not given either figure.
    expect(entry.price).toBe(0)
    expect(entry.fields.price.value).toBe('')
    expect(discovery.conflicts.find((conflict) => conflict.field === 'price:Cedar + Smoke')?.values).toHaveLength(2)
    // Requires the owner: one question naming both figures.
    expect(entry.fields.price.needsConfirmation).toBe(true)
    const question = discovery.questions.find((entry) => entry.field === 'price:Cedar + Smoke')
    expect(question?.why).toContain('28.00')
    expect(question?.why).toContain('32.00')
  })
})

describe('price ranges', () => {
  const cards = `<div class="product-card"><h3>Lamp</h3><span class="price">£10–£20</span></div>
    <div class="product-card"><h3>Stool</h3><span class="price">£45.00</span></div>`

  test('a range is kept as a range, not turned into its lower bound', () => {
    const items = cardProducts(cards, 'https://wick.example/shop')
    const lamp = items.find((entry) => entry.name === 'Lamp')!
    expect(lamp.priceEvidence?.raw).toBe('£10–£20')
    expect(lamp.meta).toBe('from')

    const facts = site({ menu: [{ name: 'Furniture', items }], currency: 'GBP', vertical: 'shop' })
    const discovery = buildDiscovery({ site: facts, source: facts.website })
    const read = discovery.commerce.sections[0].items.find((entry) => entry.name === 'Lamp')!
    // Extracted: both bounds exactly as written.
    expect(read.fields.price.range).toEqual({ from: '£10', to: '£20', raw: '£10–£20' })
    expect(read.fields.price.value).toBe('£10–£20')
    // Cannot extract: one price for the item.
    expect(read.fields.price.value).not.toBe('£10')
    // Requires the owner: a single question, not one per ranged item.
    expect(read.fields.price.needsConfirmation).toBe(true)
    expect(discovery.questions.filter((question) => question.field === 'price-ranges')).toHaveLength(1)
    expect(discovery.questions.find((question) => question.field === 'price-ranges')?.why).toContain('£10–£20')
  })
})

describe('missing product detail', () => {
  test('a product with no photograph keeps no invented image', () => {
    const discovery = discover({
      menu: [{ name: 'Candles', items: [item({ image: undefined })] }],
    })
    const entry = discovery.commerce.sections[0].items[0]
    // Extracted: the product, its price and its words.
    expect(entry.name).toBe('Cedar + Smoke')
    expect(entry.price).toBe(2800)
    // Cannot extract: a photograph. Nothing is substituted.
    expect(entry.fields.image.value).toBe('')
    expect(entry.fields.image.confidence).toBe('guess')
    expect(discovery.commerce.withImage).toBe(0)
    // Requires the owner: one photograph question for the catalogue.
    expect(discovery.questions.filter((question) => question.field === 'photographs')).toHaveLength(1)
    expect(discovery.missing.some((line) => line.includes('photographs'))).toBe(true)
  })

  test('a product with no description is empty, never filled with sample copy', () => {
    const discovery = discover({
      menu: [{ name: 'Candles', items: [item({ desc: '' })] }],
    })
    const entry = discovery.commerce.sections[0].items[0]
    expect(entry.desc).toBe('')
    expect(entry.fields.desc.confidence).toBe('guess')
    expect(entry.fields.desc.value).toBe('')
    // The trade's demo copy is not borrowed for an imported business.
    expect(entry.fields.desc.value).not.toContain('Cedarwood')
    expect(discovery.missing).toContain('product descriptions')
    expect(discovery.questions.some((question) => question.field === 'descriptions')).toBe(true)
  })
})

describe('ambiguous business category', () => {
  test('an inferred trade is offered as a question, not asserted as fact', () => {
    const discovery = discover({
      category: 'Boutique',
      categoryBasis: '',
      verticalConfidence: 'guessed',
      menu: [{ name: 'Products', items: [item()] }],
    })
    expect(discovery.business.category.value).toBe('Boutique')
    expect(discovery.business.category.confidence).toBe('likely')
    expect(discovery.business.category.needsConfirmation).toBe(true)
    expect(discovery.business.trade.needsConfirmation).toBe(true)
    const asked = discovery.questions.filter((question) => question.field === 'category')
    expect(asked).toHaveLength(1)
    expect(asked[0].why).toContain('Boutique')
  })
})

describe('a catalogue only the browser can see', () => {
  test('the shell is reported, and no product is invented', () => {
    const shell = `<!doctype html><html><head><title>Loading…</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>`
    const site = extractSite(shell, new URL('https://js.example/'))
    const discovery = buildDiscovery({ site, source: 'https://js.example/', html: shell, clientRendered: true })
    expect(discovery.clientRendered).toBe(true)
    // Extracted: the business shell and its host, at low confidence.
    expect(discovery.host).toBe('js.example')
    expect(discovery.business.name.confidence).not.toBe('verified')
    // Cannot extract: any catalogue at all.
    expect(discovery.commerce.products).toBe(0)
    expect(discovery.commerce.sections).toHaveLength(0)
    // Requires the owner: the catalogue question, and no invented rows.
    expect(discovery.questions.find((question) => question.field === 'catalogue')?.kind).toBe('confirm')
  })
})

describe('a site that refuses the reader', () => {
  test('robots.txt is obeyed and the refusal says nothing was fetched', async () => {
    const calls: string[] = []
    const fetchImpl = (async (input: string) => {
      calls.push(String(input))
      if (String(input).endsWith('/robots.txt'))
        return new Response('User-agent: *\nDisallow: /\n', { headers: { 'content-type': 'text/plain' } })
      return new Response('<html><body><h1>Should not be read</h1></body></html>', {
        headers: { 'content-type': 'text/html' },
      })
    }) as unknown as typeof fetch

    const failure = await importWebsite('https://blocked.example/', fetchImpl).catch((error) => error)
    // Extracted: the site's own rule.
    expect(failure).toBeInstanceOf(ImportError)
    expect((failure as ImportError).code).toBe('robots_disallowed')
    expect((failure as ImportError).message).toContain('robots.txt')
    // Cannot extract: the page the rule protects.
    expect(calls.some((url) => !url.endsWith('/robots.txt'))).toBe(false)
    // Requires the owner: the message sends them to supply the details.
    expect((failure as ImportError).message).toContain('Paste the details in by hand')
  })

  test('an unreachable site is a failure, not an empty catalogue', async () => {
    const fetchImpl = (async () => {
      throw new Error('connect ECONNREFUSED')
    }) as unknown as typeof fetch
    const failure = await importWebsite('https://down.example/', fetchImpl).catch((error) => error)
    expect(failure).toBeInstanceOf(ImportError)
    expect((failure as ImportError).code).toBe('fetch_failed')
    expect((failure as ImportError).status).toBe(502)
    // Nothing is invented to fill the gap; the owner is asked to check the link.
    expect((failure as ImportError).message).toContain('Could not reach down.example')
  })
})

describe('re-import never overwrites an owner edit', () => {
  const ownerMenu = (): MenuSection[] => [
    {
      name: 'Candles',
      items: [
        {
          ...item(),
          price: 3000,
          desc: 'Our own words about Cedar + Smoke.',
          ownerFields: ['price', 'desc'],
          fieldProvenance: {
            price: { source: 'owner', method: 'owner', confidence: 'verified', validated: true },
            desc: { source: 'owner', method: 'owner', confidence: 'verified', validated: true },
          },
          sourceTrail: {
            original: { price: '28.00', desc: 'Cedarwood, smoke and a little sweetness.', at: '2026-11-20T10:00:00.000Z' },
            ownerAt: '2026-11-20T10:05:00.000Z',
          },
        },
      ],
    },
  ]

  test('an unapproved re-import leaves the owner price, words and provenance intact', () => {
    const current = ownerMenu()
    const incoming: MenuSection[] = [
      {
        name: 'Candles',
        items: [item({ price: 3500, desc: 'A different description from the new site.' })],
      },
    ]
    const applied = applyApproval(current, incoming, { removed: [], changed: [] }, '2026-11-23T09:00:00.000Z')
    const entry = applied[0].items[0]
    expect(entry.price).toBe(3000)
    expect(entry.desc).toBe('Our own words about Cedar + Smoke.')
    expect(entry.fieldProvenance?.price?.source).toBe('owner')
    expect(entry.fieldProvenance?.desc?.source).toBe('owner')
  })

  test('only an explicit source resolution moves an owner value', () => {
    const current = ownerMenu()
    const incoming: MenuSection[] = [
      { name: 'Candles', items: [item({ price: 3500, desc: 'A different description from the new site.' })] },
    ]
    const applied = applyApproval(
      current,
      incoming,
      {
        removed: [],
        changed: [],
        resolutions: [{ name: 'Cedar + Smoke', field: 'price', choice: 'source' }],
      },
      '2026-11-23T09:00:00.000Z',
    )
    const entry = applied[0].items[0]
    // The price the owner approved is the source's, and the words they wrote
    // are still untouched because they did not resolve that field.
    expect(entry.price).toBe(3500)
    expect(entry.desc).toBe('Our own words about Cedar + Smoke.')
    expect(entry.fieldProvenance?.price?.source).toBe('website')
    expect(entry.fieldProvenance?.desc?.source).toBe('owner')
  })
})

describe('the owner is asked only about gaps', () => {
  test('a complete read produces no questions about what it already proved', () => {
    const facts = site({
      menu: [
        {
          name: 'Candles',
          items: [item(), item({ name: 'Fig Leaf', price: 3200, image: { url: 'https://wick.example/img/fig.jpg', source: 'website' } })],
        },
      ],
    })
    const discovery = buildDiscovery({ site: facts, source: facts.website })
    const plan = discoverPlan(discovery, facts)
    const asked = [...plan.blockers, ...plan.confirmations].map((question) => question.field)
    expect(asked).not.toContain('name')
    expect(asked).not.toContain('currency')
    expect(asked).not.toContain('catalogue')
    expect(asked).not.toContain('descriptions')
    expect(asked).not.toContain('photographs')
  })
})
