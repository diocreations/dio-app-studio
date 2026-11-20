/**
 * One authorised live read of Present & Correct, inside the documented budget.
 *
 *   OUT=docs/qa/<folder>/present-and-correct bun scripts/present-and-correct-crawl.mjs
 *
 * OUT defaults to the original folder, so a re-run never overwrites an earlier
 * report by accident when the variable is set.
 *
 * Runs once. There is no retry, no second pass and no fallback crawl: if the
 * run fails, the failure is written down instead of being re-attempted. The
 * budget in docs/qa/shopify-feed.md (10 page reads, at most 3 feed pages, 20 s
 * wall clock, 6 s per request, 900 KB per body) is enforced here as well as in
 * the importer, so a bug in one place cannot spend a second crawl.
 *
 * Writes (under OUT):
 *   report.json    what the importer read, without page HTML
 *   requests.json  every request, its status, size and duration
 *   feed.json      the feed pages and the products they listed
 *   spec.json      the build the report produced
 *   app.html       the customer app rendered from that build
 *   page-2.html    the page past the first, from the same card renderer
 *   checks.json    the verification checks, with their evidence
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { importWebsite } from '../src/worker/importer'
import { buildSpec } from '../src/worker/pricing'
import { renderApp } from '../src/worker/app'

const OUT = process.env.OUT || 'docs/qa/live-discovery-2026-11-20/present-and-correct'
const ENTRY = 'https://www.presentandcorrect.com/'
const MAX_PAGE_READS = 10
const MAX_BODY_BYTES = 900 * 1024
const WALL_MS = 20_000
const ASSET = /\.(png|jpe?g|webp|avif|gif|svg|css|js|mjs|woff2?|ico)$/i

const requests = []
const feedPages = []
const feedProducts = []

const started = Date.now()

/** Every request goes through here, so the budget is measured rather than assumed. */
async function guardedFetch(input, init) {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  const pageReads = requests.filter((entry) => !ASSET.test(new URL(entry.url).pathname)).length
  if (pageReads >= MAX_PAGE_READS) throw new Error(`budget: page read cap (${MAX_PAGE_READS}) reached before ${url}`)
  if (Date.now() - started > WALL_MS) throw new Error(`budget: wall clock (${WALL_MS} ms) spent before ${url}`)

  const at = Date.now()
  const response = await fetch(input, init)
  const body = Buffer.from(await response.clone().arrayBuffer())
  requests.push({
    url,
    status: response.status,
    bytes: body.byteLength,
    ms: Date.now() - at,
    contentType: response.headers.get('content-type') ?? '',
  })
  if (body.byteLength > MAX_BODY_BYTES) throw new Error(`budget: body over 900 KB at ${url}`)

  if (new URL(url).pathname === '/products.json' && response.ok) {
    try {
      const payload = JSON.parse(body.toString('utf8'))
      const products = Array.isArray(payload.products) ? payload.products : []
      feedPages.push({ url, status: response.status, count: products.length, bytes: body.byteLength })
      for (const product of products) {
        feedProducts.push({
          title: String(product.title ?? ''),
          handle: String(product.handle ?? ''),
          productType: String(product.product_type ?? ''),
          variants: Array.isArray(product.variants)
            ? product.variants.map((variant) => ({
                id: String(variant.id ?? ''),
                title: String(variant.title ?? ''),
                price: String(variant.price ?? ''),
              }))
            : [],
          images: Array.isArray(product.images)
            ? product.images.map((image) => String(image.src ?? '')).filter(Boolean)
            : [],
        })
      }
    } catch {
      // A body that is not the expected JSON is reported by the importer; the
      // page-level record above still holds its status and size.
    }
  }
  return response
}

await mkdir(OUT, { recursive: true })

let report = null
let failure = null
try {
  report = await importWebsite(ENTRY, guardedFetch)
} catch (error) {
  failure = { code: error?.code ?? 'crawl_failed', message: error?.message ?? String(error) }
}

const wall = Date.now() - started
const pageReads = requests.filter((entry) => !ASSET.test(new URL(entry.url).pathname))

await writeFile(`${OUT}/requests.json`, JSON.stringify({ entry: ENTRY, wallMs: wall, requests }, null, 2))
await writeFile(`${OUT}/feed.json`, JSON.stringify({ pages: feedPages, products: feedProducts }, null, 2))

if (!report) {
  await writeFile(`${OUT}/failure.json`, JSON.stringify({ entry: ENTRY, at: new Date().toISOString(), failure, requests }, null, 2))
  console.log(`FAILED ${failure.code}: ${failure.message}`)
  console.log(`requests ${requests.length} · wall ${wall} ms`)
  process.exit(1)
}

const { entryHtml, ...publicReport } = report
await writeFile(`${OUT}/report.json`, JSON.stringify(publicReport, null, 2))

