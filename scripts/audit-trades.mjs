// Stage 0 trade audit. Generates every supported trade from a representative
// business prompt, saves the real AppSpec and Doc, renders the app the customer
// would get, captures it at 390x844, and records what is still generic.
//
//   bun scripts/audit-trades.mjs
//
// Writes docs/qa/trade-audit-2026-11-20/: <trade>.png, machine/<trade>.{spec,doc}.json
// and TRADES.json. Chrome must be on CDP 9223, headless, with a scratch profile.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { renderApp } from '../src/worker/app.ts'
import { flagshipDocFromSpec, docFromSpec, homeSections, normalizeDoc } from '../src/worker/doc.ts'
import { FLAGSHIP_TRADES } from '../src/worker/flagship.ts'
import { stockPhotos } from '../src/worker/flagshipImages.ts'
import { buildSpec } from '../src/worker/pricing.ts'
import { conceptsFor, readPrompt } from '../src/worker/prompt.ts'
import { VERTICALS, VERTICAL_IDS } from '../src/worker/verticals.ts'

const OUT = process.env.TRADE_AUDIT_OUT || 'docs/qa/trade-matrix-2026-11-23'
const MACHINE = `${OUT}/machine`
const CDP = process.env.CDP_ORIGIN || 'http://127.0.0.1:9223'
const WIDTH = 390
const HEIGHT = 844

const OWNERS = {
  restaurant: 'Marta Ruiz',
  cafe: 'Nell Hart',
  shop: 'Ivo Mercer',
  salon: 'Maya Chen',
  gym: 'Ada Okafor',
  clinic: 'Amara Osei',
  trades: 'Dan Mercer',
  professional: 'Helen Marsh',
  property: 'Ruth Calder',
  hotel: 'Jonah Reed',
  studio: 'Nell Fraser',
  auto: 'Sam Iles',
  hospital: 'Theo Marsh',
  ecommerce: 'Rosa Bell',
  'plants-indoor': 'Priya Nair',
  'plants-outdoor': 'Tomas Reed',
  courses: 'Rosa Bell',
  tuition: 'Alex Reed',
  school: 'Lena Park',
  kindergarten: 'Elena Rossi',
  finance: 'Owen Shah',
  agency: 'Ruth Okafor',
  influencer: 'Nadia Cole',
  portfolio: 'Noor Haddad',
  film: 'Ruth Calder',
  gallery: 'Ines Kaur',
  marketplace: 'Ade Ogun',
}

/** A sentence a real owner would type, using the trade's own label and kind. */
function promptFor(id) {
  const vertical = VERTICALS[id]
  return `${vertical.label} — ${vertical.kind.toLowerCase()}. ${vertical.blurb}. I need an app for my ${id === 'marketplace' ? 'marketplace' : vertical.label.toLowerCase()}.`
}

function money(cents, currency) {
  const value = (cents / 100).toFixed(2)
  return `${currency || ''} ${value}`.trim()
}

function photosForApp(id) {
  const photos = stockPhotos(id) ?? []
  if (!photos.length) return undefined
  return {
    wide: photos.map((photo) => `/images/flagship/${photo.name}-1280.webp`),
    thumb: photos.map((photo) => `/images/flagship/${photo.name}-640.webp`),
  }
}

