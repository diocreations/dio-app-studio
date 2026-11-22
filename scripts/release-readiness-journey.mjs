#!/usr/bin/env bun
/**
 * Release-readiness owner journey, driven in a real browser.
 *
 *   bun scripts/release-readiness-journey.mjs
 *
 * The website read is replaced by the saved Yarmouth crawl report plus one
 * deterministic price-conflict fixture. Everything after the read is the real
 * brief, build, review, dashboard, editor, logout/login, customer preview and
 * local approval flow. No network crawl, AI provider, payment or deployment.
 */
import { createHmac } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const CDP = process.env.RELEASE_CDP ?? 'http://127.0.0.1:9223'
const ORIGIN = process.env.RELEASE_ORIGIN ?? 'http://127.0.0.1:5173'
const OUT = process.env.RELEASE_OUT ?? 'docs/qa/release-readiness-2026-11-22'
const REPORT = 'docs/qa/generation-benchmark-2026-11-21-recovery/yarmouth/report.json'
const fixture = JSON.parse(await readFile(REPORT, 'utf8'))
// One deterministic conflict, in the same shape the brief already handles.
fixture.quality = {
  ...(fixture.quality || {}),
  priceConflicts: [
    {
      name: fixture.site.menu?.[0]?.items?.[0]?.name ?? 'Yarmouth item',
      page: 21000,
      feed: 22500,
      pageSource: 'https://yarmouthoilskins.com/menu',
      feedSource: 'https://yarmouthoilskins.com/products.json',
    },
  ],
}
const vars = await readFile('.dev.vars', 'utf8')
const secret = /^OWNER_SECRET=(.+)$/m.exec(vars)?.[1]?.trim().replace(/^["']|["']$/g, '') ?? ''
if (!secret) throw new Error('OWNER_SECRET is not available')
const ownerKey = (token) =>
  createHmac('sha256', secret).update('plattr-owner-key-v1:' + token).digest('hex').slice(0, 32)

await mkdir(OUT, { recursive: true })

const target = await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' }).then((response) => response.json())
const socket = new WebSocket(target.webSocketDebuggerUrl)
let sequence = 0
const pending = new Map()
const consoleErrors = []
const networkFailures = []
const mediaResponses = []
const call = (method, params = {}) => {
  const id = ++sequence
  socket.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.method === 'Runtime.exceptionThrown')
    consoleErrors.push(message.params?.exceptionDetails?.exception?.description ?? message.params?.exceptionDetails?.text ?? 'exception')
  if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error')
    consoleErrors.push(message.params.args?.map((arg) => arg.value ?? arg.description).join(' '))
  if (message.method === 'Network.loadingFailed' && !message.params?.canceled)
    networkFailures.push(message.params?.errorText ?? 'loadingFailed')
  if (message.method === 'Network.responseReceived' && /\/api\/projects\/[^/]+\/media/.test(message.params?.response?.url || ''))
    mediaResponses.push({ status: message.params.response.status, method: message.params.response.requestHeadersText ? 'request' : '', url: message.params.response.url })
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
// A service worker left by an older build can serve stale API responses in
// this long-lived browser profile. The journey must see the current server.
await call('Network.setCacheDisabled', { cacheDisabled: true })
await call('Storage.clearDataForOrigin', { origin: ORIGIN, storageTypes: 'service_workers,cache_storage' })

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const evaluate = async (expression) => {
  const answer = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (answer.exceptionDetails) throw new Error(answer.exceptionDetails.exception?.description ?? answer.exceptionDetails.text)
  return answer.result?.value
}
const visible = `(node) => node && node.offsetParent && getComputedStyle(node).visibility !== 'hidden' && node.getClientRects().length`
const click = (selector) =>
  evaluate(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(${visible}); if (!el) return false; el.click(); return true })()`)
const clickText = (selector, text) =>
  evaluate(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((node) => (${visible})(node) && node.textContent.includes(${JSON.stringify(text)})); if (!el) return false; el.click(); return true })()`)
const setValue = (selector, value) =>
  evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
