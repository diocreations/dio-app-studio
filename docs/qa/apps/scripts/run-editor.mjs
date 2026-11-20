/**
 * The editor, driven as an owner drives it.
 *
 * The editor keeps undo history in the page, so the only honest test is a real
 * browser: hide a component and undo it, drag one and undo it, break the
 * network and read what the page tells the owner. Every check then reads the
 * document back from the server, because a page that shows the right thing
 * while the server holds something else is the bug this suite exists for.
 *
 * The suite writes to the fixture document and restores it at the end. Run it
 * against the local dev server only.
 */
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(path.join(here, 'package.json'))
const { chromium } = require('playwright')

const BASE = process.env.BASE || 'http://127.0.0.1:8795'
const fixtures = JSON.parse(fs.readFileSync(path.join(here, 'fixtures.json'), 'utf8'))
const ONLY = process.env.ONLY ? process.env.ONLY.split(',').map((entry) => entry.trim()) : null
const apps = ONLY ? fixtures.apps.filter((app) => ONLY.includes(app.key)) : fixtures.apps.slice(0, 1)

const cookieFile = process.env.QA_COOKIES || path.join(os.tmpdir(), 'plattr-qa-owner-cookies.json')
if (!fs.existsSync(cookieFile)) {
  console.error(`No owner sessions in ${cookieFile}. Run sessions.mjs first.`)
  process.exit(2)
}
const sessions = JSON.parse(fs.readFileSync(cookieFile, 'utf8'))

