#!/usr/bin/env bun
/**
 * Controlled-pilot acceptance for the four eligible trades.
 *
 * Uses the clean saved-evidence builds only; it never crawls, creates business
 * content or touches production. One representative per trade completes the
 * customer workflow the trade promises, then the owner dashboard is read with
 * that build's owner session.
 *
 *   PILOT_APPS=.chrome-qa/pilot-clean-apps-v5.json bun scripts/pilot-acceptance.mjs
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const CDP = process.env.PILOT_CDP ?? 'http://127.0.0.1:9223'
const ORIGIN = process.env.PILOT_ORIGIN ?? 'http://127.0.0.1:5173'
const OUT = process.env.PILOT_OUT ?? 'docs/qa/controlled-pilot-2026-11-22/acceptance'
const APPS = JSON.parse(
  await readFile(process.env.PILOT_APPS ?? '.chrome-qa/pilot-clean-apps-v5.json', 'utf8'),
)
await mkdir(OUT, { recursive: true })

const selected = {
  shop: ['yarmouth', 'editorial'],
  restaurant: ['padella', 'editorial'],
  salon: ['bluetit', 'editorial'],
  professional: ['afl', 'classic'],
}
const appFor = (site, direction) => APPS.find((app) => app.site === site && app.direction === direction)

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
await call('Network.setCacheDisabled', { cacheDisabled: true })
await call('Storage.clearDataForOrigin', { origin: ORIGIN, storageTypes: 'service_workers,cache_storage' })

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const evaluate = async (expression) => {
  const answer = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (answer.exceptionDetails) throw new Error(answer.exceptionDetails.exception?.description ?? 'page error')
  return answer.result?.value
}
const visible = `(el) => el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'`
const click = (selector) =>
  evaluate(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(${visible}); if (!el) return false; el.click(); return true })()`)
const clickIn = (screen, selector) =>
  evaluate(`(() => { const root = document.querySelector('[data-screen="' + ${JSON.stringify(screen)} + '"]'); const el = [...(root?.querySelectorAll(${JSON.stringify(selector)}) || [])].find(${visible}); if (!el) return false; el.click(); return true })()`)
const setValue = (selector, value) =>
  evaluate(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(${visible});
    if (!el) return false;
    el.focus();
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`)
const text = (selector) =>
  evaluate(`(document.querySelector(${JSON.stringify(selector)})?.innerText || '').trim()`)
const shot = async (name) => {
  const capture = await call('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(`${OUT}/${name}.png`, Buffer.from(capture.data, 'base64'))
}
const open = async (app, width = 390, height = 844) => {
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
    localStorage.clear(); sessionStorage.clear();
    document.querySelector('[data-splash]')?.remove();
    document.querySelector('[data-offline]')?.remove();
    document.querySelectorAll('.sheet').forEach((el) => el.classList.remove('on'));
  `)
  await sleep(250)
}
const dashboard = async (app) => {
  const response = await fetch(`${ORIGIN}/api/projects/${app.token}/dashboard`, {
    headers: { Cookie: app.cookie },
  })
  const body = await response.json().catch(() => ({}))
  return {
    status: response.status,
    orders: body.orders?.length ?? null,
    bookings: body.bookings?.length ?? null,
    enquiries: body.enquiries?.length ?? null,
    app: body.project?.name ?? body.name ?? null,
  }
}
const stateOf = (token) =>
  evaluate(`JSON.parse(localStorage.getItem('plattr:${token}') || '{}')`)

const report = []
for (const [trade, [site, direction]] of Object.entries(selected)) {
  const app = appFor(site, direction)
  if (!app) throw new Error(`missing ${site}/${direction}`)
  const before = await dashboard(app)
  const entry = { trade, site, direction, token: app.token, before, concepts: [] }
  try {
    // Discovery and all three compositions render from the saved document.
    for (const concept of APPS.filter((candidate) => candidate.site === site)) {
      const response = await fetch(`${ORIGIN}/p/${concept.token}/app`)
      const html = await response.text()
      entry.concepts.push({
        direction: concept.direction,
        status: response.status,
        concept: /<body[^>]*data-concept="([^"]+)"/.exec(html)?.[1] ?? null,
        hasStructuredData: html.includes('window.__PLATTR_DATA__'),
      })
    }

    await open(app)
    await shot(`${trade}--home--390`)
    if (trade === 'shop') {
      await click('[data-go="catalog"]')
      await sleep(350)
      const opened = await evaluate(`(() => { const el = document.querySelector('.screen.on [data-item]'); if (!el) return false; el.click(); return true })()`)
      if (!opened) throw new Error('no retail item opened')
      await sleep(450)
      const name = await text('[data-detail-body] h1')
      await clickIn('detail', '[data-add]')
      await sleep(300)
      await click('[data-cart-open]')
      await sleep(400)
      const cart = await text('[data-cart]')
      await setValue('[data-checkout-name]', 'Pilot Retail')
      await setValue('[data-checkout-contact]', 'pilot-retail@example.com')
      await click('[data-place]')
      await sleep(1500)
      entry.workflow = { name, cart, confirmation: await text('[data-cart-done]'), state: await stateOf(app.token) }
      await shot(`${trade}--confirmation--390`)
    } else if (trade === 'restaurant' || trade === 'salon') {
      if (trade === 'salon') {
        await click('[data-go="catalog"]')
        await sleep(350)
        await evaluate(`document.querySelector('.screen.on [data-item]')?.click()`)
        await sleep(450)
        await shot(`${trade}--detail--390`)
        await clickIn('detail', '[data-go="book"]').catch(() => {})
        await sleep(450)
      }
      const opened = await click('[data-go="book"]')
      if (!opened) throw new Error('booking screen not reachable')
      await sleep(450)
      await evaluate(`document.querySelectorAll('[data-days] .chip')[1]?.click()`)
      await evaluate(`document.querySelectorAll('[data-slots] .slot')[1]?.click()`)
      await setValue('[data-book-name]', 'Pilot Guest')
      await setValue('[data-book-contact]', 'pilot-guest@example.com')
      await click('[data-book]')
      await sleep(1600)
      entry.workflow = { confirmation: await text('[data-note-body]'), state: await stateOf(app.token) }
      await shot(`${trade}--confirmation--390`)
    } else {
      const opened = await click('[data-go="quote"]')
      if (!opened) throw new Error('proposal request not reachable')
      await sleep(450)
      await setValue('[data-quote-name]', 'Pilot Client')
      await setValue('[data-quote-contact]', 'pilot-client@example.com')
      await setValue('[data-quote-message]', 'Please quote for a small project this month.')
      await click('[data-quote-send]')
      await sleep(1600)
      entry.workflow = { heading: await text('[data-note-body] h2'), confirmation: await text('[data-note-body]') }
      await shot(`${trade}--confirmation--390`)
    }
    const after = await dashboard(app)
    entry.after = after
    entry.ownerDashboard = after.status === 200
    entry.dashboardRecorded =
      trade === 'shop'
        ? (after.orders ?? 0) > (before.orders ?? 0)
        : trade === 'professional'
          ? (after.enquiries ?? 0) > (before.enquiries ?? 0)
          : (after.bookings ?? 0) > (before.bookings ?? 0)
    entry.ok =
      entry.concepts.length === 3 &&
      entry.concepts.every((concept) => concept.status === 200) &&
      entry.ownerDashboard &&
      entry.dashboardRecorded
  } catch (error) {
    entry.error = error.message
    entry.ok = false
  }
  report.push(entry)
  console.log(`${trade}: ${entry.ok ? 'ok' : 'FAILED'}${entry.error ? ' · ' + entry.error : ''}`)
}

await writeFile(
  `${OUT}/pilot-acceptance.json`,
  JSON.stringify(
    { generatedAt: new Date().toISOString(), origin: ORIGIN, report, consoleErrors, networkFailures },
    null,
    2,
  ),
)
console.log(`\n${report.filter((entry) => entry.ok).length}/${report.length} trades accepted`)
socket.close()
await fetch(`${CDP}/json/close/${target.id}`).catch(() => {})
