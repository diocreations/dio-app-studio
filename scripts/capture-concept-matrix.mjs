/**
 * Visual acceptance matrix for the three application concepts.
 *
 *   bun scripts/capture-concept-matrix.mjs
 *
 * Reads the saved audit specs (never crawls), builds the same document the app
 * publishes, and screenshots home, catalogue and detail at four viewport widths
 * for all five acceptance trades. Also records layout failures per screen.
 *
 * Writes docs/qa/concepts-2026-11-21/<trade>--<concept>--<screen>--<width>.png
 * and a machine-readable report.json in the same folder.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { blueprintFor } from '../src/worker/blueprints'
import { flagshipDocFromSpec } from '../src/worker/doc'
import { directionsFor } from '../src/worker/directions'
import { renderApp } from '../src/worker/app'

const MACHINE = 'docs/qa/trade-audit-2026-11-20/machine'
const OUT = 'docs/qa/concepts-2026-11-21'
const CDP = 'http://127.0.0.1:9223'
const UPSTREAM = 'http://127.0.0.1:5173'
const TRADES = ['shop', 'restaurant', 'hotel', 'salon', 'professional']
const WIDTHS = [
  { width: 390, height: 844, mobile: true },
  { width: 430, height: 932, mobile: true },
  { width: 768, height: 1024, mobile: false },
  { width: 1280, height: 900, mobile: false },
]
const SCREENS = [
  { name: 'home', go: 'home' },
  { name: 'catalog', go: 'catalog' },
  { name: 'detail', item: true },
]

await mkdir(OUT, { recursive: true })

const pages = []
const extras = []
for (const trade of TRADES) {
  const saved = JSON.parse(await Bun.file(`${MACHINE}/${trade}.spec.json`).text())
  for (const direction of directionsFor(saved.vertical)) {
    const spec = { ...saved, direction: direction.id }
    const doc = flagshipDocFromSpec(spec)
    const concept = blueprintFor(spec).id
    const name = `${trade}--${concept}`
    const html = renderApp(spec, { token: `concept-${name}`, live: false, flagship: true, doc })
    await writeFile(`${OUT}/${name}.html`, html)
    pages.push({ trade, name, concept, direction: direction.id, doc })
    for (const screen of doc.screens.filter((entry) => ['more', 'search', 'saved'].includes(entry.kind))) {
      extras.push({ name, concept, screen: screen.kind })
    }
  }
}

const server = Bun.serve({
  port: 0,
  async fetch(request) {
    const path = new URL(request.url).pathname
    const file = Bun.file(`${OUT}${path}`)
    if (await file.exists())
      return new Response(await file.arrayBuffer(), {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    // Photography and app artwork are served by the running Worker.
    try {
      const upstream = await fetch(`${UPSTREAM}${path}${new URL(request.url).search}`)
      if (upstream.ok) return upstream
    } catch {}
    return new Response('not found', { status: 404 })
  },
})

const target = await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json())
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
  if (message.method === 'Network.loadingFailed' && !message.params?.canceled) {
    networkFailures.push(message.params?.errorText ?? 'loadingFailed')
  }
  const entry = pending.get(message.id)
  if (!entry) return
  pending.delete(message.id)
  if (message.error) entry.reject(new Error(message.error.message))
  else entry.resolve(message.result)
})
const networkFailures = []
await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }))
await call('Page.enable')
await call('Runtime.enable')
await call('Network.enable')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const evaluate = async (expression) => {
  const answer = await call('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  return answer.result?.value
}
const report = []
const runId = Date.now()
let shots = 0

if (process.env.EXTRAS_ONLY !== '1') for (const page of pages) {
  const url = `http://127.0.0.1:${server.port}/${page.name}.html?v=${runId}`
  for (const viewport of WIDTHS) {
    await call('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.mobile,
      screenWidth: viewport.width,
      screenHeight: viewport.height,
    })
    for (const screen of SCREENS) {
      if (process.env.DETAIL_ONLY === '1' && screen.name !== 'detail') continue
      if (process.env.HOME_ONLY === '1' && screen.name !== 'home') continue
      await call('Page.navigate', { url })
      await sleep(800)
      await evaluate(`
        document.querySelector('[data-splash]')?.remove();
        document.querySelector('[data-offline]')?.remove();
        document.querySelectorAll('.screen.on').forEach((el) => (el.style.animation = 'none'));
        document.fonts?.ready;
      `)
      if (screen.go) {
        await evaluate(`
          (() => {
            const tab = [...document.querySelectorAll('.tabbar [data-go="${screen.go}"]')].find((el) => el.offsetParent);
            const other = [...document.querySelectorAll('[data-go="${screen.go}"]')].find((el) => el.offsetParent);
            (tab || other)?.click();
          })()
        `)
      } else if (screen.item) {
        await evaluate(`
          (() => {
            const tab = [...document.querySelectorAll('.tabbar [data-go="catalog"]')].find((el) => el.offsetParent);
            tab?.click();
          })()
        `)
        await sleep(500)
        await evaluate(`
          (() => {
            const item = [...document.querySelectorAll('[data-item]')].find((el) => el.offsetParent);
            item?.click();
          })()
        `)
      }
      await sleep(650)
      const file = `${page.name}--${screen.name}--${viewport.width}.png`
      const shot = await call('Page.captureScreenshot', { format: 'png', fromSurface: true })
      await writeFile(`${OUT}/${file}`, Buffer.from(shot.data, 'base64'))
      shots += 1
      const metrics = await evaluate(`
        (() => {
          const active = document.querySelector('.screen.on');
          const rect = (el) => el ? el.getBoundingClientRect() : null;
          const tabbar = document.querySelector('.tabbar');
          const missing = [...document.querySelectorAll('.screen.on .fx-art.is-missing')];
          const cards = [...document.querySelectorAll('.screen.on .fx-product, .screen.on .rl-card, .screen.on .fx-service, .screen.on .fx-room, .screen.on .tile')];
          const clipped = [...document.querySelectorAll('.screen.on *')].filter((el) => {
            const style = getComputedStyle(el);
            if (style.overflow === 'visible' || style.display === 'none') return false;
            // Horizontal rails are meant to scroll; they are not clipped text.
            if (el.closest('.rec-row, .fx-products, .rl-grid, .fx-room-stack')) return false;
            return el.scrollWidth > el.clientWidth + 3 || el.scrollHeight > el.clientHeight + 3;
          }).slice(0, 8).map((el) => el.className || el.tagName);
          const tiny = missing.filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && (r.width < 40 || r.height < 28);
          }).length;
          const failedImages = [...document.querySelectorAll('.screen.on img')]
            .filter((img) => img.complete && img.naturalWidth === 0)
            .map((img) => img.getAttribute('src'));
          return {
            active: active?.dataset.screen ?? null,
            title: active?.dataset.title ?? null,
            screenWidth: active?.scrollWidth ?? 0,
            viewport: innerWidth,
            bodyOverflow: document.documentElement.scrollWidth - innerWidth,
            tabbar: rect(tabbar) ? { left: rect(tabbar).left, right: rect(tabbar).right, width: rect(tabbar).width } : null,
            missing: missing.length,
            tinyMissing: tiny,
            cards: cards.length,
            cardWidths: [...new Set(cards.map((el) => Math.round(el.getBoundingClientRect().width)))].slice(0, 6),
            clipped,
            failedImages,
            heroHeight: Math.round(rect(active?.querySelector('.fx-hero, .fx-dine, .fx-shop-title, .fx-hotel-image, .fx-hotel-type, .fx-pro-head, .fx-salon-head') ?? null)?.height ?? 0),
          };
        })()
      `)
      const issues = []
      if (metrics.bodyOverflow > 2) issues.push(`body overflows by ${metrics.bodyOverflow}px`)
      if (metrics.tabbar && (metrics.tabbar.left < -2 || metrics.tabbar.right > metrics.viewport + 2))
        issues.push(`tab bar outside viewport (${Math.round(metrics.tabbar.left)}..${Math.round(metrics.tabbar.right)})`)
      if (metrics.tinyMissing) issues.push(`${metrics.tinyMissing} unreadably small media fields`)
      if (metrics.clipped.length) issues.push(`clipped: ${metrics.clipped.join(', ')}`)
      if (metrics.failedImages.length) issues.push(`${metrics.failedImages.length} failed images`)
      if (metrics.active && metrics.active !== screen.name)
        issues.push(`expected ${screen.name}, active ${metrics.active}`)
      report.push({ concept: page.name, direction: page.direction, screen: screen.name, width: viewport.width, file, ...metrics, issues })
      console.log(`${file}  ${metrics.cards} cards  ${metrics.missing} fields  ${issues.length ? 'ISSUES: ' + issues.join('; ') : 'ok'}`)
    }
  }
}

if (process.env.MAIN_ONLY !== '1') for (const entry of extras) {
  if (process.env.MORE_ONLY === '1' && entry.screen !== 'more') continue
  const widths = entry.screen === 'more' ? [390, 1280] : [390]
  for (const width of widths) {
    const viewport = WIDTHS.find((item) => item.width === width)
    await call('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.mobile,
      screenWidth: viewport.width,
      screenHeight: viewport.height,
    })
    await call('Page.navigate', { url: `http://127.0.0.1:${server.port}/${entry.name}.html?v=${runId}-${entry.screen}-${width}` })
    await sleep(800)
    await evaluate(`
      document.querySelector('[data-splash]')?.remove();
      document.querySelector('[data-offline]')?.remove();
      document.querySelectorAll('.screen.on').forEach((el) => (el.style.animation = 'none'));
      document.fonts?.ready;
    `)
    const selector = entry.screen === 'more' ? '[data-go="more"]' : entry.screen === 'search' ? '[data-search-open]' : '[data-saved-open]'
    await evaluate(`
      (() => {
        const el = [...document.querySelectorAll('${selector}')].find((node) => node.offsetParent);
        el?.click();
      })()
    `)
    await sleep(450)
    const file = `${entry.name}--${entry.screen}--${width}.png`
    const shot = await call('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(`${OUT}/${file}`, Buffer.from(shot.data, 'base64'))
    shots += 1
    console.log(file)
  }
}

socket.close()
await fetch(`${CDP}/json/close/${target.id}`)
server.stop(true)
await writeFile(
  `${OUT}/report.json`,
  JSON.stringify({ generatedAt: new Date().toISOString(), networkFailures, report }, null, 2),
)
const failing = report.filter((entry) => entry.issues.length)
console.log(`\n${shots} screens, ${failing.length} with layout issues, ${networkFailures.length} request failures`)
if (failing.length) {
  for (const entry of failing) console.log(`${entry.file}: ${entry.issues.join('; ')}`)
}