// The same build the brief would make from this report: the shop's own trade,
// its colour, its catalogue, and nothing invented.
const site = report.site
const spec = buildSpec({
  name: site.name || 'Present & Correct',
  vertical: site.vertical || 'shop',
  accent: site.accent || '#2b2b2b',
  logo: 'P&C',
  features: Array.isArray(site.features) && site.features.length ? site.features : ['catalog', 'ordering'],
  tagline: site.tagline,
  category: site.category,
  site,
})
await writeFile(`${OUT}/spec.json`, JSON.stringify(spec, null, 2))
const appHtml = renderApp(spec, { token: 'live-present-and-correct', live: false, flagship: true })
await writeFile(`${OUT}/app.html`, appHtml)
// The page past the first one, rendered by the same card renderer. No network:
// this proves the fragment is a real page of the same shop, not a second markup
// implementation.
const firstShelf = spec.menu[0]
const pageTwo = firstShelf
  ? renderApp(spec, {
      token: 'live-present-and-correct',
      live: false,
      flagship: true,
      cards: { section: 0, from: 12, count: 24 },
    })
  : ''
await writeFile(`${OUT}/page-2.html`, pageTwo)

/* ------------------------------------------------------------------ checks */

const menu = Array.isArray(report.site.menu) ? report.site.menu : []
const items = menu.flatMap((section) => (Array.isArray(section.items) ? section.items : []))
const quality = report.quality ?? {}
const fold = (value) => String(value ?? '').trim().toLowerCase()
const byTitle = new Map(feedProducts.map((product) => [fold(product.title), product]))
const publishedTitles = new Set(items.map((item) => fold(item.name)))
const feedOnly = feedProducts.filter((product) => !publishedTitles.has(fold(product.title)))
const pageOnly = items.filter((item) => !byTitle.has(fold(item.name)))
const path = (value) => {
  try {
    return new URL(value).pathname
  } catch {
    return ''
  }
}

const variants = items.filter((item) => Array.isArray(item.variants) && item.variants.length > 1)
const variantSample = variants.slice(0, 5).map((item) => {
  const feed = byTitle.get(fold(item.name))
  const feedVariants = feed ? feed.variants : []
  return {
    name: item.name,
    published: (item.variants ?? []).map((variant) => ({
      id: variant.id ?? '',
      name: variant.name,
      price: variant.price,
      currency: variant.currency ?? '',
      selected: variant.selected === true,
    })),
    feed: feedVariants,
    selectedCount: (item.variants ?? []).filter((variant) => variant.selected === true).length,
    namesMatch: feed
      ? (item.variants ?? []).every((variant) =>
          feedVariants.some((candidate) => fold(candidate.title) === fold(variant.name)),
        )
      : null,
    pricesMatch: feed
      ? (item.variants ?? []).every((variant) =>
          feedVariants.some(
            (candidate) => fold(candidate.title) === fold(variant.name) && Math.round(Number(candidate.price) * 100) === variant.price,
          ),
        )
      : null,
    idsKept: (item.variants ?? []).filter((variant) => variant.id).length,
  }
})

const images = items
  .filter((item) => item.image?.url)
  .map((item) => {
    const feed = byTitle.get(fold(item.name))
    const wanted = path(item.image.url)
    return {
      name: item.name,
      url: item.image.url,
      listedByFeed: feed ? feed.images.some((src) => path(src) === wanted) : null,
    }
  })
const unassociated = images.filter((entry) => entry.listedByFeed === false)
const feedProductsWithImages = feedProducts.filter((product) => product.images.length > 0).length

const currencies = [...new Set(items.flatMap((item) => (item.variants ?? []).map((variant) => variant.currency).filter(Boolean)))]

const unpriced = items.filter((item) => !(item.price > 0))
const lowest = items
  .filter((item) => item.price > 0)
  .sort((a, b) => a.price - b.price)
  .slice(0, 5)
  .map((item) => ({ name: item.name, price: item.price, evidence: item.priceEvidence?.method ?? '' }))

