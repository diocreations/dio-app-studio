// Design-audit captures: what the brief's three concepts actually look like,
// and what a trade outside the flagship fifteen gets. 390x844 through CDP.
//
//   bun scripts/capture-design-audit.mjs
//
// Nothing here is a product decision: it is the evidence the audit cites.
import { mkdir, writeFile } from 'node:fs/promises'

const HEIGHT = 844
const WIDTH = 390
const ORIGIN = process.env.PLATTR_ORIGIN || 'http://127.0.0.1:8795'
const CDP = process.env.CDP_ORIGIN || 'http://127.0.0.1:9223'

/** The three previews /api/prompt returns, as designsFor() builds them. */
const CONCEPTS = {
  editorial: { variant: 0, density: 'cozy', corners: 'sharp', hero: 'image', order: 'catalog', heroScale: 'immersive', buttons: 'square', cards: 'square' },
  calm: { variant: 1, density: 'roomy', corners: 'round', hero: 'centered', order: 'visit', heroScale: 'tall', buttons: 'round', cards: 'round' },
  compact: { variant: 2, density: 'standard', corners: 'soft', hero: 'split', order: 'offers', heroScale: 'compact', buttons: 'soft', cards: 'soft' },
}

/** Trades with no flagship composition: what a generic build looks like. */
const GENERIC = ['hospital', 'kindergarten', 'portfolio']

const shots = []
for (const [name, axes] of Object.entries(CONCEPTS)) {
  const query = new URLSearchParams({ biz: 'cafe', media: 'art', ...axes })
  shots.push({ name: `cafe-brief-${name}`, path: `/demo/app?${query.toString()}` })
}
for (const biz of GENERIC) {
  shots.push({ name: `${biz}-home`, path: `/demo/app?biz=${biz}` })
}

const tab = await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' }).then((response) => response.json())
const socket = new WebSocket(tab.webSocketDebuggerUrl)
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
  if (message.error) entry.reject(new Error(message.error.message))
  else entry.resolve(message.result)
})

await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }))
await call('Page.enable')
await call('Runtime.enable')
await mkdir('screenshots/audit', { recursive: true })

for (const shot of shots) {
  await call('Emulation.setDeviceMetricsOverride', {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: 1,
    mobile: true,
    screenWidth: WIDTH,
    screenHeight: HEIGHT,
  })
  await call('Page.navigate', { url: `${ORIGIN}${shot.path}` })
  await new Promise((resolve) => setTimeout(resolve, 1600))
  await call('Runtime.evaluate', {
    expression:
      "document.querySelector('[data-splash]')?.remove(); document.querySelectorAll('.screen.on').forEach((el) => (el.style.animation = 'none'));",
  })
  const capture = await call('Page.captureScreenshot', { format: 'png', fromSurface: true })
  const path = `screenshots/audit/${shot.name}.png`
  await writeFile(path, Buffer.from(capture.data, 'base64'))
  console.log(path)
}

socket.close()
await fetch(`${CDP}/json/close/${tab.id}`)