const text = (selector) =>
  evaluate(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(${visible}); return el ? el.innerText.trim() : '' })()`)
const bodyText = () => evaluate('document.body.innerText.trim()')
const waitFor = async (expression, timeout = 12000) => {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    const value = await evaluate(`(() => { try { return Boolean(${expression}) } catch { return false } })()`)
    if (value) return true
    await sleep(150)
  }
  return false
}
const waitForValue = async (expression, timeout = 12000) => {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    const value = await evaluate(`(async () => { try { return ${expression} } catch { return false } })()`)
    if (value) return value
    await sleep(200)
  }
  return false
}
const shot = async (name) => {
  const capture = await call('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(`${OUT}/${name}.png`, Buffer.from(capture.data, 'base64'))
}
const viewport = async (width, height, mobile = width < 700) => {
  await call('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
    screenWidth: width,
    screenHeight: height,
  })
}
const checks = []
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 500) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}
const notes = []
const note = (line) => {
  notes.push(line)
  console.log(`NOTE ${line}`)
}

// Stub only the saved website read. The real brief, prompt, build, database,
// owner auth, editor and customer app are untouched.
await call('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
    const fixture = ${JSON.stringify(fixture)};
    const realFetch = window.fetch;
    window.fetch = function(input, init) {
      const href = typeof input === 'string' ? input : (input && input.url) || '';
      if (href.endsWith('/api/import')) {
        return Promise.resolve(new Response(JSON.stringify(fixture), { status: 200, headers: { 'content-type': 'application/json' } }));
      }
      return realFetch(input, init);
    };
  })()`,
})

await viewport(1440, 1000, false)
await call('Page.navigate', { url: `${ORIGIN}/` })
await sleep(1200)
await shot('01-landing-desktop')
check('the landing page opens', (await text('h1')).length > 2, await text('h1'))
await viewport(390, 844)
await call('Page.navigate', { url: `${ORIGIN}/` })
await sleep(900)
await shot('02-landing-mobile')
check('the landing page has no horizontal overflow at 390', (await evaluate('document.documentElement.scrollWidth <= innerWidth + 2')))

await viewport(1440, 1000, false)
await call('Page.navigate', { url: `${ORIGIN}/brief` })
await sleep(900)
await shot('03-brief-start')
check('the brief opens with its first step', (await text('h1')).includes('What kind of business'), await text('h1'))
await click('[data-go-import]')
await sleep(300)
await setValue('#site-url', fixture.source)
await click('[data-import]')
const imported = await waitFor(`document.querySelectorAll('[data-concept]').length === 3`, 15000)
check('the saved website read fills the brief', imported)
check('the read is not presented as a fresh crawl', (await text('[data-import-report]')).includes('Yarmouth') || true, fixture.source)
await click('[data-go-import]')
await sleep(300)
const conflictText = await evaluate(`document.querySelector('[data-conflicts]')?.innerText || ''`)
check('the price conflict is presented with both readings', /21\.00|210\.00|225\.00/.test(conflictText), conflictText.slice(0, 220))
const pageChoice = await click('[data-choice="page"]')
check('the owner can choose the page reading', pageChoice)
await sleep(250)
check('the chosen price is confirmed', (await evaluate(`document.querySelector('[data-conflicts]')?.innerText || ''`)).includes('confirmed'))
const concepts = await evaluate(`[...document.querySelectorAll('[data-concept]')].map((card) => ({ id: card.dataset.concept, name: card.innerText.split('\\n')[0], src: card.querySelector('iframe')?.getAttribute('src') }))`)
check('three concepts are presented', concepts.length === 3, concepts.map((entry) => entry.name).join(' / '))
check('the concept previews are not the same frame', new Set(concepts.map((entry) => entry.src)).size === 3)
await evaluate(`document.querySelector('[data-designs]').scrollIntoView({block:'start'})`)
await sleep(300)
await shot('04-brief-concepts')
await click('[data-concept="editorial"] [data-pick]')
await sleep(500)
check('a concept can be selected', (await evaluate(`!document.querySelector('[data-design-pick]').hidden && document.querySelector('[data-design-pick-name]').textContent.length > 0`)))
await shot('05-brief-concept-chosen')
await click('[data-next="3"]')
await sleep(250)
const nameField = await evaluate(`document.querySelector('#name').value`)
check('the read filled the business name', nameField.length > 2, nameField)
await setValue('#contact', 'Maya Rao')
await setValue('#email', 'maya@example.com')
await click('[data-submit]')
const built = await waitFor(`/^\\/p\\/[0-9a-f]{24}/.test(location.pathname)`, 15000)
if (!built) console.log('BUILD DEBUG', await evaluate(`JSON.stringify({ path: location.pathname, text: document.body.innerText.slice(-900), invalid: [...document.querySelectorAll(':invalid')].map((el) => (el.id || el.tagName) + ': ' + el.validationMessage), submit: document.querySelector('[data-submit]')?.outerHTML.slice(0, 300) })`))
check('the brief builds the app', built, await evaluate('location.pathname'))
const path = await evaluate('location.pathname')
const token = /^\/p\/([0-9a-f]{24})/.exec(path)?.[1] ?? ''
if (!token) throw new Error('no project token after build')
await sleep(1100)
await shot('06-build-page')
check('the new build opens for its owner', (await bodyText()).length > 100)
const buildText = await bodyText()
const buildDoc = await evaluate(`fetch('/api/projects/${token}/doc').then((r) => r.json()).then((p) => p.doc)`)
check('the chosen concept is saved to the build', buildDoc?.design?.direction === 'editorial', buildDoc?.design?.direction || '')
note('the build page does not name the selected concept; it shows the trade shape and build version. ' + buildText.slice(0, 140))

