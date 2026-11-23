/**
 * P0 business-identity journeys.
 *
 *   bun scripts/capture-p0-journeys.mjs
 *
 * Drives the running local Worker (PLATTR_ORIGIN, default :5173) through the
 * mandatory journeys and records, for each one: the input, the identity the
 * page shows, the catalogue/text in each concept, three desktop and three
 * mobile screenshots, the saved build after reload, and the isolation checks.
 *
 * It writes docs/qa/p0-identity-2026-11-22/journeys.json. It never deploys and
 * never touches production data. Local D1 budgets are reset between journeys
 * because this is a repeatable local test, not a customer session.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { Database } from 'bun:sqlite'

const ORIGIN = process.env.PLATTR_ORIGIN || 'http://127.0.0.1:5173'
const CDP = process.env.CDP_ORIGIN || 'http://127.0.0.1:9223'
const OUT = process.env.P0_OUT || 'docs/qa/p0-identity-2026-11-22'
const DB =
  process.env.PLATTR_DB ||
  '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/017f96ff90c988f5b934d2789b404a0a0f513de2918297f1afba6b3581b20f80.sqlite'

await mkdir(OUT, { recursive: true })

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function resetBudgets() {
  const db = new Database(DB)
  db.query('delete from daily_budget').run()
  db.query('update import_budget set used = 0').run()
  db.close()
}

async function openTab() {
  const target = await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' }).then((response) => response.json())
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  let sequence = 0
  const pending = new Map()
  const exceptions = []
  const closes = []

  function call(method, params = {}) {
    const id = ++sequence
    socket.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
  }

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.method === 'Runtime.exceptionThrown') {
      exceptions.push(
        message.params.exceptionDetails?.exception?.description ||
          message.params.exceptionDetails?.text ||
          'unknown exception',
      )
    }
    if (message.method === 'Network.loadingFailed' && !message.params?.canceled) {
      closes.push({ error: message.params.errorText })
    }
    if (!message.id) return
    const entry = pending.get(message.id)
    if (!entry) return
    pending.delete(message.id)
    message.error ? entry.reject(new Error(message.error.message)) : entry.resolve(message.result)
  })

  await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }))
  await call('Page.enable')
  await call('Runtime.enable')
  await call('Network.enable')

  async function evaluate(expression) {
    const answer = await call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      timeout: 15000,
    })
    if (answer.exceptionDetails)
      throw new Error(answer.exceptionDetails.exception?.description || answer.exceptionDetails.text)
    return answer.result?.value
  }

  async function waitFor(expression, label, timeout = 180000) {
    const started = Date.now()
    while (Date.now() - started < timeout) {
      if (await evaluate(expression).catch(() => false)) return true
      await sleep(500)
    }
    throw new Error(`Timed out waiting for ${label}`)
  }

  async function viewport(width, height) {
    await call('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 600,
      screenWidth: width,
      screenHeight: height,
    })
  }

  async function goto(url) {
    await call('Page.navigate', { url })
    await waitFor("document.readyState === 'complete'", `load ${url}`)
  }

  async function capture(path) {
    const metrics = await call('Page.getLayoutMetrics')
    const width = Math.min(1440, Math.ceil(metrics.cssContentSize.width))
    const height = Math.min(2600, Math.ceil(metrics.cssContentSize.height))
    const shot = await call('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height, scale: 1 },
    })
    await writeFile(path, Buffer.from(shot.data, 'base64'))
    return path
  }

  async function close() {
    try {
      socket.close()
    } catch {}
    await fetch(`${CDP}/json/close/${target.id}`).catch(() => {})
  }

  return { call, evaluate, waitFor, viewport, goto, capture, close, exceptions, closes }
}

/** What a rendered application says about itself, including its images. */
const APP_READ = `(() => {
  const text = document.body.innerText.replace(/\\s+/g, ' ').trim()
  const root = getComputedStyle(document.documentElement)
  const palette = {
    bg: root.getPropertyValue('--bg').trim(),
    surface: root.getPropertyValue('--surface').trim(),
    ink: root.getPropertyValue('--ink').trim(),
    accent: root.getPropertyValue('--accent').trim(),
    display: root.getPropertyValue('--font-display').trim() || root.getPropertyValue('--display').trim(),
  }
  const seen = new Set()
  const cards = [...document.querySelectorAll('article, li, a, div')]
    .filter((el) => el.querySelector('img') && /[₹$£€]\\s?\\d/.test(el.innerText || '') && (el.innerText || '').length < 320)
    .map((el) => ({
      name: (el.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 100),
      image: el.querySelector('img')?.currentSrc || el.querySelector('img')?.src || '',
      alt: el.querySelector('img')?.alt || '',
    }))
    .filter((card) => {
      const key = card.image + '|' + card.name.slice(0, 30)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 14)
  const images = [...document.images].map((img) => ({
    src: (img.currentSrc || img.src || '').slice(0, 220),
    alt: img.alt || '',
    loaded: img.complete && img.naturalWidth > 0,
    visible: img.offsetParent !== null,
    width: img.naturalWidth,
  })).filter((img) => img.src && img.visible)
  const h1 = document.querySelector('h1')
  const nav = [...document.querySelectorAll('nav a, header a')].map((a) => a.textContent.trim()).filter(Boolean)
  return {
    title: document.title,
    name: h1 ? h1.textContent.trim().slice(0, 120) : '',
    text: text.slice(0, 2200),
    nav: [...new Set(nav)].slice(0, 14),
    background: palette.bg || getComputedStyle(document.body).backgroundColor,
    palette,
    displayFont: h1 ? getComputedStyle(h1).fontFamily : '',
    images,
    imageCount: images.length,
    loadedImages: images.filter((img) => img.loaded).length,
    failedImages: images.filter((img) => !img.loaded).length,
    cards,
  }
})()`

