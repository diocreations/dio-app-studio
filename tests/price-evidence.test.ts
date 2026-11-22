import { describe, expect, test } from 'bun:test'
import { cleanMenu, importWebsite } from '../src/worker/importer'
import type { MenuItem, MenuSection } from '../src/worker/types'

/**
 * A price reaches a customer only with proof of where it was read. These tests
 * cover the five cases the price work was specified against, then the hosted
 * storefront feed that was producing names with no prices or photographs.
 */

const priced = (name: string, price: number, proof = true): MenuItem => ({
  name,
  desc: '',
  price,
  ...(proof
    ? {
        priceEvidence: {
          method: 'json-ld' as const,
          source: 'https://shop.example/products.json?page=1',
          raw: (price / 100).toFixed(2),
          currency: 'GBP',
          validated: true,
        },
      }
    : {}),
})

const nine = (build: (index: number) => MenuItem): MenuSection[] => [
  { name: 'Pens', items: Array.from({ length: 9 }, (_, index) => build(index)) },
]

const strict = (sections: MenuSection[]) => cleanMenu(sections, 'shop', { requireEvidence: true })

describe('a price is published only with per-item evidence', () => {
  test('nine genuine products at one price with individual evidence keep all nine', () => {
    const { sections, quality } = strict(nine((index) => priced(`Pen ${index + 1}`, 1800)))
    const kept = sections.flatMap((section) => section.items)
    expect(kept).toHaveLength(9)
    expect(kept.every((item) => item.price === 1800)).toBe(true)
    expect(kept.every((item) => item.priceEvidence?.validated)).toBe(true)
    expect(quality.suspectPrices).toHaveLength(0)
  })

  test('nine products at one price with no reliable evidence publish no price', () => {
    const { sections, quality } = strict(nine((index) => priced(`Pen ${index + 1}`, 1800, false)))
    const kept = sections.flatMap((section) => section.items)
    expect(kept).toHaveLength(9)
    expect(kept.every((item) => item.price === 0)).toBe(true)
    expect(quality.suspectPrices).toHaveLength(9)
    expect(quality.suspectPrices.every((entry) => entry.reason === 'unverified')).toBe(true)
  })

  test('nine differing fabricated prices are rejected just the same', () => {
    const { sections, quality } = strict(nine((index) => priced(`Pen ${index + 1}`, 500 + index * 137, false)))
    const kept = sections.flatMap((section) => section.items)
    expect(new Set(kept.map((item) => item.price))).toEqual(new Set([0]))
    expect(quality.suspectPrices).toHaveLength(9)
  })

  test('genuine products at different verified prices are preserved', () => {
    const { sections } = strict([
      { name: 'Pens', items: [priced('Fountain pen', 12500), priced('Ballpoint', 2400), priced('Pencil', 350)] },
    ])
    expect(sections[0].items.map((item) => item.price)).toEqual([12500, 2400, 350])
  })

  test('a product with no price stays empty rather than guessed', () => {
    const { sections, quality } = strict([
      {
        name: 'Pens',
        // The feed declared this product; only its price is missing, so the
        // item stays with no price rather than being guessed at.
        items: [{ name: 'Desk pen', desc: '', price: 0, sourceMethod: 'structured-data' }, priced('Fountain pen', 12500)],
      },
    ])
    expect(sections[0].items).toHaveLength(2)
    expect(sections[0].items[0].price).toBe(0)
    expect(quality.suspectPrices).toHaveLength(0)
  })
})

/* ------------------------------------------------------------------ */
/* The hosted storefront, against the round-2 report                   */
/* ------------------------------------------------------------------ */

type Report = { site: { menu: MenuSection[] } }

const storeReport = async (): Promise<Report> =>
  JSON.parse(await Bun.file('docs/qa/live-discovery-round2-2026-11-20/store/report.json').text()) as Report

const HOME = `<!doctype html><html><head>
<title>Present &amp; Correct — Office sundries</title>
<meta property="og:site_name" content="Present &amp; Correct" />
<meta name="description" content="Office sundries for the modern workspace." />
<script src="https://cdn.shopify.com/s/files/1/0001/theme.js"></script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Store","name":"Present & Correct","currenciesAccepted":"GBP"}</script>
</head><body><h1>Present &amp; Correct</h1>
<p>Add to cart · Free shipping · £12.00 · Shop all products</p>
<nav><a href="/collections/notes">Notes</a></nav></body></html>`

