/**
 * The "before" evidence for the P0 audit.
 *
 * These are not screenshots of a different product: they are the exact preview
 * URLs the old brief page built when a stale prompt or a stale import survived
 * into the next read. `/demo/app` is the same renderer, so the composition,
 * navigation and catalogue are what the customer saw.
 *
 *   bun scripts/capture-p0-before.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises'

const ORIGIN = 'http://127.0.0.1:5173'
const CDP = 'http://127.0.0.1:9223'
const OUT = 'docs/qa/p0-identity-2026-11-22'
await mkdir(OUT, { recursive: true })

const SAREE_ITEMS = [
  '2381 Traditional Purple and Orange Semi Silk Saree~1690',
  '2204 Small Checks Soft Silk Saree~1590',
  '2275 Black & Maroon Hand Block Printed Saree~1250',
  '5624 Antique Gold Jhumka Earrings~980',
].join(';')

const BEFORE = [
  {
    name: 'before-geestores-cafe-merged',
    // Old brief: a stale café prompt survived a GeeStores import, so the read
    // stayed café while the identity and catalogue were the jeweller's.
    url: `/demo/app?biz=cafe&direction=modern&name=GeeStores&cat=Jewellery%20shop&logo=GS&accent=%23c8452b&items=${encodeURIComponent(SAREE_ITEMS)}`,
  },
  {
    name: 'before-florist-jewellery-leak',
    // Old brief: a café/florist prompt was then given a stale GeeStores import;
    // the florist trade label sat above a jeweller's products.
    url: `/demo/app?biz=shop&direction=minimal&name=GeeStores&cat=Florist&logo=GS&accent=%23c8452b&items=${encodeURIComponent(SAREE_ITEMS)}`,
  },
]

const target = await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' }).then((response) => response.json())
const socket = new WebSocket(target.webSocketDebuggerUrl)
let sequence = 0
const pending = new Map()

function call(method, params = {}) {
  const id = ++sequence
  socket.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (!message.id) return
  const entry = pending.get(message.id)
  if (!entry) return
  pending.delete(message.id)
  message.error ? entry.reject(new Error(message.error.message)) : entry.resolve(message.result)
})
await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }))
await call('Page.enable')
await call('Runtime.enable')
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const evaluate = async (expression) =>
  (await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value

for (const [index, entry] of BEFORE.entries()) {
  for (const [size, width, height] of [
    ['desktop', 1440, 1000],
    ['mobile', 390, 844],
  ]) {
    await call('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: size === 'mobile',
      screenWidth: width,
      screenHeight: height,
    })
    await call('Page.navigate', { url: ORIGIN + entry.url })
    await sleep(2200)
    const shot = await call('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(`${OUT}/${entry.name}-${size}.png`, Buffer.from(shot.data, 'base64'))
    const text = await evaluate(`document.body.innerText.replace(/\\s+/g, ' ').slice(0, 500)`)
    console.log(entry.name, size, '→', text.slice(0, 150))
  }
  if (index === BEFORE.length - 1) break
}
await fetch(`${CDP}/json/close/${target.id}`)
console.log('wrote', OUT)
