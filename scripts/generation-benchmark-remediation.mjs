/**
 * Remediation pass for the 21 November 2026 generation benchmark.
 *
 *   bun scripts/generation-benchmark-remediation.mjs [site ...]
 *
 * Reads the five saved crawl reports. It does not open a network connection and
 * does not rewrite the original evidence: every result goes to
 * docs/qa/generation-benchmark-2026-11-21-remediation/, beside the original
 * docs/qa/generation-benchmark-2026-11-21/.
 *
 * What it re-runs is the part that was wrong: the trade-aware catalogue rule,
 * the per-item evidence record and the concept build. The saved report is the
 * crawl's own record, so its prices, variants, photographs and page list are
 * used as-is; only provenance that the crawler recorded in `priceEvidence` is
 * restored onto the item.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { cleanMenu } from '../src/worker/importer'
import { buildDiscovery, discoverPlan } from '../src/worker/discovery'
import { assessItem, pageRoleOf } from '../src/worker/catalogue'
import { renderApp } from '../src/worker/app'

const OLD = 'docs/qa/generation-benchmark-2026-11-21'
const OUT = process.env.OUT ?? 'docs/qa/generation-benchmark-2026-11-21-remediation'

const SITES = [
  {
    id: 'yarmouth',
    url: 'https://yarmouthoilskins.com/',
    trade: 'retail',
    /** Real inventory the original crawl did establish. */
    minimum: 70,
  },
  {
    id: 'padella',
    url: 'https://www.padella.co/',
    trade: 'restaurant',
    minimum: 0,
  },
  {
    id: 'pelirocco',
    url: 'https://www.hotelpelirocco.co.uk/',
    trade: 'hotel',
    minimum: 0,
  },
  {
    id: 'bluetit',
    url: 'https://www.bluetitlondon.com/',
    trade: 'appointments',
    minimum: 80,
  },
  {
    id: 'afl',
    url: 'https://www.architectureforlondon.com/',
    trade: 'professional',
    minimum: 1,
  },
]

const wanted = process.argv.slice(2).filter((entry) => !entry.startsWith('-'))
const chosen = wanted.length ? SITES.filter((site) => wanted.includes(site.id)) : SITES
await mkdir(OUT, { recursive: true })

const absolute = (value, base) => {
  if (!value) return ''
  try {
    return new URL(value, base).toString()
  } catch {
    return ''
  }
}

/**
 * Restore the provenance the crawl recorded, and nothing it did not.
 *
 * A priced item already names the page its price came from. An unpriced item
 * does not, but the saved page list and the item's own name are the crawl's
 * record of where it was: “Padella Soho” was read from /soho/, “Rebalancing”
 * from /services/rebalancing/. When no page matches, the item keeps no page
 * instead of borrowing one.
 */
