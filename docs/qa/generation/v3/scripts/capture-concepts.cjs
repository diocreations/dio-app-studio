/* Capture the twelve concepts (three per business) at exactly 390x844.

   Preview-only: ?concept=<direction> plus the axis preset renders a seeded
   composition and saves nothing, so this run leaves the fixture DB untouched. */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const { base, apps } = require('./apps.json')

const BASE = process.env.BASE || base
const OUT = process.env.CONCEPT_OUT || path.join(__dirname, '..')

const PRESETS = [
  'variant=1&density=roomy&corners=soft&hero=image&heroScale=immersive&order=catalog',
  'variant=0&density=standard&corners=sharp&hero=image&heroScale=compact&order=offers',
  'variant=2&density=cozy&corners=round&hero=centered&heroScale=tall&order=visit',
]

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch()
  const rows = []
  for (const app of apps) {
    for (let index = 0; index < app.directions.length; index++) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
      const direction = app.directions[index]
      const url = `${BASE}/p/${app.token}/app?concept=${direction}&${PRESETS[index]}`
      await page.goto(url, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1600)
      const file = path.join(OUT, `${app.key}-concept-${index + 1}.png`)
      await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 390, height: 844 } })
      const dims = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }))
      const heading = await page.evaluate(() => document.querySelector('h1')?.textContent?.trim() || '')
      rows.push({ app: app.key, concept: index + 1, direction, dims, heading })
      await page.close()
    }
  }
  await browser.close()
  console.table(rows)
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
