#!/usr/bin/env bun
/**
 * Trade-specific smoke check for the hotel benchmark app: can a room be added
 * without stay dates, and is there a date-aware booking surface?
 */
import { writeFile } from 'node:fs/promises'

const CDP = 'http://127.0.0.1:9223'
const ORIGIN = 'http://127.0.0.1:5173'
const token = 'b2b50193683a82f40d25ecd5'
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
await call('Page.enable'); await call('Runtime.enable')
await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 })
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const evaluate = async (expression) => {
  const answer = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (answer.exceptionDetails) throw new Error(answer.exceptionDetails.exception?.description ?? answer.exceptionDetails.text)
  return answer.result?.value
}
await call('Page.navigate', { url: `${ORIGIN}/p/${token}/app` })
await sleep(1300)
await evaluate('localStorage.clear(); sessionStorage.clear()')
await call('Page.reload')
await sleep(1300)
await evaluate(`document.querySelector('[data-splash]')?.remove(); document.querySelector('[data-offline]')?.remove()`)
const data = await evaluate(`(() => {
  const text = document.documentElement.innerHTML
  const match = text.match(/window\\.__PLATTR_DATA__=(\\{.*?\\});<\\/script>/s)
  return { booking: window.__PLATTR_DATA__?.booking ?? null, ordering: window.__PLATTR_DATA__?.ordering ?? null, vertical: window.__PLATTR_DATA__?.vertical ?? null, addLabel: window.__PLATTR_DATA__?.addLabel ?? null, hasData: Boolean(window.__PLATTR_DATA__) }
})()`)
const itemOpened = await evaluate(`(() => { const item = [...document.querySelectorAll('[data-item]')].find((el) => el.offsetParent); if (!item) return false; item.click(); return true })()`)
await sleep(500)
const detail = await evaluate(`({ active: document.querySelector('.screen.on')?.dataset.screen || '', add: document.querySelector('[data-add]')?.innerText || '', checkin: Boolean(document.querySelector('#book-checkin')), datesTab: Boolean([...document.querySelectorAll('[data-go]')].find((el) => /dates/i.test(el.textContent))) })`)
await evaluate(`document.querySelector('[data-add]')?.click()`)
await sleep(500)
const cart = await evaluate(`(() => {
  const cart = document.querySelector('[data-cart]')
  const checkin = cart?.querySelector('[data-checkin]')
  const checkout = cart?.querySelector('[data-checkout]')
  return {
    open: cart ? !cart.hidden : false,
    checkinInCart: Boolean(checkin),
    checkinVisibleInCart: Boolean(checkin && checkin.offsetParent),
    checkoutInCart: Boolean(checkout),
    checkoutVisibleInCart: Boolean(checkout && checkout.offsetParent),
    body: cart?.innerText.slice(0, 350) || '',
  }
})()`)
// Inspect the alternative dates surface without submitting anything.
await evaluate(`document.querySelector('[data-scrim]')?.click()`)
await evaluate(`[...document.querySelectorAll('[data-go]')].find((el) => /dates/i.test(el.textContent) && el.offsetParent)?.click()`)
await sleep(500)
const dates = await evaluate(`({ active: document.querySelector('.screen.on')?.dataset.screen || '', checkinVisible: Boolean([...document.querySelectorAll('[data-checkin]')].find((el) => el.offsetParent)), bookingButton: [...document.querySelectorAll('[data-book]')].find((el) => el.offsetParent)?.textContent.trim() || '' })`)
// The probe must not leave a customer cart behind in the shared QA profile.
await evaluate('localStorage.clear(); sessionStorage.clear()')
const result = { token, data, itemOpened, detail, cart, dates, generatedAt: new Date().toISOString() }
await writeFile('docs/qa/release-readiness-2026-11-22/hotel-trade.json', JSON.stringify(result, null, 2))
console.log(JSON.stringify(result, null, 2))
socket.close()
await fetch(`${CDP}/json/close/${target.id}`).catch(() => {})
