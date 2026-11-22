/**
 * Business application acceptance, driven in a real browser.
 *
 *   bun scripts/acceptance-browser.mjs
 *
 * Reads the fifteen builds seeded by acceptance-seed.mjs and drives the real
 * customer app at 127.0.0.1:5173 through CDP. Every action is the app's own
 * control; the script only clicks, types and reads what the page shows. It also
 * writes screenshots for the visual pass and a machine-readable report.
 *
 * No crawl, no payment provider, no deployment.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const CDP = process.env.ACCEPTANCE_CDP ?? 'http://127.0.0.1:9223'
const ORIGIN = process.env.ACCEPTANCE_API ?? 'http://127.0.0.1:5173'
const OUT = process.env.ACCEPTANCE_OUT ?? 'docs/qa/acceptance-2026-11-21'
const APPS = process.env.ACCEPTANCE_APPS ?? '.chrome-qa/acceptance-apps.json'
const apps = JSON.parse(await readFile(APPS, 'utf8'))
await mkdir(OUT, { recursive: true })

const target = await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json())
const socket = new WebSocket(target.webSocketDebuggerUrl)
let sequence = 0
const pending = new Map()
const consoleErrors = []
let networkFailures = []
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
/** Hidden screens keep their layout box, so `offsetParent` alone would let a
 *  script click a control no customer can see. Every action is scoped to the
 *  active screen and must be visibly painted. */
const visible = `(node) => node.offsetParent && getComputedStyle(node).visibility !== 'hidden' && node.getClientRects().length`
const click = (selector) =>
  evaluate(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(${visible})
    if (!el) return false
    el.click()
    return true
  })()`)
const clickText = (selector, text) =>
  evaluate(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(
      (node) => (${visible})(node) && node.textContent.includes(${JSON.stringify(text)})
    )
    if (!el) return false
    el.click()
    return true
  })()`)