const results = []
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`)
}

const cookieHeader = (token) => `${sessions[token].name}=${sessions[token].value}`

async function serverDoc(token) {
  const response = await fetch(`${BASE}/api/projects/${token}/doc`, { headers: { cookie: cookieHeader(token) } })
  if (!response.ok) throw new Error(`doc GET ${response.status}`)
  const body = await response.json()
  return body.doc ?? body.document ?? body
}

async function putDoc(token, doc) {
  const response = await fetch(`${BASE}/api/projects/${token}/doc`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie: cookieHeader(token), origin: BASE },
    body: JSON.stringify({ doc }),
  })
  if (!response.ok) throw new Error(`doc PUT ${response.status}`)
}

const homeOf = (doc) => doc.screens.find((screen) => screen.kind === 'home') || doc.screens[0]
const nodeOf = (doc, id) => homeOf(doc).sections.find((node) => node.id === id)
const order = (doc) => homeOf(doc).sections.map((node) => node.id)

async function settled(page, label) {
  await page
    .waitForFunction(() => document.getElementById('saveStatus').textContent !== 'Saving…', null, { timeout: 8000 })
    .catch(() => {})
  const status = await page.$eval('#saveStatus', (element) => element.textContent)
  if (status !== 'Saved') check(`save completes for ${label}`, false, status)
  return status === 'Saved'
}

/** Poll the server until the document matches, so a passing check means the
 *  change landed rather than that the page happened to look right. */
async function serverMatches(token, predicate, label) {
  const started = Date.now()
  while (Date.now() - started < 8000) {
    if (predicate(await serverDoc(token))) return true
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  check(label, false, 'server document never matched')
  return false
}

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })

for (const app of apps) {
  const token = app.token
  const original = await serverDoc(token)
  const pid = homeOf(original).sections.find((node) => node.variant === 'shop-products')?.id
  const allLink = homeOf(original).sections.find((node) => node.variant === 'shop-all')?.id
  const title = homeOf(original).sections.find((node) => node.variant === 'shop-title')?.id
  if (!pid || !allLink || !title) {
    check(`${app.key}: fixture has the components this suite drives`, false, order(original))
    continue
  }

  await context.addCookies([
    { name: sessions[token].name, value: sessions[token].value, domain: '127.0.0.1', path: '/' },
  ])
  const page = await context.newPage()
  page.on('dialog', (dialog) => dialog.accept())
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))

  const editorUrl = () => `${BASE}/p/${token}/edit`
  try {
    await page.goto(editorUrl(), { waitUntil: 'domcontentloaded' })
    await page.waitForSelector(`#structure [data-node="${pid}"]`, { timeout: 15000 })
    const startOrder = order(original)
    check(`${app.key}: editor opens on the saved home`, startOrder.length > 0, startOrder.length)

    /* ---------------------------- visibility ---------------------------- */
    await page.click(`[data-hide="${pid}"]`)
    await page.waitForSelector(`#structure [data-node="${pid}"].off`)
    await settled(page, 'hide')
    const hidden = await serverMatches(
      token,
      (doc) => nodeOf(doc, pid)?.hidden === true,
      `${app.key}: hiding a component is on the server, not just on screen`,
    )
    if (hidden) check(`${app.key}: hide is stored by id only`, nodeOf(await serverDoc(token), allLink)?.hidden === false)

    await page.keyboard.press('Meta+z')
    await page.waitForSelector(`#structure [data-node="${pid}"]:not(.off)`)
    await settled(page, 'undo')
    check(
      `${app.key}: undo restores the hidden component`,
      await serverMatches(token, (doc) => nodeOf(doc, pid)?.hidden === false, `${app.key}: undo never reached the server`),
    )

    await page.keyboard.press('Shift+Meta+z')
    await page.waitForSelector(`#structure [data-node="${pid}"].off`)
    await settled(page, 'redo')
    check(
      `${app.key}: redo hides it again`,
      await serverMatches(token, (doc) => nodeOf(doc, pid)?.hidden === true, `${app.key}: redo never reached the server`),
    )

    await page.click('#undo')
    await page.waitForSelector(`#structure [data-node="${pid}"]:not(.off)`)
    await settled(page, 'undo by button')
    check(
      `${app.key}: the undo button matches the keyboard`,
      await serverMatches(token, (doc) => nodeOf(doc, pid)?.hidden === false, `${app.key}: button undo never reached the server`),
    )

    /* ----------------------------- reordering --------------------------- */
    await page.dragAndDrop(`#structure [data-node="${allLink}"]`, `#structure [data-node="${title}"]`)
    await page.waitForFunction(
      ([before, target]) => {
        const nodes = [...document.querySelectorAll('#structure [data-node]')].map((node) => node.dataset.node)
        return nodes.indexOf(before) < nodes.indexOf(target)
      },
      [allLink, title],
      { timeout: 5000 },
    ).catch(() => {})
    const movedOrder = await page.$$eval('#structure [data-node]', (nodes) => nodes.map((node) => node.dataset.node))
    check(`${app.key}: dragging reorders the structure`, movedOrder.indexOf(allLink) < movedOrder.indexOf(title), movedOrder)
    await settled(page, 'reorder')
    await serverMatches(token, (doc) => order(doc).indexOf(allLink) < order(doc).indexOf(title), `${app.key}: reorder never reached the server`)

    await page.keyboard.press('Meta+z')
    await settled(page, 'undo reorder')
    check(
      `${app.key}: undo restores the original order`,
      await serverMatches(
        token,
        (doc) => JSON.stringify(order(doc)) === JSON.stringify(startOrder),
        `${app.key}: undo did not restore the order on the server`,
      ),
    )

    /* ------------------------ duplicate and delete ---------------------- */
    const countBefore = await page.$$eval('#structure [data-node]', (nodes) => nodes.length)
    await page.click(`[data-duplicate="${title}"]`)
    await page.waitForFunction((before) => document.querySelectorAll('#structure [data-node]').length === before + 1, countBefore, { timeout: 5000 })
    const duplicated = await page.$$eval('#structure [data-node]', (nodes) => nodes.map((node) => node.dataset.node))
    const extra = duplicated.filter((id) => id.startsWith(title) && id !== title)
    check(`${app.key}: a duplicate takes a new id`, extra.length === 1, extra)
    await settled(page, 'duplicate')
    await serverMatches(token, (doc) => homeOf(doc).sections.some((node) => node.id === extra[0]), `${app.key}: duplicate never reached the server`)

    await page.keyboard.press('Meta+z')
    await settled(page, 'undo duplicate')
    check(
      `${app.key}: undo removes the duplicate and nothing else`,
      await serverMatches(
        token,
        (doc) => homeOf(doc).sections.length === startOrder.length && JSON.stringify(order(doc)) === JSON.stringify(startOrder),
        `${app.key}: undo of a duplicate did not restore the document`,
      ),
    )

    await page.click(`[data-delete="${allLink}"]`)
    await page.waitForFunction((before) => document.querySelectorAll('#structure [data-node]').length === before - 1, countBefore, { timeout: 5000 })
    await settled(page, 'delete')
    await serverMatches(token, (doc) => !nodeOf(doc, allLink), `${app.key}: delete never reached the server`)
    await page.keyboard.press('Meta+z')
    await settled(page, 'undo delete')
    check(
      `${app.key}: undo restores a deleted component with its id`,
      await serverMatches(
        token,
        (doc) => Boolean(nodeOf(doc, allLink)) && nodeOf(doc, allLink).hidden === false,
        `${app.key}: undo of a delete did not restore the component`,
      ),
    )

    /* --------------------------- adding a component --------------------- */
    await page.click('[data-add-component="text"]')
    await page.waitForFunction(
      (before) => document.querySelectorAll('#structure [data-node]').length === before + 1,
      countBefore,
      { timeout: 5000 },
    )
    await settled(page, 'add component')
    check(
      `${app.key}: an added component is saved`,
      await serverMatches(token, (doc) => homeOf(doc).sections.length === countBefore + 1, `${app.key}: the added component never reached the server`),
    )
    await page.keyboard.press('Meta+z')
    await settled(page, 'undo add')
    check(
      `${app.key}: undo removes the component that was just added`,
      await serverMatches(token, (doc) => JSON.stringify(order(doc)) === JSON.stringify(startOrder), `${app.key}: undo of an add did not restore the document`),
    )

    /* ------------------- image fit and crop, then restore --------------- */
    await page.click('#catalogBtn')
    await page.waitForSelector('select[data-cat-image]', { timeout: 5000 })
    const fitSelector = 'select[data-cat-image="0:0"][data-field="fit"]'
    const xSelector = 'input[data-cat-image="0:0"][data-field="positionX"]'
    const fitBefore = await page.$eval(fitSelector, (select) => select.value)
    const xBefore = await page.$eval(xSelector, (input) => input.value)
    const fitTarget = fitBefore === 'cover' ? 'contain' : 'cover'
    await page.selectOption(fitSelector, fitTarget)
    await page.$eval(
      xSelector,
      (input) => {
        input.value = '20'
        input.dispatchEvent(new Event('input', { bubbles: true }))
      },
    )
    /** The catalogue saves and then closes its modal, so the published app is
     *  the only place to read the stored result back. */
    async function appHtmlWhen(predicate, label) {
      const started = Date.now()
      while (Date.now() - started < 8000) {
        const html = await (await fetch(`${BASE}/p/${token}/app`)).text()
        if (predicate(html)) return html
        await new Promise((resolve) => setTimeout(resolve, 250))
      }
      check(label, false, 'published app never showed the change')
      return null
    }

    await page.click('#catalogSave')
    const cropped = await appHtmlWhen(
      (html) => html.includes(`object-fit:${fitTarget}`) && /object-position:\s*20%/.test(html),
      `${app.key}: the saved fit and crop reach the published app`,
    )
    check(`${app.key}: the saved fit reaches the published app`, Boolean(cropped), fitTarget)

    await page.click('#catalogBtn')
    await page.waitForSelector(fitSelector, { timeout: 5000 })
    await page.selectOption(fitSelector, fitBefore)
    await page.$eval(
      xSelector,
      (input, value) => {
        input.value = value
        input.dispatchEvent(new Event('input', { bubbles: true }))
      },
      xBefore,
    )
    await page.click('#catalogSave')
    const restored = await appHtmlWhen(
      (html) => html.includes(`object-fit:${fitBefore}`),
      `${app.key}: the fixture fit is restored`,
    )
    check(`${app.key}: the fixture fit is restored`, Boolean(restored), fitBefore)

    /* --------------------------- rapid editing -------------------------- */
    await page.click(`#structure [data-select="${title}"]`)
    await page.waitForSelector('#quickTitle')
    const originalTitle = (await page.$eval('#quickTitle', (input) => input.value)) ?? ''
    for (const value of ['One', 'One two', 'One two three']) {
      await page.fill('#quickTitle', value)
    }
    await settled(page, 'rapid edits')
    await serverMatches(token, (doc) => nodeOf(doc, title)?.title === 'One two three', `${app.key}: rapid edits lost a keystroke`)
    await page.keyboard.press('Meta+z')
    await page.keyboard.press('Meta+z')
    await page.keyboard.press('Meta+z')
    await settled(page, 'undo rapid edits')
    check(
      `${app.key}: three undos step back through three edits`,
      await serverMatches(token, (doc) => (nodeOf(doc, title)?.title ?? '') === originalTitle, `${app.key}: rapid edits did not undo cleanly`),
    )

    /* ------------------------ save failure and recovery ----------------- */
    await page.route(`**/api/projects/${token}/doc`, (route) => route.abort('failed'))
    await page.fill('#quickTitle', 'Rejected wording')
    await page.waitForFunction(() => document.getElementById('saveStatus').textContent === 'Not saved', null, { timeout: 8000 })
    check(`${app.key}: a failed save is reported as not saved`, true)
    check(
      `${app.key}: a failed save does not reach the server`,
      nodeOf(await serverDoc(token), title)?.title !== 'Rejected wording',
    )
    await page.unroute(`**/api/projects/${token}/doc`)
    await page.fill('#quickTitle', 'Recovered wording')
    await settled(page, 'recovery')
    check(
      `${app.key}: the next save succeeds after reconnecting`,
      await serverMatches(token, (doc) => nodeOf(doc, title)?.title === 'Recovered wording', `${app.key}: no recovery save`),
    )

    /* ---------------------- refresh during a pending save ---------------- */
    await page.fill('#quickTitle', 'Written just before reload')
    await page.reload({ waitUntil: 'domcontentloaded' })
    check(
      `${app.key}: a reload during the debounce keeps the edit`,
      await serverMatches(token, (doc) => nodeOf(doc, title)?.title === 'Written just before reload', `${app.key}: the pending save was lost on reload`),
    )

    check(`${app.key}: editor raised no page errors`, errors.length === 0, errors.slice(0, 2))
  } finally {
    await putDoc(token, original).catch((error) => check(`${app.key}: fixture restored`, false, String(error)))
    await page.close()
  }
}

await context.close()
await browser.close()

const failed = results.filter((result) => !result.ok)
fs.writeFileSync(path.join(here, '..', 'editor-results.json'), `${JSON.stringify({ at: new Date().toISOString(), base: BASE, results }, null, 2)}\n`)
console.log(failed.length ? `\n${failed.length} editor checks failed` : `\nall ${results.length} editor checks pass`)
process.exit(failed.length ? 1 : 0)
