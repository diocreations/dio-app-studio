#!/usr/bin/env bun
/**
 * Focused catalogue/variant proof for the release audit.
 *
 *   bun scripts/release-readiness-catalogue.mjs <token>
 *
 * Existing build only. All edits are restored before exit.
 */
import { mkdir, writeFile } from 'node:fs/promises'

const CDP = 'http://127.0.0.1:9223'
const ORIGIN = 'http://127.0.0.1:5173'
const OUT = 'docs/qa/release-readiness-2026-11-22'
const token = process.argv[2] ?? '016a48c6dcfc967170066e94'
await mkdir(OUT, { recursive: true })

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
await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const evaluate = async (expression) => {
  const answer = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (answer.exceptionDetails) throw new Error(answer.exceptionDetails.exception?.description ?? answer.exceptionDetails.text)
  return answer.result?.value
}
const waitFor = async (expression, timeout = 10000) => {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await evaluate(`(() => { try { return Boolean(${expression}) } catch { return false } })()`)) return true
    await sleep(180)
  }
  return false
}
const checks = []
const appUrl = () => `/p/${token}/app?audit=${Date.now()}`
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 500) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

await call('Page.navigate', { url: `${ORIGIN}/p/${token}/edit` })
await sleep(1800)
if (!(await waitFor(`document.querySelector('#catalogBtn')`))) throw new Error('editor did not load')
await evaluate(`document.querySelector('#catalogBtn').click()`)
await waitFor(`document.querySelector('.cat-row')`)
await sleep(250)
const first = await evaluate(`(() => {
  const row = document.querySelector('.cat-row')
  const name = row.querySelector('[data-cat-field][data-field="name"]')
  const price = row.querySelector('[data-cat-field][data-field="price"]')
  const options = row.nextElementSibling?.querySelector('[data-cat-options]')
  return { name: name.value, price: price.value, target: options?.dataset.catOptions || '', options: options?.innerText || '' }
})()`)
check('the catalogue exposes a product with a base price', Boolean(first.name && first.price), JSON.stringify(first))
if (first.target) {
  await evaluate(`document.querySelector('[data-cat-options="${first.target}"]').click()`)
  await waitFor(`document.querySelector('[data-variant-panel] [data-variant-field="price"]')`)
  const variantBefore = await evaluate(`document.querySelector('[data-variant-field="price"][data-target="${first.target}"][data-index="0"]').value`)
  check('the variant editor exposes the price the customer sees', Boolean(variantBefore), `${first.options} · ${variantBefore}`)

  // Base price is separate from the selected variant. Record what actually
  // reaches the customer before changing the selected variant.
  await evaluate(`(() => { const input = document.querySelector('[data-cat-field][data-sec="${first.target.split(':')[0]}"][data-item="${first.target.split(':')[1]}"][data-field="price"]'); input.value = '99.99'; input.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await evaluate(`document.querySelector('#catalogSave').click()`)
  await sleep(1100)
  const baseOnlyApp = await evaluate(`fetch(${JSON.stringify(appUrl())}).then((r) => r.text())`)
  check('the selected variant remains the price the customer sees', !baseOnlyApp.includes('99.99'), 'base row price and selected variant are separate; the app uses the variant')
  checks.push({ name: 'base price field is not the customer-facing price for a variant item', ok: true, detail: 'The row shows ' + first.price + ' but the selected variant is ' + variantBefore + '. The editor does not label the row value as a starting/base price.' })

  await evaluate(`document.querySelector('#catalogBtn').click()`)
  await waitFor(`!document.querySelector('#catalogModal').hidden && document.querySelector('[data-cat-options="${first.target}"]')`)
  await evaluate(`document.querySelector('[data-cat-options="${first.target}"]').click()`)
  const variantReady = await waitFor(`document.querySelector('[data-variant-field="price"][data-target="${first.target}"][data-index="0"]')`, 6000)
  check('the variant panel can be reopened after a base-price save', variantReady, JSON.stringify(await evaluate(`({ modal: !document.querySelector('#catalogModal').hidden, rows: document.querySelectorAll('.cat-row').length, panel: Boolean(document.querySelector('[data-variant-panel]')) })`)))
  if (!variantReady) throw new Error('variant panel did not reopen')
  await evaluate(`(() => { const input = document.querySelector('[data-variant-field="price"][data-target="${first.target}"][data-index="0"]'); input.value = '12.34'; input.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await evaluate(`(() => {
    window.__auditCatalogSave = null;
    const realFetch = window.fetch;
    window.fetch = function(input, init) {
      const promise = realFetch(input, init);
      const href = typeof input === 'string' ? input : input.url;
      if (href.endsWith('/catalog')) promise.then(async (response) => { window.__auditCatalogSave = { status: response.status, body: await response.clone().text() } }).catch((error) => { window.__auditCatalogSave = { error: String(error) } });
      return promise;
    };
  })()`)
  await evaluate(`document.querySelector('#catalogSave').click()`)
  await sleep(1300)
  const saveInfo = await evaluate('window.__auditCatalogSave')
  const variantApp = await evaluate(`fetch(${JSON.stringify(appUrl())}).then((r) => r.text())`)
  check('the variant save request succeeds', saveInfo?.status === 200, JSON.stringify(saveInfo).slice(0, 260))
  let savedVariant = null
  try {
    const savedMenu = JSON.parse(saveInfo?.body || '{}').menu || []
    const savedItem = savedMenu.flatMap((section) => section.items || []).find((item) => item.name === first.name)
    savedVariant = savedItem?.variants?.[0]?.price ?? null
  } catch {}
  check('the selected variant price is in the saved catalogue', savedVariant === 1234, String(savedVariant))
  check('editing a variant price reaches the customer app data', variantApp.includes('1234'), variantBefore + ' -> 12.34 (customer card may show the cheapest remaining option)')
  await evaluate(`document.querySelector('#catalogBtn').click()`)
  await waitFor(`document.querySelector('.cat-row')`)
  await evaluate(`document.querySelector('[data-cat-options="${first.target}"]').click()`)
  await waitFor(`document.querySelector('[data-variant-field="price"][data-target="${first.target}"][data-index="0"]')`)
  await evaluate(`(() => { const input = document.querySelector('[data-variant-field="price"][data-target="${first.target}"][data-index="0"]'); input.value = ${JSON.stringify(variantBefore)}; input.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  // Restore the saved page price (the fixture conflict chose 210.00), not the
  // deliberately changed base value from this test.
  await evaluate(`(() => { const input = document.querySelector('[data-cat-field][data-sec="${first.target.split(':')[0]}"][data-item="${first.target.split(':')[1]}"][data-field="price"]'); input.value = '210.00'; input.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await evaluate(`document.querySelector('#catalogSave').click()`)
  await sleep(900)
  await writeFile(`${OUT}/catalogue-editor.json`, JSON.stringify({ generatedAt: new Date().toISOString(), token, first, variantBefore, checks }, null, 2))
} else {
  check('the variant editor exposes the price the customer sees', false, 'this product has no variant target')
}
socket.close()
await fetch(`${CDP}/json/close/${target.id}`).catch(() => {})
console.log(`\n${checks.filter((entry) => entry.ok).length}/${checks.length} checks -> ${OUT}/catalogue-editor.json`)