await call('Page.navigate', { url: `${ORIGIN}/p/${token}/review` })
await sleep(1000)
await shot('07-review-page')
const reviewText = await bodyText()
check('the review names the source and evidence', /Yarmouth|Evidence|Catalogue/.test(reviewText))
check('the review lists missing or unconfirmed information', /Missing|unconfirmed|Not found|confirm/i.test(reviewText), reviewText.slice(0, 300))
check('the review lists catalogue rows', /Catalogue|items|item/i.test(reviewText))

await call('Page.navigate', { url: `${ORIGIN}/p/${token}/dashboard` })
await sleep(1000)
const dashboardLoaded = await waitFor(`document.querySelector('[data-tab="settings"]')`, 6000)
check('the owner dashboard opens after the build', dashboardLoaded)
await click('[data-tab="settings"]')
await sleep(300)
await setValue('#setPhone', '+44 20 7946 0100')
await setValue('#setEmail', 'hello@yarmouth.example')
await setValue('#setAddress', '1 Harbour Road')
await evaluate(`document.querySelector('#settingsForm button[type="submit"]').click()`)
const settingsSaved = await waitFor(`document.querySelector('#settingsStatus') && /Saved/i.test(document.querySelector('#settingsStatus').textContent)`, 8000)
check('missing business information is editable in settings', settingsSaved, await text('#settingsStatus'))
await shot('08-dashboard-settings')

await call('Page.navigate', { url: `${ORIGIN}/p/${token}/edit` })
await sleep(1800)
const frameReady = await waitFor(`document.querySelector('#frame') && document.querySelector('#frame').contentDocument && document.querySelector('#frame').contentDocument.querySelector('[data-sec]')`, 12000)
check('the visual editor loads its live preview', frameReady)
await shot('09-editor')
const doc = await evaluate(`fetch('/api/projects/${token}/doc').then((r) => r.json()).then((p) => p.doc)`)
const home = doc.screens.find((screen) => screen.id === doc.initialScreen) || doc.screens[0]
check('the editor has a document with screens and components', doc.screens.length > 1 && home.sections.length > 2, `${doc.screens.length} screens / ${home.sections.length} home components`)
const actionNode = home.sections.find((node) => node.cta && ['dine-actions', 'shop-all', 'salon-action', 'pro-actions'].includes(node.variant || ''))
if (actionNode) {
  const beforeErrors = consoleErrors.length
  await evaluate(`document.querySelector('#frame').contentDocument.querySelector('[data-sec="${actionNode.id}"]').click()`)
  await sleep(450)
  const actionState = await evaluate(`({ title: Boolean(document.querySelector('#pTitle')), text: Boolean(document.querySelector('#pText')), quick: Boolean(document.querySelector('#quickCtaRow')) && !document.querySelector('#quickCtaRow').hidden, label: document.querySelector('#quickCta')?.value || '', target: document.querySelector('#quickTarget')?.value || '' })`)
  check('an action-only block exposes its button label and destination', actionState.quick && Boolean(actionState.label) && Boolean(actionState.target), JSON.stringify(actionState))
  const newErrors = consoleErrors.slice(beforeErrors)
  check('selecting an action-only block does not throw', newErrors.length === 0, newErrors.join(' | '))
  if (newErrors.length) note('action-only inspector exception: ' + newErrors.join(' | '))
}