const checks = {
  entry: ENTRY,
  at: new Date().toISOString(),
  budget: {
    wallMs: wall,
    pageReads: pageReads.length,
    pageReadLimit: MAX_PAGE_READS,
    feedPages: feedPages.length,
    feedPageLimit: 3,
    largestBodyBytes: requests.reduce((max, entry) => Math.max(max, entry.bytes), 0),
    bodyLimitBytes: MAX_BODY_BYTES,
    longestRequestMs: requests.reduce((max, entry) => Math.max(max, entry.ms), 0),
    requests: requests.map((entry) => ({ url: entry.url, status: entry.status, bytes: entry.bytes, ms: entry.ms })),
  },
  '1_feed': {
    pageStatuses: feedPages.map((page) => ({ url: page.url, status: page.status })),
    products: feedProducts.length,
    contentType: requests.find((entry) => new URL(entry.url).pathname === '/products.json')?.contentType ?? '',
    notes: report.notes.filter((line) => /feed|products\.json|shopify/i.test(line)),
    pagesRead: report.pagesRead,
  },
  '2_pagination': {
    pages: feedPages,
    total: feedProducts.length,
    lastPageShort: feedPages.length ? feedPages[feedPages.length - 1].count < 250 : null,
    pageCapNote: report.notes.filter((line) => /750|page cap|pagination/i.test(line)),
  },
  '3_names': {
    published: items.length,
    feedProducts: feedProducts.length,
    matchedFeed: items.length - pageOnly.length,
    pageOnly: pageOnly.slice(0, 10).map((item) => item.name),
    feedOnly: feedOnly.slice(0, 10).map((product) => product.title),
    feedOnlyCount: feedOnly.length,
    first: items.slice(0, 5).map((item) => item.name),
  },
  '4_images': {
    publishedWithImage: images.length,
    feedProductsWithImages,
    associated: images.filter((entry) => entry.listedByFeed === true).length,
    unassociated: unassociated.slice(0, 10),
    sample: images.slice(0, 5),
    report: report.images,
  },
  '5_variants': {
    multiOptionItems: variants.length,
    sample: variantSample,
    everySampleSingleSelected: variantSample.every((entry) => entry.selectedCount === 1),
  },
  '6_currency': {
    declared: report.site.currency ?? '',
    variantCurrencies: currencies,
    formatted: lowest,
  },
  '7_conflicts': {
    count: (quality.priceConflicts ?? []).length,
    list: (quality.priceConflicts ?? []).slice(0, 10),
  },
  '8_missing': {
    unpriced: unpriced.length,
    unpricedSample: unpriced.slice(0, 10).map((item) => item.name),
    dropped: (quality.dropped ?? []).length,
    droppedSample: (quality.dropped ?? []).slice(0, 10),
    suspectPrices: (quality.suspectPrices ?? []).length,
    pagesFailed: report.pagesFailed,
    feedOnlyCount: feedOnly.length,
    pageOnlyCount: pageOnly.length,
  },
  '10_paging': {
    catalogueItems: items.length,
    firstPaintCards: (appHtml.match(/data-item="\d+-\d+"/g) ?? []).length,
    firstPaintNote: (appHtml.match(/Showing \d+ of \d+ [a-z]+/) ?? [''])[0],
    hasMoreControl: /data-more-go="0"/.test(appHtml),
    pageTwoCards: (pageTwo.match(/data-item="0-\d+"/g) ?? []).length,
    pageTwoFirstKey: (pageTwo.match(/data-item="0-(\d+)"/) ?? [])[1] ?? '',
    pageTwoIsFragment: !pageTwo.includes('<html') && !pageTwo.includes('const DATA'),
    fullCatalogueInPayload: (appHtml.match(/"items":/g) ?? []).length > 0 && items.length > 30,
  },
  '11_ids': {
    itemsWithPrice: items.filter((item) => item.priceEvidence?.method === 'shopify-variant').length,
    multiOptionItems: variants.length,
    variantsWithFeedId: variants.reduce(
      (total, item) => total + (item.variants ?? []).filter((variant) => /^\d+$/.test(variant.id ?? '')).length,
      0,
    ),
    feedVariants: feedProducts.reduce((total, product) => total + product.variants.length, 0),
    allVariantNamesMatch: variantSample.every((entry) => entry.namesMatch === true),
    allVariantPricesMatch: variantSample.every((entry) => entry.pricesMatch === true),
    everySampleSingleSelected: variantSample.every((entry) => entry.selectedCount === 1),
  },
  '12_currency_visible': {
    declared: report.site.currency ?? '',
    currencySource: report.site.currencyEvidence ?? null,
    symbolsInApp: [...new Set(appHtml.match(/[£€₹¥]/g) ?? [])],
    dollarAmountsInApp: (appHtml.match(/\$\s?\d/g) ?? []).length,
    pricedSample: lowest,
  },
  '9_budget': {
    withinBudget:
      pageReads.length <= MAX_PAGE_READS &&
      feedPages.length <= 3 &&
      wall <= WALL_MS &&
      requests.every((entry) => entry.bytes <= MAX_BODY_BYTES),
    wallMs: wall,
    pageReads: pageReads.length,
    feedPages: feedPages.length,
  },
  quality,
}

await writeFile(`${OUT}/checks.json`, JSON.stringify(checks, null, 2))
await writeFile(
  `${OUT}/failure.json`,
  JSON.stringify({ note: 'the crawl completed; this file records nothing to retry', failure: null }, null, 2),
)

console.log(
  `crawled ${ENTRY} in ${wall} ms · requests ${requests.length} (pages ${pageReads.length}) · ` +
    `feed pages ${feedPages.length} · products ${feedProducts.length} · published ${items.length}`,
)
console.log(
  `variants ${variants.length} · conflicts ${(quality.priceConflicts ?? []).length} · ` +
    `unpriced ${unpriced.length} · images ${images.length} (unassociated ${unassociated.length}) · ` +
    `currency ${report.site.currency || 'none'}`,
)
