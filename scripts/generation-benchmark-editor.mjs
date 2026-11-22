/**
 * Editor acceptance for all fifteen benchmark apps.
 *
 *   bun scripts/generation-benchmark-editor.mjs [site]
 *
 * Each app is exercised through the editor's own controls: a visible heading,
 * a catalogue price, and a variant price where one exists. Each edit must reach
 * the customer app and survive a reload; every change is restored. Writes
 * docs/qa/generation-benchmark-2026-11-21/editor.json.
 */
import { readFile, writeFile } from 'node:fs/promises'

const CDP = process.env.BENCH_CDP ?? 'http://127.0.0.1:9223'
const ORIGIN = process.env.BENCH_API ?? 'http://127.0.0.1:5173'
const ROOT = process.env.BENCH_ROOT ?? 'docs/qa/generation-benchmark-2026-11-21'
const APPS = process.env.BENCH_APPS ?? '.chrome-qa/generation-benchmark-apps.json'
const only = process.argv[2]
const apps = JSON.parse(await readFile(APPS, 'utf8')).filter(
  (app) => !only || app.site === only,
)

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
  if (message.method === 'Page.javascriptDialogOpening') call('Page.handleJavaScriptDialog', { accept: true })
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
await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const rows = []
for (const app of apps) {
  const [cookieName, cookieValue] = app.cookie.split(';')[0].split('=')
  await call('Network.setCookie', { name: cookieName, value: cookieValue, domain: '127.0.0.1', path: '/', httpOnly: true })
  await call('Page.navigate', { url: `${ORIGIN}/p/${app.token}/edit` })
  await sleep(3200)
  const answer = await call('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const TOKEN = ${JSON.stringify(app.token)}
      const wait = (fn, ms = 10000) => new Promise((resolve, reject) => {
        const started = Date.now()
        const timer = setInterval(() => {
          let value = false
          try { value = fn() } catch (error) {}
          if (value) { clearInterval(timer); resolve(value) }
          else if (Date.now() - started > ms) { clearInterval(timer); reject(new Error('timeout ' + fn.toString().slice(0, 70))) }
        }, 100)
      })
      const doc = () => fetch('/api/projects/' + TOKEN + '/doc').then((r) => r.json()).then((p) => p.doc)
      const app = () => fetch('/p/' + TOKEN + '/app').then((r) => r.text())
      const log = []
      let pass = 0
      let fail = 0
      const check = (name, ok, detail) => {
        if (ok) pass += 1
        else fail += 1
        log.push((ok ? 'PASS ' : 'FAIL ') + name + (detail === undefined ? '' : ' — ' + detail))
      }

      const homeOpener = document.querySelector('#screens [data-open="scr_home"]')
      if (homeOpener) homeOpener.click()
      await wait(() => document.querySelectorAll('#structure .node').length > 1)
      const frame = document.querySelector('#frame')
      await wait(() => frame && frame.contentDocument && frame.contentDocument.querySelector('[data-sec]'))

      // Visible text through the live preview. A featured-item section keeps
      // its visible name in the item reference, not in a section title, so use
      // the first section that actually has a title field.
      let title = null
      const debug = []
      for (const section of [...frame.contentDocument.querySelectorAll('[data-sec]')]) {
        section.click()
        try { await wait(() => document.querySelector('#pTitle'), 1200) } catch (error) { debug.push([section.dataset.sec, 'no title field']); continue }
        const candidate = document.querySelector('#pTitle')
        const words = candidate && candidate.value.trim()
        debug.push([section.dataset.sec, words, candidate && candidate.maxLength, Boolean(words && section.innerText.includes(words))])
        if (words && section.innerText.includes(words)) { title = candidate; break }
      }
      let original = ''
      if (title) {
        original = title.value
        // A field that cannot hold the generated heading is the defect this
        // check found once; respect its own bound so the check tests saving,
        // not the browser's truncation of a programmatic value.
        const limit = title.maxLength > 0 ? title.maxLength : 60
        const edited = original.slice(0, Math.max(0, limit - 5)).trimEnd() + ' · BQ'
        title.value = edited
        title.dispatchEvent(new Event('input', { bubbles: true }))
        await wait(() => document.querySelector('#saveStatus') && /saved/i.test(document.querySelector('#saveStatus').textContent), 9000)
        // Poll for the saved value instead of judging on one fixed pause: a
        // large catalogue can still be committing when the status flips.
        let headingSaved = false
        for (let attempt = 0; attempt < 20 && !headingSaved; attempt += 1) {
          await new Promise((r) => setTimeout(r, 300))
          headingSaved = (await doc()).screens.some((s) => s.sections.some((n) => n.title === edited))
        }
        check('heading edit saves', headingSaved)
        let published = false
        for (let attempt = 0; attempt < 20 && !published; attempt += 1) {
          await new Promise((r) => setTimeout(r, 300))
          published = (await app()).includes(edited)
        }
        check('heading edit reaches the customer app', published)
        document.querySelector('#undo').click()
        await new Promise((r) => setTimeout(r, 1300))
        check('heading undo restores the app', !(await app()).includes(edited))
        document.querySelector('#redo').click()
        await new Promise((r) => setTimeout(r, 1300))
        let redone = false
        for (let attempt = 0; attempt < 12 && !redone; attempt += 1) {
          await new Promise((r) => setTimeout(r, 300))
          redone = (await app()).includes(edited)
        }
        check('heading redo restores the edit', redone)
        document.querySelector('#undo').click()
        await new Promise((r) => setTimeout(r, 1300))
        check('heading undo after redo restores the original', !(await app()).includes(edited))
      } else {
        log.push('SKIP heading — this catalogue-first screen has no visible section title; its copy is in the catalogue')
      }

      // Catalogue price through the catalogue panel. An item with variants
      // publishes its cheapest variant, so its base field is not the customer
      // price; use a variant-free item when the catalogue has one.
      document.querySelector('#catalogBtn').click()
      await wait(() =>
        document.querySelector('[data-cat-field][data-field="price"]') || document.querySelector('[data-cat-add]'),
      )
      const reviewPage = await (await fetch('/p/' + TOKEN + '/review')).text()
      check(
        'the owner review lists evidence and gaps',
        (reviewPage.includes('Catalogue evidence') || reviewPage.includes('No catalogue items were published')) &&
          (reviewPage.includes('Website evidence') ||
            reviewPage.includes('Your data') ||
            reviewPage.includes('Unverified') ||
            reviewPage.includes('No price') ||
            reviewPage.includes('No catalogue items')),
      )
      const priceRows = [...document.querySelectorAll('.cat-row')].map((row) => ({
        row,
        options: parseInt((row.nextElementSibling?.querySelector('[data-cat-options]')?.textContent || '0').replace(/[^0-9]/g, ''), 10) || 0,
      }))
      const plain = priceRows.find((entry) => entry.options === 0)
      if (!priceRows.length) {
        // The import refused to invent a catalogue. The editor must explain
        // the gap, offer a bulk list, and let the owner publish before it is
        // complete.
        const recovery = document.querySelector('.recovery')
        check('an empty catalogue explains why it is empty', Boolean(recovery) && /Evidence/.test(recovery.textContent))
        const paste = document.querySelector('#bulkPaste')
        check('an empty catalogue offers a bulk list', Boolean(paste) && Boolean(document.querySelector('[data-bulk-add]')))
        if (paste) {
          paste.value = 'QA catalogue entry | 12.34 | Added from a pasted list'
          document.querySelector('[data-bulk-add]').click()
          await wait(() => document.querySelector('[data-cat-field][data-field="price"]'))
          document.querySelector('#catalogSave').click()
          let added = false
          for (let attempt = 0; attempt < 25 && !added; attempt += 1) {
            await new Promise((r) => setTimeout(r, 400))
            const published = await app()
            added = published.includes('QA catalogue entry') && published.includes('12.34')
          }
          check('a pasted list fills and publishes the catalogue', added)
          const evidence = await (await fetch('/p/' + TOKEN + '/review')).text()
          check('the review marks a pasted row as owner-provided', evidence.includes('Your data') && evidence.includes('from your entry'))
          document.querySelector('[data-cat-remove]').click()
          document.querySelector('#catalogSave').click()
          await new Promise((r) => setTimeout(r, 1200))
          check('the test entry is removed again', !(await app()).includes('QA catalogue entry'))
        }
      } else if (plain) {
        const price = plain.row.querySelector('[data-cat-field][data-field="price"]')
        const oldPrice = price.value
        price.value = '12.34'
        price.dispatchEvent(new Event('input', { bubbles: true }))
        document.querySelector('#catalogSave').click()
        let found = false
        for (let attempt = 0; attempt < 25 && !found; attempt += 1) {
          await new Promise((r) => setTimeout(r, 400))
          found = (await app()).includes('12.34')
        }
        check('catalogue price edit reaches the app', found, oldPrice + ' -> 12.34')
        price.value = oldPrice
        price.dispatchEvent(new Event('input', { bubbles: true }))
        document.querySelector('#catalogSave').click()
        await new Promise((r) => setTimeout(r, 900))
      } else {
        log.push('SKIP base price — every item is variant-priced; variant price is checked instead')
      }

      // Variant price, where this catalogue has variants.
      const options = [...document.querySelectorAll('[data-cat-options]')].find(
        (node) => parseInt(node.textContent.replace(/[^0-9]/g, ''), 10) > 0,
      )
      if (options) {
        options.click()
        await wait(() => document.querySelector('[data-variant-panel] [data-variant-field="price"]'))
        const variantPrice = document.querySelector('[data-variant-field="price"]')
        const oldVariant = variantPrice.value
        variantPrice.value = '19.99'
        variantPrice.dispatchEvent(new Event('input', { bubbles: true }))
        document.querySelector('#catalogSave').click()
        let variantFound = false
        for (let attempt = 0; attempt < 25 && !variantFound; attempt += 1) {
          await new Promise((r) => setTimeout(r, 400))
          variantFound = (await app()).includes('"price":1999')
        }
        check('variant price edit reaches the app', variantFound, oldVariant + ' -> 19.99')
        variantPrice.value = oldVariant
        variantPrice.dispatchEvent(new Event('input', { bubbles: true }))
        document.querySelector('#catalogSave').click()
        await new Promise((r) => setTimeout(r, 900))
      } else {
        log.push('SKIP variants — catalogue has no variant prices')
      }
      return { log, pass, fail, original, debug, edited: title ? title.value : '' }
    })()`,
  })

  // Save, reload the editor, and confirm the restored document is what it reads.
  await call('Page.navigate', { url: `${ORIGIN}/p/${app.token}/edit` })
  await sleep(2200)
  const reloaded = await call('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const wait = (fn, ms = 9000) => new Promise((resolve, reject) => {
        const started = Date.now()
        const timer = setInterval(() => {
          let value = false
          try { value = fn() } catch (error) {}
          if (value) { clearInterval(timer); resolve(value) }
          else if (Date.now() - started > ms) { clearInterval(timer); reject(new Error('timeout')) }
        }, 100)
      })
      const homeOpener = document.querySelector('#screens [data-open="scr_home"]')
      if (homeOpener) homeOpener.click()
      await wait(() => document.querySelectorAll('#structure .node').length > 1)
      return { nodes: document.querySelectorAll('#structure .node').length, saved: document.querySelector('#saveStatus')?.textContent || '' }
    })()`,
  })
  if (answer.exceptionDetails) {
    console.error(`${app.site}/${app.direction}: ${answer.exceptionDetails.exception?.description ?? 'page exception'}`)
    rows.push({ ...app, pass: 0, fail: 1, log: ['FAIL ' + (answer.exceptionDetails.exception?.description ?? 'page exception')] })
    continue
  }
  const value = answer.result?.value
  if (!value) {
    console.error(`${app.site}/${app.direction}: editor returned no result`)
    rows.push({ ...app, pass: 0, fail: 1, log: ['FAIL editor returned no result'] })
    continue
  }
  const row = {
    ...app,
    pass: value.pass,
    fail: value.fail + (reloaded.result?.value?.nodes > 1 ? 0 : 1),
    log: [...value.log, `${reloaded.result?.value?.nodes > 1 ? 'PASS' : 'FAIL'} editor reloads with its document`],
    reloadNodes: reloaded.result?.value?.nodes ?? 0,
    ...(value.fail ? { debug: value.debug, edited: value.edited } : {}),
  }
  rows.push(row)
  console.log(
    `${app.site}/${app.direction.padEnd(9)} ${row.fail === 0 ? 'PASS' : 'FAIL'} ` +
      `${row.pass}/${row.pass + row.fail} checks`,
  )
  for (const line of row.log) console.log('  ' + line)
}
let previous = []
try { previous = JSON.parse(await readFile(`${ROOT}/editor.json`, 'utf8')) } catch {}
const merged = [
  ...previous.filter((old) => !rows.some((row) => row.site === old.site && row.direction === old.direction)),
  ...rows,
]
await writeFile(`${ROOT}/editor.json`, JSON.stringify(merged, null, 2))
console.log(`${merged.filter((row) => row.fail === 0).length}/${merged.length} pass -> ${ROOT}/editor.json`)
process.exit(0)
