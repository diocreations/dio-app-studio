#!/usr/bin/env bun
/**
 * Release-readiness visual evidence for the fifteen existing benchmark apps.
 * Reads saved app tokens; never crawls or creates content.
 *
 *   bun scripts/release-readiness-visual.mjs
 *
 * Home/catalogue/detail at 390 for every concept, plus 320/430/768/1280 for
 * every concept. Writes screenshots, contact sheets and a
 * machine-readable layout report under docs/qa/release-readiness-2026-11-22/.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const CDP = 'http://127.0.0.1:9223'
const ORIGIN = 'http://127.0.0.1:5173'
const OUT = process.env.VISUAL_OUT ?? 'docs/qa/release-readiness-2026-11-22/concepts'
const SHEETS = process.env.VISUAL_SHEETS ?? 'docs/qa/release-readiness-2026-11-22/sheets'
const APPS = JSON.parse(await readFile(process.env.VISUAL_APPS ?? '.chrome-qa/generation-benchmark-apps-audit.json', 'utf8'))
const WIDTHS = [
  { width: 320, height: 700, mobile: true, label: 'small phone' },
  { width: 430, height: 932, mobile: true, label: 'large phone' },
  { width: 768, height: 1024, mobile: false, label: 'tablet' },
  { width: 1280, height: 900, mobile: false, label: 'desktop' },
]
const REPRESENTATIVE = APPS
await mkdir(OUT, { recursive: true })
await mkdir(SHEETS, { recursive: true })

const target = await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' }).then((response) => response.json())
const socket = new WebSocket(target.webSocketDebuggerUrl)
let sequence = 0
const pending = new Map()
const call = (method, params = {}) => {
  const id = ++sequence
  socket.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}
const networkFailures = []
const consoleErrors = []
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.method === 'Runtime.exceptionThrown')
    consoleErrors.push(message.params?.exceptionDetails?.exception?.description ?? message.params?.exceptionDetails?.text ?? 'exception')
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
  if (answer.exceptionDetails) throw new Error(answer.exceptionDetails.exception?.description ?? answer.exceptionDetails.text)
  return answer.result?.value
}
const viewport = async (width, height, mobile) => {
  await call('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
    screenWidth: width,
    screenHeight: height,
  })
}
const shot = async (name) => {
  const capture = await call('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(`${OUT}/${name}.png`, Buffer.from(capture.data, 'base64'))
}
const open = async (app, query = '') => {
  await call('Page.navigate', { url: `${ORIGIN}/p/${app.token}/app${query}` })
  await sleep(1000)
  await evaluate(`
    document.querySelector('[data-splash]')?.remove();
    document.querySelector('[data-offline]')?.remove();
    document.querySelectorAll('.screen.on').forEach((el) => (el.style.animation = 'none'));
  `)
  await evaluate('document.fonts?.ready')
  await sleep(350)
}
const clickGo = async (kind) => {
  const clicked = await evaluate(`(() => {
    const tab = [...document.querySelectorAll('.tabbar [data-go="${kind}"]')].find((el) => el.offsetParent);
    const other = [...document.querySelectorAll('[data-go="${kind}"]')].find((el) => el.offsetParent);
    const target = tab || other;
    if (!target) return false;
    target.click();
    return true;
  })()`)
  await sleep(600)
  return clicked
}
const metrics = async () =>
  evaluate(`(() => {
    const active = document.querySelector('.screen.on');
    const rect = (el) => el ? el.getBoundingClientRect() : null;
    const tabbar = document.querySelector('.tabbar');
    const missing = [...document.querySelectorAll('.screen.on .fx-art.is-missing')];
    const cards = [...document.querySelectorAll('.screen.on .fx-product, .screen.on .rl-card, .screen.on .fx-service, .screen.on .fx-room, .screen.on .tile, .screen.on [data-item]')];
    const clipped = [...document.querySelectorAll('.screen.on *')].filter((el) => {
      const style = getComputedStyle(el);
      if (style.overflow === 'visible' || style.display === 'none') return false;
      if (el.closest('.rec-row, .fx-products, .rl-grid, .fx-room-stack, .fx-cats')) return false;
      return el.scrollWidth > el.clientWidth + 3 || el.scrollHeight > el.clientHeight + 3;
    }).slice(0, 10).map((el) => (el.className || el.tagName).toString().slice(0, 80));
    const failedImages = [...document.querySelectorAll('.screen.on img')]
      .filter((img) => img.complete && img.naturalWidth === 0)
      .map((img) => img.getAttribute('src'));
    return {
      active: active?.dataset.screen ?? null,
      title: active?.dataset.title ?? null,
      bodyOverflow: document.documentElement.scrollWidth - innerWidth,
      scrollHeight: document.documentElement.scrollHeight,
      tabbar: rect(tabbar) ? { left: Math.round(rect(tabbar).left), right: Math.round(rect(tabbar).right), width: Math.round(rect(tabbar).width) } : null,
      missing: missing.length,
      cards: cards.length,
      cardWidths: [...new Set(cards.map((el) => Math.round(el.getBoundingClientRect().width)))].slice(0, 6),
      clipped,
      failedImages,
      heroHeight: Math.round(rect(active?.querySelector('.fx-hero, .fx-dine, .fx-shop-title, .fx-hotel-image, .fx-hotel-type, .fx-pro-head, .fx-salon-head') ?? null)?.height ?? 0),
      navLabels: [...document.querySelectorAll('.tabbar [data-go]')].filter((el) => el.offsetParent).map((el) => el.innerText.trim()).slice(0, 8),
    };
  })()`)

const report = []
const capture = async (app, widthConfig, screens, tag) => {
  await viewport(widthConfig.width, widthConfig.height, widthConfig.mobile)
  for (const screen of screens) {
    await open(app)
    if (screen === 'catalog') {
      const clicked = await clickGo('catalog')
      if (!clicked) report.push({ site: app.site, direction: app.direction, screen, width: widthConfig.width, skipped: 'no catalogue navigation' })
    } else if (screen === 'detail') {
      await clickGo('catalog')
      await sleep(400)
      const clicked = await evaluate(`(() => { const item = document.querySelector('.screen.on [data-item]'); if (!item) return false; item.click(); return true })()`)
      await sleep(650)
      if (!clicked) report.push({ site: app.site, direction: app.direction, screen, width: widthConfig.width, skipped: 'no catalogue item' })
    }
    const file = `${app.site}--${app.direction}--${screen}--${widthConfig.width}`
    await shot(file)
    const values = await metrics()
    const issues = []
    if (values.bodyOverflow > 2) issues.push(`body overflows by ${values.bodyOverflow}px`)
    if (values.tabbar && (values.tabbar.left < -2 || values.tabbar.right > widthConfig.width + 2))
      issues.push(`tab bar outside viewport (${values.tabbar.left}..${values.tabbar.right})`)
    if (values.clipped.length) issues.push(`clipped: ${values.clipped.join(', ')}`)
    if (values.failedImages.length) issues.push(`${values.failedImages.length} failed images`)
    if (values.missing) issues.push(`${values.missing} missing-art fields`)
    if (screen === 'detail' && values.active !== 'detail') issues.push(`detail did not open (active ${values.active})`)
    if (screen === 'catalog' && values.active !== 'catalog') issues.push(`catalogue did not open (active ${values.active})`)
    report.push({ site: app.site, direction: app.direction, screen, width: widthConfig.width, file, ...values, issues })
    console.log(`${file}  ${values.cards} cards  ${issues.length ? 'ISSUES: ' + issues.join('; ') : 'ok'}`)
  }
}

for (const app of APPS) await capture(app, { width: 390, height: 844, mobile: true }, ['home', 'catalog', 'detail'], 'all')
for (const app of REPRESENTATIVE) await capture(app, WIDTHS[0], ['home'], 'responsive-small')
for (const app of REPRESENTATIVE) await capture(app, WIDTHS[1], ['home'], 'responsive-large')
for (const app of REPRESENTATIVE) await capture(app, WIDTHS[2], ['home'], 'responsive-tablet')
for (const app of REPRESENTATIVE) await capture(app, WIDTHS[3], ['home'], 'responsive-desktop')

// Contact sheets are assembled locally so the visual evidence is reviewable in
// five trade sheets and four responsive sheets instead of 65 loose files.
const imageFor = (site, direction, screen, width) =>
  `file://${resolve(OUT)}/${site}--${direction}--${screen}--${width}.png`
const sheet = async (name, columns, cells) => {
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#1d1c1a;color:#f4efe6;font:13px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;padding:22px}
    h1{font:600 22px/1.2 Georgia,serif;margin:0 0 4px}p{color:#bcb4a6;margin:0 0 18px}
    .grid{display:grid;grid-template-columns:repeat(${columns},1fr);gap:16px}
    figure{margin:0;background:#2b2926;border-radius:10px;overflow:hidden}
    img{width:100%;display:block;background:#eee}
    figcaption{padding:8px 10px;font-size:12px} b{color:#f4efe6} span{color:#bcb4a6}
  </style><h1>${name}</h1><p>${cells.length} captured screens · 390px unless labelled</p><div class="grid">
  ${cells.map((cell) => `<figure><img src="${cell.src}"><figcaption><b>${cell.title}</b><br><span>${cell.sub}</span></figcaption></figure>`).join('')}
  </div>`
  const path = resolve(`${SHEETS}/${name}.html`)
  await writeFile(path, html)
  await call('Page.navigate', { url: `file://${path}` })
  await sleep(900)
  await evaluate('document.fonts?.ready')
  const size = await evaluate(`({ width: Math.max(1200, document.documentElement.scrollWidth), height: document.documentElement.scrollHeight })`)
  await viewport(size.width, size.height, false)
  await sleep(300)
  const capture = await call('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: size.width, height: size.height, scale: 1 },
  })
  await writeFile(`${SHEETS}/${name}.png`, Buffer.from(capture.data, 'base64'))
  console.log(`SHEET ${SHEETS}/${name}.png  ${size.width}x${size.height}`)
}

for (const site of [...new Set(APPS.map((app) => app.site))]) {
  const apps = APPS.filter((app) => app.site === site)
  const cells = []
  for (const app of apps)
    for (const screen of ['home', 'catalog', 'detail'])
      cells.push({
        src: imageFor(site, app.direction, screen, 390),
        title: `${app.name} · ${app.direction}`,
        sub: `${screen} · 390px`,
      })
  await sheet(`trade-${site}`, 3, cells)
}
for (const width of [320, 430, 768, 1280]) {
  const cells = REPRESENTATIVE.map((app) => ({
    src: imageFor(app.site, app.direction, 'home', width),
    title: `${app.name} · ${app.direction}`,
    sub: `home · ${width}px`,
  }))
  await sheet(`responsive-${width}`, 5, cells)
}

socket.close()
await fetch(`${CDP}/json/close/${target.id}`).catch(() => {})
await writeFile(
  `${OUT}/visual.json`,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      origin: ORIGIN,
      apps: APPS.length,
      screens: report.length,
      networkFailures,
      consoleErrors,
      report,
      issueCount: report.filter((entry) => entry.issues?.length).length,
    },
    null,
    2,
  ),
)
console.log(`\n${report.length} screens, ${report.filter((entry) => entry.issues?.length).length} with issues, ${networkFailures.length} network failures`)
for (const entry of report.filter((entry) => entry.issues?.length)) console.log(`${entry.file}: ${entry.issues.join('; ')}`)
