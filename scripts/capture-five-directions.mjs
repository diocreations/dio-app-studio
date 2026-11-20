/**
 * Three directions for restaurant, hotel, salon, professional and retail.
 *
 *   bun scripts/capture-five-directions.mjs
 *
 * Uses the saved audit specs (docs/qa/trade-audit-2026-11-20/machine), seeds a
 * direction, builds the real document and renders it with the real renderer.
 * Writes docs/qa/directions-2026-11-20/<trade>--<direction>.png
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { flagshipDocFromSpec } from '../src/worker/doc'
import { directionsFor } from '../src/worker/directions'
import { buildSpec } from '../src/worker/pricing'
import { renderApp } from '../src/worker/app'

const MACHINE = 'docs/qa/trade-audit-2026-11-20/machine'
const OUT = 'docs/qa/directions-2026-11-20'
const CDP = 'http://127.0.0.1:9223'
const TRADES = ['restaurant', 'hotel', 'salon', 'professional', 'shop']

await mkdir(OUT, { recursive: true })

const pages = []
for (const trade of TRADES) {
  const saved = JSON.parse(await Bun.file(`${MACHINE}/${trade}.spec.json`).text())
  for (const direction of directionsFor(saved.vertical)) {
    const spec = buildSpec({
      name: saved.name,
      vertical: saved.vertical,
      accent: saved.accent,
      logo: saved.logo,
      features: saved.features ?? [],
      tagline: saved.tagline,
      category: saved.kind,
      direction: direction.id,
      site: { menu: saved.menu, phone: saved.phone, address: saved.address, hours: saved.hours, story: saved.story },
    })
    const doc = flagshipDocFromSpec(spec)
    const name = `${trade}--${direction.id}`
    await writeFile(`${OUT}/${name}.html`, renderApp(spec, { token: `dir-${name}`, live: false, flagship: true, doc }))
    pages.push(name)
  }
}

const server = Bun.serve({
  port: 0,
  async fetch(request) {
    const path = new URL(request.url).pathname
    const file = Bun.file(`${OUT}${path}`)
    if (await file.exists())
      return new Response(await file.arrayBuffer(), { headers: { 'content-type': 'text/html; charset=utf-8' } })
    // The app's own artwork and stock photography live on the running Worker;
    // without it every image renders as its alt text.
    try {
      const upstream = await fetch(`http://127.0.0.1:8795${path}${new URL(request.url).search}`)
      if (upstream.ok) return upstream
    } catch {}
    return new Response('not found', { status: 404 })
  },
})

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
  const entry = pending.get(message.id)
  if (!entry) return
  pending.delete(message.id)
  if (message.error) entry.reject(new Error(message.error.message))
  else entry.resolve(message.result)
})
await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }))
await call('Page.enable')
await call('Runtime.enable')
await call('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  mobile: true,
  screenWidth: 390,
  screenHeight: 844,
})

for (const name of pages) {
  await call('Page.navigate', { url: `http://127.0.0.1:${server.port}/${name}.html` })
  await new Promise((resolve) => setTimeout(resolve, 800))
  await call('Runtime.evaluate', {
    expression:
      "document.querySelector('[data-splash]')?.remove(); document.querySelectorAll('.screen.on').forEach((el) => (el.style.animation = 'none'));",
  })
  await new Promise((resolve) => setTimeout(resolve, 200))
  const shot = await call('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(`${OUT}/${name}.png`, Buffer.from(shot.data, 'base64'))
  console.log(name)
}

socket.close()
await fetch(`${CDP}/json/close/${target.id}`)
server.stop(true)
console.log(`\n${pages.length} direction screens`)