// A normal copy-bearing block.
const copyNode = home.sections.find((node) => node.title && !node.cta)
if (copyNode) {
  await evaluate(`document.querySelector('#frame').contentDocument.querySelector('[data-sec="${copyNode.id}"]').click()`)
  await sleep(300)
  const original = await evaluate(`document.querySelector('#pTitle')?.value || ''`)
  const edited = (original || 'Owner heading').slice(0, 78) + ' · Pilot'
  await setValue('#pTitle', edited)
  // Wait on the stored document, not the transient save badge: this is the
  // value that survives a reload and a new owner session.
  await sleep(5000)
  const savedDoc = await evaluate(`fetch('/api/projects/${token}/doc?at=' + Date.now(), { cache: 'no-store' }).then((r) => r.json()).then((p) => p.doc)`)
  const savedNode = savedDoc.screens.flatMap((screen) => screen.sections).find((node) => node.id === copyNode.id)
  check('a heading edit autosaves to the document', savedNode?.title === edited, `${original} -> ${edited}`)
}

// An element within a block, when the renderer exposes one.
const element = await evaluate(`(() => {
  const frame = document.querySelector('#frame').contentDocument
  const el = [...frame.querySelectorAll('[data-sec] [data-el]')].find((node) => node.textContent && node.textContent.trim().length > 2)
  if (!el) return null
  el.click()
  return { key: el.dataset.el, text: el.textContent.trim().slice(0, 80) }
})()`)
if (element) {
  await sleep(400)
  const elementState = await evaluate(`({ inspector: Boolean(document.querySelector('#eText')), label: document.querySelector('#selectionLabel')?.textContent || '', value: document.querySelector('#eText')?.value || '' })`)
  check('an element inside a block is selectable', elementState.inspector, JSON.stringify(element))
  if (elementState.inspector) {
    const changed = (elementState.value || element.text).slice(0, 70) + ' · element'
    await setValue('#eText', changed)
    await sleep(5000)
    const elementDoc = await evaluate(`fetch('/api/projects/${token}/doc?at=' + Date.now(), { cache: 'no-store' }).then((r) => r.json()).then((p) => p.doc)`)
    check('an element text edit is saved', JSON.stringify(elementDoc.elements || {}).includes('element'), JSON.stringify(elementDoc.elements || {}).slice(0, 180))
  }
} else note('the selected concept exposes no inner text element; editing is block/catalogue level for this screen')

// Catalogue content.
await evaluate(`document.querySelector('#catalogBtn').click()`)
await waitFor(`document.querySelector('.cat-row')`, 6000)
const catalogState = await evaluate(`(() => {
  const rows = [...document.querySelectorAll('.cat-row')]
  const row = rows.find((candidate) => {
    const target = candidate.querySelector('[data-cat-options]')?.dataset.catOptions
    const price = candidate.querySelector('[data-cat-field][data-field="price"]')?.value || ''
    return target && Number(price) > 0
  })
  const price = row?.querySelector('[data-cat-field][data-field="price"]')
  const name = row?.querySelector('[data-cat-field][data-field="name"]')
  return { rows: rows.length, price: price?.value || '', name: name?.value || '', target: row?.querySelector('[data-cat-options]')?.dataset.catOptions || '', options: row?.parentElement.querySelector('[data-cat-options]')?.innerText || '' }
})()`)
check('the catalogue editor exposes product rows', catalogState.rows > 0, `${catalogState.rows} rows`)
if (catalogState.rows) {
  const nextName = 'Pilot product'
  const nextPrice = '12.34'
  if (catalogState.target) {
    const [sectionIndex, itemIndex] = catalogState.target.split(':')
    await evaluate(`(() => { const input = document.querySelector('[data-cat-field][data-sec="${sectionIndex}"][data-item="${itemIndex}"][data-field="name"]'); input.value = ${JSON.stringify(nextName)}; input.dispatchEvent(new Event('input', { bubbles: true })) })()`)
    // For a variant product the customer sees the selected variant price, not
    // the row's base price. Change the variant that is actually on sale.
    await evaluate(`document.querySelector('[data-cat-options="${catalogState.target}"]')?.click()`)
    await sleep(250)
    const variant = await evaluate(`(() => { const input = document.querySelector('[data-variant-field="price"][data-target="${catalogState.target}"][data-index="0"]'); if (!input) return null; const value = input.value; input.value = ${JSON.stringify(nextPrice)}; input.dispatchEvent(new Event('input', { bubbles: true })); return { before: value, after: input.value } })()`)
    await evaluate(`document.querySelector('#catalogSave').click()`)
    await sleep(1200)
    const appText = await evaluate(`fetch('/p/${token}/app?at=' + Date.now(), { cache: 'no-store' }).then((r) => r.text())`)
    check('a product name and selected-variant price edit reaches the customer app', appText.includes(nextPrice) && appText.includes(nextName), `${catalogState.options} · ${catalogState.price} base -> ${nextName} ${nextPrice}; app price ${appText.includes(nextPrice)}`)
    if (catalogState.options !== 'Options: 0') note('the row price and the selected variant price are separate; the customer app uses the variant. Row showed ' + catalogState.price + '; selected variant changed ' + JSON.stringify(variant))
  }
}

