/**
 * Compose the trade captures into 2x2 contact sheets so every generated screen
 * can be looked at, at full pixel size, without opening 54 images one by one.
 *
 *   bun scripts/contact-sheets.mjs
 *
 * Writes docs/qa/trade-audit-2026-11-20/sheets/sheet-NN.png
 */
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const OUT = 'docs/qa/trade-audit-2026-11-20'
const SHEETS = `${OUT}/sheets`
const CDP = 'http://127.0.0.1:9223'

const homes = (await readdir(OUT))
  .filter((name) => name.endsWith('.png'))
  .sort()
  .map((name) => `${OUT}/${name}`)
const screens = (await readdir(`${OUT}/screens`))
  .filter((name) => name.endsWith('.png'))
  .sort()
  .map((name) => `${OUT}/screens/${name}`)

const files = [...homes, ...screens]
await mkdir(SHEETS, { recursive: true })

const groups = []
for (let index = 0; index < files.length; index += 4) groups.push(files.slice(index, index + 4))

const server = Bun.serve({
  port: 0,
  async fetch(request) {
    const url = new URL(request.url)
    if (url.pathname === '/') {
      const [group] = (url.searchParams.get('g') ?? '0').split('-')
      const list = groups[Number(group)] ?? []
      const cells = list
        .map(
          (file) =>
            `<figure><img src="/${relative(ROOT, join(ROOT, file))}" /><figcaption>${file.split('/').pop()}</figcaption></figure>`,
        )
        .join('')
      return new Response(
        `<!doctype html><html><head><meta charset="utf-8"><style>
          body{margin:0;background:#222;display:grid;grid-template-columns:390px 390px;gap:0;font:11px/1.3 -apple-system,sans-serif;color:#eee}
          figure{margin:0;position:relative}
          img{display:block;width:390px;height:844px}
          figcaption{position:absolute;left:0;top:0;background:#000c;padding:2px 5px;font-size:10px}
        </style></head><body>${cells}</body></html>`,
        { headers: { 'content-type': 'text/html; charset=utf-8' } },
      )
    }
    try {
      return new Response(await Bun.file(join(ROOT, url.pathname)).arrayBuffer(), {
        headers: { 'content-type': 'image/png' },
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
await call('Emulation.setDeviceMetricsOverride', {
  width: 780,
  height: 1688,
  deviceScaleFactor: 1,
  mobile: false,
  screenWidth: 780,
  screenHeight: 1688,
})

for (const [index, group] of groups.entries()) {
  await call('Page.navigate', { url: `http://127.0.0.1:${server.port}/?g=${index}` })
  await new Promise((resolve) => setTimeout(resolve, 500))
  const shot = await call('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(`${SHEETS}/sheet-${String(index + 1).padStart(2, '0')}.png`, Buffer.from(shot.data, 'base64'))
  console.log(`sheet-${String(index + 1).padStart(2, '0')}.png  ${group.map((file) => file.split('/').pop()).join(', ')}`)
}

socket.close()
await fetch(`${CDP}/json/close/${target.id}`)
server.stop(true)