/** Lazy-loaded product photographs only fetch when the card is near the
 *  viewport. Walk the page first, then wait for every image to settle, so
 *  "not loaded yet" is never mistaken for "no photograph". */
async function settleImages(tab) {
  await tab.evaluate(`(async () => {
    // The app scrolls inside .screen panes, not the window. A lazy image inside
    // one of those panes never fetches until that pane itself is scrolled.
    const panes = [...document.querySelectorAll('*')].filter((el) =>
      el.scrollHeight > el.clientHeight + 100 &&
      el.clientHeight > 200 &&
      /(auto|scroll)/.test(getComputedStyle(el).overflowY)
    ).slice(0, 6)
    for (const pane of panes) {
      const step = Math.max(200, Math.floor(pane.clientHeight * 0.8))
      for (let y = 0; y < pane.scrollHeight; y += step) {
        pane.scrollTop = y
        await new Promise((resolve) => setTimeout(resolve, 70))
      }
      pane.scrollTop = 0
    }
    const step = Math.max(300, Math.floor(window.innerHeight * 0.8))
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y)
      await new Promise((resolve) => setTimeout(resolve, 70))
    }
    window.scrollTo(0, 0)
    await Promise.all([...document.images].map((img) => img.complete
      ? Promise.resolve()
      : new Promise((resolve) => { img.onload = img.onerror = resolve; setTimeout(resolve, 4000) })))
    await new Promise((resolve) => setTimeout(resolve, 300))
    return { panes: panes.length, images: document.images.length }
  })()`)
}

async function readApp(tab, url) {
  await tab.viewport(1440, 1000)
  await tab.goto(url)
  await tab.waitFor("document.body && document.body.innerText.trim().length > 20", `app ${url}`)
  // The product grid is a different pane in the same application. Open it so
  // the image evidence is the catalogue itself, not only the home screen.
  await tab.evaluate(`(() => {
    const open = document.querySelector('[data-go="catalog"]') || document.querySelector('[data-go="shop"]')
    if (open) open.click()
    return Boolean(open)
  })()`)
  await sleep(600)
  await settleImages(tab)
  return tab.evaluate(APP_READ)
}

async function screenshotsFor(tab, urls, slug, appName) {
  const shots = { desktop: [], mobile: [] }
  for (const [index, url] of urls.entries()) {
    for (const [size, width, height] of [
      ['desktop', 1440, 1000],
      ['mobile', 390, 844],
    ]) {
      await tab.viewport(width, height)
      await tab.goto(url)
      await tab.waitFor("document.body && document.body.innerText.trim().length > 20", `${size} ${url}`)
      await settleImages(tab)
      await sleep(500)
      const path = `${OUT}/${slug}-${index + 1}-${appName}-${size}.png`
      shots[size].push(await tab.capture(path))
    }
  }
  return shots
}

