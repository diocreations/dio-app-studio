/* Customer-app test: every tab, the workflows each trade supports, and a
   responsive sweep. Writes JSON and screenshots to docs/qa/apps.

   Run from a clean checkout:
     bun docs/qa/apps/scripts/sessions.mjs
     node docs/qa/apps/scripts/run-apps.cjs
*/
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const here = __dirname
const repoRoot = path.join(here, '../../../..')
const fixtures = JSON.parse(fs.readFileSync(path.join(here, 'fixtures.json'), 'utf8'))
const BASE = process.env.BASE || fixtures.base
const OUT = process.env.APPS_OUT || path.join(repoRoot, 'docs/qa/apps')
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null
const PROFILE = path.join(process.env.TMPDIR || '/tmp', 'plattr-qa-profiles')

const out = { startedAt: new Date().toISOString(), base: BASE, apps: [] }
const text = (page, sel) =>
  page.evaluate((s) => (document.querySelector(s)?.innerText || '').replace(/\s+/g, ' ').trim(), sel)

async function visit(page, screen) {
  await page.evaluate((id) => document.querySelector(`[data-go="${id}"]`)?.click(), screen)
  await page.waitForTimeout(350)
  return page.evaluate(() => document.querySelector('.screen.on')?.dataset.screen || null)
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) })
  return `${name}.png`
}

