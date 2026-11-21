/**
 * Synthetic workflow acceptance: retail variants and hotel occupancy.
 *
 *   bun scripts/acceptance-variants.mjs
 *
 * Creates its own isolated local builds from tests/fixtures/retail-variants.json
 * plus one hotel room whose saved record states "Sleeps 2". Nothing is merged
 * into the saved Present & Correct or trade-audit fixtures, and the script does
 * not crawl, pay or deploy.
 *
 * Requires the local Worker at 127.0.0.1:5173 and CDP Chrome at 127.0.0.1:9223.
 * Tokens, cookies and uploaded image ids stay in .chrome-qa/ (untracked); the
 * machine-readable result is written under docs/qa/.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const CDP = process.env.ACCEPTANCE_CDP ?? 'http://127.0.0.1:9223'
const ORIGIN = process.env.ACCEPTANCE_API ?? 'http://127.0.0.1:5173'
const OUT = 'docs/qa/acceptance-2026-11-21'
const STATE = '.chrome-qa/variant-apps.json'
const fixture = JSON.parse(await readFile('tests/fixtures/retail-variants.json', 'utf8'))
await mkdir('.chrome-qa', { recursive: true })
await mkdir(OUT, { recursive: true })

const target = await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' }).then((response) => response.json())
const socket = new WebSocket(target.webSocketDebuggerUrl)
let sequence = 0
const pending = new Map()
const consoleErrors = []
const networkFailures = []
const call = (method, params = {}) => {
  const id = ++sequence
  socket.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error')
    consoleErrors.push(message.params.args?.map((arg) => arg.value ?? arg.description).join(' '))
  if (message.method === 'Runtime.exceptionThrown')
    consoleErrors.push(message.params?.exceptionDetails?.exception?.description ?? 'exception')
  if (message.method === 'Network.loadingFailed' && !message.params?.canceled)
    networkFailures.push(message.params?.errorText ?? 'loadingFailed')
  const entry = pending.get(message.id)
  if (!entry) return
  pending.delete(message.id)
  if (message.error) entry.reject(new Error(message.error.message))
  else entry.resolve(message.result)
})
await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }))
await call('Page.enable')
await call('Runtime.enable')
await call('Network.enable')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const evaluate = async (expression) => {
  const answer = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (answer.exceptionDetails) throw new Error(answer.exceptionDetails.exception?.description ?? 'page error')
  return answer.result?.value
}
const visible = `(node) => node.offsetParent && getComputedStyle(node).visibility !== 'hidden' && node.getClientRects().length`
const click = (selector) =>
  evaluate(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(${visible})
    if (!el) return false
    el.click()
    return true
  })()`)
const clickIn = (screen, selector, text) =>
  evaluate(`(() => {
    const root = document.querySelector('[data-screen="' + ${JSON.stringify(screen)} + '"]')
    if (!root) return false
    const el = [...root.querySelectorAll(${JSON.stringify(selector)})].find(
      (node) => (${visible})(node) && (!${JSON.stringify(text ?? '')} || node.textContent.trim() === ${JSON.stringify(text ?? '')})
    )
    if (!el) return false
    el.click()
    return true
  })()`)
const text = (selector) =>
  evaluate(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(${visible})
    return el ? el.innerText.trim() : ''
  })()`)
const stateOf = (token) => evaluate(`JSON.parse(localStorage.getItem('plattr:v2:${token}') || '{}')`)
const setValue = (selector, value) =>
  evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) return false
    el.value = ${JSON.stringify(value)}
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })()`)

async function open(app, width = 390, height = 844) {
  await call('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 700,
    screenWidth: width,
    screenHeight: height,
  })
  await call('Page.navigate', { url: `${ORIGIN}/p/${app.token}/app?v=${Date.now()}` })
  await sleep(1100)
  await evaluate(`
    document.querySelector('[data-splash]')?.remove();
    document.querySelector('[data-offline]')?.remove();
    document.querySelectorAll('.sheet').forEach((el) => el.classList.remove('on'));
    document.fonts?.ready;
  `)
  await sleep(250)
}

async function searchFor(query) {
  await click('[data-search-open]')
  await sleep(350)
  await setValue('[data-search-input]', query)
  await sleep(500)
  const count = await evaluate(`document.querySelectorAll('[data-search-results] [data-item]').length`)
  await click('[data-search-results] [data-item]')
  await sleep(550)
  return count
}

async function createApp(name, direction, site, visitor) {
  const response = await fetch(`${ORIGIN}/api/projects`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: ORIGIN,
      'cf-connecting-ip': '10.' + (Math.floor(Date.now() / 1000) % 200) + '.' + visitor + '.1',
    },
    body: JSON.stringify({
      name,
      contact: site.phone ?? '',
      email: site.email ?? '',
      vertical: site.vertical ?? 'shop',
      tagline: site.tagline ?? '',
      category: site.kind ?? '',
      accent: site.accent ?? '',
      logo: site.logo ?? '',
      features: site.features ?? ['catalog'],
      platforms: ['pwa'],
      plan: 'onetime',
      direction,
      site,
    }),
  })
  const body = await response.json()
  if (!response.ok) throw new Error(`create failed: ${response.status} ${JSON.stringify(body)}`)
  return { token: body.token, cookie: (response.headers.get('set-cookie') ?? '').split(';')[0] }
}

async function setBrowserCookie(cookie, token) {
  const [name, ...rest] = cookie.split('=')
  await call('Network.setCookie', {
    name,
    value: rest.join('='),
    url: ORIGIN,
    path: '/',
  })
  await call('Page.navigate', { url: `${ORIGIN}/p/${token}/app?v=${Date.now()}` })
  await sleep(1100)
}

/** Upload real WebP media through the app's own editor endpoint, generated in
 *  the page so no image tooling is added to the project. */
