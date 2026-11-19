/* Browser-driven editor/published parity check. Drives the real editor UI:
   select a block, retype the tagline, upload and apply a photo, move a block,
   hide a block, wait for the save, reload, then compare the published app.

   This mutates the fixture projects (their tagline, a section photo, the block
   order and one hidden block), so the committed screenshots are the record of
   the accepted run rather than something a re-run reproduces byte for byte. */
const { chromium } = require('playwright')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { base, apps } = require('./apps.json')

const ORIGIN = process.env.BASE || base
const OUT = process.env.PARITY_OUT || path.join(__dirname, '..', 'parity')
const UPLOAD = process.env.PARITY_UPLOAD || path.join(__dirname, '..', 'buttertales-concept-2.png')
const COOKIES = process.env.PARITY_COOKIES || path.join(os.tmpdir(), 'plattr-owner-cookies.json')
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const nodeList = (page) =>
  page.$$eval('#structure .node', (els) =>
    els.map((el) => ({
      id: el.dataset.node,
      label: (el.querySelector('.name')?.textContent || '').trim(),
      hidden: el.classList.contains('off'),
    })),
  )

async function select(page, id) {
  await page.click(`#structure .node[data-node="${id}"] .name`)
  await page.waitForSelector('#quickEditor:not([hidden])')
  await sleep(350)
}

async function saved(page) {
  await page.waitForFunction(
    () => document.getElementById('saveStatus')?.textContent === 'Saved',
    null,
    { timeout: 15000 },
  )
}