function rehydrate(site, base, pagesRead, vertical) {
  const generic = new Set(['services', 'service', 'menu', 'menus', 'products', 'shop', 'collections', 'rooms'])
  const pages = pagesRead
    .map((path) => {
      const slug = path.replace(/[?#].*$/, '').split('/').filter(Boolean).pop() ?? ''
      const words = slug.replace(/[-_]+/g, ' ').replace(/\.\w+$/, '').toLowerCase()
      return { path, words, isPage: Boolean(words) && !generic.has(words) && words.length >= 3 }
    })
    .filter((page) => page.isPage)
    .sort((a, b) => b.words.length - a.words.length)

  for (const section of site.menu) {
    for (const item of section.items) {
      if (item.priceEvidence?.source) {
        item.sourceUrl = item.sourceUrl ?? absolute(item.priceEvidence.source, base)
        item.sourceMethod =
          item.sourceMethod ??
          (item.priceEvidence.method === 'json-ld'
            ? 'structured-data'
            : item.priceEvidence.method === 'shopify-variant'
              ? 'embedded-json'
              : 'visible-text')
      }
      if (!item.sourceUrl) {
        const name = item.name.toLowerCase()
        const page = pages.find((entry) => name.includes(entry.words))
        if (page) item.sourceUrl = absolute(page.path, base)
      }
    }
  }
  // `vertical` is accepted so a caller cannot forget which trade the names are
  // being read for, even though this function only restores recorded evidence.
  void vertical
  return site
}

const checks = []
const check = (name, ok, detail) => checks.push({ name, ok, detail })

for (const target of chosen) {
  const dir = `${OUT}/${target.id}`
  await mkdir(`${dir}/concepts`, { recursive: true })
  const report = JSON.parse(await readFile(`${OLD}/${target.id}/report.json`, 'utf8'))
  const before = JSON.parse(await readFile(`${OLD}/${target.id}/discovery.json`, 'utf8'))

  const site = rehydrate(structuredClone(report.site), report.source, report.pagesRead, report.site.vertical)
  // The saved report does not say where the name came from. A one-word,
  // lowercase name that matches the domain was read from the host, and saying
  // so is honest; it is never title-cased into a brand the site did not write.
  if (!site.nameSource) {
    const host = new URL(report.source).hostname.replace(/^www\./, '').split('.')[0]
    site.nameSource = site.name.replace(/\s+/g, '').toLowerCase() === host ? 'host' : 'title'
  }

  const oldItems = before.commerce.sections.flatMap((section) => section.items)
  const { sections, quality } = cleanMenu(site.menu, site.vertical, { requireEvidence: true })
  site.menu = sections
  const cleanReport = { ...report, site, quality }

  const discovery = buildDiscovery({
    report: cleanReport,
    site,
    source: report.source,
    pagesRead: report.pagesRead,
    pagesFailed: report.pagesFailed,
    usedSitemap: report.usedSitemap,
    clientRendered: report.notes.some((line) => /client-rendered/i.test(line)),
  })
  const plan = discoverPlan(discovery, site)

  const accepted = discovery.commerce.sections.flatMap((section) => section.items)
  const acceptedVerdicts = accepted.map((item) =>
    assessItem({
      name: item.name,
      desc: item.desc,
      price: item.price,
      image: Boolean(item.image),
      variants: item.variants?.length ?? 0,
      meta: item.meta,
      vertical: site.vertical,
      source: item.evidence.source,
      priceVerified: item.price > 0,
      fromRecord: item.evidence.method === 'structured-data',
    }),
  )

  // The whole acceptance argument for this business, in one record.
  const pageRoles = report.pagesRead.map((path) => {
    let url = path
    try {
      url = new URL(path, report.source).toString()
    } catch {}
    return {
      path,
      role: pageRoleOf({ url, title: path, vertical: site.vertical }),
    }
  })

  const localChecks = []
  const localCheck = (name, ok, detail) => {
    localChecks.push({ name, ok, detail })
    check(`${target.id}: ${name}`, ok, detail)
  }

  localCheck(
    'no policy rows published',
    acceptedVerdicts.every((verdict) => verdict.payload !== 'policy'),
    acceptedVerdicts.filter((verdict) => verdict.payload === 'policy').map((verdict) => verdict.payload),
  )
  localCheck(
    'no editorial rows published',
    acceptedVerdicts.every((verdict) => verdict.payload !== 'article'),
    acceptedVerdicts.filter((verdict) => verdict.payload === 'article').length,
  )
  localCheck(
    'no navigation or location rows published',
    acceptedVerdicts.every(
      (verdict) => verdict.payload !== 'navigation' && verdict.payload !== 'location' && verdict.payload !== 'promotion',
    ),
    acceptedVerdicts.filter((verdict) =>
      ['navigation', 'location', 'promotion'].includes(verdict.payload),
    ).length,
  )
  localCheck(
    'real inventory retained',
    accepted.length >= target.minimum,
    `${accepted.length} of a required ${target.minimum}`,
  )
  localCheck(
    'every published price carries validated evidence',
    accepted.every((item) => item.price === 0 || item.evidence.confidence === 'verified'),
    accepted.filter((item) => item.price > 0 && item.evidence.confidence !== 'verified').length,
  )
  localCheck(
    'every item carries a source',
    accepted.every((item) => Boolean(item.evidence.source)),
    accepted.filter((item) => !item.evidence.source).length,
  )
  localCheck(
    'currency is stated wherever a price is published',
    !accepted.some((item) => item.price > 0) || Boolean(discovery.commerce.currency.value),
    discovery.commerce.currency.value,
  )
  const imageUrls = accepted.filter((item) => item.image).map((item) => item.image)
  localCheck(
    'every photograph is attached to an item, not shared between them',
    new Set(imageUrls).size === imageUrls.length,
    `${imageUrls.length} photographs, ${new Set(imageUrls).size} distinct`,
  )
  localCheck(
    'an empty catalogue is disclosed, not filled',
    accepted.length > 0 || discovery.questions.some((question) => question.field === 'catalogue'),
    discovery.questions.map((question) => question.field),
  )
  localCheck(
    'business name keeps the source casing',
    discovery.business.name.value === String(report.site.name ?? '').trim(),
    discovery.business.name.value,
  )
  localCheck(
    'all three concepts are structurally distinct',
    plan.diversity.ok,
    plan.diversity.pairs.map((pair) => ({
      pair: `${pair.a}/${pair.b}`,
      different: pair.dimensions.filter((dimension) => dimension.different).map((dimension) => dimension.name),
      insufficient: pair.dimensions.filter((dimension) => !dimension.different).map((dimension) => dimension.name),
      reasons: pair.reasons,
    })),
  )
  localCheck(
    'no delivery fee is invented',
    plan.concepts.every(
      (concept) => concept.spec.fulfilment?.source === 'default' && concept.spec.fulfilment?.deliveryFee === undefined,
    ),
    plan.concepts.map((concept) => concept.spec.fulfilment),
  )
  localCheck(
    'every catalogue row the trade refused is recorded',
    quality.dropped.length === discovery.commerce.rejected.length,
    `${quality.dropped.length} dropped / ${discovery.commerce.rejected.length} recorded`,
  )

  const evidence = {
    site: target.id,
    trade: target.trade,
    source: report.source,
    sourceKind: 'saved crawl report, 21 November 2026 (no network request)',
    before: {
      items: oldItems.length,
      priced: before.commerce.priced,
      withImage: before.commerce.withImage,
      sections: before.commerce.sections.map((section) => [section.name, section.items.length]),
      missing: before.missing,
    },
    after: {
      items: accepted.length,
      priced: discovery.commerce.priced,
      withImage: discovery.commerce.withImage,
      payload: discovery.commerce.payload,
      status: discovery.commerce.status,
      pricingBasis: discovery.commerce.pricingBasis,
      requirements: discovery.commerce.requirements,
      inventoryPagesRead: pageRoles.filter((page) => page.role === 'inventory').map((page) => page.path),
      currency: discovery.commerce.currency,
      missing: discovery.missing,
      questions: discovery.questions,
      conflicts: discovery.conflicts,
    },
    name: {
      value: discovery.business.name.value,
      source: site.nameSource,
      confidence: discovery.business.name.confidence,
    },
    contact: {
      phone: discovery.business.phone,
      email: discovery.business.email,
      address: discovery.business.address,
      evidence: site.contactEvidence ?? {},
    },
    pages: pageRoles,
    rejected: discovery.commerce.rejected,
    accepted: discovery.commerce.sections.flatMap((section) =>
      section.items.map((item) => ({
        section: section.name,
        name: item.name,
        price: item.price,
        variants: item.variants?.length ?? 0,
        image: item.image ? 'source photograph' : '',
        evidence: item.evidence,
        priceEvidence: item.price ? 'validated' : 'absent',
      })),
    ),
    checks: localChecks,
  }

  await writeFile(`${dir}/report.json`, JSON.stringify({ ...target, ...cleanReport }, null, 2))
  await writeFile(`${dir}/discovery.json`, JSON.stringify(discovery, null, 2))
  await writeFile(`${dir}/evidence.json`, JSON.stringify(evidence, null, 2))
  await writeFile(
    `${dir}/questions.json`,
    JSON.stringify({ blockers: plan.blockers, confirmations: plan.confirmations }, null, 2),
  )
  await writeFile(
    `${dir}/plan.json`,
    JSON.stringify(
      {
        site: target,
        diversity: plan.diversity,
        concepts: plan.concepts.map((concept) => ({
          id: concept.id,
          name: concept.name,
          note: concept.note,
          architecture: concept.spec.direction,
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
        token: `remed-${target.id}-${concept.id}`,
        live: false,
        flagship: true,
        doc: concept.doc,
      }),
    )
  }

  console.log(
    `${target.id.padEnd(10)} ${String(oldItems.length).padStart(3)} -> ${String(accepted.length).padStart(3)} items  ` +
      `priced:${String(discovery.commerce.priced).padEnd(3)} photos:${String(discovery.commerce.withImage).padEnd(3)} ` +
      `status:${discovery.commerce.status.padEnd(8)} rejected:${String(discovery.commerce.rejected.length).padEnd(3)} ` +
      `local checks:${localChecks.filter((entry) => entry.ok).length}/${localChecks.length}`,
  )
}

await writeFile(`${OUT}/verification.json`, JSON.stringify(checks, null, 2))
const passed = checks.filter((entry) => entry.ok).length
console.log(`\n${passed}/${checks.length} acceptance checks pass -> ${OUT}/verification.json`)
if (passed !== checks.length) {
  for (const entry of checks.filter((row) => !row.ok))
    console.log(`  FAIL ${entry.name} — ${JSON.stringify(entry.detail)}`)
  process.exitCode = 1
}
