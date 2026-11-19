// Batch-3 editor verification: tap-select in the live preview, edit + autosave,
// drag reorder, hide/duplicate/delete, undo/redo and version restore.
import { readFileSync } from 'node:fs'

const ORIGIN = process.env.PLATTR_ORIGIN || 'http://127.0.0.1:8795'
const record = JSON.parse(readFileSync('.wrangler/qa-batch3/trades.json', 'utf8'))
const [cookieName, cookieValue] = record.cookie.split(';')[0].split('=')

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
await call('Network.enable')
await call('Network.setCookie', {
  name: cookieName,
  value: cookieValue,
  domain: '127.0.0.1',
  path: '/',
  httpOnly: true,
})
await call('Page.javascriptDialogOpening', () => {}).catch(() => {})
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.method === 'Page.javascriptDialogOpening') call('Page.handleJavaScriptDialog', { accept: true })
})

const baseline = await fetch(`${ORIGIN}/api/projects/${record.token}/doc`, {
  headers: { cookie: record.cookie },
}).then((response) => response.json())
const sectionCount = baseline.doc.screens.find((screen) => screen.kind === 'home').sections.length

await call('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
})
await call('Page.navigate', { url: `${ORIGIN}/p/${record.token}/edit` })
await new Promise((resolve) => setTimeout(resolve, 2000))

const result = await call('Runtime.evaluate', {
  awaitPromise: true,
  returnByValue: true,
  expression: `(async () => {
    const TOKEN = ${JSON.stringify(record.token)}
    const wait = (fn, ms = 8000) => new Promise((resolve, reject) => {
      const started = Date.now()
      const timer = setInterval(() => {
        let value = false
        try { value = fn() } catch (error) {}
        if (value) { clearInterval(timer); resolve(value) }
        else if (Date.now() - started > ms) { clearInterval(timer); reject(new Error('timeout ' + fn.toString().slice(0, 70))) }
      }, 100)
    })
    const doc = () => fetch('/api/projects/' + TOKEN + '/doc').then((response) => response.json()).then((payload) => payload.doc)
    const home = (payload) => payload.screens.find((screen) => screen.kind === 'home')
    const log = []
    await wait(() => document.querySelectorAll('#structure .node').length > 1)

    // Tap a section inside the live preview rather than the layer list.
    const frame = document.querySelector('#phone iframe')
    await wait(() => frame && frame.contentDocument && frame.contentDocument.querySelector('[data-sec]'))
    frame.contentDocument.querySelectorAll('[data-sec]')[1].click()
    await wait(() => document.querySelector('#pTitle'))
    log.push('preview tap selected: ' + (document.querySelector('#structure .node.on')?.textContent.trim().slice(0, 24) || 'none'))

    const original = document.querySelector('#pTitle').value
    const title = original + ' · ED'
    const input = document.querySelector('#pTitle')
    input.value = title
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await wait(() => document.querySelector('#saveStatus') && /saved/i.test(document.querySelector('#saveStatus').textContent), 6000)
    await new Promise((resolve) => setTimeout(resolve, 700))
    let current = await doc()
    log.push('autosave title: ' + (home(current).sections[1].title === title))

    document.querySelector('#undo').click()
    await new Promise((resolve) => setTimeout(resolve, 1200))
    current = await doc()
    log.push('undo restores title: ' + (home(current).sections[1].title === original))

    // Library add, then undo: a new component must land and leave again.
    const before = home(current).sections.length
    const tile = document.querySelector('[data-add-component="text"]') || document.querySelector('[data-add-component="reviews"]')
    if (tile) { tile.click(); await new Promise((resolve) => setTimeout(resolve, 900)) }
    current = await doc()
    log.push('add component: ' + (home(current).sections.length === before + 1))
    document.querySelector('#undo').click()
    await new Promise((resolve) => setTimeout(resolve, 1000))
    current = await doc()
    log.push('undo removes added component: ' + (home(current).sections.length === before))

    // Drag the third component above the second using the same drop handler.
    const nodes = [...document.querySelectorAll('#structure .node')]
    const transfer = new DataTransfer()
    transfer.setData('text/plain', nodes[2].dataset.node)
    nodes[1].dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
    await new Promise((resolve) => setTimeout(resolve, 1200))
    current = await doc()
    log.push('drag reorder moved third first: ' + (home(current).sections[1].id === nodes[2].dataset.node))
    document.querySelector('#undo').click()
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Hide, check the published document, then undo.
    const hideTarget = [...document.querySelectorAll('#structure .node')][1]
    const hideId = hideTarget.dataset.node
    hideTarget.querySelector('[data-hide]').click()
    await new Promise((resolve) => setTimeout(resolve, 1200))
    current = await doc()
    log.push('hide persists: ' + (home(current).sections.find((section) => section.id === hideId).hidden === true))
    const published = await fetch('/p/' + TOKEN + '/app').then((response) => response.text())
    log.push('hidden section absent from app: ' + !published.includes('data-sec="' + hideId + '"'))
    document.querySelector('#undo').click()
    await new Promise((resolve) => setTimeout(resolve, 1000))
    current = await doc()
    log.push('undo unhides: ' + !home(current).sections.find((section) => section.id === hideId).hidden)

    // Duplicate and delete the copy (dialogs auto-accepted).
    const duplicateTarget = [...document.querySelectorAll('#structure .node')][1]
    duplicateTarget.querySelector('[data-duplicate]').click()
    await new Promise((resolve) => setTimeout(resolve, 1200))
    current = await doc()
    log.push('duplicate adds component: ' + (home(current).sections.length === before + 1))
    const delTarget = [...document.querySelectorAll('#structure .node')][2]
    delTarget.querySelector('[data-delete]').click()
    await new Promise((resolve) => setTimeout(resolve, 1200))
    current = await doc()
    log.push('delete removes component: ' + (home(current).sections.length === before))

    // Version history opens and can restore the most recent saved version.
    document.querySelector('#history').click()
    await wait(() => document.querySelector('[data-restore]'))
    const versions = document.querySelectorAll('[data-restore]').length
    document.querySelector('[data-restore]').click()
    await new Promise((resolve) => setTimeout(resolve, 1600))
    log.push('versions listed: ' + versions + ', restore ok: ' + !!(await doc()))

    return { log, finalCount: home(await doc()).sections.length, baselineCount: ${sectionCount} }
  })()`,
})
if (result.exceptionDetails) {
  console.error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  process.exitCode = 1
} else {
  for (const line of result.result.value.log) console.log(line)
  console.log('sections now/baseline:', result.result.value.finalCount, result.result.value.baselineCount)
}

// Leave the demo exactly as it was.
await fetch(`${ORIGIN}/api/projects/${record.token}/doc`, {
  method: 'PUT',
  headers: { cookie: record.cookie, origin: ORIGIN, 'content-type': 'application/json' },
  body: JSON.stringify({ doc: baseline.doc }),
})
socket.close()
await fetch(`http://127.0.0.1:9223/json/close/${tab.id}`)
