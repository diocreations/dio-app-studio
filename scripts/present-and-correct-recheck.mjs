/**
 * Recompute the final live read's currency and integrity numbers from its saved
 * feed. No network: this only reads the evidence already recorded under
 * docs/qa/live-verification-2026-11-20-final/, so it cannot be mistaken for
 * another crawl.
 *
 *   bun scripts/present-and-correct-recheck.mjs
 */
import { readFile, writeFile } from 'node:fs/promises'
import { importWebsite } from '../src/worker/importer'

const DIR = 'docs/qa/live-verification-2026-11-20-final/present-and-correct'
const feed = JSON.parse(await readFile(`${DIR}/feed.json`, 'utf8'))
const report = JSON.parse(await readFile(`${DIR}/report.json`, 'utf8'))
const checks = JSON.parse(await readFile(`${DIR}/checks.json`, 'utf8'))

const products = feed.products
const items = (report.site.menu ?? []).flatMap((section) => section.items)
const fold = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

// The shop's own option labels, kept only when the label agrees with that
// option's own price. A label that disagrees says nothing about the catalogue.
const symbols = { '£': 'GBP', '€': 'EUR', '₹': 'INR', '¥': 'JPY' }
const labels = new Map()
for (const product of products) {
  for (const variant of product.variants) {
    const hit = /([£€₹¥])\s?(\d+(?:[.,]\d{1,2})?)/.exec(variant.title ?? '')
    const code = hit ? symbols[hit[1]] : ''
    if (!hit || !code) continue
    const amount = Math.round(Number(hit[2].replace(',', '.')) * 100)
    const price = Math.round(Number(variant.price || 0) * 100)
    const seen = labels.get(code) ?? { products: new Set(), validated: 0, rejected: 0, raw: variant.title }
    if (price > 0 && amount > 0 && price === amount) {
      seen.products.add(product.title)
      seen.validated += 1
    } else seen.rejected += 1
    labels.set(code, seen)
  }
}

const labelled = [...labels.entries()]
  .filter(([, seen]) => seen.validated > 0)
  .map(([code, seen]) => ({
    code,
    products: seen.products.size,
    validatedPairs: seen.validated,
    rejectedPairs: seen.rejected,
    raw: `${seen.raw} matched against its option price`,
  }))
// One product is a hint; two or more agreeing products would be proof.
const proven = labelled.length === 1 && labelled[0].products >= 2

const multi = items.filter((item) => (item.variants ?? []).length > 1)
const singles = items.filter((item) => (item.variants ?? []).length === 1)
const variants = items.flatMap((item) => item.variants ?? [])
const variantIds = variants.filter((variant) => /^\d+$/.test(variant.id ?? '')).length

const out = {
  note: 'Computed from the saved feed and report of the final authorised run. No request was made to the shop.',
  run: checks.at,
  products: { feed: products.length, published: items.length },
  labels: labelled,
  labelProof: proven,
  currencyAtRun: report.site.currency,
  currencyAtRunMethod: report.site.currencyEvidence?.method ?? '',
  currencyUnderRule: proven ? labelled[0].code : '',
  currencyRule: proven
    ? 'Two or more products agree, so the label currency is published.'
    : 'One product label is a hint only: no currency is published and the brief asks the owner.',
  savedReportVariants: {
    // The run published only optioned products with a variant list; the
    // re-read below shows what the current reader keeps.
    multiOptionItems: multi.length,
    singleOptionItems: singles.length,
    variantsShipped: variants.length,
    variantsWithFeedId: variantIds,
    singleOptionsSelected: singles.filter((item) => item.variants[0].selected === true).length,
  },
  paging: checks['10_paging'],
  images: {
    publishedWithImage: checks['4_images'].publishedWithImage,
    associated: checks['4_images'].associated,
    unassociated: checks['4_images'].unassociated.length,
  },
  names: {
    matchedExactly: checks['3_names'].matchedFeed,
    normalisedOnly: checks['3_names'].pageOnly,
  },
}

// What the current reader makes of the very same saved feed, with the page
// currency the run recorded (INR, the visitor's presentment). Still no network.
const ORIGIN = 'https://www.presentandcorrect.com'
const home = `<!doctype html><html><head><title>Present &amp; Correct</title>
<meta property="og:site_name" content="Present & Correct">
<script>ShopifyAnalytics = window.ShopifyAnalytics || {}; window.ShopifyAnalytics.meta = { "currency": "INR" };</script>
<script src="https://cdn.shopify.com/s/files/theme.js"></script>
</head><body><h1>Present &amp; Correct</h1></body></html>`
const stub = async (raw) => {
  const url = new URL(raw)
  if (url.pathname === '/robots.txt')
    return new Response('User-agent: *\nAllow: /', { headers: { 'content-type': 'text/plain' } })
  if (url.pathname === '/') return new Response(home, { headers: { 'content-type': 'text/html; charset=utf-8' } })
  if (url.pathname === '/products.json') {
    const page = Number(url.searchParams.get('page') || '1')
    const limit = Number(url.searchParams.get('limit') || '250')
    const slice = products.slice((page - 1) * limit, page * limit)
    return new Response(JSON.stringify({ products: slice }), { headers: { 'content-type': 'application/json' } })
  }
  return new Response('gone', { status: 404 })
}
const rebuilt = await importWebsite(`${ORIGIN}/`, stub)
const rebuiltItems = (rebuilt.site.menu ?? []).flatMap((section) => section.items)
const rebuiltSingles = rebuiltItems.filter((item) => (item.variants ?? []).length === 1)
const rebuiltMulti = rebuiltItems.filter((item) => (item.variants ?? []).length > 1)
const rebuiltVariants = rebuiltItems.flatMap((item) => item.variants ?? [])

out.currentReader = {
  note: 'The saved feed re-read by the current reader with the run page currency. Not a crawl.',
  products: rebuiltItems.length,
  currency: rebuilt.site.currency ?? '',
  currencyEvidence: rebuilt.site.currencyEvidence?.method ?? '',
  currencyCandidates: (rebuilt.site.currencyCandidates ?? []).map((entry) => `${entry.code}:${entry.method}`),
  currencyConflict: rebuilt.site.currencyConflict === true,
  multiOptionItems: rebuiltMulti.length,
  singleOptionItems: rebuiltSingles.length,
  variantsShipped: rebuiltVariants.length,
  variantsWithFeedId: rebuiltVariants.filter((variant) => /^\d+$/.test(variant.id ?? '')).length,
  singleOptionsSelected: rebuiltSingles.filter((item) => item.variants[0].selected === true).length,
}

await writeFile(`${DIR}/recheck.json`, JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