async function run(app, cookies) {
  const browser = await chromium.launch()
  const result = { app: app.key, name: app.name, token: app.token, steps: {}, ok: false }
  try {
    const owner = cookies[app.token]
    if (!owner) throw new Error(`no owner session for ${app.token}; run owner-sessions.mjs first`)
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await context.addCookies([
      { name: owner.name, value: owner.value, domain: new URL(ORIGIN).hostname, path: '/', httpOnly: true, sameSite: 'Lax' },
    ])
    const editor = await context.newPage()
    await editor.goto(`${ORIGIN}/p/${app.token}/edit`, { waitUntil: 'domcontentloaded' })
    await editor.waitForSelector('#structure .node')
    await sleep(1500)

    const appPage = await context.newPage()
    await appPage.setViewportSize({ width: 390, height: 844 })
    await appPage.goto(`${ORIGIN}/p/${app.token}/app`, { waitUntil: 'domcontentloaded' })
    await sleep(1200)
    await editor.screenshot({ path: `${OUT}/${app.key}-editor-before.png` })
    await appPage.screenshot({ path: `${OUT}/${app.key}-app-before.png` })

    // The run hides a block and reorders others, so start from every block
    // visible: without this a second run toggles the previous run's hidden
    // block back on and the published comparison fails on its own leftovers.
    for (const node of (await nodeList(editor)).filter((entry) => entry.hidden)) {
      await select(editor, node.id)
      await editor.click('[data-quick="hide"]')
      await sleep(400)
    }
    await saved(editor)

    const before = await nodeList(editor)
    if (before.some((node) => node.hidden)) throw new Error('a hidden block survived the reset')
    result.sections = before.map((node) => node.label)
    const hero = before.find((node) => /intro|hero|title/i.test(node.label)) || before[0]

    // 1. Business tagline, typed into the hero block the customer reads it in.
    await select(editor, hero.id)
    await editor.fill('#quickText', app.tagline)
    await sleep(600)
    result.steps.tagline = { id: hero.id, text: app.tagline }

    // 2. Replace a section image: upload through the editor's own photo dialog.
    let imageNode = null
    for (const node of before.filter((entry) => entry.id !== hero.id)) {
      await select(editor, node.id)
      if (await editor.locator('#pPick').count()) {
        imageNode = node
        break
      }
    }
    if (!imageNode) throw new Error('no section exposes a photo control')
    await editor.click('#pPick')
    await editor.waitForSelector('#mediaModal:not([hidden])')
    await editor.setInputFiles('#mediaFile', UPLOAD)
    await editor.waitForSelector('#mediaModal', { state: 'hidden', timeout: 30000 })
    await sleep(900)
    result.steps.image = { id: imageNode.id, label: imageNode.label }

    // 3. Reorder two sections with the editor's own move controls.
    const movable = before.filter((node) => node.id !== hero.id && node.id !== imageNode.id)
    if (movable.length < 2) throw new Error('not enough sections to reorder')
    await select(editor, movable[0].id)
    await editor.click('[data-quick="down"]')
    await sleep(700)
    result.steps.reorder = { moved: movable[0].id, direction: 'down' }

    // 4. Hide a section.
    const hideTarget = movable[movable.length - 1]
    await select(editor, hideTarget.id)
    await editor.click('[data-quick="hide"]')
    await sleep(800)
    await editor.waitForSelector(`#structure .node[data-node="${hideTarget.id}"].off`)
    result.steps.hide = { id: hideTarget.id, label: hideTarget.label }
    await saved(editor)

    // 5. Reload the editor: everything must come back from the saved document.
    const expected = await nodeList(editor)
    await editor.reload({ waitUntil: 'domcontentloaded' })
    await editor.waitForSelector('#structure .node')
    await sleep(1200)
    const after = await nodeList(editor)
    const ids = (nodes) => JSON.stringify(nodes.map((node) => node.id))
    const hidden = (nodes) => JSON.stringify(nodes.filter((node) => node.hidden).map((node) => node.id))
    result.reload = {
      order: after.map((node) => node.id),
      orderMatches: ids(after) === ids(expected),
      hidden: after.filter((node) => node.hidden).map((node) => node.id),
      hiddenMatches:
        hidden(after) === hidden(expected) &&
        JSON.stringify(after.filter((node) => node.hidden).map((node) => node.id)) ===
          JSON.stringify([hideTarget.id]),
    }

    await select(editor, hero.id)
    result.reload.taglineValue = await editor.inputValue('#quickText')
    await select(editor, imageNode.id)
    result.reload.photoControl = (await editor.locator('#pMediaPreview img').count()) > 0
    await editor.screenshot({ path: `${OUT}/${app.key}-editor-after.png` })

    // 6. The published app, rendered from the same saved document. Sections whose
    // only content is sample data render nothing publicly, so they are excluded
    // from the expected order rather than counted as a parity failure.
    await appPage.goto(`${ORIGIN}/p/${app.token}/app`, { waitUntil: 'domcontentloaded' })
    await sleep(1500)
    await appPage.screenshot({ path: `${OUT}/${app.key}-app-after.png` })
    const published = await appPage.evaluate(() => ({
      order: Array.from(document.querySelectorAll('[data-sec]')).map((node) => node.dataset.sec),
      text: document.body.innerText,
      media: Array.from(document.querySelectorAll('[data-sec] img')).map((img) => img.getAttribute('src') || ''),
    }))
    const expectedOrder = result.reload.order.filter(
      (id) => !result.reload.hidden.includes(id) && !(app.sampleOnly || []).includes(id),
    )
    result.published = {
      order: published.order,
      orderMatches: JSON.stringify(published.order) === JSON.stringify(expectedOrder),
      taglineShown: published.text.includes(app.tagline),
      hiddenAbsent: !published.order.includes(hideTarget.id),
      photoShown: published.media.some((src) => src.includes('/media/')),
    }

    result.ok = Object.values(result.reload).every((value) => value !== false) &&
      Object.values(result.published).every((value) => value !== false) &&
      result.reload.taglineValue === app.tagline
  } catch (error) {
    result.error = String(error && error.message ? error.message : error)
  } finally {
    await browser.close()
  }
  return result
}

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const cookies = JSON.parse(fs.readFileSync(COOKIES, 'utf8'))
  const out = []
  for (const app of apps) {
    const result = await run(app, cookies)
    out.push(result)
    console.log(JSON.stringify(result))
  }
  fs.writeFileSync(`${OUT}/parity-results.json`, JSON.stringify(out, null, 2))
  fs.writeFileSync(
    `${OUT}/results.jsonl`,
    out.map((entry) => JSON.stringify({ app: entry.app, ok: entry.ok, published: entry.published })).join('\n') + '\n',
  )
  console.log('done', out.filter((entry) => entry.ok).length, 'of', out.length)
  if (out.some((entry) => !entry.ok)) process.exitCode = 1
})()