async function uploadColour(token, hex, alt) {
  return evaluate(`(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 900
    canvas.height = 900
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = ${JSON.stringify(hex)}
    ctx.fillRect(0, 0, 900, 900)
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.font = 'bold 84px sans-serif'
    ctx.fillText(${JSON.stringify(alt)}, 60, 470)
    const original = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9))

    const small = document.createElement('canvas')
    small.width = 400
    small.height = 400
    small.getContext('2d').drawImage(canvas, 0, 0, 400, 400)
    const variant = await new Promise((resolve) => small.toBlob(resolve, 'image/webp', 0.9))

    const form = new FormData()
    form.append('file', original, 'swatch.webp')
    form.append('variant', variant, 'small.webp')
    form.append('alt', ${JSON.stringify(alt)})
    const response = await fetch('/api/projects/' + ${JSON.stringify(token)} + '/media', { method: 'POST', body: form })
    return { status: response.status, body: await response.json() }
  })()`)
}

const SWATCHES = [
  ['med_aaaaaaaaaaaaaaaa', '#1f2a44', 'Ink'],
  ['med_bbbbbbbbbbbbbbbb', '#e6ddcd', 'Bone'],
  ['med_cccccccccccccccc', '#b46a4c', 'Clay'],
  ['med_dddddddddddddddd', '#5b6342', 'Olive'],
  ['med_eeeeeeeeeeeeeeee', '#1b1b1b', 'Black'],
  ['med_ffffffffffffffff', '#d8c9a7', 'Natural'],
]

function withMedia(ids) {
  const copy = JSON.parse(JSON.stringify(fixture))
  for (const section of copy.menu) {
    for (const item of section.items) {
      if (item.media?.id && ids[item.media.id]) item.media.id = ids[item.media.id]
      for (const variant of item.variants ?? []) {
        if (variant.media?.id && ids[variant.media.id]) variant.media.id = ids[variant.media.id]
      }
    }
  }
  return copy
}

async function saveCatalogue(app, site) {
  const response = await fetch(`${ORIGIN}/api/projects/${app.token}/catalog`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', origin: ORIGIN, cookie: app.cookie },
    body: JSON.stringify({ menu: site.menu, offers: [] }),
  })
  if (!response.ok) throw new Error(`catalogue save failed: ${response.status} ${await response.text()}`)
}

function check(results, name, condition, detail = '') {
  results.push({ name, pass: Boolean(condition), ...(detail ? { detail } : {}) })
  return condition
}

async function uploadSwatches(app) {
  await setBrowserCookie(app.cookie, app.token)
  const ids = {}
  for (const [placeholder, hex, alt] of SWATCHES) {
    const result = await uploadColour(app.token, hex, alt)
    if (![200, 201].includes(result.status) || !result.body?.media?.id)
      throw new Error(`upload ${alt} failed: ${result.status} ${JSON.stringify(result.body)}`)
    ids[placeholder] = result.body.media.id
  }
  return ids
}