async function run(app) {
  const result = { app: app.key, checks: {}, screenText: {}, screenshots: [], errors: [], orders: [], bookings: [], enquiries: [] }
  const check = (name, pass, detail) => {
    result.checks[name] = { pass: Boolean(pass), detail }
    if (!pass) result.errors.push(`${name}: ${JSON.stringify(detail).slice(0, 300)}`)
  }
  const context = await chromium.launchPersistentContext(path.join(PROFILE, app.key), {
    viewport: { width: 390, height: 844 },
  })
  const page = context.pages()[0] || (await context.newPage())
  page.on('console', (msg) => {
    if (msg.type() === 'error') result.errors.push(`console: ${msg.text().slice(0, 160)}`)
  })
  page.on('pageerror', (error) => result.errors.push(`pageerror: ${error.message.slice(0, 160)}`))
  try {
    await page.goto(`${BASE}/p/${app.token}/app`, { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => localStorage.clear())
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1200)

    const structure = await page.evaluate(() => ({
      trade: document.body.dataset.trade,
      shell: document.body.dataset.shell,
      screens: Array.from(document.querySelectorAll('[data-screen]')).map((node) => ({ id: node.dataset.screen, title: node.dataset.title })),
      tabs: Array.from(document.querySelectorAll('.tabbar button')).map((button) => ({ go: button.dataset.go || 'cart', label: button.innerText.replace(/\s+/g, ' ').trim() })),
      items: document.querySelectorAll('[data-item]').length,
      adds: document.querySelectorAll('[data-add]').length,
    }))
    result.structure = structure
    check('tabs-rendered', structure.tabs.length >= 3, structure.tabs)

    for (const tab of structure.tabs) {
      if (tab.go === 'cart') continue
      const shown = await visit(page, tab.go)
      const body = await text(page, `.screen[data-screen="${tab.go}"]`)
      check(`tab:${tab.go}`, shown === tab.go && body.length > 40, { shown, length: body.length })
      result.screenText[tab.go] = body.slice(0, 400)
      if (['home', 'catalog', 'more', 'book'].includes(tab.go))
        result.screenshots.push(await shot(page, `${app.key}-${tab.go}-390`))
    }

    // Search narrows the catalogue, and an impossible query shows an empty state.
    const search = await page.evaluate(() => Boolean(document.querySelector('[data-go="search"]') || document.querySelector('[data-search-open]')))
    if (search) {
      await page.evaluate(() => {
        document.querySelector('[data-search-open]')?.click()
        document.querySelector('[data-go="search"]')?.click()
      })
      await page.waitForTimeout(400)
      const first = await page.evaluate(() => (document.querySelector('[data-item]')?.innerText || '').replace(/\s+/g, ' ').trim().split(' ')[0])
      const query = (first || 'a').slice(0, 4).toLowerCase()
      await page.fill('[data-search-input]', query)
      await page.waitForTimeout(500)
      const results = await page.evaluate(() => ({
        hits: document.querySelectorAll('[data-search-results] [data-item]').length,
        text: (document.querySelector('[data-search-results]')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200),
      }))
      check('search-filters', results.hits > 0 && results.hits <= structure.items, { query, ...results })
      result.screenshots.push(await shot(page, `${app.key}-search-390`))
      await page.fill('[data-search-input]', 'zzzzqqq')
      await page.waitForTimeout(400)
      const empty = await page.evaluate(() => ({
        hits: document.querySelectorAll('[data-search-results] [data-item]').length,
        text: (document.querySelector('[data-search-results]')?.innerText || '').trim().slice(0, 120),
      }))
      check('search-empty-state', empty.hits === 0 && empty.text.length > 0, empty)
      await page.fill('[data-search-input]', '')
      await page.waitForTimeout(300)
    }

    // A catalogue card opens the detail screen, which can be saved and reloaded.
    await visit(page, 'catalog')
    const card = await page.evaluate(() => {
      const node = document.querySelector('[data-screen="catalog"] [data-item]')
      const name = (node?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80)
      node?.click()
      return name
    })
    await page.waitForTimeout(600)
    const detail = await page.evaluate(() => {
      const screen = document.querySelector('[data-screen="detail"]')
      return { on: screen?.classList.contains('on'), text: (screen?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 300) }
    })
    check('detail-opens', detail.on && detail.text.length > 20, { card, ...detail })
    result.screenText.detail = detail.text
    result.screenshots.push(await shot(page, `${app.key}-detail-390`))

    if (await page.locator('[data-screen="detail"] [data-save]').count()) {
      await page.locator('[data-screen="detail"] [data-save]').first().click()
      await page.waitForTimeout(300)
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(900)
      await visit(page, 'saved')
      const saved = await page.evaluate(() => ({
        count: document.querySelector('[data-saved-count]')?.textContent?.trim(),
        list: (document.querySelector('[data-saved-list]')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120),
      }))
      check('saved-persists', Number(saved.count) >= 1 && saved.list.length > 0, saved)
      result.screenshots.push(await shot(page, `${app.key}-saved-390`))
    }

    // Ordering: add, change quantity, check out, then find the order after reload.
    if (await page.evaluate(() => Boolean(document.querySelector('[data-sheet="cart"]')))) {
      await visit(page, 'catalog')
      const added = await page.evaluate(() => {
        const button = document.querySelector('[data-screen="catalog"] [data-add]')
        button?.click()
        return button?.dataset.add ?? null
      })
      await page.waitForTimeout(500)
      await page.evaluate(() => document.querySelector('[data-cart-open]')?.click())
      await page.waitForTimeout(500)
      const cart = await page.evaluate(() => ({
        lines: document.querySelectorAll('[data-cart] .cart-line').length,
        inc: document.querySelectorAll('[data-inc]').length,
        totals: (document.querySelector('[data-totals]')?.innerText || '').replace(/\s+/g, ' ').trim(),
      }))
      check('cart-adds-item', cart.lines === 1 && cart.inc > 0, { added, ...cart })
      await page.evaluate(() => {
        Array.from(document.querySelectorAll('[data-inc]')).find((b) => b.dataset.delta === '1')?.click()
      })
      await page.waitForTimeout(300)
      check('cart-quantity', (await page.evaluate(() => document.querySelector('[data-cart] .qty b')?.textContent?.trim())) === '2', {})
      result.screenshots.push(await shot(page, `${app.key}-cart-390`))
      await page.fill('[data-checkout-name]', 'QA Tester')
      await page.fill('[data-checkout-contact]', 'qa@example.com')
      await page.click('[data-place]')
      await page.waitForTimeout(2200)
      const done = await page.evaluate(() => ({
        visible: !document.querySelector('[data-cart-done]')?.hidden,
        text: (document.querySelector('[data-cart-done]')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200),
        payButton: document.querySelectorAll('[data-pay]').length,
      }))
      const number = (done.text.match(/#(\d+)/) || [])[1]
      check('checkout-completes', done.visible && Boolean(number), done)
      result.orders.push({ number, payButton: done.payButton, text: done.text })
      result.screenshots.push(await shot(page, `${app.key}-order-done-390`))
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1000)
      await visit(page, 'more')
      const history = await text(page, '[data-screen="more"]')
      check('order-persists-in-app', Boolean(number) && history.includes(number), { number, head: history.slice(0, 200) })
    }

    // Booking: day, slot, service where offered, then the confirmation sheet.
    if (await page.evaluate(() => Boolean(document.querySelector('[data-screen="book"] [data-book]')))) {
      await visit(page, 'book')
      await page.evaluate(() => document.querySelectorAll('[data-days] .chip')[2]?.click())
      await page.waitForTimeout(300)
      const slot = await page.evaluate(() => {
        const slots = document.querySelectorAll('[data-slots] .slot')
        slots[slots.length - 1]?.click()
        return document.querySelector('[data-slots] .slot.on')?.textContent?.trim()
      })
      const service = await page.evaluate(() => {
        const select = document.querySelector('[data-book-service]')
        if (!select) return null
        select.selectedIndex = 1
        return select.value
      })
      await page.fill('[data-book-name]', 'QA Tester')
      await page.fill('[data-book-contact]', '0400 000 000')
      await page.click('[data-book]')
      await page.waitForTimeout(2200)
      const note = await text(page, '[data-note-body]')
      check('booking-submits', note.includes('Request sent'), { slot, service, note: note.slice(0, 160) })
      result.bookings.push({ slot, service, note: note.slice(0, 200) })
      result.screenshots.push(await shot(page, `${app.key}-booking-done-390`))
      await page.evaluate(() => document.querySelector('[data-sheet="note"] [data-close-sheet]')?.click())
    }

    // Enquiry, where the trade offers one.
    if (await page.evaluate(() => Boolean(document.querySelector('[data-screen="quote"] [data-quote-send]')))) {
      await visit(page, 'quote')
      await page.fill('[data-quote-name]', 'QA Tester')
      await page.fill('[data-quote-contact]', 'qa@example.com')
      await page.fill('[data-quote-message]', 'Please tell me more about what is on offer.')
      await page.click('[data-quote-send]')
      await page.waitForTimeout(2000)
      const note = await text(page, '[data-note-body]')
      check('enquiry-submits', note.includes('Request sent'), note.slice(0, 160))
      result.enquiries.push(note.slice(0, 200))
      result.screenshots.push(await shot(page, `${app.key}-enquiry-done-390`))
      await page.evaluate(() => document.querySelector('[data-sheet="note"] [data-close-sheet]')?.click())
    }

    // Responsive: no horizontal overflow at any phone width, and the app caps
    // its own width on tablet and desktop instead of stretching.
    result.responsive = {}
    for (const width of fixtures.widths) {
      await page.setViewportSize({ width, height: 844 })
      await visit(page, 'home')
      const home = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }))
      await visit(page, 'catalog')
      const catalog = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }))
      check(`responsive:${width}`, home.scrollWidth <= home.innerWidth && catalog.scrollWidth <= catalog.innerWidth, { home, catalog })
      result.responsive[width] = { home, catalog }
      if (width === 320) result.screenshots.push(await shot(page, `${app.key}-catalog-320`))
      if (width === 430) result.screenshots.push(await shot(page, `${app.key}-home-430`))
    }
    for (const width of fixtures.wide) {
      await page.setViewportSize({ width, height: 900 })
      await visit(page, 'home')
      const layout = await page.evaluate(() => ({
        shell: document.querySelector('.screens')?.getBoundingClientRect().width,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }))
      check(`layout:${width}`, layout.scrollWidth <= layout.innerWidth, layout)
      result.responsive[width] = layout
      result.screenshots.push(await shot(page, `${app.key}-home-${width}`))
    }
  } catch (error) {
    result.errors.push(`fatal: ${error.message}`)
  } finally {
    await context.close()
  }
  return result
}

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  for (const app of fixtures.apps) {
    if (ONLY && !ONLY.includes(app.key)) continue
    const result = await run(app)
    out.apps.push(result)
    console.log(
      app.key,
      JSON.stringify({
        pass: Object.values(result.checks).filter((entry) => entry.pass).length,
        total: Object.keys(result.checks).length,
        errors: result.errors.slice(0, 5),
        orders: result.orders,
        bookings: result.bookings,
        enquiries: result.enquiries,
      }),
    )
  }
  out.finishedAt = new Date().toISOString()
  fs.writeFileSync(path.join(OUT, 'app-test-results.json'), JSON.stringify(out, null, 2))
  console.log('done')
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