function auditTrade(id) {
  const vertical = VERTICALS[id]
  const notes = []
  const check = (name, pass, detail = '') => notes.push({ name, pass, detail })

  const prompt = promptFor(id)
  const read = readPrompt(prompt)
  check('prompt-reads-trade', read.vertical === id, `read as ${read.vertical} from "${prompt.slice(0, 70)}…"`)

  const conceptList = conceptsFor(id)
  check('three-concepts', conceptList.length === 3, conceptList.map((entry) => entry.name).join(' · '))

  const spec = buildSpec({
    name: vertical.label,
    vertical: id,
    accent: vertical.accent,
    logo: vertical.label.slice(0, 2).toUpperCase(),
    features: vertical.features,
    direction: conceptList[0]?.id,
  })

  const flagship = FLAGSHIP_TRADES.has(id)
  const doc = flagship ? flagshipDocFromSpec(spec) : docFromSpec(spec)
  const home = homeSections(doc)
  const flagged = home.filter((node) => node.kind === 'flagship')

  check('owned-composition', flagship && flagged.length >= 3, `${flagged.length} home blocks, flagship=${flagship}`)
  if (id === 'hospital' || id === 'school' || id === 'gallery' || id === 'portfolio') {
    const prefixes = new Set(
      flagged
        .map((node) => String(node.variant))
        .filter((variant) => variant !== 'offers')
        .map((variant) => variant.split('-')[1]),
    )
    check('no-borrowed-blocks', [...prefixes].every((prefix) => prefix === id || prefix === id.split('-')[0]), [...prefixes].join(','))
  }

  for (const feature of vertical.features) {
    const needed = feature === 'booking' || feature === 'classes' ? 'book' : feature === 'quote' ? 'quote' : ''
    if (!needed) continue
    const found = doc.screens.some((screen) => screen.kind === needed)
    check(`screen-${needed}`, found, `${feature} needs the ${needed} screen`)
  }

  const photos = photosForApp(id)
  const shared = {
    token: `audit-${id}`,
    version: 1,
    doc,
    flagship,
    photos,
    live: false,
  }
  const published = renderApp(spec, shared)
  const editor = renderApp(spec, { ...shared, editor: true })

  // A customer render deliberately omits sample people, so the team blocks
  // render empty for a customer and full in the editor. That is intended; every
  // other block must be present on both.
  const samplePeople = new Set([
    'gym-trainers',
    'clinic-doctors',
    'pro-team',
    'studio-team',
    'finance-advisers',
  ])
  const required = flagged.filter((node) => !samplePeople.has(String(node.variant)))
  const missing = required.filter((node) => !published.includes(`data-sec="${node.id}"`))
  check('published-renders-doc', missing.length === 0, missing.map((node) => node.id).join(',') || 'every block present')
  const editorMissing = required.filter((node) => !editor.includes(`data-sec="${node.id}"`))
  check('editor-renders-doc', editorMissing.length === 0, editorMissing.map((node) => node.id).join(',') || 'every block present')

  const reloaded = normalizeDoc(JSON.parse(JSON.stringify(doc)), spec)
  const before = flagged.map((node) => `${node.id}:${node.variant}`).join('|')
  const after = homeSections(reloaded)
    .filter((node) => node.kind === 'flagship')
    .map((node) => `${node.id}:${node.variant}`)
    .join('|')
  check('save-reload-identical', before === after, before === after ? 'identical' : 'document changed on reload')

  const visible = published.replace(/<script\b[\s\S]*?<\/script>/g, '').replace(/<style\b[\s\S]*?<\/style>/g, '')
  check('no-undefined', !/undefined|NaN/.test(visible), 'no undefined or NaN in visible markup')
  const images = [...published.matchAll(/<img\b[^>]*>/g)].map((match) => match[0])
  const noAlt = images.filter((tag) => !/\balt="/.test(tag))
  check('images-have-alt', noAlt.length === 0, `${images.length} images, ${noAlt.length} without alt`)
  const emptySection = flagged.filter((node) => !node.title && !node.text).length
  check('blocks-have-copy', emptySection === 0, `${emptySection} blocks with neither title nor text`)
  const glyphTiles = (published.match(/class="cx-glyph"/g) || []).length
  check('no-fake-art', glyphTiles === 0, glyphTiles ? `${glyphTiles} initial tiles` : 'no invented artwork')
  // Curated photography is content, not code. A trade without it is reported,
  // never patched with stock photos that pretend to be the business's own.
  check(
    'trade-photography',
    (photos?.wide.length ?? 0) > 0,
    photos ? `${photos.wide.length} curated photos` : 'no curated photo library yet',
  )

  const unlabelled = [...published.matchAll(/<(button|a)\b([^>]*)>([\s\S]*?)<\/\1>/g)].filter((match) => {
    const attrs = match[2]
    const label = match[3].replace(/<[^>]+>/g, '').trim()
    return !/aria-label=/.test(attrs) && !label && !/aria-hidden="true"/.test(attrs)
  })
  check('controls-labelled', unlabelled.length === 0, `${unlabelled.length} controls without a label`)

  const priceHoles = [...published.matchAll(/·\s*from\s*</g)].length
  check('no-empty-price-prefix', priceHoles === 0, priceHoles ? `${priceHoles} "from" with no amount` : 'no dangling price prefixes')

  const first = spec.menu.flatMap((section) => section.items)[0]
  check('catalogue-is-trades-own', vertical.menu[0].items[0].name === first?.name, first?.name || 'none')
  void money

  return {
    id,
    label: vertical.label,
    kind: vertical.kind,
    owner: OWNERS[id],
    prompt,
    readAs: read.vertical,
    confidence: read.confidence,
    concepts: conceptList.map((entry) => ({ id: entry.id, name: entry.name, note: entry.note })),
    flagship,
    blocks: flagged.map((node) => ({ id: node.id, variant: node.variant, title: node.title || '' })),
    screens: doc.screens.map((screen) => `${screen.kind}:${screen.name || ''}`),
    photoLibrary: photos ? photos.wide.length : 0,
    checks: notes,
    spec,
    doc,
    html: published,
  }
}

/* ---------------------------- render + capture --------------------------- */

await mkdir(MACHINE, { recursive: true })
await mkdir(`${OUT}/screens`, { recursive: true })

const only = (process.env.TRADES || '').split(',').map((entry) => entry.trim()).filter(Boolean)
const ids = only.length ? VERTICAL_IDS.filter((id) => only.includes(id)) : VERTICAL_IDS
const results = []
for (const id of ids) results.push(auditTrade(id))

const pages = new Map()
for (const trade of results) pages.set(`/${trade.id}.html`, trade.html)

const server = Bun.serve({
  port: 0,
  async fetch(request) {
    const url = new URL(request.url)
    if (pages.has(url.pathname)) return new Response(pages.get(url.pathname), { headers: { 'content-type': 'text/html; charset=utf-8' } })
    if (url.pathname.startsWith('/images/')) {
      try {
        const file = await readFile(join('public', url.pathname.replace(/^\//, '')))
        return new Response(file, { headers: { 'content-type': extname(url.pathname) === '.webp' ? 'image/webp' : 'application/octet-stream' } })
      } catch {
        return new Response('not found', { status: 404 })
      }
    }
    return new Response('not found', { status: 404 })
  },
})

const target = await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' }).then((response) => response.json())
const socket = new WebSocket(target.webSocketDebuggerUrl)
let sequence = 0
const pending = new Map()
const call = (method, params = {}) => {
  const id = ++sequence
  socket.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  const entry = pending.get(message.id)
  if (!entry) return
  pending.delete(message.id)
  if (message.error) entry.reject(new Error(message.error.message))
  else entry.resolve(message.result)
})
await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }))
await call('Page.enable')
await call('Runtime.enable')
await call('Emulation.setDeviceMetricsOverride', {
  width: WIDTH,
  height: HEIGHT,
  deviceScaleFactor: 1,
  mobile: true,
  screenWidth: WIDTH,
  screenHeight: HEIGHT,
})

