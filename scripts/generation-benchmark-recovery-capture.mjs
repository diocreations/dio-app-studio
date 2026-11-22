/**
 * Recovery and owner-review capture for the 21 November 2026 recovery pass.
 *
 *   bun scripts/generation-benchmark-recovery-capture.mjs
 *
 * Reads the seeded apps already in the local Worker. For one representative
 * concept per business it captures the customer app, the recovery catalogue
 * panel and the source review at phone and desktop widths. It edits nothing.
 * Writes docs/qa/generation-benchmark-2026-11-21-recovery/recovery/.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const CDP = process.env.BENCH_CDP ?? 'http://127.0.0.1:9223'
const ORIGIN = process.env.BENCH_API ?? 'http://127.0.0.1:5173'
const ROOT = process.env.BENCH_ROOT ?? 'docs/qa/generation-benchmark-2026-11-21-recovery'
const APPS = process.env.BENCH_APPS ?? '.chrome-qa/generation-benchmark-apps-recovery.json'
const OUT = `${ROOT}/recovery`
const apps = JSON.parse(await readFile(APPS, 'utf8'))
const chosen = [
  ['yarmouth', 'minimal'],
  ['padella', 'editorial'],
  ['pelirocco', 'minimal'],
  ['bluetit', 'editorial'],
  ['afl', 'classic'],
].map(([site, direction]) => {
  const app = apps.find((entry) => entry.site === site && entry.direction === direction)
  if (!app) throw new Error(`missing ${site}/${direction}`)
  return app
})
await mkdir(OUT, { recursive: true })

const target = await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' }).then((response) => response.json())
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const evaluate = async (expression) => {
  const answer = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (answer.exceptionDetails) throw new Error(answer.exceptionDetails.exception?.description ?? 'page error')
  return answer.result?.value
}
const metrics = async (width, height, mobile) => {
  await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile })
  await sleep(500)
}
const shot = async (name) => {
  const message = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(`${OUT}/${name}.png`, Buffer.from(message.data, 'base64'))
}
const goto = async (url) => {
  await call('Page.navigate', { url })
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await sleep(200)
    const ready = await evaluate('document.readyState')
    if (ready === 'complete') return
  }
  throw new Error(`timeout loading ${url}`)
}

const rows = []
for (const app of chosen) {
  const [name, value] = app.cookie.split(';')[0].split('=')
  await call('Network.setCookie', { name, value, domain: '127.0.0.1', path: '/', httpOnly: true })
  const entry = { site: app.site, direction: app.direction, token: app.token, screens: {} }

  for (const [width, height] of [
    [390, 844],
    [1280, 900],
  ]) {
    await metrics(width, height, width < 700)
    await goto(`${ORIGIN}/p/${app.token}/review`)
    await sleep(700)
    entry.screens[`review-${width}`] = await evaluate(
      `(() => {
        const text = document.body.innerText
        return {
          status: document.title,
          empty: /No catalogue items were published/.test(text),
          kept: /Kept as business information/.test(text),
          evidence: /Catalogue evidence|No catalogue items were published/.test(text),
          portfolio: /Eligible for the portfolio/.test(text),
          owner: /Your data/.test(text),
          overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        }
      })()`,
    )
    await shot(`review-${app.site}-${width}`)
  }

  await metrics(390, 844, true)
  await goto(`${ORIGIN}/p/${app.token}/edit`)
  await sleep(1300)
  await evaluate(`document.querySelector('#catalogBtn').click()`)
  await sleep(900)
  entry.screens['catalogue-390'] = await evaluate(
    `(() => {
      const panel = document.querySelector('.recovery')
      return {
        recovery: Boolean(panel),
        bulk: Boolean(document.querySelector('#bulkPaste')),
        text: panel ? panel.innerText.replace(/\\s+/g, ' ').slice(0, 280) : '',
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      }
    })()`,
  )
  await shot(`catalogue-${app.site}-390`)

  await goto(`${ORIGIN}/p/${app.token}/app`)
  await sleep(900)
  entry.screens['app-390'] = await evaluate(
    `(() => ({
      empty: /aren’t published yet/.test(document.body.innerText),
      work: /SELECTED WORK/i.test(document.body.innerText),
      policies: /Privacy Policy|Cookie Policy/.test(document.body.innerText),
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    }))()`,
  )
  await shot(`app-${app.site}-390`)

  // Keep non-catalogue pages observable: policies, locations and press live
  // on the Visit/More tab, not on the home screen.
  const openedInfo = await evaluate(`(() => {
    const target = [...document.querySelectorAll('button, a')].find((node) => /^(Visit|More|Contact)$/i.test(node.innerText.trim()))
    if (!target) return false
    target.click()
    return true
  })()`)
  if (openedInfo) {
    await sleep(700)
    await shot(`app-${app.site}-information-390`)
    entry.screens['information-390'] = await evaluate(
      `(() => ({
        text: document.body.innerText.replace(/\\s+/g, ' ').slice(0, 420),
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      }))()`,
    )
  }

  await metrics(1280, 900, false)
  await goto(`${ORIGIN}/p/${app.token}/app`)
  await sleep(700)
  await shot(`app-${app.site}-1280`)
  rows.push(entry)
}

await writeFile(`${OUT}/recovery.json`, JSON.stringify(rows, null, 2))
console.log(`captured ${rows.length} businesses -> ${OUT}`)
for (const row of rows) console.log(row.site, JSON.stringify(row.screens))
process.exit(0)