function conceptSummary(apps) {
  return apps.map((app) => ({
    name: app.name,
    title: app.title,
    nav: app.nav,
    background: app.background,
    palette: app.palette,
    displayFont: app.displayFont,
    imageCount: app.imageCount,
    loadedImages: app.loadedImages,
    failedImages: app.failedImages,
    cards: app.cards,
    text: app.text.slice(0, 900),
  }))
}

function different(a, b) {
  return {
    name: a.name !== b.name,
    background: a.background !== b.background,
    accent: a.palette?.accent !== b.palette?.accent,
    displayFont: a.displayFont !== b.displayFont,
    nav: JSON.stringify(a.nav) !== JSON.stringify(b.nav),
    textOrder: a.text.slice(0, 200) !== b.text.slice(0, 200),
  }
}

const ONLY = new Set((process.env.P0_ONLY || '').split(',').filter(Boolean))
const wants = (slug) => !ONLY.size || ONLY.has(slug)

const results = {
  startedAt: new Date().toISOString(),
  origin: ORIGIN,
  journeys: [],
  isolation: {},
  limitations: [],
}

const tab = await openTab()

// ---------------------------------------------------------------- URL journeys
async function urlJourney({ slug, url, mustShow, mustNotShow, shotsPrefix }) {
  resetBudgets()
  await tab.viewport(1440, 1000)
  await tab.goto(`${ORIGIN}/start`)
  await tab.evaluate(`(() => {
    const input = document.getElementById('start-url')
    input.value = ${JSON.stringify(url)}
    document.getElementById('start-form').requestSubmit()
    return true
  })()`)
  await tab.waitFor(
    "!document.querySelector('#discovery')?.hidden && document.querySelectorAll('[data-concept]').length === 3",
    `${slug} discovery`,
  )
  await tab.waitFor(
    "[...document.querySelectorAll('[data-concept] iframe')].every((frame) => frame.contentDocument && frame.contentDocument.body && frame.contentDocument.body.innerText.length > 40)",
    `${slug} concept frames`,
    90000,
  ).catch(() => false)

  const meta = await tab.evaluate(`(() => ({
    title: document.getElementById('discovery-title')?.textContent || '',
    category: document.getElementById('profile-category')?.value || '',
    name: document.getElementById('profile-name')?.value || '',
    source: document.getElementById('discovery-source')?.textContent || '',
    pages: document.getElementById('discovery-pages')?.textContent || '',
    concepts: [...document.querySelectorAll('[data-concept]')].map((card) => ({
      id: card.dataset.concept,
      heading: card.querySelector('header b')?.textContent || '',
      note: card.querySelector('header span')?.textContent || '',
      specLine: card.querySelector('p')?.textContent || '',
      preview: card.querySelector('iframe')?.src || ''
    })),
    pageText: document.body.innerText.slice(0, 4000),
    error: document.getElementById('start-error')?.textContent || ''
  }))()`)

  // Screenshots run in their own tab so the discovery tab keeps the concepts
  // it was given: re-reading the site merely to choose one would cost a second
  // import and muddy what the journey actually did.
  const shotTab = await openTab()
  const apps = []
  for (const concept of meta.concepts) {
    apps.push(await readApp(shotTab, concept.preview))
  }
  const shots = await screenshotsFor(
    shotTab,
    meta.concepts.map((concept) => concept.preview),
    slug,
    shotsPrefix,
  )
  await shotTab.close()
  const allText = meta.pageText + ' ' + apps.map((app) => app.text).join(' ')
  const missing = (mustShow || []).filter((word) => !new RegExp(word, 'i').test(allText))
  const leaked = (mustNotShow || []).filter((word) => new RegExp(word, 'i').test(allText))

  // Choosing a concept creates the owner build; reload it to prove persistence.
  await tab.viewport(1440, 1000)
  await tab.evaluate(
    `document.querySelector('[data-concept] [data-pick]').click(); document.getElementById('choose-button').click(); true`,
  )
  await tab.waitFor("location.pathname.startsWith('/p/')", `${slug} owner workspace`, 30000)
  const savedUrl = await tab.evaluate('location.href')
  const beforeReload = await tab.evaluate(`({ title: document.title, text: document.body.innerText.slice(0, 900) })`)
  await tab.goto(savedUrl)
  await tab.waitFor("document.body.innerText.trim().length > 40", `${slug} reload`)
  const afterReload = await tab.evaluate(`({ title: document.title, text: document.body.innerText.slice(0, 900) })`)

  const record = {
    input: url,
    detected: { title: meta.title, name: meta.name, category: meta.category, source: meta.source, pages: meta.pages },
    concepts: meta.concepts,
    apps: conceptSummary(apps),
    different: different(apps[0], apps[1]),
    different13: different(apps[0], apps[2]),
    screenshots: shots,
    mustShow: { words: mustShow, missing },
    mustNotShow: { words: mustNotShow, leaked },
    saved: {
      url: savedUrl,
      titleBefore: beforeReload.title,
      titleAfter: afterReload.title,
      stable: beforeReload.title === afterReload.title && afterReload.text.includes(meta.name.slice(0, 24)),
      excerpt: afterReload.text.slice(0, 500),
    },
    exceptions: tab.exceptions.splice(0),
  }
  results.journeys.push({ slug, kind: 'url', ...record })
  console.log(`\n${slug}: ${meta.title}`)
  console.log(`  category: ${meta.category} · concepts: ${meta.concepts.map((c) => c.id).join(', ')}`)
  console.log(`  leaked: ${leaked.join(', ') || 'none'} · missing: ${missing.join(', ') || 'none'}`)
  console.log(`  images: ${apps.map((app) => `${app.imageCount}/${app.loadedImages}`).join(' ')}`)
  console.log(`  saved: ${afterReload.title}`)
  return record
}

