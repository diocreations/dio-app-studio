/**
 * Seed the fifteen generation-benchmark applications into the local Worker.
 *
 *   bun scripts/generation-benchmark-seed.mjs
 *
 * One project per saved concept, in an isolated local project list. No crawl,
 * no deployment, no payment. Tokens and owner cookies go to
 * .chrome-qa/generation-benchmark-apps.json (untracked).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const API = process.env.BENCH_API ?? 'http://127.0.0.1:5173'
const OUT = process.env.BENCH_APPS ?? '.chrome-qa/generation-benchmark-apps.json'
const ROOT = process.env.BENCH_ROOT ?? 'docs/qa/generation-benchmark-2026-11-21'
// A clean acceptance dataset builds from the saved report's own identity and
// rows. The concept fixture is only a rendered relic and must not supply copy
// that the crawl did not establish.
const CLEAN = process.env.BENCH_CLEAN === '1'
const SITES = ['yarmouth', 'padella', 'pelirocco', 'bluetit', 'afl']
const CONCEPTS = {
  yarmouth: ['minimal', 'editorial', 'lifestyle'],
  padella: ['editorial', 'modern', 'luxe'],
  pelirocco: ['minimal', 'editorial', 'luxe'],
  bluetit: ['minimal', 'editorial', 'luxe'],
  afl: ['classic', 'minimal', 'editorial'],
}

async function existing() {
  try {
    const saved = JSON.parse(await readFile(OUT, 'utf8'))
    const alive = []
    for (const app of saved) {
      const response = await fetch(`${API}/p/${app.token}/app`)
      if (response.ok) alive.push(app)
    }
    return alive
  } catch {
    return []
  }
}

const apps = await existing()
if (apps.length) console.log(`${apps.length} benchmark applications already exist; filling the gaps.`)
await mkdir('.chrome-qa', { recursive: true })

// A fresh local visitor address per run: the per-connection meter is not the
// subject of this benchmark, and a second seeding pass must not collide with
// the first pass's addresses.
let visitor = 1000 + (Date.now() % 50000)
for (const site of SITES) {
  for (const direction of CONCEPTS[site]) {
    if (apps.some((app) => app.site === site && app.direction === direction)) continue
    const spec = JSON.parse(await readFile(`${ROOT}/${site}/concepts/${direction}.spec.json`, 'utf8'))
    const report = JSON.parse(await readFile(`${ROOT}/${site}/report.json`, 'utf8'))
    const dropped = report.quality?.dropped ?? []
    const items = (spec.menu ?? []).flatMap((section) => section.items ?? [])
    const priced = items.filter((item) => item.price > 0).length
    const sourceReview = {
      source: report.source,
      host: report.host,
      status: !items.length ? 'empty' : priced === items.length ? 'complete' : 'partial',
      pagesRead: report.pagesRead ?? [],
      pagesFailed: report.pagesFailed ?? [],
      usedSitemap: report.usedSitemap === true,
      found: report.found ?? [],
      missing: report.missing ?? [],
      rejected: dropped,
    }
    // The saved AFL reads refused six journal case studies as services. The
    // owner accepts them as portfolio work here, which is exactly the review
    // action measured by the recovery benchmark.
    const projects =
      spec.vertical === 'professional'
        ? dropped
            .filter((entry) => /article/.test(entry.reason))
            .slice(0, 12)
            .map((entry) => {
              const full = String(entry.name ?? '').replace(/…$/, '').trim()
              const head = full.split(/[,.]/)[0].trim()
              return { title: (head || full).slice(0, 80), ...(full !== head ? { desc: full.slice(0, 400) } : {}), source: 'website' }
            })
        : undefined
    visitor += 1
    // The saved crawl report is the evidence record: its `site` carries each
    // item's own price evidence, photograph and variants. A concept spec is a
    // rendered fixture and may not. BENCH_EVIDENCE=1 builds from the report's
    // rows while keeping the concept's identity, so owner review has real
    // evidence to show instead of an untraceable number.
    const evidenced = process.env.BENCH_EVIDENCE === '1' && Array.isArray(report.site?.menu) ? report.site.menu : null
    const identity = CLEAN ? report.site : spec
    const body = {
      name: identity.name ?? spec.name,
      contact: identity.phone ?? '',
      email: identity.email ?? '',
      vertical: identity.vertical ?? spec.vertical,
      ...(CLEAN ? {} : { tagline: spec.tagline ?? '' }),
      custom: spec.custom ?? '',
      category: identity.category ?? identity.kind ?? '',
      accent: identity.accent ?? '',
      logo: identity.logo ?? '',
      features: identity.features ?? spec.features ?? [],
      platforms: ['pwa'],
      plan: 'onetime',
      direction,
      sourceReview,
      ...(projects?.length ? { projects } : {}),
      site: CLEAN
        ? { ...report.site }
        : { ...spec, ...(evidenced && evidenced.length ? { menu: evidenced } : {}) },
    }
    const response = await fetch(`${API}/api/projects`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: API,
        // A separate local visitor per build: the owner meter is not the subject
        // of this benchmark, and one benchmark app must not consume another's.
        'cf-connecting-ip': `10.31.${visitor}.1`,
      },
      body: JSON.stringify(body),
    })
    const result = await response.json()
    if (!response.ok) {
      console.error(`${site}/${direction}: ${response.status} ${JSON.stringify(result)}`)
      process.exitCode = 1
      continue
    }
    const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0]
    apps.push({ site, direction, token: result.token, cookie, name: spec.name, vertical: spec.vertical })
    await writeFile(OUT, JSON.stringify(apps, null, 1))
    console.log(`${site}/${direction}: ${result.token}`)
  }
}
console.log(`seeded ${apps.length} applications -> ${OUT}`)
