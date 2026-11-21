/**
 * Seed the local Worker with the fifteen acceptance applications.
 *
 *   bun scripts/acceptance-seed.mjs
 *
 * Five trades, three concepts each, from the saved fixtures only: the
 * Present & Correct run for retail (with the owner's GBP confirmation) and the
 * saved trade audit specs for the other four trades. Nothing is crawled and no
 * production resource is touched.
 *
 * Tokens and owner sessions are written to .chrome-qa/acceptance-apps.json
 * (untracked) so the browser and editor passes can reuse the same builds.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const API = process.env.ACCEPTANCE_API ?? 'http://127.0.0.1:5173'
const OUT = '.chrome-qa/acceptance-apps.json'
const MACHINE = 'docs/qa/trade-audit-2026-11-20/machine'
const RETAIL = 'docs/qa/live-verification-2026-11-20-final/present-and-correct/spec.json'

const CONCEPTS = {
  shop: ['minimal', 'editorial', 'lifestyle'],
  restaurant: ['editorial', 'modern', 'luxe'],
  hotel: ['luxe', 'editorial', 'minimal'],
  salon: ['luxe', 'minimal', 'editorial'],
  professional: ['classic', 'minimal', 'editorial'],
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

const done = await existing()
if (done.length) console.log(`${done.length} acceptance applications already exist; filling the gaps.`)

await mkdir('.chrome-qa', { recursive: true })
const apps = [...done]
let visitor = 0

for (const [trade, directions] of Object.entries(CONCEPTS)) {
  const spec =
    trade === 'shop'
      ? JSON.parse(await readFile(RETAIL, 'utf8'))
      : JSON.parse(await readFile(`${MACHINE}/${trade}.spec.json`, 'utf8'))
  // The saved retail run recorded the visitor's presentment currency (INR) and
  // the importer correctly refuses to publish it. The owner-confirmed GBP is
  // the currency this acceptance uses, exactly as the brief did.
  if (trade === 'shop') spec.currency = 'GBP'

  visitor += 1
  for (const direction of directions) {
    if (apps.some((app) => app.trade === trade && app.direction === direction)) continue
    const body = {
      name: spec.name,
      contact: spec.phone ?? '',
      email: spec.email ?? '',
      vertical: trade === 'shop' ? 'shop' : trade,
      tagline: spec.tagline ?? '',
      custom: spec.custom ?? '',
      category: spec.kind ?? '',
      accent: spec.accent ?? '',
      logo: spec.logo ?? '',
      features: spec.features ?? [],
      platforms: ['pwa'],
      plan: 'onetime',
      direction,
      site: spec,
    }
    const response = await fetch(`${API}/api/projects`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: API,
        // Each trade gets its own build allowance on the local Worker, so one
        // evaluation cannot exhaust the per-connection meter for the rest.
        'cf-connecting-ip': `10.10.${visitor}.1`,
      },
      body: JSON.stringify(body),
    })
    const result = await response.json()
    if (!response.ok) {
      console.error(`${trade}/${direction}: ${response.status} ${JSON.stringify(result)}`)
      process.exitCode = 1
      continue
    }
    const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0]
    apps.push({ trade, direction, token: result.token, cookie, name: spec.name })
    console.log(`${trade}/${direction}: ${result.token}`)
  }
}

await writeFile(OUT, JSON.stringify(apps, null, 1))
console.log(`seeded ${apps.length} applications -> ${OUT}`)