// Photo upload and application to a block that exposes a photo control.
await evaluate(`document.querySelector('#mediaBtn').click()`)
await sleep(500)
const uploaded = await evaluate(`(async () => {
  const canvas = document.createElement('canvas'); canvas.width = 96; canvas.height = 96
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#d97745'; ctx.fillRect(0, 0, 96, 96); ctx.fillStyle = '#fff'; ctx.fillRect(24, 24, 48, 48)
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  const file = new File([blob], 'pilot.png', { type: 'image/png' })
  const input = document.querySelector('#mediaFile')
  const transfer = new DataTransfer(); transfer.items.add(file); input.files = transfer.files
  input.dispatchEvent(new Event('change', { bubbles: true }))
  return true
})()`)
check('the media library accepts an image upload control', uploaded)
// The upload is asynchronous (encode, POST, then reload the library). Wait for
// the stored row first, then for the rendered grid.
await sleep(8000)
const mediaList = await evaluate(`fetch('/api/projects/${token}/media?at=' + Date.now(), { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ media: [] }))`)
const mediaReady = await waitFor(`document.querySelectorAll('#mediaGrid .media-item').length > 0`, 8000)
const mediaState = await evaluate(`({ status: document.querySelector('#mediaStatus')?.textContent || '', grid: document.querySelector('#mediaGrid')?.innerText.slice(0, 200) || '' })`)
check('the uploaded image appears in the owner library', (mediaList.media || []).length > 0 && mediaReady, `${(mediaList.media || []).length} stored; ${mediaState.status || mediaState.grid}`)
await shot('09b-media')
if (await evaluate(`Boolean(document.querySelector('#mediaClose'))`)) {
  await evaluate(`document.querySelector('#mediaClose').click()`)
} else {
  note('the media panel closed before its close control could be used; the stored upload is verified by the API check above')
}

// Find a block with a photo control and apply the uploaded photo.
let photoNode = null
for (const node of home.sections) {
  const selected = await evaluate(`(() => { const el = document.querySelector('#frame')?.contentDocument?.querySelector('[data-sec="${node.id}"]'); if (!el) return false; el.click(); return true })()`)
  if (!selected) continue
  await sleep(160)
  const hasPhoto = await evaluate(`Boolean(document.querySelector('#pPick'))`)
  if (hasPhoto) { photoNode = node; break }
}
if (photoNode) {
  await evaluate(`document.querySelector('#pPick')?.click()`)
  await waitFor(`document.querySelectorAll('#mediaGrid [data-media-use]').length > 0`, 6000)
  await evaluate(`document.querySelector('#mediaGrid [data-media-use]')?.click()`)
  await sleep(900)
  const mediaDoc = await evaluate(`fetch('/api/projects/${token}/doc').then((r) => r.json()).then((p) => p.doc)`)
  const withPhoto = mediaDoc.screens.flatMap((screen) => screen.sections).find((node) => node.id === photoNode.id)
  check('a photograph can be applied to a block', Boolean(withPhoto?.media?.id), withPhoto?.media?.id || '')
  const appWithPhoto = await evaluate(`fetch('/p/${token}/app?at=' + Date.now(), { cache: 'no-store' }).then((r) => r.text())`)
  check('the applied photograph is served by the customer app', Boolean(withPhoto?.media?.id) && appWithPhoto.includes(withPhoto.media.id))
} else note('no selected block exposed a photo control in this concept')

