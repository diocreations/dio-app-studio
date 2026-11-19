// Batch-3 acceptance matrix: real CSS viewports through CDP.
import { readFileSync } from 'node:fs'

const ORIGIN = process.env.PLATTR_ORIGIN || 'http://127.0.0.1:8795'
const APPS = ['trades', 'auto', 'ecommerce', 'courses', 'finance']
const WIDTHS = [320, 375, 390, 430]

const tab = await fetch('http://127.0.0.1:9223/json/new?about:blank', { method: 'PUT' }).then((r) =>
  r.json(),
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

let failures = 0
for (const key of APPS) {
  const token = JSON.parse(readFileSync(`.wrangler/qa-batch3/${key}.json`, 'utf8')).token
  for (const width of WIDTHS) {
    await call('Emulation.setDeviceMetricsOverride', {
      width,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
      screenWidth: width,
      screenHeight: 844,
    })
    await call('Page.navigate', { url: `${ORIGIN}/p/${token}/app` })
    await new Promise((resolve) => setTimeout(resolve, 1400))
    const result = await call('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        document.querySelector('[data-splash]')?.remove()
        const viewport = innerWidth
        const pageWidth = document.documentElement.scrollWidth
        const images = [...document.querySelectorAll('main img')]
        // A lazy image below the fold is not a failure; a finished image with no pixels is.
        const broken = images.filter((img) => img.complete && img.naturalWidth === 0).map((img) => img.currentSrc || img.src)
        const missingAlt = images.filter((img) => !img.hasAttribute('alt')).length
        const navLabels = [...document.querySelectorAll('nav .tab span')].map((span) => ({ text: span.textContent, clipped: span.scrollWidth > span.clientWidth }))
        const smallTargets = [...document.querySelectorAll('main button, main [role="button"], nav button, header button, header a')]
          .filter((el) => {
            const rect = el.getBoundingClientRect()
            return rect.width > 0 && rect.height > 0 && (rect.width < 30 || rect.height < 30)
          })
          .map((el) => (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24))
        const unlabelled = [...document.querySelectorAll('main button, nav button, header button, header a')].filter((el) => {
          const text = (el.textContent || '').trim()
          return !text && !el.getAttribute('aria-label') && !el.getAttribute('title')
        }).length
        return { viewport, pageWidth, images: images.length, broken, missingAlt, navLabels, smallTargets, unlabelled }
      })()`,
    })
    const value = result.result.value
    const clipped = value.navLabels.filter((label) => label.clipped).map((label) => label.text)
    const problems = []
    if (value.pageWidth !== value.viewport) problems.push(`overflow ${value.pageWidth}/${value.viewport}`)
    if (value.broken.length) problems.push(`broken ${value.broken.length}`)
    if (value.missingAlt) problems.push(`missing alt ${value.missingAlt}`)
    if (clipped.length) problems.push(`clipped nav ${clipped.join(',')}`)
    if (value.unlabelled) problems.push(`unlabelled ${value.unlabelled}`)
    if (value.smallTargets.length) problems.push(`small ${value.smallTargets.join(',')}`)
    if (problems.length) failures++
    console.log(
      `${key.padEnd(10)} ${String(width).padEnd(4)} ${problems.length ? `FAIL ${problems.join('; ')}` : `ok ${value.images} images`}`,
    )
  }
}

socket.close()
await fetch(`http://127.0.0.1:9223/json/close/${tab.id}`)
if (failures) process.exitCode = 1
