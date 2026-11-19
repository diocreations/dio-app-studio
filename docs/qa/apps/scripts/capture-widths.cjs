/* Capture the same screens at every supported width, for visual review.

     node docs/qa/apps/scripts/capture-widths.cjs

   Writes docs/qa/apps/<app>-<screen>-<width>.png. Read-only: it never adds to a
   cart or books anything.
*/
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const here = __dirname
const repoRoot = path.join(here, '../../../..')
const fixtures = JSON.parse(fs.readFileSync(path.join(here, 'fixtures.json'), 'utf8'))
const BASE = process.env.BASE || fixtures.base
const OUT = process.env.APPS_OUT || path.join(repoRoot, 'docs/qa/apps')
const widths = [...fixtures.widths, ...fixtures.wide]
const screens = ['home', 'catalog']

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch()
  for (const app of fixtures.apps) {
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto(`${BASE}/p/${app.token}/app`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)
    for (const width of widths) {
      await page.setViewportSize({ width, height: width > 600 ? 900 : 844 })
      for (const screen of screens) {
        await page.evaluate((id) => document.querySelector(`[data-go="${id}"]`)?.click(), screen)
        await page.waitForTimeout(400)
        await page.screenshot({ path: path.join(OUT, `${app.key}-${screen}-${width}.png`) })
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      if (overflow > 0) console.log(`${app.key} ${width}: overflow ${overflow}px`)
    }
    await context.close()
  }
  await browser.close()
  console.log('done')
})()
