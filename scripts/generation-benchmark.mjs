/**
 * Generation-quality benchmark: discovery and three concepts per business.
 *
 *   bun scripts/generation-benchmark.mjs [siteId ...]
 *
 * Each site is crawled at most once. A site with discovery.json is skipped, so
 * a partial run cannot spend a second crawl. Limits are the crawler's existing
 * limits: 10 pages, 900 KB/page, 6.5 s/page, 20 s wall clock, same host,
 * robots respected, sitemap only when the entry page is thin.
 *
 * Writes docs/qa/generation-benchmark-2026-11-21/<site>/
 *   report.json      what the crawler read (no page HTML)
 *   discovery.json   every field with source, method and confidence
 *   questions.json   blockers and confirmations
 *   plan.json        the three concepts and their structural diversity
 *   concepts/*.json  the real spec and document for each concept
 */
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { importWebsite } from '../src/worker/importer'
import { buildDiscovery, discoverPlan } from '../src/worker/discovery'
import { renderApp } from '../src/worker/app'

const OUT = process.env.OUT || 'docs/qa/generation-benchmark-2026-11-21'

/** Five businesses not present in any earlier Plattr fixture or acceptance run. */
export const SITES = [
  {
    id: 'yarmouth',
    url: 'https://yarmouthoilskins.com/',
    model: 'Retail with product variants',
    why: 'Shopify workwear shop: sizes, colours, per-variant prices and product photography',
  },
  {
    id: 'padella',
    url: 'https://www.padella.co/',
    model: 'Restaurant',
    why: 'Fresh-pasta restaurant with HTML menus, prices, locations and walk-in workflow',
  },
  {
    id: 'pelirocco',
    url: 'https://www.hotelpelirocco.co.uk/',
    model: 'Hotel / accommodation',
    why: 'Independent themed hotel with rooms, capacity language and direct booking',
  },
  {
    id: 'bluetit',
    url: 'https://www.bluetitlondon.com/',
    model: 'Appointment-based business',
    why: 'Hair salon group with service pages, tiered prices and online appointment booking',
  },
  {
    id: 'afl',
    url: 'https://www.architectureforlondon.com/',
    model: 'Professional / service business',
    why: 'Architecture practice with services, projects and consultation-led enquiry',
  },
]

const wanted = process.argv.slice(2).filter((entry) => !entry.startsWith('-'))
const rebuild = process.argv.includes('--rebuild')
const chosen = wanted.length ? SITES.filter((site) => wanted.includes(site.id)) : SITES

for (const site of chosen) {
  const dir = `${OUT}/${site.id}`
  await mkdir(`${dir}/concepts`, { recursive: true })
  try {
    const existing = await readdir(dir)
    if (existing.includes('discovery.json') && !rebuild) {
      console.log(`${site.id.padEnd(11)} already crawled — skipped`)
      continue
    }
  } catch {}

  console.log(`${site.id.padEnd(11)} ${rebuild ? 're-reading saved report' : `reading ${site.url}`} …`)
  const started = Date.now()
  let report
  try {
    report = rebuild
      ? JSON.parse(await Bun.file(`${dir}/report.json`).text())
      : await importWebsite(site.url, fetch, { withHtml: true })
  } catch (error) {
    const failure = {
      ...site,
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

  await writeFile(`${dir}/report.json`, JSON.stringify({ ...site, ...publicReport }, null, 2))
  await writeFile(`${dir}/discovery.json`, JSON.stringify(discovery, null, 2))
  await writeFile(
    `${dir}/questions.json`,
    JSON.stringify({ blockers: plan.blockers, confirmations: plan.confirmations }, null, 2),
  )
  await writeFile(
    `${dir}/plan.json`,
    JSON.stringify(
      {
        site,
        diversity: plan.diversity,
        concepts: plan.concepts.map((concept) => ({
          id: concept.id,
          name: concept.name,
          note: concept.note,
        })),
      },
      null,
      2,
    ),
  )

  for (const concept of plan.concepts) {
    await writeFile(`${dir}/concepts/${concept.id}.spec.json`, JSON.stringify(concept.spec, null, 2))
    await writeFile(`${dir}/concepts/${concept.id}.doc.json`, JSON.stringify(concept.doc, null, 2))
    await writeFile(
      `${dir}/concepts/${concept.id}.html`,
      renderApp(concept.spec, {
        token: `bench-${site.id}-${concept.id}`,
        live: false,
        flagship: true,
        doc: concept.doc,
      }),
    )
  }

  const commerce = discovery.commerce
  const items = commerce.sections.reduce((total, section) => total + section.items.length, 0)
  const withVariants = report.site.menu.flatMap((section) => section.items).filter((item) => (item.variants?.length ?? 0) > 0).length
  console.log(
    `${site.id.padEnd(11)} ${discovery.business.trade.value.padEnd(14)} ` +
      `${discovery.business.name.value.slice(0, 28).padEnd(29)} ` +
      `items:${String(items).padEnd(4)} priced:${String(commerce.priced).padEnd(4)} ` +
      `photos:${String(commerce.withImage).padEnd(4)} variants:${String(withVariants).padEnd(4)} ` +
      `diversity:${plan.diversity.ok ? 'ok' : 'FAIL'} conflicts:${discovery.conflicts.length} ` +
      `pages:${report.pages} ${Math.round((Date.now() - started) / 100) / 10}s`,
  )
}
