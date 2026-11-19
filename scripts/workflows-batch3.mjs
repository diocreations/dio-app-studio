// Batch-3 customer workflows in a real browser, then owner-dashboard checks.
// Each flow drives the shipped app JavaScript: nav taps, field input, submit,
// and the success sheet. Records are read back through the owner API.
import { readFileSync } from 'node:fs'

const ORIGIN = process.env.PLATTR_ORIGIN || 'http://127.0.0.1:8795'
const APPS = ['trades', 'auto', 'ecommerce', 'courses', 'finance']

const tab = await fetch('http://127.0.0.1:9223/json/new?about:blank', { method: 'PUT' }).then((r) =>
  r.json(),
)
const socket = new WebSocket(tab.webSocketDebuggerUrl)
let sequence = 0
const pending = new Map()
function call(method, params = {}) {
  const id = ++sequence
  socket.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (!message.id) return
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
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  mobile: true,
})

const HELPERS = `
  const wait = (fn, ms = 8000) => new Promise((resolve, reject) => {
    const started = Date.now()
    const timer = setInterval(() => {
      let value = false
      try { value = fn() } catch (error) {}
      if (value) { clearInterval(timer); resolve(value) }
      else if (Date.now() - started > ms) { clearInterval(timer); reject(new Error('timeout')) }
    }, 100)
  })
  const tap = (el) => { if (!el) throw new Error('element missing'); el.click(); return true }
  const nav = (label) => tap([...document.querySelectorAll('nav .tab')].find((el) => el.textContent.trim().toLowerCase().includes(label.toLowerCase())))
  const set = (selector, value) => {
    const el = document.querySelector(selector)
    if (!el) throw new Error('missing ' + selector)
    el.value = value
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
`

const FLOWS = {
  trades: `${HELPERS}
    (async () => {
      nav('Quote')
      set('[data-quote-name]', 'Nadia Whitfield')
      set('[data-quote-contact]', 'nadia@example.com')
      set('[data-quote-message]', 'The kitchen tap is dripping under the sink and the boiler is losing pressure.')
      tap(document.querySelector('[data-quote-send]'))
      await wait(() => document.querySelector('[data-note-body] .done'))
      const enquiry = document.querySelector('[data-note-body] .done h2').textContent
      tap(document.querySelector('[data-close-sheet]'))
      nav('Call-out')
      set('[data-book-name]', 'Nadia Whitfield')
      set('[data-book-contact]', '07700 900321')
      const service = document.querySelector('[data-book-service]')
      if (service) service.value = service.options[0].value
      tap(document.querySelector('[data-book]'))
      await wait(() => document.querySelector('[data-note-body] .done'))
      const booking = document.querySelector('[data-note-body] .done h2').textContent
      return { enquiry, booking }
    })()`,
  auto: `${HELPERS}
    (async () => {
      nav('Book')
      set('[data-book-name]', 'Callum Reid')
      set('[data-book-contact]', 'callum@example.com')
      const service = document.querySelector('[data-book-service]')
      if (service) service.value = service.options[1].value
      const slots = document.querySelectorAll('[data-slots] .slot')
      if (slots[2]) slots[2].click()
      tap(document.querySelector('[data-book]'))
      await wait(() => document.querySelector('[data-note-body] .done'))
      return { booking: document.querySelector('[data-note-body] .done h2').textContent }
    })()`,
  ecommerce: `${HELPERS}
    (async () => {
      tap(document.querySelector('[data-add]'))
      tap(document.querySelector('[data-cart-open]'))
      await wait(() => document.querySelector('[data-checkout-name]'))
      set('[data-checkout-name]', 'Imogen Vale')
      set('[data-checkout-contact]', 'imogen@example.com')
      tap(document.querySelector('[data-place]'))
      await wait(() => document.querySelector('[data-cart-done] .done h2'))
      return { order: document.querySelector('[data-cart-done] .done h2').textContent, total: document.querySelector('[data-cart-done] .done p').textContent }
    })()`,
  courses: `${HELPERS}
    (async () => {
      nav('Courses')
      await wait(() => document.querySelector('[data-screen="catalog"].on [data-item]'))
      tap(document.querySelector('[data-screen="catalog"].on [data-item]'))
      await wait(() => document.querySelector('[data-screen="detail"] [data-add]'))
      tap(document.querySelector('[data-screen="detail"] [data-add]'))
      tap(document.querySelector('[data-cart-open]'))
      await wait(() => document.querySelector('[data-checkout-name]'))
      set('[data-checkout-name]', 'Owen Finch')
      set('[data-checkout-contact]', 'owen@example.com')
      tap(document.querySelector('[data-place]'))
      await wait(() => document.querySelector('[data-cart-done] .done h2'))
      return { order: document.querySelector('[data-cart-done] .done h2').textContent, total: document.querySelector('[data-cart-done] .done p').textContent }
    })()`,
  finance: `${HELPERS}
    (async () => {
      nav('Enquiry')
      set('[data-quote-name]', 'Priya Raman')
      set('[data-quote-contact]', 'priya@example.com')
      set('[data-quote-message]', 'I would like a retirement check before the tax year ends.')
      tap(document.querySelector('[data-quote-send]'))
      await wait(() => document.querySelector('[data-note-body] .done'))
      const enquiry = document.querySelector('[data-note-body] .done h2').textContent
      tap(document.querySelector('[data-close-sheet]'))
      nav('Meeting')
      set('[data-book-name]', 'Priya Raman')
      set('[data-book-contact]', '07700 900654')
      tap(document.querySelector('[data-book]'))
      await wait(() => document.querySelector('[data-note-body] .done'))
      const booking = document.querySelector('[data-note-body] .done h2').textContent
      return { enquiry, booking }
    })()`,
}

const results = {}
for (const key of APPS) {
  const record = JSON.parse(readFileSync(`.wrangler/qa-batch3/${key}.json`, 'utf8'))
  await call('Page.navigate', { url: `${ORIGIN}/p/${record.token}/app` })
  await new Promise((resolve) => setTimeout(resolve, 900))
  await call('Runtime.evaluate', { expression: 'localStorage.clear()' })
  await call('Page.navigate', { url: `${ORIGIN}/p/${record.token}/app` })
  await new Promise((resolve) => setTimeout(resolve, 1200))
  const run = await call('Runtime.evaluate', {
    expression: FLOWS[key],
    awaitPromise: true,
    returnByValue: true,
  })
  if (run.exceptionDetails) throw new Error(`${key}: ${run.exceptionDetails.text}`)
  results[key] = run.result.value
  console.log(key, JSON.stringify(results[key]))

  const dashboard = await fetch(`${ORIGIN}/api/projects/${record.token}/dashboard`, {
    headers: { cookie: record.cookie },
  })
  if (!dashboard.ok) throw new Error(`${key} dashboard ${dashboard.status}`)
  const data = await dashboard.json()
  const counts = {
    orders: data.orders?.length ?? 0,
    bookings: data.bookings?.length ?? 0,
    enquiries: data.enquiries?.length ?? 0,
  }
  console.log(`  dashboard ${JSON.stringify(counts)}`, data.bookings?.[0]?.customer?.name ?? data.orders?.[0]?.customer?.name ?? data.enquiries?.[0]?.name ?? '')
  if (!counts.orders && !counts.bookings && !counts.enquiries) throw new Error(`${key} no records`)
}

socket.close()
await fetch(`http://127.0.0.1:9223/json/close/${tab.id}`)