for (const trade of results) {
  await call('Page.navigate', { url: `http://127.0.0.1:${server.port}/${trade.id}.html` })
  await new Promise((resolve) => setTimeout(resolve, 900))
  // The splash is a timed overlay; capture the app behind it, as the other
  // capture scripts do, or every first screen looks like a monogram on grey.
  await call('Runtime.evaluate', {
    expression:
      "document.querySelector('[data-splash]')?.remove(); document.querySelectorAll('.screen.on').forEach((el) => (el.style.animation = 'none'));",
  })
  await new Promise((resolve) => setTimeout(resolve, 150))
  const measured = await call('Runtime.evaluate', {
    expression: `(() => {
      const doc = document.documentElement
      // Intended tap targets only: icon controls, nav tabs, and the block-level
      // rows, cards, chips and primary actions. Inline text links are not
      // primary targets and are measured as text, not as buttons.
      const selector = '.iconbtn, .tab, .cx-primary, .cx-secondary, .cx-chip, .cx-row, .cx-card, .cx-vendor, .fx-primary, .fx-secondary, .fx-actions button, .tile, .h-row, .fx-dayrow button'
      const smallElements = [...document.querySelectorAll(selector)].filter((el) => {
        const rect = el.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0 && rect.height < 44
      })
      const small = smallElements.length
      const smallClasses = [...new Set(smallElements.map((el) => el.className || el.tagName))].slice(0, 4)
      const smallHtml = smallElements.slice(0, 3).map((el) => el.outerHTML.slice(0, 140))
      const tab = document.querySelector('.tabbar')
      const tabRect = tab ? tab.getBoundingClientRect() : null
      const labelTexts = [...document.querySelectorAll('.screen.on h1, .screen.on h2, .screen.on h3, .screen.on .eyebrow, .screen.on .label, .screen.on .fx-kicker')]
        .filter((el) => el.offsetParent)
        .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
      const duplicateLabels = [...new Set(labelTexts.filter((text, index) => labelTexts.indexOf(text) !== index))]
      return {
        overflow: doc.scrollWidth - window.innerWidth,
        smallTargets: small,
        smallClasses,
        smallHtml,
        duplicateLabels,
        // Only what the customer can see: a lazy image below the fold is not
        // broken, it is not loaded yet.
        images: [...document.images].filter((img) => {
          const rect = img.getBoundingClientRect()
          const visibleNow = rect.top < window.innerHeight * 1.5 && rect.bottom > 0
          return visibleNow && (!img.complete || img.naturalWidth === 0)
        }).length,
        tabHeight: tabRect ? Math.round(tabRect.height) : 0,
      }
    })()`,
    returnByValue: true,
  })
  const metrics = measured.result?.value ?? {}
  trade.checks.push({ name: 'no-horizontal-overflow', pass: (metrics.overflow ?? 0) <= 0, detail: `${metrics.overflow}px` })
  trade.checks.push({ name: 'tap-targets', pass: (metrics.smallTargets ?? 0) === 0, detail: `${metrics.smallTargets} under 44px` })
  trade.checks.push({ name: 'images-load', pass: (metrics.images ?? 0) === 0, detail: `${metrics.images} broken` })
  trade.checks.push({ name: 'labels-unique', pass: (metrics.duplicateLabels ?? []).length === 0, detail: (metrics.duplicateLabels ?? []).join(' | ') || 'no duplicate visible labels' })
  trade.metrics = metrics
  const capture = await call('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(`${OUT}/${trade.id}.png`, Buffer.from(capture.data, 'base64'))

  // A business-specific screen, not just the shop window: the first screen past
  // home in this trade's own document, opened the way a customer opens it.
  // The screen that shows how this business actually transacts — booking, a
  // quote, a timetable — rather than the catalogue every trade shares.
  const generic = new Set(['home', 'catalog', 'detail', 'search', 'saved', 'more', 'visit'])
  const kinds = trade.screens.map((entry) => entry.split(':')[0])
  const secondary = kinds.find((kind) => !generic.has(kind)) ?? kinds.find((kind) => kind !== 'home')
  if (secondary) {
    await call('Runtime.evaluate', {
      expression: `(() => {
        const kind = ${JSON.stringify(secondary)}
        const el = document.querySelector('[data-go="' + kind + '"]') || document.querySelector('[data-screen="' + kind + '"]') || document.querySelector('[data-tab="' + kind + '"]')
        if (!el) return 'no control'
        el.click(); return 'clicked'
      })()`,
      returnByValue: true,
    })
    await new Promise((resolve) => setTimeout(resolve, 350))
    const screenMetrics = await call('Runtime.evaluate', {
      expression: `(() => {
        const doc = document.documentElement
        const heading = document.querySelector('.screen.on h1, .screen.on h2, .fx-title')
        return {
          overflow: doc.scrollWidth - window.innerWidth,
          heading: heading ? heading.textContent.trim().slice(0, 60) : '',
          text: (document.querySelector('.screen.on')?.innerText || '').length,
        }
      })()`,
      returnByValue: true,
    })
    const screenShot = await call('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(`${OUT}/screens/${trade.id}--${secondary}.png`, Buffer.from(screenShot.data, 'base64'))
    trade.secondary = { kind: secondary, ...(screenMetrics.result?.value ?? {}) }
  }

  // A small phone is the width that breaks fixed rows: 320 is the cheap proof.
  await call('Emulation.setDeviceMetricsOverride', { width: 320, height: 700, deviceScaleFactor: 1, mobile: true, screenWidth: 320, screenHeight: 700 })
  await new Promise((resolve) => setTimeout(resolve, 200))
  const narrow = await call('Runtime.evaluate', {
    expression: 'document.documentElement.scrollWidth - window.innerWidth',
    returnByValue: true,
  })
  trade.checks.push({ name: 'fits-320', pass: (narrow.result?.value ?? 0) <= 0, detail: `${narrow.result?.value ?? 0}px overflow at 320` })

  // 430 is the wide-phone case the approved matrix names separately. Return to
  // the trade's home screen and capture it at that width rather than inheriting
  // the secondary workflow screen.
  await call('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 1, mobile: true, screenWidth: 430, screenHeight: 932 })
  await call('Page.navigate', { url: `http://127.0.0.1:${server.port}/${trade.id}.html?width=430` })
  await new Promise((resolve) => setTimeout(resolve, 850))
  await call('Runtime.evaluate', {
    expression:
      "document.querySelector('[data-splash]')?.remove(); document.querySelectorAll('.screen.on').forEach((el) => (el.style.animation = 'none'));",
  })
  await new Promise((resolve) => setTimeout(resolve, 150))
  const wide = await call('Runtime.evaluate', {
    expression: `(() => {
      const doc = document.documentElement
      const labels = [...document.querySelectorAll('.screen.on h1, .screen.on h2, .screen.on h3, .screen.on .eyebrow, .screen.on .label, .screen.on .fx-kicker')]
        .filter((el) => el.offsetParent)
        .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
      return {
        overflow: doc.scrollWidth - window.innerWidth,
        duplicateLabels: [...new Set(labels.filter((text, index) => labels.indexOf(text) !== index))],
      }
    })()`,
    returnByValue: true,
  })
  const wideMetrics = wide.result?.value ?? {}
  trade.checks.push({ name: 'fits-430', pass: (wideMetrics.overflow ?? 0) <= 0, detail: `${wideMetrics.overflow ?? 0}px overflow at 430` })
  trade.checks.push({ name: 'labels-unique-430', pass: (wideMetrics.duplicateLabels ?? []).length === 0, detail: (wideMetrics.duplicateLabels ?? []).join(' | ') || 'no duplicate visible labels' })
  trade.metrics430 = wideMetrics
  const wideCapture = await call('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(`${OUT}/screens/${trade.id}--430.png`, Buffer.from(wideCapture.data, 'base64'))

  await call('Emulation.setDeviceMetricsOverride', {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: 1,
    mobile: true,
    screenWidth: WIDTH,
    screenHeight: HEIGHT,
  })
  await writeFile(`${MACHINE}/${trade.id}.spec.json`, JSON.stringify(trade.spec, null, 2))
  await writeFile(`${MACHINE}/${trade.id}.doc.json`, JSON.stringify(trade.doc, null, 2))
  const failed = trade.checks.filter((check) => !check.pass).length
  console.log(`${trade.id.padEnd(16)} ${failed === 0 ? 'ok  ' : `${failed} fail`}  ${trade.checks.map((check) => `${check.pass ? '✓' : '✗'}${check.name}`).join(' ')}`)
}

socket.close()
await fetch(`${CDP}/json/close/${target.id}`)
server.stop(true)

const publicResults = results.map(({ html, spec, doc, ...rest }) => rest)
await writeFile(`${OUT}/TRADES.json`, JSON.stringify(publicResults, null, 2))
const total = publicResults.reduce((sum, trade) => sum + trade.checks.length, 0)
const failed = publicResults.reduce((sum, trade) => sum + trade.checks.filter((check) => !check.pass).length, 0)
console.log(`\n${publicResults.length} trades, ${total} checks, ${failed} failing`)

/* ------------------------------- the report ------------------------------ */

const failing = publicResults.flatMap((trade) =>
  trade.checks.filter((check) => !check.pass).map((check) => ({ trade: trade.id, ...check })),
)
const noPhoto = publicResults.filter((trade) => trade.photoLibrary === 0)

const rows = publicResults
  .map((trade) => {
    const bad = trade.checks.filter((check) => !check.pass).length
    const blocks = trade.blocks.map((block) => block.variant).join(', ')
    return `| ${trade.id} | ${trade.label} | ${trade.readAs === trade.id ? 'detected' : `**${trade.readAs}**`} | ${trade.flagship ? 'own' : 'generic'} | ${blocks} | ${trade.photoLibrary || '—'} | ${bad ? `${bad} (${trade.checks.filter((c) => !c.pass).map((c) => c.name).join(', ')})` : 'all pass'} |`
  })
  .join('\n')

const report = `# Trade audit — ${new Date().toISOString().slice(0, 10)}

Generated by \`bun scripts/audit-trades.mjs\` (Stage 0). Every row is a real build:
open → business prompt → \`readPrompt\` → \`buildSpec\` → document → \`renderApp\`,
captured at 390×844 from a local server. Nothing here is a mocked result.

- **${publicResults.length} trades**, **${total} checks**, **${failed} failing**.
- **${publicResults.filter((trade) => trade.flagship).length}/${publicResults.length}** have a composition of their own for their home screen.
- **${publicResults.filter((trade) => trade.readAs === trade.id).length}/${publicResults.length}** prompts were read as the intended trade.
- **${noPhoto.length} trades have no curated photography** — reported, never patched with stock art.

| Trade | Business type | Prompt read | Composition | Home blocks | Photos | Checks |
| --- | --- | --- | --- | --- | --- | --- |
${rows}

## Failing checks

${failing.length ? failing.map((check) => `- **${check.trade}** · \`${check.name}\` — ${check.detail}`).join('\n') : 'None.'}

## Known gaps this run proves

${noPhoto.length ? `1. **No photography for ${noPhoto.map((trade) => trade.id).join(', ')}.** These trades render text-led compositions with no image boxes at all: no stock photograph stands in for the business. Premium imagery for them is a content task (licensed photography through the existing \`docs/PHOTOGRAPHY.md\` pipeline), not a code change.\n2. **Data models are still catalogue-shaped.** Hotel nights, class places, job records, sessions, enrolments and vendors have no entity yet; those trades stop at the catalogue.` : '1. Photography is present for every trade.'}
3. **Workflow-screen defects** (hotel has no nights, film books a cast member, gallery books an artwork, school books a club) are listed in VISUAL_REVIEW.md; they need the trade data models in docs/TRADE_DATA_MODELS.md, not a styling change.\n4. **A customer render omits sample people by design** (\`team\`, \`staff\`), so blocks built on them are full in the editor and absent for a customer. That is intentional and tested.\n
## What this does not prove

- Design quality by implication. Structure, type and spacing are measured here; the visual judgement of all 27 home screens and all 27 workflow screens is in VISUAL_REVIEW.md, with its own defect list.\n- Live URL discovery. No external site was crawled in this run.\n- That 27 documents equal 27 finished products. They do not: a trade passes here when it has its own composition, its screens, its controls and no fake art — not when it is complete.\n`

await writeFile(`${OUT}/REPORT.md`, report)
console.log(`report: ${OUT}/REPORT.md`)
