/**
 * Five-app regression sweep.
 *
 * Checks the things the fixture investigation found broken: business identity,
 * catalogue and prices, featured items, section visibility, offers, media
 * ownership, stale document data, invented copy, horizontal overflow at every
 * supported width, readable text, and editor/published parity.
 *
 *   bun docs/qa/apps/scripts/sessions.mjs
 *   bun docs/qa/apps/scripts/repair-fixtures.mjs
 *   bun docs/qa/apps/scripts/run-regression.mjs
 *
 * The data half reads the local D1 fixture database. The browser half uses the
 * same Playwright install as the other harnesses and is skipped with
 * `--no-browser`. Writes JSON to docs/qa/apps/regression-results.json.
 */
import { Database } from 'bun:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { localDatabase } from './sessions.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(here, '../../../..')
const fixtures = JSON.parse(fs.readFileSync(path.join(here, 'fixtures.json'), 'utf8'))
const BASE = process.env.BASE || fixtures.base
const WIDTHS = [...(fixtures.widths ?? []), ...(fixtures.wide ?? [])]
const NO_BROWSER = process.argv.includes('--no-browser')
const OUT = process.env.REGRESSION_OUT || path.join(repoRoot, 'docs/qa/apps/regression-results.json')

const db = new Database(localDatabase())
const results = { startedAt: new Date().toISOString(), base: BASE, widths: WIDTHS, apps: [] }

/** WCAG relative luminance, for the readable-text check. */
const luminance = (rgb) => {
  const [r, g, b] = rgb.map((value) => {
    const channel = value / 255
    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const ratio = (a, b) => {
  const first = luminance(a)
  const second = luminance(b)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

function dataChecks(app) {
  const project = db.query('select id, doc, spec from projects where token = ?').get(app.token)
  const checks = []
  const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), detail })
  if (!project) {
    check('project exists', false, app.token)
    return checks
  }
  const spec = JSON.parse(project.spec || '{}')
  const doc = project.doc ? JSON.parse(project.doc) : null
  const owned = new Set(db.query('select id from media where project_id = ?').all(project.id).map((row) => row.id))
  const items = (spec.menu ?? []).flatMap((section) => section.items ?? [])

  check('identity: business name', Boolean(spec.name) && spec.name.length > 1, spec.name)
  check('catalogue: has priced items', items.filter((item) => item.price > 0).length > 0, `${items.length} items`)
  check('catalogue: every item has a stable id', items.every((item) => /^itm_[a-f0-9]{8,24}(_\d{1,2})?$/.test(item.id ?? '')), `${items.length} items`)
  check('catalogue: duplicate ids are scoped', new Set(items.map((item) => item.id)).size === items.length, '')

  if (!doc) {
    check('document: saved', false, 'no document')
    return checks
  }
  const home = doc.screens.find((screen) => screen.kind === 'home')
  const nodes = home?.sections ?? []
  const mediaIds = nodes.filter((node) => node.media).map((node) => node.media.id)
  const foreign = mediaIds.filter((id) => !owned.has(id))
  check('media: every reference is owned by this build', foreign.length === 0, foreign)
  check('sections: no duplicate node ids', new Set(nodes.map((node) => node.id)).size === nodes.length, '')
  check(
    'sections: the home has visible content',
    nodes.some((node) => !node.hidden),
    `${nodes.filter((node) => !node.hidden).length} visible`,
  )
  const offersPresent = nodes.some((node) => node.id === 'sec_fx_offers')
  if (offersPresent && (spec.offers ?? []).length && (spec.features ?? []).includes('offers')) {
    const offers = nodes.find((node) => node.id === 'sec_fx_offers')
    check('offers: a build with offers publishes them', !offers.hidden, offers.hidden ? 'hidden' : 'visible')
  }
  for (const node of nodes) {
    if (node.text === 'The kitchen is writing its first menu.') {
      check('copy: no generator placeholder in the document', false, node.id)
    }
  }
  const featured = nodes.find((node) => node.variant === 'dine-feature')
  if (featured) {
    const ref = featured.itemRef
    check('featured: a dish component references the catalogue', Boolean(ref), ref ?? 'none')
    if (ref) check('featured: the reference resolves', items.some((item) => item.id === ref), ref)
  }
  return checks
}

async function htmlChecks(app) {
  const response = await fetch(`${BASE}/p/${app.token}/app`)
  const html = await response.text()
  const checks = []
  const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), detail })
  const project = db.query('select doc, spec from projects where token = ?').get(app.token)
  const spec = JSON.parse(project?.spec || '{}')
  const doc = project?.doc ? JSON.parse(project.doc) : null
  const home = doc?.screens.find((screen) => screen.kind === 'home')

  check('app responds', response.ok, response.status)
  check('identity: name rendered', html.includes(spec.name), spec.name)
  const foreign = fixtures.apps
    .filter((other) => other.token !== app.token)
    .filter((other) => html.includes(`/p/${other.token}/media/`))
  check('media: no other build media path', foreign.length === 0, foreign.map((entry) => entry.key))
  check('copy: no generator placeholder rendered', !html.includes('The kitchen is writing its first menu.'), '')
  for (const node of home?.sections ?? []) {
    if (node.hidden) {
      check(`sections: hidden ${node.id} is not published`, !html.includes(`data-sec="${node.id}"`), node.id)
    } else {
      check(`sections: visible ${node.id} is published`, html.includes(`data-sec="${node.id}"`), node.id)
    }
  }
  const priced = (spec.menu ?? []).flatMap((section) => section.items ?? []).filter((item) => item.price > 0)
  const shown = priced.filter((item) => html.includes(item.name)).length
  check('catalogue: priced items appear in the app', shown > 0, `${shown}/${priced.length}`)

  // The editor preview and the published app are the same document and the
  // same renderer; if their section sequence or catalogue ever differs, one of
  // the two surfaces has drifted.
  const editorHtml = await (await fetch(`${BASE}/p/${app.token}/app?editor=1`)).text()
  const sections = (source) => [...source.matchAll(/data-sec="([^"]+)"/g)].map((match) => match[1])
  const published = sections(html)
  const editor = sections(editorHtml)
  check('parity: same sections in editor and published app', JSON.stringify(published) === JSON.stringify(editor), {
    published: published.length,
    editor: editor.length,
  })
  const names = (spec.menu ?? []).flatMap((section) => section.items ?? []).map((item) => item.name)
  const bothShow = names.filter((name) => html.includes(name) === editorHtml.includes(name)).length
  check('parity: same catalogue names in both surfaces', bothShow === names.length, `${bothShow}/${names.length}`)
  return { checks, html }
}

