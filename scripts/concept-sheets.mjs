/**
 * Contact sheets for docs/qa/concepts-2026-11-21.
 *
 *   bun scripts/concept-sheets.mjs
 *
 * One sheet per trade for the 390px screens, one for the three home concepts,
 * and one width strip showing each concept at 390/430/768/1280.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const OUT = 'docs/qa/concepts-2026-11-21'
const SHEETS = `${OUT}/sheets`
const CDP = 'http://127.0.0.1:9223'
const TRADES = ['shop', 'restaurant', 'hotel', 'salon', 'professional']
const CONCEPTS = ['lead', 'index', 'immersive']
const WIDTHS = [390, 430, 768, 1280]

await mkdir(SHEETS, { recursive: true })

const groups = []
for (const trade of TRADES) {
  groups.push({
    name: `home-${trade}`,
    columns: 3,
    title: `${trade} — three concepts at 390`,
    cells: CONCEPTS.map((concept) => ({
      src: `${OUT}/${trade}--${concept}--home--390.png`,
      label: `${concept} / home / 390`,
    })),
  })
  for (const concept of CONCEPTS) {
    groups.push({
      name: `screens-${trade}--${concept}`,
      columns: 3,
      title: `${trade} / ${concept} — home, catalogue, detail at 390`,
      cells: ['home', 'catalog', 'detail'].map((screen) => ({
        src: `${OUT}/${trade}--${concept}--${screen}--390.png`,
        label: `${concept} / ${screen} / 390`,
      })),
    })
  }
  groups.push({
    name: `more-${trade}`,
    columns: 3,
    title: `${trade} — More at 390`,
    cells: CONCEPTS.map((concept) => ({
      src: `${OUT}/${trade}--${concept}--more--390.png`,
      label: `${concept} / more / 390`,
    })),
  })
  groups.push({
    name: `utility-${trade}`,
    columns: 3,
    title: `${trade} — Search and Saved at 390`,
    cells: CONCEPTS.flatMap((concept) =>
      ['search', 'saved'].map((screen) => ({
        src: `${OUT}/${trade}--${concept}--${screen}--390.png`,
        label: `${concept} / ${screen} / 390`,
      })),
    ),
  })
  groups.push({
    name: `more-wide-${trade}`,
    columns: 3,
    title: `${trade} — More at 1280`,
    cells: CONCEPTS.map((concept) => ({
      src: `${OUT}/${trade}--${concept}--more--1280.png`,
      label: `${concept} / more / 1280`,
    })),
  })
  groups.push({
    name: `widths-${trade}`,
    columns: 4,
    title: `${trade} — home at 390, 430, 768, 1280`,
    cells: CONCEPTS.flatMap((concept) =>
      WIDTHS.map((width) => ({
        src: `${OUT}/${trade}--${concept}--home--${width}.png`,
        label: `${concept} / ${width}`,
      })),
    ),
  })
}

const server = Bun.serve({
  port: 0,
  async fetch(request) {
    const url = new URL(request.url)
    if (url.pathname === '/') {
      const group = groups[Number(url.searchParams.get('g') ?? '0')]
      const cells = group.cells
        .map(
          (cell) =>
            `<figure><img src="/${cell.src}" style="max-width:100%;max-height:620px;width:auto;height:auto" /><figcaption>${cell.label}</figcaption></figure>`,
        )
        .join('')
      return new Response(
        `<!doctype html><html><head><meta charset="utf-8"><style>
          *{box-sizing:border-box}body{margin:0;background:#191919;font:11px/1.35 -apple-system,sans-serif;color:#eee;padding:24px}
          h1{font:500 16px/1.3 -apple-system,sans-serif;margin:0 0 16px;color:#bbb;letter-spacing:.02em}
          main{display:grid;grid-template-columns:repeat(${group.columns},minmax(0,1fr));gap:12px;align-items:start}
          figure{margin:0;background:#111;border:1px solid #2c2c2c;min-width:0}
          img{display:block;margin:0 auto;background:#0b0b0b}
          figcaption{padding:6px 8px;color:#aaa;border-top:1px solid #2c2c2c}
        </style></head><body><h1>${group.title}</h1><main>${cells}</main></body></html>`,
        { headers: { 'content-type': 'text/html; charset=utf-8' } },
      )
    }
    try {
      return new Response(await Bun.file(join(process.cwd(), url.pathname)).arrayBuffer(), {
        headers: { 'content-type': 'image/png' },
      })
    } catch {
      return new Response('not found', { status: 404 })
    }
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

for (const [index, group] of groups.entries()) {
  const columns = group.columns
  const width = columns === 4 ? 1880 : 1200
  const height = group.name.startsWith('home-') ? 920 : group.name.startsWith('widths-') ? 2080 : group.name.startsWith('utility-') ? 1830 : group.name.startsWith('more-wide-') ? 1120 : 2720
  await call('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: width,
    screenHeight: height,
  })
  await call('Page.navigate', { url: `http://127.0.0.1:${server.port}/?g=${index}` })
  await new Promise((resolve) => setTimeout(resolve, 450))
  const shot = await call('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: true })
  await writeFile(`${SHEETS}/${group.name}.png`, Buffer.from(shot.data, 'base64'))
  console.log(`${group.name}.png`)
}

socket.close()
await fetch(`${CDP}/json/close/${target.id}`)
server.stop(true)