/** A products feed built from the 136 names the live crawl actually read. */
function feed(menu: MenuSection[]): { products: Record<string, unknown>[] } {
  const products: Record<string, unknown>[] = []
  for (const section of menu) {
    for (const item of section.items) {
      const slug = item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      const price = (18 + (products.length % 7) * 3).toFixed(2)
      products.push({
        id: products.length + 1,
        title: item.name,
        handle: slug,
        body_html: '<p>Office sundries for the modern workspace.</p>',
        product_type: section.name.replace(/^Collection:\s*/, ''),
        variants:
          item.name === 'Brass Pen Box'
            ? [
                { title: 'Small', price: '42.00' },
                { title: 'Large', price: '58.00' },
              ]
            : [{ title: 'Default Title', price }],
        // The first product deliberately has no photograph at all.
        images: products.length === 0 ? [] : [{ src: `https://cdn.shopify.com/s/files/1/0001/products/${slug}.jpg?v=1` }],
      })
    }
  }
  return { products }
}

async function readStore() {
  const stored = await storeReport()
  const body = feed(stored.site.menu)
  const seen: string[] = []
  const fetchImpl = (async (input: string) => {
    const url = new URL(input)
    seen.push(url.pathname + url.search)
    if (url.pathname === '/products.json')
      return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
    if (url.pathname === '/')
      return new Response(HOME, { headers: { 'content-type': 'text/html; charset=utf-8' } })
    return new Response('gone', { status: 404, headers: { 'content-type': 'text/html' } })
  }) as unknown as typeof fetch
  const report = await importWebsite('https://www.presentandcorrect.com/', fetchImpl)
  return { report, seen, stored }
}

describe('a hosted storefront publishes prices and photographs per product', () => {
  test('the round-2 report is the baseline: 136 names, no prices, no photographs', async () => {
    const stored = await storeReport()
    const items = stored.site.menu.flatMap((section) => section.items)
    expect(items).toHaveLength(136)
    expect(items.filter((item) => item.price > 0)).toHaveLength(0)
    expect(items.filter((item) => item.image)).toHaveLength(0)
  })

  test('the product feed supplies a verified price for all 136 names', async () => {
    const { report } = await readStore()
    const items = report.site.menu.flatMap((section) => section.items)
    expect(items).toHaveLength(136)
    expect(items.filter((item) => item.price > 0)).toHaveLength(136)
    expect(items.filter((item) => item.priceEvidence?.validated)).toHaveLength(136)
    // The feed names the product each file belongs to, so a product literally
    // called "Cover" keeps its own photograph. Every product with a file gets
    // one; the product the feed lists with no images keeps none.
    expect(report.images.withImage).toBe(135)
    const cover = items.find((item) => /cover/i.test(item.name))!
    expect(cover.image?.url).toContain('hobonichi-cover')
  })

  test('each photograph belongs to its own product, never a neighbour', async () => {
    const { report } = await readStore()
    const items = report.site.menu.flatMap((section) => section.items)
    const pen = items.find((item) => item.name === 'Brass Pen Box')!
    expect(pen.image?.url).toContain('/brass-pen-box.jpg')
    const mismatched = items.filter((item) => {
      if (!item.image) return false
      const slug = item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      return !item.image.url.includes(`/${slug}.jpg`)
    })
    expect(mismatched).toHaveLength(0)
  })

  test('the variants the source lists are kept, with the entry price as the cheapest', async () => {
    const { report } = await readStore()
    const pen = report.site.menu.flatMap((section) => section.items).find((item) => item.name === 'Brass Pen Box')!
    expect(pen.price).toBe(4200)
    expect(pen.variants?.map((variant) => variant.name)).toEqual(['Small', 'Large'])
    expect(pen.variants?.map((variant) => variant.price)).toEqual([4200, 5800])
    expect(pen.priceEvidence?.raw).toBe('42.00')
  })

  test('every published price names its source and its method', async () => {
    const { report } = await readStore()
    const items = report.site.menu.flatMap((section) => section.items).filter((item) => item.price > 0)
    expect(items.every((item) => item.priceEvidence?.method === 'shopify-variant')).toBe(true)
    expect(items.every((item) => item.priceEvidence?.source.startsWith('/products.json'))).toBe(true)
    expect(items.every((item) => item.priceEvidence?.currency === 'GBP')).toBe(true)
  })

  test('a product the feed lists without a photograph is left without one', async () => {
    const { report } = await readStore()
    const items = report.site.menu.flatMap((section) => section.items)
    const first = items.find((item) => item.name === storedFirst(report))
    expect(first?.image).toBeUndefined()
    expect(first?.price).toBe(1800)
  })

  test('the feed is read once, and its pages count against the crawl budget', async () => {
    const { report, seen } = await readStore()
    expect(seen.filter((path) => path.startsWith('/products.json'))).toHaveLength(1)
    expect(report.pages).toBeLessThanOrEqual(11)
  })
})

function storedFirst(report: { site: { menu: MenuSection[] } }): string {
  return report.site.menu[0]?.items[0]?.name ?? ''
}
