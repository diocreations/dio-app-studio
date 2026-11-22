#!/usr/bin/env bun
/**
 * PWA, offline, installability and in-app back evidence for the release audit.
 *
 *   bun scripts/release-readiness-pwa.mjs <token>
 *
 * Uses a build that already exists. No deployment or service change.
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
const errors = []
const call = (method, params = {}) => {
  const id = ++sequence
  socket.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject, method }))
}
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.method === 'Runtime.exceptionThrown')
    errors.push(message.params?.exceptionDetails?.exception?.description ?? message.params?.exceptionDetails?.text ?? 'exception')
  const entry = pending.get(message.id)
  if (!entry) return
  pending.delete(message.id)
  if (message.error) entry.reject(new Error(`${entry.method}: ${message.error.message}`))
  else entry.resolve(message.result)
})
await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }))
await call('Page.enable')
await call('Runtime.enable')
await call('Network.enable')
await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 })
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const evaluate = async (expression) => {
  const response = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text)
  return response.result?.value
}
const shot = async (name) => {
  const capture = await call('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(`${OUT}/${name}.png`, Buffer.from(capture.data, 'base64'))
}
const result = { token, generatedAt: new Date().toISOString(), checks: [], errors: [] }
const check = (name, ok, detail = '') => {
  result.checks.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 600) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

const url = `${ORIGIN}/p/${token}/app`
await call('Page.navigate', { url })
await sleep(1600)
await evaluate(`document.querySelector('[data-splash]')?.remove(); document.querySelector('[data-offline]')?.remove()`)
const manifestLink = await evaluate(`document.querySelector('link[rel="manifest"]')?.href || ''`)
const manifest = manifestLink
  ? await evaluate(`fetch(${JSON.stringify(manifestLink)}).then(async (r) => ({ status: r.status, type: r.headers.get('content-type'), body: await r.json() }))`)
  : null
check('the app links its manifest', Boolean(manifestLink), manifestLink)
check('the manifest is served as a web app manifest', manifest?.status === 200 && /manifest\+json/.test(manifest?.type || ''), JSON.stringify({ status: manifest?.status, type: manifest?.type }))
check('the manifest is standalone', manifest?.body?.display === 'standalone', manifest?.body?.display || '')
check('the manifest has a scoped start URL', Boolean(manifest?.body?.start_url && manifest?.body?.scope), `${manifest?.body?.start_url || ''} / ${manifest?.body?.scope || ''}`)
check('the manifest has name and icons', Boolean(manifest?.body?.name && manifest?.body?.icons?.length), `${manifest?.body?.name || ''} · ${manifest?.body?.icons?.length || 0} icons`)
let appManifest = null
try { appManifest = await call('Page.getAppManifest') } catch (error) { appManifest = { error: String(error) } }
let installability = null
try { installability = await call('Page.getInstallabilityErrors') } catch (error) { installability = { error: String(error) } }
check('Chrome reports no installability errors', Array.isArray(installability?.installabilityErrors) && installability.installabilityErrors.length === 0, JSON.stringify(installability))
const sw = await evaluate(`Promise.race([
  navigator.serviceWorker.ready.then((registration) => ({ scope: registration.scope, active: registration.active?.state || '' })).catch((error) => ({ error: String(error) })),
  new Promise((resolve) => setTimeout(() => resolve({ error: 'service worker did not become ready within 4s' }), 4000)),
])`)
check('the service worker is registered and active', Boolean(sw?.active), JSON.stringify(sw))

// A navigation and a detail push, then the app's own back control and browser back.
console.log('stage navigation/back')
const homeActive = await evaluate(`document.querySelector('.screen.on')?.dataset.screen || ''`)
const catalogOpened = await evaluate(`(() => {
  const buttons = [...document.querySelectorAll('.tabbar [data-go], [data-go]')].filter((el) => el.offsetParent);
  const target = buttons.find((el) => ['scr_catalog', 'catalog'].includes(el.dataset.go)) || buttons.find((el) => /shop|catalogue|catalog/i.test(el.textContent));
  if (!target) return false;
  target.click();
  return true;
})()`)
await sleep(600)
const catalogActive = await evaluate(`document.querySelector('.screen.on')?.dataset.screen || ''`)
const itemOpened = await evaluate(`(() => { const item = [...document.querySelectorAll('[data-item]')].find((el) => el.offsetParent); if (!item) return false; item.click(); return true })()`)
await sleep(550)
const detailActive = await evaluate(`document.querySelector('.screen.on')?.dataset.screen || ''`)
const backVisible = await evaluate(`Boolean(document.querySelector('[data-back]') && !document.querySelector('[data-back]').hidden)`)
try { await evaluate(`document.querySelector('[data-back]')?.click()`) } catch {}
await sleep(800)
const backActive = await evaluate(`document.querySelector('.screen.on')?.dataset.screen || ''`)
// Browser back is tested from a fresh detail push, not after the in-app back.
await evaluate(`[...document.querySelectorAll('[data-item]')].find((el) => el.offsetParent)?.click()`)
await sleep(500)
try { await evaluate(`history.back()`) } catch {}
await sleep(900)
const browserBackActive = await evaluate(`document.querySelector('.screen.on')?.dataset.screen || ''`).catch(() => '')
check('catalogue navigation opens the catalogue', catalogOpened && catalogActive === 'catalog', `${homeActive} -> ${catalogActive}`)
check('a catalogue item opens its detail screen', itemOpened && detailActive === 'detail', `${catalogActive} -> ${detailActive}`)
check('the in-app back control is visible on detail', backVisible)
check('the in-app back control returns to the catalogue', backActive === 'catalog', backActive)
check('browser back returns to the previous app screen', browserBackActive === 'catalog' || browserBackActive === 'home', browserBackActive)
await shot('pwa-navigation')

// A real controlled reload, then an offline reload served by the service worker.
console.log('stage controlled reload')
await call('Page.navigate', { url })
await sleep(1000)
await Promise.race([call('Page.reload'), sleep(8000)])
await sleep(1200)
const controlled = await evaluate(`navigator.serviceWorker.controller !== null`)
check('the first reload is controlled by the service worker', controlled)
await evaluate(`document.querySelector('[data-splash]')?.remove(); document.querySelector('[data-offline]')?.remove()`)
let offline = { body: '', banner: false, active: '', controller: false }
if (sw?.active) {
  console.log('stage offline reload')
  await call('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 })
  await Promise.race([call('Page.reload'), sleep(8000)])
  await sleep(1200)
  offline = await evaluate(`(async () => ({
    title: document.title,
    body: document.body.innerText.slice(0, 500),
    banner: document.querySelector('[data-offline]') ? !document.querySelector('[data-offline]').hidden : false,
    active: document.querySelector('.screen.on')?.dataset.screen || '',
    cacheNames: await caches.keys(),
    controller: navigator.serviceWorker.controller !== null,
  }))()`)
  await shot('pwa-offline')
  check('the app document is available offline', offline.body.length > 80 && offline.body.includes('Yarmouth'), offline.body.slice(0, 180))
  check('the offline banner is shown when offline', offline.banner, JSON.stringify({ banner: offline.banner, active: offline.active }))
  check('the offline document is controlled by the service worker', offline.controller)
} else {
  check('the app document is available offline', false, 'skipped because the service worker never became active')
  check('the offline banner is shown when offline', false, 'skipped because the service worker never became active')
  check('the offline document is controlled by the service worker', false, 'skipped because the service worker never became active')
}
await call('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
await sleep(500)
result.offline = offline
result.manifest = manifest
result.installability = installability
result.serviceWorker = sw
result.errors = errors
await writeFile(`${OUT}/pwa.json`, JSON.stringify(result, null, 2))
console.log(`\n${result.checks.filter((entry) => entry.ok).length}/${result.checks.length} checks -> ${OUT}/pwa.json`)
socket.close()
await fetch(`${CDP}/json/close/${target.id}`).catch(() => {})
if (result.checks.some((entry) => !entry.ok)) process.exitCode = 1