async function retailFlow(app, direction, results) {
  await open(app)
  await click('[data-go="catalog"]').catch(() => {})
  await sleep(300)
  const found = await searchFor('Field Shirt')
  check(results, 'shirt found', found > 0, `results=${found}`)

  const groups = await evaluate(`[...document.querySelectorAll('[data-screen="detail"] [data-option-group]')].map((node) => node.dataset.optionGroup)`)
  check(results, 'size and colour groups render', groups.includes('Size') && groups.includes('Colour'), groups.join(','))
  const groupOptions = await evaluate(`[...document.querySelectorAll('[data-screen="detail"] [data-option-value]')].map((node) => node.textContent.trim())`)
  check(results, 'all declared options render', ['S', 'M', 'L', 'Ink', 'Bone', 'Clay'].every((option) => groupOptions.includes(option)), groupOptions.join(','))
  check(results, 'sold-out option is disabled', await evaluate(`[...document.querySelectorAll('[data-option-value]')].find((node) => node.textContent.trim() === 'Clay')?.disabled === true`))

  const initial = await text('[data-detail-body] .price')
  const inkShot = await evaluate(`document.querySelector('[data-screen="detail"] .rd-media img, [data-screen="detail"] .detail-band img')?.getAttribute('src') ?? ''`)
  check(results, 'initial combination price', initial.includes('42'), initial)

  await clickIn('detail', '[data-option-value]', 'Bone')
  const boneShot = await evaluate(`document.querySelector('[data-screen="detail"] .rd-media img, [data-screen="detail"] .detail-band img')?.getAttribute('src') ?? ''`)
  const bonePrice = await text('[data-detail-body] .price')
  check(results, 'variant photo changes with the colour', boneShot && boneShot !== inkShot && boneShot.includes(app.ids.med_bbbbbbbbbbbbbbbb), `${inkShot} -> ${boneShot}`)
  check(results, 'variant combination price changes', bonePrice !== initial && bonePrice.includes('44'), `${initial} -> ${bonePrice}`)

  await clickIn('detail', '[data-option-value]', 'L')
  await sleep(250)
  const largePrice = await text('[data-detail-body] .price')
  check(results, 'each combination keeps its own price', largePrice.includes('46'), largePrice)

  await clickIn('detail', '[data-add]')
  await sleep(300)
  await click('[data-cart-open]')
  await sleep(450)
  const cart = await text('[data-cart]')
  const totals = await text('[data-totals]')
  check(results, 'structured combination reaches the cart', cart.includes('L / Bone') && totals.includes('46'), `${cart.split('\n').slice(0, 4).join(' | ')} / ${totals}`)

  await open(app)
  await click('[data-go="catalog"]').catch(() => {})
  await sleep(300)
  await searchFor('Field Trouser')
  const trouserGroups = await evaluate(`[...new Set([...document.querySelectorAll('[data-screen="detail"] [data-option-value]')].map((node) => node.dataset.optionGroup))]`)
  check(results, 'the second option matrix renders', trouserGroups.includes('Waist') && trouserGroups.includes('Colour'), trouserGroups.join(','))
  await clickIn('detail', '[data-option-value]', '32')
  await sleep(250)
  await clickIn('detail', '[data-option-value]', 'Black')
  await sleep(350)
  const missingPrice = await text('[data-detail-body] .price')
  const awaiting = await evaluate(`(() => {
    const button = [...document.querySelectorAll('[data-screen="detail"] button')].find((node) => node.textContent.trim() === 'Select options')
    return button ? { disabled: button.disabled, visible: ${visible}(button) } : null
  })()`)
  check(results, 'missing combination is not priced', missingPrice === '', missingPrice)
  check(results, 'missing combination cannot be added', awaiting?.visible && awaiting.disabled, JSON.stringify(awaiting))

  await open(app)
  await click('[data-go="catalog"]').catch(() => {})
  await sleep(300)
  await searchFor('Canvas Tote')
  const flat = await evaluate(`[...document.querySelectorAll('[data-screen="detail"] [data-variant]')].map((node) => ({ label: node.innerText.trim(), disabled: node.disabled, pressed: node.getAttribute('aria-pressed') }))`)
  check(results, 'legacy flat variants render', flat.length === 2, JSON.stringify(flat))
  check(results, 'sold-out flat variant is disabled', flat.some((variant) => variant.label.includes('Black') && variant.disabled))
  check(results, 'legacy flat price stays real', (await text('[data-detail-body] .price')).includes('18'), await text('[data-detail-body] .price'))
}

const hotelSpec = {
  name: 'Harbour Rooms',
  kind: 'Small hotel',
  tagline: 'Three rooms above the harbour.',
  phone: '555 0199',
  email: 'stay@harbour.example',
  vertical: 'hotel',
  features: ['catalog', 'booking'],
  currency: 'GBP',
  accent: '#2f4f6a',
  logo: 'HR',
  menu: [
    {
      name: 'Rooms',
      items: [
        {
          name: 'Cabin',
          desc: 'Sleeps 2 · sea view',
          price: 18000,
          meta: 'per night',
        },
        {
          name: 'Loft',
          desc: 'Roll-top bath · no stated capacity',
          price: 26000,
          meta: 'per night',
        },
      ],
    },
  ],
}

