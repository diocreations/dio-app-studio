// Batch-2 acceptance screenshots, captured at real CSS viewports through CDP.
import { mkdir, writeFile } from 'node:fs/promises'

const APPS = {
  cafe: '587261a689560b0d6f7b78b2',
  gym: 'a33cf8137032b9584a15fa5d',
  clinic: '329814cbc28244e4ffdfbadd',
  property: '8ff5f4ac8897bc58694a0dde',
  studio: '61cd93de6e8aa9c7340e66e0',
}
const WIDTHS = [320, 375, 390, 430]
const HEIGHT = 844
const ORIGIN = process.env.PLATTR_ORIGIN || 'http://127.0.0.1:8795'

const tab = await fetch('http://127.0.0.1:9223/json/new?about:blank', { method: 'PUT' }).then((response) =>
  response.json(),
)
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
await mkdir('screenshots/batch2', { recursive: true })

for (const [name, token] of Object.entries(APPS)) {
  for (const width of WIDTHS) {
    await call('Emulation.setDeviceMetricsOverride', {
      width,
      height: HEIGHT,
      deviceScaleFactor: 1,
      mobile: true,
      screenWidth: width,
      screenHeight: HEIGHT,
    })
    await call('Page.navigate', { url: `${ORIGIN}/p/${token}/app` })
    await new Promise((resolve) => setTimeout(resolve, 1800))
    await call('Runtime.evaluate', {
      expression:
        "document.querySelector('[data-splash]')?.remove(); document.querySelectorAll('.screen.on').forEach((el) => (el.style.animation = 'none'));",
    })
    const shot = await call('Page.captureScreenshot', { format: 'png', fromSurface: true })
    const path = `screenshots/batch2/${name}-${width}.png`
    await writeFile(path, Buffer.from(shot.data, 'base64'))
    console.log(path)
  }
}

socket.close()
await fetch(`http://127.0.0.1:9223/json/close/${tab.id}`)