async function browserChecks(app, chromium) {
  const checks = []
  const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), detail })
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message.slice(0, 160)))
    await page.goto(`${BASE}/p/${app.token}/app`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(600)

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 })
      await page.waitForTimeout(200)
      const overflow = await page.evaluate(() => {
        const root = document.documentElement
        const wide = Array.from(document.querySelectorAll('.screen.on *'))
          .filter((node) => node.getBoundingClientRect().right > window.innerWidth + 1)
          .slice(0, 3)
          .map((node) => `${node.tagName.toLowerCase()}.${String(node.className).split(' ')[0]}`)
        return { scroll: root.scrollWidth, client: root.clientWidth, wide }
      })
      check(
        `layout: no horizontal overflow at ${width}px`,
        overflow.scroll <= overflow.client + 1 && overflow.wide.length === 0,
        overflow,
      )
    }

    await page.setViewportSize({ width: 390, height: 844 })
    /** WCAG AA: 4.5:1 for body text, 3:1 for large text and disabled controls,
     *  measured from the colours the browser actually painted. */
    const measureScreen = () =>
      page.evaluate(() => {
      /** Any CSS colour form the app uses: rgb(), rgba(), color(srgb … / a). */
      const parseColour = (value) => {
        const numbers = (value.match(/[\d.]+/g) || []).map(Number)
        if (numbers.length < 3) return null
        const channels = numbers.slice(0, 3)
        const rgb = channels.every((entry) => entry <= 1.001) ? channels.map((entry) => entry * 255) : channels
        const slash = value.match(/\/\s*([\d.]+)\s*\)/)
        const alpha = slash ? Number(slash[1]) : numbers.length >= 4 ? numbers[3] : 1
        return { rgb, alpha }
      }
      const toRgb = (value) => parseColour(value)?.rgb ?? null
      const luminanceOf = (rgb) => {
        const [r, g, b] = rgb.map((value) => {
          const channel = value / 255
          return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)
        })
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
      }
      const ratioOf = (a, b) => {
        const first = luminanceOf(a)
        const second = luminanceOf(b)
        return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
      }
      const screen = document.querySelector('.screen.on')
      const page = parseColour(getComputedStyle(document.body).backgroundColor)?.rgb ?? [255, 255, 255]
      /** The surface a piece of text actually sits on, with every translucent
       *  layer composited. Text over a photograph or artwork is skipped: a
       *  computed background colour cannot describe it, and a badge on a
       *  photograph is not a theme defect. */
      const backgroundFor = (node) => {
        const layers = []
        let current = node
        while (current && current !== document.body) {
          const style = getComputedStyle(current)
          if (style.backgroundImage && style.backgroundImage !== 'none') return null
          const colour = parseColour(style.backgroundColor)
          if (colour && colour.alpha > 0.001) layers.push(colour)
          current = current.parentElement
        }
        let surface = page
        for (const layer of layers.reverse()) {
          surface = surface.map((value, index) => layer.rgb[index] * layer.alpha + value * (1 - layer.alpha))
        }
        return surface
      }
      const out = []
      screen.querySelectorAll('*').forEach((node) => {
        const text = Array.from(node.childNodes)
          .filter((child) => child.nodeType === 3)
          .map((child) => child.textContent.trim())
          .join(' ')
          .trim()
        if (!text) return
        const style = getComputedStyle(node)
        if (style.display === 'none' || style.visibility === 'hidden') return
        let alpha = parseFloat(style.opacity)
        let parent = node.parentElement
        while (parent && parent !== screen && alpha > 0.01) {
          alpha *= parseFloat(getComputedStyle(parent).opacity)
          parent = parent.parentElement
        }
        const colour = toRgb(style.color)
        if (!colour) return
        const background = backgroundFor(node)
        if (!background) return
        const composited = colour.map((value, index) => value * alpha + background[index] * (1 - alpha))
        const rect = node.getBoundingClientRect()
        if (rect.width < 2 || rect.height < 2) return
        const value = ratioOf(composited, background)
        const weight = Number.parseInt(style.fontWeight, 10) || 400
        const pixels = Number.parseFloat(style.fontSize) || 14
        const large = pixels >= 24 || (pixels >= 18.66 && weight >= 700)
        const disabled = Boolean(node.closest('[disabled], [aria-disabled="true"]'))
        const floor = large || disabled ? 3 : 4.5
        if (value < floor - 0.01)
          out.push({ text: text.slice(0, 28), ratio: Number(value.toFixed(2)), needs: floor, size: style.fontSize })
      })
      return out.slice(0, 8)
    })

    const tabBar = await page.$$eval('.tabbar button[data-go]', (buttons) =>
      buttons.map((button) => ({ id: button.dataset.go, label: button.textContent.trim() })),
    )
    const visited = [{ id: null, label: 'the opening screen' }, ...tabBar]
    for (const destination of visited) {
      if (destination.id) {
        // A sheet or scrim can sit over the tab bar, so the tab is activated
        // the way the app listens for it rather than through a pointer hit.
        await page.$eval(`.tabbar button[data-go="${destination.id}"]`, (button) => button.click())
        await page.waitForTimeout(500)
      }
      const screenName = await page.$eval('.screen.on', (node) => node.dataset.screen || 'screen')
      const issues = await measureScreen()
      check(`contrast: ${screenName} meets AA (${destination.label})`, issues.length === 0, issues)
    }
    check('runtime: no page errors', errors.length === 0, errors.slice(0, 3))
  } finally {
    await browser.close()
  }
  return checks
}

