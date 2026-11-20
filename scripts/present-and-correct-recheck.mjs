/**
 * Recompute the final live read's currency and integrity numbers from its saved
 * feed. No network: this only reads the evidence already recorded under
 * docs/qa/live-verification-2026-11-20-final/, so it cannot be mistaken for
 * another crawl.
 *
 *   bun scripts/present-and-correct-recheck.mjs
 */
import { readFile, writeFile } from 'node:fs/promises'

const DIR = 'docs/qa/live-verification-2026-11-20-final/present-and-correct'
const feed = JSON.parse(await readFile(`${DIR}/feed.json`, 'utf8'))
const report = JSON.parse(await readFile(`${DIR}/report.json`, 'utf8'))
const checks = JSON.parse(await readFile(`${DIR}/checks.json`, 'utf8'))

const products = feed.products
const items = (report.site.menu ?? []).flatMap((section) => section.items)
const fold = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
const byTitle = new Map(products.map((product) => [fold(product.title), product]))

// The shop's own option labels, and only those with an amount beside the mark.
const symbols = { '£': 'GBP', '€': 'EUR', '₹': 'INR', '¥': 'JPY' }
const labelled = new Map()
for (const product of products) {
  for (const variant of product.variants) {
    const hit = /[£€₹¥]\s?\d/.exec(variant.title ?? '')
    if (hit && symbols[hit[0][0]] && !labelled.has(symbols[hit[0][0]]))
      labelled.set(symbols[hit[0][0]], `${hit[0][0]} in the option name "${variant.title}"`)
  }
}

const multi = items.filter((item) => Array.isArray(item.variants) && item.variants.length > 1)
const variants = multi.flatMap((item) => item.variants ?? [])
const variantIds = variants.filter((variant) => /^\d+$/.test(variant.id ?? '')).length
const feedVariantsForMulti = multi.reduce((total, item) => {
  const feedProduct = byTitle.get(fold(item.name))
  return total + (feedProduct ? feedProduct.variants.length : 0)
}, 0)

const out = {
  note: 'Computed from the saved feed and report of the final authorised run. No request was made to the shop.',
  run: checks.at,
  products: { feed: products.length, published: items.length },
  labels: [...labelled.entries()].map(([code, raw]) => ({ code, raw })),
  currencyAtRun: report.site.currency,
  currencyAtRunMethod: report.site.currencyEvidence?.method ?? '',
  currencyUnderPresentmentRule: labelled.size === 1 ? [...labelled.keys()][0] : '',
  currencyRule: labelled.size === 1
    ? 'The page only offered a presentment code; the shop own labels decide. GBP.'
    : 'No single label currency, so nothing is published and the owner is asked.',
  variants: {
    multiOptionItems: multi.length,
    variantsShipped: variants.length,
    variantsWithFeedId: variantIds,
    feedVariantsForThoseProducts: feedVariantsForMulti,
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

await writeFile(`${DIR}/recheck.json`, JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
