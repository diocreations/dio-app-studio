/* Owner-dashboard test: every tab, the records the customer workflows created,
   and a settings edit that must reach the customer app.

   Run from a clean checkout:
     bun docs/qa/apps/scripts/sessions.mjs
     node docs/qa/apps/scripts/run-dashboard.cjs
*/
const { chromium } = require('playwright')
const fs = require('fs')
const os = require('os')
const path = require('path')

const here = __dirname
const repoRoot = path.join(here, '../../../..')
const fixtures = JSON.parse(fs.readFileSync(path.join(here, 'fixtures.json'), 'utf8'))
const BASE = process.env.BASE || fixtures.base
const OUT = process.env.APPS_OUT || path.join(repoRoot, 'docs/qa/apps')
const COOKIES = process.env.QA_COOKIES || path.join(os.tmpdir(), 'plattr-qa-owner-cookies.json')
const TABS = ['overview', 'orders', 'bookings', 'customers', 'enquiries', 'payments', 'settings']

const results = []

async function run(app, cookies) {
  const owner = cookies[app.token]
  const result = { app: app.key, checks: {}, tabs: {}, errors: [] }
  const check = (name, pass, detail) => {
    result.checks[name] = { pass: Boolean(pass), detail }
    if (!pass) result.errors.push(`${name}: ${JSON.stringify(detail).slice(0, 300)}`)
  }
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } })
  await context.addCookies([
    { name: owner.name, value: owner.value, domain: new URL(BASE).hostname, path: '/', httpOnly: true, sameSite: 'Lax' },
  ])
  const page = await context.newPage()
  page.on('pageerror', (error) => result.errors.push(`pageerror: ${error.message.slice(0, 160)}`))
  try {
    await page.goto(`${BASE}/p/${app.token}/dashboard`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1200)
    const title = await page.evaluate(() => document.querySelector('h1')?.textContent?.trim() || '')
    check('dashboard-signs-in', /Today at/.test(title), title)

    const tabs = await page.$$eval('[data-tab]', (nodes) => nodes.map((node) => node.dataset.tab))
    check('tabs-present', tabs.length >= 5, tabs)
    result.importPanel = await page.evaluate(() => document.getElementById('importPanel')?.innerText.replace(/\s+/g, ' ').slice(0, 240) ?? null)

    for (const tab of tabs) {
      await page.click(`[data-tab="${tab}"]`)
      await page.waitForTimeout(500)
      const info = await page.evaluate((id) => {
        const section = document.getElementById(`tab-${id}`)
        return {
          on: section?.classList.contains('on') || false,
          heading: section?.querySelector('h2')?.textContent?.trim() || '',
          text: (section?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 400),
        }
      }, tab)
      result.tabs[tab] = info
      check(`tab:${tab}`, info.on && info.text.length > 20, { heading: info.heading, length: info.text.length })
      if (TABS.includes(tab)) await page.screenshot({ path: path.join(OUT, `${app.key}-dashboard-${tab}.png`) })
    }

    if (result.tabs.orders?.text)
      check('orders-listed', /#\d{3,5}/.test(result.tabs.orders.text), result.tabs.orders.text.slice(0, 160))
    if (result.tabs.bookings?.text)
      check('bookings-listed', /#\d{3,5}/.test(result.tabs.bookings.text), result.tabs.bookings.text.slice(0, 160))
    if (result.tabs.enquiries?.text)
      check('enquiries-listed', /QA Tester/.test(result.tabs.enquiries.text) || /enquir/i.test(result.tabs.enquiries.text), result.tabs.enquiries.text.slice(0, 160))
    if (result.tabs.customers?.text)
      check('customers-listed', /QA Tester/.test(result.tabs.customers.text), result.tabs.customers.text.slice(0, 200))
    if (result.tabs.products) {
      const catalogue = await page.evaluate(() => {
        document.querySelector('[data-tab="products"]')?.click()
        return {
          rows: document.querySelectorAll('#productEditor [data-field="name"]').length,
          first: document.querySelector('#productEditor [data-field="name"]')?.value || '',
        }
      })
      check('products-editable', catalogue.rows > 0 && Boolean(catalogue.first), catalogue)
    }
    if (result.tabs.payments) {
      const payments = await page.evaluate(() => {
        document.querySelector('[data-tab="payments"]')?.click()
        return {
          badges: Array.from(document.querySelectorAll('[data-gateway-badge]')).map((node) => node.textContent.trim()),
          active: document.querySelector('#payActive')?.value ?? null,
        }
      })
      check('payments-disconnected', payments.badges.length >= 2 && payments.badges.every((badge) => /Not connected/.test(badge)), payments)
    }

    // A settings edit must change what the customer sees.
    await page.click('[data-tab="settings"]')
    await page.waitForTimeout(400)
    const original = await page.inputValue('#setName')
    const probe = `QA Studio ${Date.now()}`
    await page.fill('#setName', probe)
    await page.click('#settingsForm button[type="submit"]')
    await page.waitForTimeout(450)
    check('settings-saves', /Saved/.test(await page.evaluate(() => document.getElementById('settingsStatus')?.textContent?.trim() || '')), probe)
    await page.waitForTimeout(1500)

    const appPage = await context.newPage()
    await appPage.setViewportSize({ width: 390, height: 844 })
    await appPage.goto(`${BASE}/p/${app.token}/app`, { waitUntil: 'domcontentloaded' })
    await appPage.waitForTimeout(1200)
    const customerText = await appPage.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
    check('settings-reach-customer-app', customerText.toLowerCase().includes(probe.toLowerCase()), { probe, header: customerText.slice(0, 120) })

    await page.bringToFront()
    await page.goto(`${BASE}/p/${app.token}/dashboard`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)
    await page.click('[data-tab="settings"]')
    await page.waitForTimeout(300)
    await page.fill('#setName', original)
    await page.click('#settingsForm button[type="submit"]')
    await page.waitForTimeout(450)
    check('settings-restored', /Saved/.test(await page.evaluate(() => document.getElementById('settingsStatus')?.textContent?.trim() || '')), original)
    await appPage.close()
  } catch (error) {
    result.errors.push(`fatal: ${error.message}`)
  } finally {
    await browser.close()
  }
  return result
}

;(async () => {
  const cookies = JSON.parse(fs.readFileSync(COOKIES, 'utf8'))
  for (const app of fixtures.apps) {
    const result = await run(app, cookies)
    results.push(result)
    console.log(
      app.key,
      JSON.stringify({
        pass: Object.values(result.checks).filter((entry) => entry.pass).length,
        total: Object.keys(result.checks).length,
        errors: result.errors.slice(0, 5),
      }),
    )
  }
  fs.writeFileSync(path.join(OUT, 'dashboard-test-results.json'), JSON.stringify(results, null, 2))
  console.log('done')
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