let chromium = null
if (!NO_BROWSER) {
  try {
    const { createRequire } = await import('node:module')
    const require = createRequire(path.join(here, 'package.json'))
    ;({ chromium } = require('playwright'))
  } catch {
    console.warn('playwright is not installed in docs/qa/apps/scripts; skipping browser checks')
  }
}

for (const app of fixtures.apps) {
  const entry = { app: app.key, checks: [] }
  try {
    entry.checks.push(...dataChecks(app))
    const html = await htmlChecks(app)
    entry.checks.push(...html.checks)
    if (chromium) entry.checks.push(...(await browserChecks(app, chromium)))
  } catch (error) {
    entry.checks.push({ name: 'sweep completed', pass: false, detail: String(error).slice(0, 200) })
  }
  entry.pass = entry.checks.every((check) => check.pass)
  results.apps.push(entry)
  console.log(`${entry.pass ? 'PASS' : 'FAIL'} ${app.key}: ${entry.checks.filter((c) => c.pass).length}/${entry.checks.length}`)
  for (const check of entry.checks.filter((c) => !c.pass)) console.log(`   ✗ ${check.name} ${JSON.stringify(check.detail)}`)
}

results.pass = results.apps.every((app) => app.pass)
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify(results, null, 2))
console.log(results.pass ? 'all five apps pass' : 'regressions found')
process.exit(results.pass ? 0 : 1)