// ------------------------------------------------------------- prompt journeys
async function promptJourney({ slug, prompt, name, mustShow, mustNotShow, build = true }) {
  resetBudgets()
  await tab.viewport(1440, 1000)
  await tab.goto(`${ORIGIN}/brief`)
  await tab.waitFor("document.getElementById('wish')", `${slug} brief`)
  const fresh = await tab.evaluate(`({
    name: document.getElementById('name').value,
    wish: document.getElementById('wish').value,
    concepts: document.querySelectorAll('[data-concept]').length,
    bannerHidden: document.querySelector('[data-draft]').hidden
  })`)
  await tab.evaluate(`(() => {
    const wish = document.getElementById('wish')
    wish.value = ${JSON.stringify(prompt)}
    wish.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector('[data-wish]').click()
    return true
  })()`)
  await tab.waitFor(
    "document.querySelectorAll('[data-design-grid] [data-concept]').length === 3",
    `${slug} concepts`,
    30000,
  )
  const meta = await tab.evaluate(`(() => ({
    read: document.querySelector('[data-wish-read]')?.innerText || '',
    trade: document.querySelector('[data-design-trade]')?.textContent || '',
    name: document.getElementById('name').value,
    category: document.getElementById('category').value,
    tagline: document.getElementById('tagline').value,
    concepts: [...document.querySelectorAll('[data-design-grid] [data-concept]')].map((card) => ({
      id: card.dataset.concept,
      heading: card.querySelector('b')?.textContent || '',
      preview: card.querySelector('iframe')?.src || ''
    })),
    pageText: document.body.innerText.slice(0, 4000)
  }))()`)

  const shotTab = await openTab()
  const apps = []
  for (const concept of meta.concepts) {
    apps.push(await readApp(shotTab, concept.preview))
  }
  const shots = await screenshotsFor(
    shotTab,
    meta.concepts.map((concept) => concept.preview),
    slug,
    slug,
  )
  await shotTab.close()
  const allText = meta.pageText + ' ' + apps.map((app) => app.text).join(' ')
  const missing = (mustShow || []).filter((word) => !new RegExp(word, 'i').test(allText))
  const leaked = (mustNotShow || []).filter((word) => new RegExp(word, 'i').test(allText))

  let saved = null
  if (build && name) {
    await tab.viewport(1440, 1000)
    await tab.evaluate(`(() => {
      document.getElementById('name').value = ${JSON.stringify(name)}
      document.getElementById('name').dispatchEvent(new Event('input', { bubbles: true }))
      document.querySelector('[data-design-grid] [data-pick]').click()
      document.getElementById('brief').requestSubmit()
      return true
    })()`)
    await tab.waitFor("location.pathname.startsWith('/p/')", `${slug} build`, 30000)
    const savedUrl = await tab.evaluate('location.href')
    await tab.waitFor("document.body.innerText.trim().length > 40", `${slug} saved page`)
    const beforeReload = await tab.evaluate(`({ title: document.title, text: document.body.innerText.slice(0, 1200) })`)
    await tab.goto(savedUrl)
    await tab.waitFor("document.body.innerText.trim().length > 40", `${slug} reload`)
    const afterReload = await tab.evaluate(`({ title: document.title, text: document.body.innerText.slice(0, 1200) })`)
    saved = {
      url: savedUrl,
      titleBefore: beforeReload.title,
      titleAfter: afterReload.title,
      stable:
        beforeReload.title === afterReload.title &&
        afterReload.text.includes(name) &&
        !/GeeStores|Saree|Jhumka/i.test(afterReload.text),
      excerpt: afterReload.text.slice(0, 600),
    }
  }

  const record = {
    input: prompt,
    detected: { read: meta.read, trade: meta.trade, name: meta.name, category: meta.category, tagline: meta.tagline },
    freshBeforePrompt: fresh,
    concepts: meta.concepts,
    apps: conceptSummary(apps),
    different: different(apps[0], apps[1]),
    different13: different(apps[0], apps[2]),
    screenshots: shots,
    mustShow: { words: mustShow, missing },
    mustNotShow: { words: mustNotShow, leaked },
    saved,
    exceptions: tab.exceptions.splice(0),
  }
  results.journeys.push({ slug, kind: 'prompt', ...record })
  console.log(`\n${slug}: ${meta.trade}`)
  console.log(`  read: ${meta.read.slice(0, 120).replace(/\s+/g, ' ')}`)
  console.log(`  leaked: ${leaked.join(', ') || 'none'} · missing: ${missing.join(', ') || 'none'}`)
  console.log(`  images: ${apps.map((app) => `${app.imageCount}/${app.loadedImages}`).join(' ')}`)
  if (saved) console.log(`  saved: ${saved.titleAfter} (stable=${saved.stable})`)
  return record
}