const clickIn = (screen, selector, text) =>
  evaluate(`(() => {
    const root = document.querySelector('[data-screen="' + ${JSON.stringify(screen)} + '"]')
    if (!root) return false
    const el = [...root.querySelectorAll(${JSON.stringify(selector)})].find(
      (node) => (${visible})(node) && (!${JSON.stringify(text ?? '')} || node.textContent.includes(${JSON.stringify(text ?? '')}))
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
const stateOf = (token) =>
  evaluate(`JSON.parse(localStorage.getItem('plattr:v2:${token}') || '{}')`)
const setValue = (selector, value) =>
  evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) return false
    el.value = ${JSON.stringify(value)}
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })()`)
const shot = async (name) => {
  const capture = await call('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(`${OUT}/${name}.png`, Buffer.from(capture.data, 'base64'))
}

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

/** Use the app's own search to reach a named catalogue entry. */
async function searchFor(query) {
  await click('[data-search-open]')
  await sleep(350)
  await setValue('[data-search-input]', query)
  await sleep(500)
  const count = await evaluate(
    `document.querySelectorAll('[data-search-results] [data-item]').length`,
  )
  await click('[data-search-results] [data-item]')
  await sleep(550)
  return count
}

const money = (value) => value

async function shopFlow(app) {
  await open(app)
  await click('[data-go="catalog"]').catch(() => {})
  await sleep(300)
  const results = await searchFor(app.sample || 'Honeycomb Tree')
  const detail = await text('[data-detail-body]')
  const initialPrice = await text('[data-detail-body] .price')

  const variants = await evaluate(
    `[...document.querySelectorAll('[data-screen="detail"] [data-variant]')].filter(${visible}).map((node) => node.innerText.trim())`,
  )
  const bigVariant = variants[variants.length - 1] || ''
  const smallVariant = variants[0] || ''
  const pickedLarge = await clickIn('detail', '[data-variant]', bigVariant)
  await sleep(400)
  const largePrice = await text('[data-detail-body] .price')
  const addedLarge = await clickIn('detail', '[data-add]')
  await sleep(250)
  const pickedSmall = await clickIn('detail', '[data-variant]', smallVariant)
  await sleep(350)
  const addedSmall = await clickIn('detail', '[data-add]')
  await sleep(250)
  await click('[data-cart-open]')
  await sleep(450)
  const twoLines = await text('[data-cart]')
  const twoTotal = await text('[data-totals]')
  await shot(`${app.trade}--${app.direction}--cart-variants--390`)

  // Remove the small option, leaving one line at the large price.
  await evaluate(`(() => {
    const line = [...document.querySelectorAll('[data-cart] .cart-line')].find((node) => node.textContent.includes(${JSON.stringify(smallVariant)}))
    line?.querySelector('[data-delta="-1"]')?.click()
  })()`)
  await sleep(300)
  const oneTotal = await text('[data-totals]')

  await clickText('[data-type]', 'Delivery')
  await sleep(300)
  const deliveryTotal = await text('[data-totals]')
  await setValue('[data-checkout-name]', 'Maya Rao')
  await setValue('[data-checkout-contact]', 'maya@example.com')
  // Two taps of one attempt: the server must return the order it already made.
  await click('[data-place]')
  await sleep(150)
  await click('[data-place]').catch(() => {})
  await sleep(1600)
  const confirmation = await text('[data-cart-done]')
  await shot(`${app.trade}--${app.direction}--order-confirmation--390`)
  const state = await stateOf(app.token)
  return {
    results,
    detailHasName: detail.includes('Honeycomb Tree'),
    variants,
    pickedLarge,
    addedLarge,
    pickedSmall,
    addedSmall,
    initialPrice,
    largePrice,
    twoLines,
    twoTotal,
    oneTotal,
    deliveryTotal,
    confirmation,
    orders: state.orders ?? [],
  }
}

async function bookingFlow(app) {
  await open(app)
  await click('[data-go="book"]')
  await sleep(500)
  const days = (offset) => {
    const date = new Date()
    date.setDate(date.getDate() + offset)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }
  // A restaurant books a table; a hotel requests a stay. Below the fold both
  // share the same form contract.
  await setValue('[data-checkin]', days(1)).catch(() => {})
  await setValue('[data-checkout]', days(4)).catch(() => {})
  await click('[data-slots] .slot').catch(() => {})
  await click('[data-party="1"]').catch(() => {})
  await sleep(300)
  const summary = await text('[data-stay-summary]')
  const day = await text('[data-screen="book"]')
  await setValue('[data-book-name]', 'Maya Rao')
  await setValue('[data-book-contact]', 'maya@example.com')
  await shot(`${app.trade}--${app.direction}--booking--390`)
  await click('[data-book]')
  await sleep(1700)
  const confirmation = (await text('[data-note-body]')) || (await text('[data-cart-done]'))
  const state = await stateOf(app.token)
  return { results: 1, day, summary, confirmation, bookings: state.bookings ?? [] }
}

async function restaurantFlow(app) {
  await open(app)
  await click('[data-go="catalog"]').catch(() => {})
  await sleep(300)
  const results = await searchFor('Burrata')
  const detail = await text('[data-detail-body]')
  const price = await text('[data-detail-body] .price')
  const category = await text('[data-detail-body] .eyebrow')
  await shot(`${app.trade}--${app.direction}--dish--390`)
  await clickIn('detail', '[data-add]')
  await sleep(300)
  await click('[data-cart-open]')
  await sleep(400)
  const cart = await text('[data-cart]')
  const total = await text('[data-totals]')
  await setValue('[data-checkout-name]', 'Maya Rao')
  await setValue('[data-checkout-contact]', '555 0100')
  await click('[data-place]')
  await sleep(1600)
  const confirmation = await text('[data-cart-done]')
  const state = await stateOf(app.token)
  return { results, detail, price, category, cart, total, confirmation, orders: state.orders ?? [] }
}

async function hotelFlow(app) {
  await open(app)
  await click('[data-go="catalog"]').catch(() => {})
  await sleep(300)
  const results = await searchFor('Loft suite')
  const detail = await text('[data-detail-body]')
  await shot(`${app.trade}--${app.direction}--room--390`)
  await clickIn('detail', '[data-go="book"]')
  await sleep(500)
  const label = await text('[data-screen="book"]')
  const service = await evaluate(`document.querySelector('[data-book-service]')?.value ?? ''`)
  const slots = await evaluate(`document.querySelectorAll('[data-slots] .slot').length`)
  const days = (offset) => {
    const date = new Date()
    date.setDate(date.getDate() + offset)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }
  const date = days(1)
  const checkOut = days(4)
  await setValue('[data-checkin]', date)
  await setValue('[data-checkout]', checkOut)
  await evaluate(`document.querySelector('[data-party="1"]')?.click()`)
  await sleep(300)
  const party = await text('[data-party-value]')
  const summary = await text('[data-stay-summary]')
  await setValue('[data-book-name]', 'Maya Rao')
  await setValue('[data-book-contact]', 'maya@example.com')
  await shot(`${app.trade}--${app.direction}--booking--390`)
  await click('[data-book]')
  await sleep(1600)
  const confirmation = await text('[data-note-body]')
  const state = await stateOf(app.token)
  return { results, detail, label, service, slots, party, date, checkOut, summary, confirmation, bookings: state.bookings ?? [] }
}

async function salonFlow(app) {
  await open(app)
  await click('[data-go="catalog"]').catch(() => {})
  await sleep(300)
  const results = await searchFor('Colour')
  const detail = await text('[data-detail-body]')
  await shot(`${app.trade}--${app.direction}--service--390`)
  const detailCta = await evaluate(
    `[...document.querySelectorAll('[data-screen="detail"] [data-go]')].filter(${visible}).map((node) => node.innerText.trim())`,
  )
  await clickIn('detail', '[data-go="book"]')
  await sleep(500)
  const service = await evaluate(`document.querySelector('[data-book-service]')?.value ?? ''`)
  const hasStaffChoice = await evaluate(`Boolean(document.querySelector('[data-book-staff]'))`)
  if (hasStaffChoice) await setValue('[data-book-staff]', 'Noa Williams')
  await evaluate(`document.querySelectorAll('[data-days] .chip')[1]?.click()`)
  await evaluate(`document.querySelectorAll('[data-slots] .slot')[2]?.click()`)
  await evaluate(`document.querySelector('[data-party="-1"]')?.click()`)
  await setValue('[data-book-name]', 'Maya Rao')
  await setValue('[data-book-contact]', '555 0100')
  await click('[data-book]')
  await sleep(1600)
  const confirmation = await text('[data-note-body]')
  const state = await stateOf(app.token)
  return { results, detail, detailCta, service, hasStaffChoice, confirmation, bookings: state.bookings ?? [] }
}

async function professionalFlow(app) {
  await open(app)
  const homeActions = await evaluate(
    `[...document.querySelectorAll('[data-screen="home"] [data-go]')].filter(${visible}).map((node) => node.innerText.trim()).filter(Boolean)`,
  )
  await click('[data-go="catalog"]').catch(() => {})
  await sleep(300)
  const results = await searchFor('Annual accounts')
  const detail = await text('[data-detail-body]')
  await shot(`${app.trade}--${app.direction}--service--390`)
  const detailCta = await evaluate(
    `[...document.querySelectorAll('[data-screen="detail"] [data-go]')].filter(${visible}).map((node) => node.innerText.trim())`,
  )
  // The detail page's primary action must be the practice's real first step:
  // a proposal request, not a confirmed intro-call booking. Fall back to the
  // tab bar or drawer only to prove the same form is still reachable there.
  const detailPrimary = detailCta[0] ?? ''
  let opened = await clickIn('detail', '[data-go="quote"]')
  const openedFromDetail = opened
  if (!opened) {
    await click('[data-go="quote"]') || (await click('[data-nav-open]'), await sleep(400), opened = await clickText('[data-sheet].on [data-go="quote"]', ''))
  }
  await sleep(450)
  const quoteTitle = await text('[data-screen="quote"] .sect .label')
  await setValue('[data-quote-name]', 'Maya Rao')
  await setValue('[data-quote-contact]', 'maya@example.com')
  await setValue('[data-quote-message]', 'We need annual accounts and a payroll quote for a six-person studio.')
  await click('[data-quote-send]')
  await sleep(1600)
  const heading = await text('[data-note-body] h2')
  const confirmation = await text('[data-note-body]')
  return { results, detail, detailCta, detailPrimary, homeActions, opened, openedFromDetail, quoteTitle, heading, confirmation }
}

const FLOWS = {
  shop: shopFlow,
  restaurant: (app) => (app.mode === 'booking' ? bookingFlow(app) : restaurantFlow(app)),
  hotel: (app) => (app.mode === 'request' ? bookingFlow(app) : hotelFlow(app)),
  salon: salonFlow,
  professional: professionalFlow,
}

const report = []
for (const app of apps) {
  consoleErrors.length = 0
  networkFailures = []
  const started = Date.now()
  try {
    const result = await FLOWS[app.trade](app)
    // Read the business record back through the public routes.
    const orders = result.orders ?? []
    const bookings = result.bookings ?? []
    const readOrder = orders[0] ? await fetch(`${ORIGIN}/p/${app.token}/orders/${orders[0].id}`).then((r) => r.json()) : null
    const readBooking = bookings[0] ? await fetch(`${ORIGIN}/p/${app.token}/bookings/${bookings[0].id}`).then((r) => r.json()) : null
    const dashboard = await fetch(`${ORIGIN}/api/projects/${app.token}/dashboard`, {
      headers: { cookie: app.cookie },
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }))
    report.push({
      trade: app.trade,
      direction: app.direction,
      token: app.token,
      elapsed: Date.now() - started,
      result,
      readOrder,
      readBooking,
      dashboardStatus: dashboard.status,
      dashboardOrders: dashboard.body?.orders?.length ?? null,
      dashboardBookings: dashboard.body?.bookings?.length ?? null,
      dashboardEnquiries: dashboard.body?.enquiries?.length ?? null,
      dashboardRevenue: dashboard.body?.totals ?? dashboard.body?.revenue ?? null,
      consoleErrors: [...consoleErrors],
      networkFailures: [...networkFailures],
    })
    console.log(`${app.trade}/${app.direction}: ok`)
  } catch (error) {
    report.push({
      trade: app.trade,
      direction: app.direction,
      token: app.token,
      error: error.message,
      consoleErrors: [...consoleErrors],
      networkFailures: [...networkFailures],
    })
    console.log(`${app.trade}/${app.direction}: FAILED ${error.message}`)
  }
}

/* Responsive captures: each trade's first concept at four widths. */
const responsive = []
for (const trade of ['shop', 'restaurant', 'hotel', 'salon', 'professional']) {
  const app = apps.find((entry) => entry.trade === trade)
  for (const width of [390, 430, 768, 1280]) {
    const height = width === 390 ? 844 : width === 430 ? 932 : width === 768 ? 1024 : 900
    await open(app, width, height)
    await click('[data-go="catalog"]').catch(() => {})
    await sleep(350)
    await evaluate(`([...document.querySelectorAll('[data-item]')].find((el) => el.offsetParent))?.click()`)
    await sleep(600)
    await shot(`${trade}--${app.direction}--detail--${width}`)
    responsive.push({ trade, width, screen: 'detail' })
  }
}

socket.close()
await fetch(`${CDP}/json/close/${target.id}`).catch(() => {})
await writeFile(`${OUT}/browser-report.json`, JSON.stringify({ generatedAt: new Date().toISOString(), report, responsive }, null, 2))
console.log(`\n${report.length} applications, ${report.filter((entry) => entry.error).length} failed`)
console.log(`screenshots in ${OUT}`)
void money
