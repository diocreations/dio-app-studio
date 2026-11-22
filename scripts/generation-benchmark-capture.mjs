/**
 * Visual benchmark capture: the actual customer apps, not their JSON.
 *
 *   bun scripts/generation-benchmark-capture.mjs
 *
 * Opens every seeded app at 390, 430, 768 and 1280 CSS px, records console and
 * network failures, horizontal overflow and image loading, then captures the
 * home screen at each width plus the catalogue and first detail screen at 390.
 * Writes docs/qa/generation-benchmark-2026-11-21/screens/ and capture.json.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const CDP = process.env.BENCH_CDP ?? 'http://127.0.0.1:9223'
const ORIGIN = process.env.BENCH_API ?? 'http://127.0.0.1:5173'
const ROOT = process.env.BENCH_ROOT ?? 'docs/qa/generation-benchmark-2026-11-21'
const APPS = process.env.BENCH_APPS ?? '.chrome-qa/generation-benchmark-apps.json'
const allApps = JSON.parse(await readFile(APPS, 'utf8'))
const onlySite = process.argv[2]
const onlyDirection = process.argv[3]
const apps = allApps.filter((app) => (!onlySite || app.site === onlySite) && (!onlyDirection || app.direction === onlyDirection))
const widths = [
  [390, 844],
  [430, 932],
  [768, 1024],
  [1280, 900],
]
await mkdir(`${ROOT}/screens`, { recursive: true })

const target = await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json())
const socket = new WebSocket(target.webSocketDebuggerUrl)
let sequence = 0
const pending = new Map()
let consoleErrors = []
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
const withTimeout = (work, ms, label) =>
  Promise.race([
    work,
    new Promise((resolve, reject) => setTimeout(() => reject(new Error(`timeout: ${label}`)), ms)),
  ])
const shot = async (name) => {
  const capture = await withTimeout(
    call('Page.captureScreenshot', { format: 'png', fromSurface: true }),
    15000,
    `screenshot ${name}`,
  )
  const path = `${ROOT}/screens/${name}.png`
  await mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true })
  await writeFile(path, Buffer.from(capture.data, 'base64'))
}

const visible = `(node) => node.offsetParent && getComputedStyle(node).visibility !== 'hidden' && node.getClientRects().length`
const click = (selector, text = '') =>
  evaluate(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(
      (node) => (${visible})(node) && (!${JSON.stringify(text)} || node.textContent.includes(${JSON.stringify(text)}))
    )
    if (!el) return false
    el.click()
    return true
  })()`)
const metrics = () =>
  evaluate(`JSON.stringify({
    title: document.title,
    body: (document.querySelector('[data-screen].on') || document.querySelector('[data-screen]'))?.innerText.slice(0, 1500) || '',
    screen: document.querySelector('[data-screen].on')?.dataset.screen || '',
    viewport: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
    images: [...document.images].map((image) => ({ alt: image.alt, width: image.naturalWidth, src: image.currentSrc.slice(0, 80) })).filter((image) => image.width === 0).length,
    loadedImages: [...document.images].filter((image) => image.complete && image.naturalWidth > 0).length,
    totalImages: document.images.length,
    items: document.querySelectorAll('[data-item]').length,
    nav: [...document.querySelectorAll('[data-go]')].filter(${visible}).map((node) => [node.dataset.go, node.textContent.trim().slice(0, 20)]).slice(0, 10),
  })`)

const report = []
for (const app of apps) {
  consoleErrors = []
  networkFailures = []
  const entry = { ...app, widths: {}, screens: {} }
  for (const [width, height] of widths) {
    await call('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 700,
      screenWidth: width,
      screenHeight: height,
    })
    await withTimeout(
      call('Page.navigate', { url: `${ORIGIN}/p/${app.token}/app?v=${Date.now()}` }),
      15000,
      `navigate ${app.site}/${app.direction} ${width}`,
    )
    await sleep(1500)
    await evaluate(`
      document.querySelector('[data-splash]')?.remove();
      document.querySelector('[data-offline]')?.remove();
      document.querySelectorAll('.sheet').forEach((el) => el.classList.remove('on'));
      document.fonts?.ready;
    `)
    // Do not judge a design on a half-downloaded hero. Wait for the images
    // that are actually in the first viewport; lazy images below it stay lazy.
    await evaluate(`Promise.race([
      Promise.all([...document.images]
        .filter((image) => image.getBoundingClientRect().top < innerHeight * 1.4)
        .map((image) => image.complete ? 1 : new Promise((resolve) => {
          image.addEventListener('load', resolve, { once: true });
          image.addEventListener('error', resolve, { once: true });
        }))),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ])`)
    await sleep(300)
    await shot(`${app.site}/${app.direction}-${width}`)
    entry.widths[width] = JSON.parse(await metrics())
  }

  await call('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
    screenWidth: 390,
    screenHeight: 844,
  })
  await withTimeout(
    call('Page.navigate', { url: `${ORIGIN}/p/${app.token}/app?v=${Date.now()}` }),
    15000,
    `navigate ${app.site}/${app.direction} detail`,
  )
  await sleep(1500)
  await evaluate(`
    document.querySelector('[data-splash]')?.remove();
    document.querySelector('[data-offline]')?.remove();
    document.querySelectorAll('.sheet').forEach((el) => el.classList.remove('on'));
  `)
  const catalogue = await click('[data-go="catalog"]')
  await sleep(650)
  await evaluate(`Promise.race([
    Promise.all([...document.images]
      .filter((image) => image.getBoundingClientRect().top < innerHeight * 1.4)
      .map((image) => image.complete ? 1 : new Promise((resolve) => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      }))),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ])`)
  await sleep(300)
  if (catalogue) {
    await shot(`${app.site}/${app.direction}-catalog`)
    const opened = await click('[data-screen="catalog"] [data-item]')
    await sleep(700)
    if (opened) await shot(`${app.site}/${app.direction}-detail`)
    entry.screens.catalog = catalogue
    entry.screens.detail = opened
  }
  entry.consoleErrors = consoleErrors
  entry.networkFailures = networkFailures
  report.push(entry)
  console.log(
    `${app.site}/${app.direction.padEnd(9)} screens:${catalogue ? 'catalog' : 'none'}/` +
      `${entry.screens.detail ? 'detail' : 'none'} overflow:` +
      widths.map(([width]) => (entry.widths[width].overflow ? 'W' : '.')).join('') +
      ` images:${widths.map(([width]) => `${entry.widths[width].loadedImages}/${entry.widths[width].totalImages}`).join(' ')}`,
  )
}
// Merge with an earlier partial pass: a capture run for one app must not erase
// the measurements for the rest.
let previous = []
try { previous = JSON.parse(await readFile(`${ROOT}/capture.json`, 'utf8')) } catch {}
const merged = [
  ...previous.filter(
    (old) => !report.some((fresh) => fresh.site === old.site && fresh.direction === old.direction),
  ),
  ...report,
]
await writeFile(`${ROOT}/capture.json`, JSON.stringify(merged, null, 2))
console.log(`captured ${report.length} apps -> ${ROOT}/screens`)
process.exit(0)