async function hotelFlow(app, results) {
  await open(app)
  await click('[data-go="catalog"]').catch(() => {})
  await sleep(300)
  await searchFor('Cabin')
  const detail = await text('[data-detail-body]')
  check(results, 'room detail opens', detail.includes('Cabin'))
  await clickIn('detail', '[data-go="book"]')
  await sleep(500)
  const bookingCopy = await text('[data-screen="book"]')
  check(results, 'booking form discloses the availability limit', bookingCopy.includes('No live availability'), bookingCopy.replace(/\s+/g, ' ').slice(0, 180))
  await sleep(500)
  const days = (offset) => {
    const date = new Date()
    date.setDate(date.getDate() + offset)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }
  await setValue('[data-checkin]', days(2))
  await setValue('[data-checkout]', days(4))
  await setValue('[data-book-name]', 'Maya Rao')
  await setValue('[data-book-contact]', 'maya@example.com')
  const defaultParty = await text('[data-party-value]')
  check(results, 'room party starts at two', defaultParty === '2', defaultParty)

  await evaluate(`document.querySelector('[data-party="1"]')?.click()`)
  await sleep(250)
  await click('[data-book]')
  await sleep(1200)
  const toast = await evaluate(`document.querySelector('[data-toast]')?.textContent ?? ''`)
  const rejected = await stateOf(app.token)
  check(results, 'party above the stated capacity is refused', toast.toLowerCase().includes('sleeps 2'), toast)
  check(results, 'refused party writes no booking', (rejected.bookings ?? []).length === 0, String((rejected.bookings ?? []).length))

  await evaluate(`document.querySelector('[data-party="-1"]')?.click()`)
  await sleep(250)
  await click('[data-book]')
  await sleep(1600)
  const confirmation = await text('[data-note-body]')
  const state = await stateOf(app.token)
  const dashboard = await fetch(`${ORIGIN}/api/projects/${app.token}/dashboard`, { headers: { cookie: app.cookie } }).then((response) => response.json())
  check(results, 'booking is described as a request', confirmation.includes('not a confirmed reservation'), confirmation.replace(/\s+/g, ' ').slice(0, 160))
  check(results, 'accepted booking is recorded once', (state.bookings ?? []).length === 1, String((state.bookings ?? []).length))
  check(results, 'dashboard records the request', (dashboard.bookings ?? []).length === 1, String((dashboard.bookings ?? []).length))
  check(results, 'stay total uses server nights', confirmation.includes('360'), confirmation)
  check(results, 'no availability promise is made', !/available/i.test(confirmation), confirmation)
}

const report = { generatedAt: new Date().toISOString(), retail: [], hotel: null }
let visitor = 1

for (const direction of ['minimal', 'editorial', 'lifestyle']) {
  const site = { ...fixture, vertical: 'shop' }
  const app = await createApp(fixture.name, direction, site, visitor++)
  app.direction = direction
  app.ids = await uploadSwatches(app)
  await saveCatalogue(app, withMedia(app.ids))
  const results = []
  try {
    await retailFlow(app, direction, results)
    console.log(`shop/${direction}: ${results.filter((entry) => entry.pass).length}/${results.length} checks`)
  } catch (error) {
    results.push({ name: 'flow completed', pass: false, detail: error.message })
    console.log(`shop/${direction}: FAILED ${error.message}`)
  }
  report.retail.push({ direction, token: app.token, checks: results })
}

const hotel = await createApp(hotelSpec.name, 'minimal', hotelSpec, visitor++)
hotel.ids = {}
const hotelResults = []
try {
  await hotelFlow(hotel, hotelResults)
  console.log(`hotel/occupancy: ${hotelResults.filter((entry) => entry.pass).length}/${hotelResults.length} checks`)
} catch (error) {
  hotelResults.push({ name: 'flow completed', pass: false, detail: error.message })
  console.log(`hotel/occupancy: FAILED ${error.message}`)
}
report.hotel = { token: hotel.token, checks: hotelResults }

const failures = [...report.retail.flatMap((entry) => entry.checks), ...hotelResults].filter((entry) => !entry.pass)
report.failures = failures
report.consoleErrors = consoleErrors
report.networkFailures = networkFailures
await writeFile(`${OUT}/variants-occupancy.json`, JSON.stringify(report, null, 1))
await writeFile(
  STATE,
  JSON.stringify(
    { retail: report.retail.map((entry) => entry.token), hotel: hotel.token },
    null,
    1,
  ),
)
console.log(`${failures.length ? failures.length + ' failed checks' : 'all checks passed'} -> ${OUT}/variants-occupancy.json`)
if (failures.length || consoleErrors.length || networkFailures.length) process.exitCode = 1
socket.close()