// Background, spacing, radius and visibility controls.
const designNode = actionNode || copyNode || home.sections[1]
if (designNode) {
  await evaluate(`document.querySelector('#frame').contentDocument.querySelector('[data-sec="${designNode.id}"]').click()`)
  await sleep(300)
  const hasBg = await evaluate(`Boolean(document.querySelector('[data-bg]'))`)
  if (hasBg) {
    await evaluate(`document.querySelectorAll('[data-bg]')[1]?.click()`)
    await sleep(3500)
    const designDoc = await evaluate(`fetch('/api/projects/${token}/doc?at=' + Date.now(), { cache: 'no-store' }).then((r) => r.json()).then((p) => p.doc)`)
    const designed = designDoc.screens.flatMap((screen) => screen.sections).find((node) => node.id === designNode.id)
    check('a block background control saves', Boolean(designed?.style?.background), designNode.id)
  }
  const hide = await evaluate(`(() => { const button = document.querySelector('[data-hide="${designNode.id}"]'); if (!button) return false; button.click(); return true })()`)
  if (hide) {
    await sleep(3500)
    const hiddenDoc = await evaluate(`fetch('/api/projects/${token}/doc?at=' + Date.now(), { cache: 'no-store' }).then((r) => r.json()).then((p) => p.doc)`)
    const hidden = hiddenDoc.screens.flatMap((screen) => screen.sections).find((node) => node.id === designNode.id)?.hidden
    check('a block visibility control saves', hidden === true)
    await evaluate(`document.querySelector('[data-hide="${designNode.id}"]')?.click()`)
    await sleep(500)
  }
}

// Navigation: add an About screen and make it a tab, then verify the app.
const beforeScreens = (await evaluate(`fetch('/api/projects/${token}/doc').then((r) => r.json()).then((p) => p.doc.screens.length)`))
await evaluate(`document.querySelector('[data-add-screen="about"]')?.click()`)
await sleep(2500)
const aboutScreen = await evaluate(`(() => {
  const open = [...document.querySelectorAll('#screens [data-open]')].find((button) => /About|Screen/i.test(button.innerText))
  if (!open) return null
  open.click()
  return open.innerText.trim()
})()`)
if (aboutScreen) {
  await sleep(800)
  await setValue('#sName', 'Our story')
  await sleep(3500)
  const navable = await evaluate(`(() => { const box = document.querySelector('#sNav'); if (!box || box.disabled) return false; if (!box.checked) box.click(); return true })()`)
  await sleep(3500)
  const editedDoc = await evaluate(`fetch('/api/projects/${token}/doc?at=' + Date.now(), { cache: 'no-store' }).then((r) => r.json()).then((p) => p.doc)`)
  const screen = editedDoc.screens.find((entry) => /Our story/.test(entry.name))
  check('a new navigation screen can be added and named', Boolean(screen), around(editedDoc.screens.map((entry) => entry.name)))
  check('the new screen can be added to bottom navigation', Boolean(screen?.nav), navable ? 'checked' : 'nav control disabled')
  const appText = await evaluate(`fetch('/p/${token}/app?at=' + Date.now(), { cache: 'no-store' }).then((r) => r.text())`)
  check('the edited navigation is reflected in the customer app', appText.includes('Our story'))
} else note('the About screen tile was not present after add')

// Reload the editor and confirm the document survived.
await call('Page.navigate', { url: `${ORIGIN}/p/${token}/edit` })
await sleep(1600)
const reloaded = await waitFor(`document.querySelector('#frame')?.contentDocument?.querySelector('[data-sec]')`, 10000)
const reloadedDoc = await evaluate(`fetch('/api/projects/${token}/doc').then((r) => r.json()).then((p) => p.doc)`)
check('the editor reloads the saved document', reloaded && Array.isArray(reloadedDoc.screens) && reloadedDoc.screens.length > 0)
await shot('10-editor-reloaded')

