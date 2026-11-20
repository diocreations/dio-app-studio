/**
 * The approved live discovery run: one crawl per site, nothing repeated.
 *
 *   bun scripts/live-discovery.mjs [siteId ...]
 *
 * A site that already has a report is skipped unless FORCE=1, so a re-run after
 * a partial failure cannot spend a second crawl by accident.
 *
 * Writes docs/qa/live-discovery-2026-11-20/<site>/
 *   report.json      what the crawler read (no page HTML)
 *   discovery.json   every field with source, method and confidence
 *   concepts/*.json  the three real documents for that site
 *   concepts/*.html  the same documents rendered by the real renderer
 */
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { importWebsite } from '../src/worker/importer'
import { buildDiscovery, discoverPlan } from '../src/worker/discovery'
import { renderApp } from '../src/worker/app'

const OUT = process.env.OUT || 'docs/qa/live-discovery-2026-11-20'

/**
 * The five approved sites, chosen for five different structures:
 * a small product shop (JSON-LD + sitemap), a large restaurant group (many
 * locations, heavy navigation), a service business (service pages, no cart),
 * a hosted storefront (Shopify product JSON, pagination) and a complex
 * institution (sitemap index, thousands of URLs, JS-driven booking).
 */
export const SITES = [
  { id: 'buttertales', url: 'https://www.buttertales.com/', why: 'small product shop: product pages the home page does not link to' },
  { id: 'dishoom', url: 'https://www.dishoom.com/', why: 'restaurant group: many locations, menus behind navigation' },
  { id: 'service', url: 'https://www.pimlicoplumbers.com/', why: 'service business: service pages and prices, no basket' },
  { id: 'store', url: 'https://www.presentandcorrect.com/', why: 'hosted storefront: product JSON-LD, collections, pagination' },
  { id: 'complex', url: 'https://www.rhs.org.uk/', why: 'complex institution: sitemap index, tens of thousands of URLs, many sections' },
]

const wanted = process.argv.slice(2).filter((entry) => !entry.startsWith('-'))
const chosen = wanted.length ? SITES.filter((site) => wanted.includes(site.id)) : SITES
const force = process.env.FORCE === '1'

for (const site of chosen) {
  const dir = `${OUT}/${site.id}`
  await mkdir(`${dir}/concepts`, { recursive: true })
  if (!force) {
    try {
      const existing = await readdir(dir)
      if (existing.includes('discovery.json')) {
        console.log(`${site.id.padEnd(11)} already crawled — skipped (FORCE=1 to repeat)`)
        continue
      }
    } catch {}
  }

  console.log(`${site.id.padEnd(11)} reading ${site.url} …`)
  const started = Date.now()
  let report
  try {
    report = await importWebsite(site.url, fetch, { withHtml: true })
  } catch (error) {
    const failure = {
      id: site.id,
      url: site.url,
      why: site.why,
      failed: true,
      code: error?.code ?? 'crawl_failed',
      message: error?.message ?? String(error),
      at: new Date().toISOString(),
    }
    await writeFile(`${dir}/failure.json`, JSON.stringify(failure, null, 2))
    console.log(`${site.id.padEnd(11)} FAILED: ${failure.code} — ${failure.message}`)
    continue
  }

  const { entryHtml, ...publicReport } = report
  const discovery = buildDiscovery({
    report,
    site: report.site,
    source: report.source,
    html: entryHtml,
    pagesRead: report.pagesRead,
    pagesFailed: report.pagesFailed,
    usedSitemap: report.usedSitemap,
    clientRendered: report.notes.some((line) => /client-rendered/i.test(line)),
  })
  const plan = discoverPlan(discovery, report.site)

  await writeFile(`${dir}/report.json`, JSON.stringify(publicReport, null, 2))
  await writeFile(`${dir}/discovery.json`, JSON.stringify(discovery, null, 2))
  await writeFile(
    `${dir}/questions.json`,
    JSON.stringify({ blockers: plan.blockers, confirmations: plan.confirmations }, null, 2),
  )

  for (const concept of plan.concepts) {
    await writeFile(`${dir}/concepts/${concept.id}.spec.json`, JSON.stringify(concept.spec, null, 2))
    await writeFile(`${dir}/concepts/${concept.id}.doc.json`, JSON.stringify(concept.doc, null, 2))
    await writeFile(
      `${dir}/concepts/${concept.id}.html`,
      renderApp(concept.spec, {
        token: `live-${site.id}-${concept.id}`,
        live: false,
        flagship: true,
        doc: concept.doc,
      }),
    )
  }

  const items = discovery.commerce.sections.reduce((total, section) => total + section.items.length, 0)
  console.log(
    `${site.id.padEnd(11)} ${discovery.business.trade.value.padEnd(14)} ` +
      `${discovery.business.name.value.slice(0, 28).padEnd(29)} ` +
      `items:${String(items).padEnd(4)} priced:${String(discovery.commerce.priced).padEnd(4)} ` +
      `photos:${String(discovery.commerce.withImage).padEnd(4)} ` +
      `conflicts:${discovery.conflicts.length} questions:${plan.blockers.length + plan.confirmations.length} ` +
      `pages:${report.pages} ${Math.round((Date.now() - started) / 100) / 10}s`,
  )
}
