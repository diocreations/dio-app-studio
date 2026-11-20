/**
 * Capture the three generated concepts for each live discovery site.
 *
 *   bun scripts/capture-concepts.mjs
 *
 * 390x844, splash removed, exactly the document the renderer produced.
 */
import { readdir, writeFile } from 'node:fs/promises'

const ROOT = process.cwd()
const BASE = 'docs/qa/live-discovery-2026-11-20'
const CDP = 'http://127.0.0.1:9223'
const WIDTH = 390
const HEIGHT = 844

const sites = (await readdir(BASE, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

const pages = []
for (const site of sites) {
  let files = []
  try {
    files = await readdir(`${BASE}/${site}/concepts`)
  } catch {
    continue
  }
  for (const file of files.filter((name) => name.endsWith('.html')).sort()) {
    pages.push({ site, file: `${BASE}/${site}/concepts/${file}`, name: `${site}--${file.replace('.html', '')}` })
  }
}

const server = Bun.serve({
  port: 0,
  async fetch(request) {
    const url = new URL(request.url)
    try {
      const file = Bun.file(`${ROOT}${decodeURIComponent(url.pathname)}`)
      if (!(await file.exists())) return new Response('not found', { status: 404 })
      return new Response(await file.arrayBuffer(), {
        headers: { 'content-type': url.pathname.endsWith('.png') ? 'image/png' : 'text/html; charset=utf-8' },
      })
    } catch {
      return new Response('not found', { status: 404 })
    }
  },
})

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
await call('Emulation.setDeviceMetricsOverride', {
  width: WIDTH,
  height: HEIGHT,
  deviceScaleFactor: 1,
  mobile: true,
  screenWidth: WIDTH,
  screenHeight: HEIGHT,
})

for (const page of pages) {
  await call('Page.navigate', { url: `http://127.0.0.1:${server.port}/${page.file}` })
  await new Promise((resolve) => setTimeout(resolve, 900))
  await call('Runtime.evaluate', {
    expression:
      "document.querySelector('[data-splash]')?.remove(); document.querySelectorAll('.screen.on').forEach((el) => (el.style.animation = 'none'));",
  })
  await new Promise((resolve) => setTimeout(resolve, 250))
  const shot = await call('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(`${BASE}/${page.site}/concepts/${page.name}.png`, Buffer.from(shot.data, 'base64'))
  console.log(page.name)
}

socket.close()
await fetch(`${CDP}/json/close/${target.id}`)
server.stop(true)
console.log(`\n${pages.length} concept screens`)