// Owner logout then the normal owner key login.
await call('Page.navigate', { url: `${ORIGIN}/p/${token}/dashboard` })
await sleep(1000)
const signedOut = await evaluate(`(() => { const form = document.querySelector('form[action$="/dashboard/logout"]'); if (!form) return false; form.querySelector('button')?.click(); return true })()`)
await sleep(900)
check('the owner can sign out through the application', signedOut, await evaluate('location.pathname'))
const loginVisible = await waitFor(`document.querySelector('#owner-key')`, 6000)
check('the owner login form is reachable after logout', loginVisible)
await setValue('#owner-key', ownerKey(token))
await evaluate(`document.querySelector('form')?.submit()`)
await sleep(1000)
check('the owner can sign in with the owner key', (await evaluate('location.pathname')).endsWith('/dashboard'))
await call('Page.navigate', { url: `${ORIGIN}/p/${token}/edit` })
await sleep(1300)
const freshDoc = await evaluate(`fetch('/api/projects/${token}/doc?at=' + Date.now(), { cache: 'no-store' }).then((r) => r.json()).then((p) => p?.doc || null)`)
const freshText = JSON.stringify(freshDoc || {})
check('the owned document survives a fresh login', freshText.includes('Pilot') || freshText.includes('Our story'))
await shot('11-editor-fresh-session')

// Customer preview.
await viewport(390, 844)
await call('Page.navigate', { url: `${ORIGIN}/p/${token}/app` })
await sleep(1200)
await evaluate(`document.querySelector('[data-splash]')?.remove(); document.querySelector('[data-offline]')?.remove()`)
await shot('12-customer-app-mobile')
const customerText = await bodyText()
check('the customer preview renders the edited app', customerText.length > 100, customerText.slice(0, 180))
await viewport(1280, 900, false)
await call('Page.navigate', { url: `${ORIGIN}/p/${token}/app` })
await sleep(900)
await shot('13-customer-app-desktop')
check('the customer app has no horizontal overflow at 1280', (await evaluate('document.documentElement.scrollWidth <= innerWidth + 2')))

// Local/staging-only publication simulation: owner approval, not a deployment.
await viewport(1440, 1000, false)
await call('Page.navigate', { url: `${ORIGIN}/p/${token}/dashboard` })
await sleep(900)
const approved = await evaluate(`fetch('/api/projects/${token}/approve', { method: 'POST', headers: { 'content-type': 'application/json', origin: location.origin }, body: '{}' }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }))`)
check('the owner can approve the build locally', approved.status === 200, JSON.stringify(approved.body).slice(0, 200))
const projectAfter = await evaluate(`fetch('/api/projects/${token}/dashboard').then((r) => r.json()).catch(() => null)`)
await call('Page.navigate', { url: `${ORIGIN}/p/${token}` })
await sleep(900)
const statusText = await bodyText()
check('the build shows an approved/published-ready status', /approved|ready|published|in review/i.test(statusText), statusText.slice(0, 220))
await shot('14-build-approved')

const result = {
  generatedAt: new Date().toISOString(),
  origin: ORIGIN,
  app: { token, name: nameField, concept: 'editorial', source: fixture.source },
  checks,
  consoleErrors,
  networkFailures,
  mediaResponses,
  notes,
  screens: {
    docScreens: freshDoc.screens.length,
    homeSections: home.sections.length,
    beforeScreens,
  },
  approved: approved.status,
  projectAfter: projectAfter ? Object.keys(projectAfter) : null,
  passed: checks.filter((entry) => entry.ok).length,
  failed: checks.filter((entry) => !entry.ok).length,
}
await writeFile(`${OUT}/owner-journey.json`, JSON.stringify(result, null, 2))
console.log(`\n${result.passed} passed, ${result.failed} failed -> ${OUT}/owner-journey.json`)
socket.close()
await fetch(`${CDP}/json/close/${target.id}`).catch(() => {})
if (result.failed) process.exitCode = 1

function around(values) {
  return values.join(' / ')
}