try {
  if (wants('geestores-jewellery')) await urlJourney({
    slug: 'geestores-jewellery',
    url: 'https://geestores.com/',
    mustShow: ['GeeStores', 'Saree|Jhumka|Jewellery'],
    mustNotShow: ['Flat white|Cappuccino|Reserve a table|Florist', 'Grey placeholder'],
    shotsPrefix: 'concept',
  })

  if (wants('cafe-kochi')) await promptJourney({
    slug: 'cafe-kochi',
    prompt: 'need a website for a cafe in kochi',
    name: 'Kochi Coffee House',
    mustShow: ['Café|Cafe', 'Menu|Coffee'],
    mustNotShow: ['GeeStores', 'Saree', 'Jhumka', 'Jewellery'],
  })

  if (wants('florist-kochi')) await promptJourney({
    slug: 'florist-kochi',
    prompt: 'I run a florist in Kochi — bouquets, wedding flowers and same-day delivery',
    name: 'Kochi Bloom Room',
    mustShow: ['Florist', 'Bouquet', 'Wedding'],
    mustNotShow: ['GeeStores', 'Saree', 'Jhumka', 'Stoneware mug'],
  })

  if (wants('salon-bluetit')) await urlJourney({
    slug: 'salon-bluetit',
    url: 'https://www.bluetitlondon.com/',
    mustShow: ['Blue Tit|salon|hair'],
    mustNotShow: ['Saree|Jhumka|GeeStores|Flat white'],
    shotsPrefix: 'concept',
  })

  if (wants('professional-kochi')) await promptJourney({
    slug: 'professional-kochi',
    prompt: 'I need a website for an accounting firm in Kochi — services, fixed fees and enquiries',
    name: 'Kochi Ledger Partners',
    mustShow: ['account|advisory|fees|services'],
    mustNotShow: ['GeeStores', 'Saree', 'Jhumka', 'Reserve a table'],
  })

  // Two saved applications in separate tabs: each must read only its own business.
  const saved = results.journeys.map((journey) => journey.saved).filter(Boolean)
  if (saved.length >= 2) {
    const first = await openTab()
    const second = await openTab()
    await first.goto(saved[0].url)
    await first.waitFor("document.body.innerText.trim().length > 40", 'isolation tab one')
    await second.goto(saved[saved.length - 1].url)
    await second.waitFor("document.body.innerText.trim().length > 40", 'isolation tab two')
    const one = await first.evaluate(`({ url: location.href, title: document.title, text: document.body.innerText.slice(0, 900) })`)
    const two = await second.evaluate(`({ url: location.href, title: document.title, text: document.body.innerText.slice(0, 900) })`)
    results.isolation.twoTabs = {
      one: { url: one.url, title: one.title },
      two: { url: two.url, title: two.title },
      sameUrl: one.url === two.url,
      firstNameLeaksIntoSecond: /Kochi Coffee House|Kochi Bloom Room|Kochi Ledger/.test(two.text) && /GeeStores/.test(two.text),
      secondNameLeaksIntoFirst: /Kochi Coffee House|Kochi Bloom Room|Kochi Ledger/.test(one.text) && /GeeStores/.test(one.text),
      oneExcerpt: one.text.slice(0, 300),
      twoExcerpt: two.text.slice(0, 300),
    }
    await first.close()
    await second.close()
    console.log('\nisolation: two tabs read distinct builds:', !results.isolation.twoTabs.sameUrl)
  }

  // Draft lifecycle: an imported draft must be offered, not auto-applied.
  if (wants('draft-restore')) {
  resetBudgets()
  await tab.viewport(1440, 1000)
  await tab.goto(`${ORIGIN}/brief`)
  await tab.waitFor("document.querySelector('[data-import-url], #import-url') || document.querySelector('[data-import]')", 'import form')
  const importUrl = await tab.evaluate(`(() => {
    const field = document.getElementById('site-url')
    if (!field) return null
    field.value = 'https://geestores.com/'
    field.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector('[data-import]').click()
    return true
  })()`)
  if (importUrl) {
    await tab.waitFor(
      "document.getElementById('name')?.value.length > 0 && document.querySelectorAll('[data-design-grid] [data-concept]').length === 3",
      'draft import',
      180000,
    )
    const imported = await tab.evaluate(`({
      name: document.getElementById('name').value,
      category: document.getElementById('category').value,
      wish: document.getElementById('wish').value,
      concepts: document.querySelectorAll('[data-design-grid] [data-concept]').length
    })`)
    await sleep(1400)
    await tab.goto(`${ORIGIN}/brief`)
    await tab.waitFor("document.getElementById('wish')", 'brief after import')
    await sleep(1200)
    const offered = await tab.evaluate(`({
      bannerVisible: !document.querySelector('[data-draft]').hidden,
      bannerText: document.querySelector('[data-draft]')?.innerText.slice(0, 200) || '',
      name: document.getElementById('name').value,
      wish: document.getElementById('wish').value,
      concepts: document.querySelectorAll('[data-design-grid] [data-concept]').length
    })`)
    await tab.evaluate(`document.querySelector('[data-draft-restore]')?.click(); true`)
    await sleep(1200)
    const restored = await tab.evaluate(`({
      name: document.getElementById('name').value,
      category: document.getElementById('category').value,
      wish: document.getElementById('wish').value,
      concepts: document.querySelectorAll('[data-design-grid] [data-concept]').length
    })`)
    results.draftRestore = {
      imported,
      onReload: offered,
      afterExplicitRestore: restored,
      autoApplied:
        offered.name === imported.name || offered.wish === imported.wish || offered.concepts > 0,
      restoredCorrectly:
        restored.name === imported.name &&
        restored.category === imported.category &&
        restored.concepts === 3,
    }
    console.log('\ndraft restore: offered without applying =', !results.draftRestore.autoApplied)
  } else {
    results.limitations.push('The brief page exposed no import field for the draft-restore check.')
  }
  }
} catch (error) {
  results.error = String(error && error.stack ? error.stack : error)
  console.error('JOURNEY ERROR', error)
  results.exceptions = tab.exceptions.splice(0)
} finally {
  await tab.close()
  results.finishedAt = new Date().toISOString()
  await writeFile(`${OUT}/journeys.json`, JSON.stringify(results, null, 2))
  console.log(`\nwrote ${OUT}/journeys.json`)
}
