/**
 * Seed the four supervised-pilot businesses, three concepts each, from the
 * saved recovery reports. This is deliberately separate from the historical
 * benchmark apps: it never edits or reuses their project rows, and it writes
 * its tokens to its own untracked evidence file.
 *
 *   bun scripts/pilot-projects-seed.mjs
 *
 * No crawl, deployment, payment or AI generation is used.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const API = process.env.PILOT_API ?? 'http://127.0.0.1:5173'
const OUT = process.env.PILOT_APPS ?? '.chrome-qa/pilot-projects.json'
const ROOT = process.env.PILOT_ROOT ?? 'docs/qa/generation-benchmark-2026-11-21-recovery'
const DIRS = {
  yarmouth: ['minimal', 'editorial', 'lifestyle'],
  padella: ['editorial', 'modern', 'luxe'],
  bluetit: ['minimal', 'editorial', 'luxe'],
  afl: ['classic', 'minimal', 'editorial'],
}
const DISPLAY = {
  yarmouth: 'Yarmouth Oilskins',
  padella: 'Padella',
  bluetit: 'Blue Tit London',
  afl: 'Architecture for London',
}
const BANNED = [/owner[- ]confirmed detail/i, /benchmark/i, /lorem ipsum/i, /test phrase/i, /contaminat/i]

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

function published(report) {
  const menu = Array.isArray(report.site?.menu) ? report.site.menu : []
  const items = menu.flatMap((section) => section.items ?? [])
  return { menu, items, sections: menu.length, photos: items.filter((item) => item.image?.url).length, priced: items.filter((item) => item.price > 0).length }
}

function reviewFor(site, report) {
  const { items, sections, photos, priced } = published(report)
  const name = DISPLAY[site]
  const source = report.source || report.site?.website || ''
  const host = report.host || (() => { try { return new URL(source).host } catch { return '' } })()
  const pagesRead = report.pagesRead ?? []
  const dropped = report.quality?.dropped ?? []
  const common = {
    source,
    host,
    pages: { read: pagesRead, failed: report.pagesFailed ?? [], usedSitemap: report.usedSitemap === true },
    status: !items.length ? 'empty' : priced === items.length ? 'complete' : 'partial',
    rejected: dropped,
    conflicts: [],
    found: [],
    missing: [],
    questions: [],
  }
  if (site === 'yarmouth') {
    common.found = [
      `${items.length} products in ${sections} sections, read from ${pagesRead.length} pages`,
      `business name read from the site as “${report.site.name}”; display name “${name}” comes from its own story`,
      `category: ${report.site.category}`,
      `brand story and 2 social links`,
      `${photos} product photographs published with the products`,
      'prices in GBP from the £ labels the shop publishes beside its variants',
    ]
    common.missing = ['phone number', 'email address', 'street address', 'opening hours', ...(items.length - photos > 0 ? [`${items.length - photos} product photographs`] : [])]
    common.questions = [
      {
        field: 'Business name',
        why: 'The website only writes the name as “yarmouthoilskins” in its web address. We have used “Yarmouth Oilskins”, as written in its own story. Please confirm the public name.',
        kind: 'confirm',
      },
      {
        field: 'Contact details',
        why: 'No phone number or email address was published. Add the details customers should use before inviting them in.',
        kind: 'confirm',
      },
    ]
  }
  if (site === 'padella') {
    const information = dropped.filter((entry) => /policy|location/.test(entry.reason)).length
    common.found = [
      '0 dishes published — the menu pages did not contain a usable dish list',
      information ? `${information} policy and location rows kept as information, not as dishes` : '',
      `business name: ${name}`,
      `category: ${report.site.category}`,
      'brand story and 2 social links',
      'three restaurant locations read from their own pages',
    ].filter(Boolean)
    common.missing = ['dish names and prices', 'phone number', 'email address', 'street address', 'opening hours', 'a menu page or dish list']
    common.questions = [
      {
        field: 'Catalogue',
        why: 'No dish names and prices were published in a form we could use. Add dishes in the editor, or point us at the page that lists them. Until then the app offers table requests only.',
        kind: 'confirm',
      },
      {
        field: 'Contact details',
        why: 'No phone number or email address was published. Add the details customers should use for a table request.',
        kind: 'confirm',
      },
    ]
  }
  if (site === 'bluetit') {
    common.found = [
      `${items.length} treatments in ${sections} section, read from ${pagesRead.length} pages`,
      `${priced} treatments had a published price`,
      `business name: ${name}`,
      `category: ${report.site.category}`,
      `phone ${report.site.phone}`,
      '3 social links',
    ]
    common.missing = ['email address', 'street address', 'opening hours', ...(items.length - priced > 0 ? [`${items.length - priced} treatment prices`] : []), ...(items.length - photos > 0 ? [`${items.length - photos} treatment photographs`] : [])]
    common.questions = [
      {
        field: 'Treatment prices',
        why: `${items.length - priced} of ${items.length} treatments were listed without a price. They say “Ask on request” until you add a price. Add prices if you want customers to see them.`,
        kind: 'confirm',
      },
      {
        field: 'Treatment photographs',
        why: 'The website did not publish a photograph for these treatments. The app uses intentional monogram panels. Upload photographs only if you have the rights to use them.',
        kind: 'confirm',
      },
    ]
  }
  if (site === 'afl') {
    common.found = [
      '1 service published from the site',
      '7 journal case studies read but kept out of the service catalogue; they can be added as portfolio work',
      `business name: ${name}`,
      `category: ${report.site.category}`,
      `phone ${report.site.phone}`,
      `email ${report.site.email}`,
      `opening hours ${report.site.hours}`,
    ]
    common.missing = ['street address', 'a price or starting price for Build', 'photographs for the suggested case studies']
    common.questions = [
      {
        field: 'Opening hours',
        why: `The website gives “${report.site.hours}”. The weekend line may mean closed rather than midnight. Please confirm the hours customers should see.`,
        kind: 'confirm',
      },
      {
        field: 'Project work',
        why: 'Seven journal case studies were read. They are not services and stay unpublished until you review their titles and accept them as portfolio work.',
        kind: 'confirm',
      },
    ]
  }
  return common
}

function portfolioFor(site, report) {
  if (site !== 'afl') return undefined
  return (report.quality?.dropped ?? [])
    .filter((entry) => /article/.test(entry.reason))
    .slice(0, 12)
    .map((entry) => {
      const full = String(entry.name ?? '').replace(/…$/, '').trim()
      const head = full.split(/[,.]/)[0].trim()
      return { title: (head || full).slice(0, 80), ...(full !== head ? { desc: full.slice(0, 400) } : {}), source: 'website' }
    })
}

const apps = await existing()
if (apps.length) console.log(`${apps.length} pilot applications already exist; filling the gaps.`)
await mkdir('.chrome-qa', { recursive: true })

let visitor = 4400 + (Date.now() % 400)
for (const site of Object.keys(DIRS)) {
  const report = JSON.parse(await readFile(`${ROOT}/${site}/report.json`, 'utf8'))
  const { menu, items } = published(report)
  if (menu.some((section) => section.items?.some((item) => BANNED.some((pattern) => pattern.test(JSON.stringify(item))))))
    throw new Error(`${site}: contaminated catalogue text remains in the saved evidence`)
  const review = reviewFor(site, report)
  const projects = portfolioFor(site, report)
  for (const direction of DIRS[site]) {
    if (apps.some((app) => app.site === site && app.direction === direction)) continue
    const spec = JSON.parse(await readFile(`${ROOT}/${site}/concepts/${direction}.spec.json`, 'utf8'))
    const body = {
      name: DISPLAY[site],
      contact: report.site.phone ?? '',
      email: report.site.email ?? '',
      vertical: report.site.vertical,
      tagline: report.site.tagline ?? '',
      category: report.site.category ?? '',
      accent: report.site.accent ?? spec.accent ?? '',
      logo: report.site.logo ?? spec.logo ?? '',
      features: report.site.features ?? spec.features ?? [],
      platforms: ['pwa'],
      plan: 'onetime',
      direction,
      sourceReview: review,
      ...(projects?.length ? { projects } : {}),
      site: {
        ...report.site,
        name: DISPLAY[site],
        // The saved shop report leaves the currency field empty, but its own
        // variant labels and Shopify analytics both say GBP. Publishing a
        // currencyless price would make £600 look like 600 of nothing.
        currency: report.site.currency || (site === 'yarmouth' ? 'GBP' : ''),
      },
    }
    visitor += 1
    const response = await fetch(`${API}/api/projects`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: API,
        'cf-connecting-ip': `10.44.${visitor}.1`,
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
    apps.push({
      site,
      direction,
      token: result.token,
      cookie,
      name: DISPLAY[site],
      vertical: report.site.vertical,
      status: 'in_review',
      items: items.length,
      review: review.status,
      missing: review.missing,
    })
    await writeFile(OUT, JSON.stringify(apps, null, 1))
    console.log(`${site}/${direction}: ${result.token} (${items.length} items, ${review.status})`)
  }
}
console.log(`seeded ${apps.length} pilot applications -> ${OUT}`)
