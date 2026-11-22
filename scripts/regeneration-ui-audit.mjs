/**
 * Exercises the owner's re-import conflict screen in a real browser.
 *
 *   bun scripts/regeneration-ui-audit.mjs
 *
 * The crawl response is stubbed with a saved plan, so no network read happens.
 * What is under test is the product's behaviour: an owner-corrected field has
 * no preselected checkbox, both values and both dates are visible, and the
 * apply request carries only the choices the owner actually made.
 */
import { Database } from 'bun:sqlite'
import { randomBytes } from 'node:crypto'
import { readdirSync, writeFileSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'

const CDP = process.env.AUDIT_CDP ?? 'http://127.0.0.1:9223'
const API = process.env.AUDIT_API ?? 'http://127.0.0.1:5173'
const APPS = process.env.AUDIT_APPS ?? '.chrome-qa/generation-benchmark-apps-audit.json'
const OUT = process.env.AUDIT_OUT ?? 'docs/qa/final-acceptance-2026-11-22'

const app = JSON.parse(await readFile(APPS, 'utf8')).find((entry) => entry.site === 'yarmouth')
if (!app) throw new Error('no yarmouth fixture')

const d1Dir = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject'
const d1File = readdirSync(d1Dir).find((entry) => entry.endsWith('.sqlite') && entry !== 'metadata.sqlite')
const db = new Database(`${d1Dir}/${d1File}`)
const project = db.query('SELECT id FROM projects WHERE token = ?').get(app.token)
const session = 'own_' + randomBytes(24).toString('hex')
const now = new Date()
db.query('INSERT INTO owner_sessions (id, project_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)').run(
  session,
  project.id,
  now.toISOString(),
  new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  now.toISOString(),
)
const cookieName = app.cookie.split('=')[0]

const PLAN = {
  added: [{ section: 'Shop', name: 'A new jacket', price: 18500 }],
  removed: [],
  changed: [
    {
      section: 'Shop',
      name: 'The Champion Jacket - Navy',
      changes: [{ field: 'image', from: '', to: 'https://cdn.example/jacket.jpg' }],
      ownerEdited: true,
    },
  ],
  conflicts: [
    {
      section: 'Shop',
      name: 'The Champion Jacket - Navy',
      field: 'price',
      original: '210.00',
      originalKnown: true,
      latest: '225.00',
      owner: '215.00',
      ownerAt: '2026-11-22T09:00:00.000Z',
    },
    {
      section: 'Shop',
      name: 'The Champion Jacket - Navy',
      field: 'description',
      original: 'Waxed cotton jacket',
      originalKnown: true,
      latest: 'Waxed cotton jacket with a new lining',
      owner: 'Waxed cotton, navy',
      ownerAt: '2026-11-22T09:00:00.000Z',
    },
  ],
  unchanged: 73,
  requiresApproval: true,
}

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
  if (message.method === 'Page.javascriptDialogOpening') call('Page.handleJavaScriptDialog', { accept: true })
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
  value: session,
  domain: '127.0.0.1',
  path: '/',
  httpOnly: true,
})

const evaluate = async (expression) => {
  const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function openDashboard() {
  await call('Page.navigate', { url: `${API}/p/${app.token}/dashboard` })
  await sleep(2500)
  await evaluate(`(() => {
    const plan = ${JSON.stringify(PLAN)}
    window.__captured = null
    const realFetch = window.fetch.bind(window)
    window.fetch = async (url, options = {}) => {
      const href = String(url)
      if (href.includes('/import/check')) return new Response(JSON.stringify({ plan }), { status: 200, headers: { 'content-type': 'application/json' } })
      if (href.includes('/import/apply')) {
        window.__captured = JSON.parse(options.body || '{}')
        return new Response(JSON.stringify({ version: 2 }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return realFetch(url, options)
    }
    document.querySelector('#checkImport').click()
    return true
  })()`)
  await sleep(500)
}

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

await openDashboard()
const screen = await evaluate(`(() => {
  const diff = document.querySelector('#importDiff')
  const radios = [...document.querySelectorAll('[data-resolve-name]')]
  return {
    text: diff ? diff.innerText : '',
    radioCount: radios.length,
    checked: radios.filter((radio) => radio.checked).length,
    options: [...new Set(radios.map((radio) => radio.value))],
    priceOwner: Boolean(document.querySelector('[data-resolve-field="price"][value="owner"]')),
    priceSource: Boolean(document.querySelector('[data-resolve-field="price"][value="source"]')),
    descriptionSource: Boolean(document.querySelector('[data-resolve-field="description"][value="source"]')),
    changeBoxes: [...document.querySelectorAll('[data-approve-change]')].map((box) => box.dataset.approveChange),
    imageLocked: diff ? /Your own photo is kept/.test(diff.innerText) : false,
    addedChecked: Boolean(document.querySelector('[data-approve-added]')?.checked),
  }
})()`)
check('both owner conflicts are shown', screen.radioCount === 4, `${screen.radioCount} options`)
check('neither side is preselected', screen.checked === 0)
check('both choices exist for each conflict', screen.priceOwner && screen.priceSource && screen.descriptionSource)
check('the owner value and both readings are visible', screen.text.includes('215.00') && screen.text.includes('210.00') && screen.text.includes('225.00'))
check('the correction date is visible', screen.text.includes('22 Nov 2026'))
check('the owner-corrected fields are not approval checkboxes', screen.changeBoxes.length === 0, screen.changeBoxes.join(', '))
check('the owner photo is kept without a checkbox', screen.imageLocked)
check('an ordinary addition is still pre-approved', screen.addedChecked)

await evaluate(`document.querySelector('[data-resolve-field="price"][value="owner"]').click()`)
await evaluate(`document.querySelector('#applyImport').click()`)
await sleep(400)
const kept = await evaluate(`window.__captured`)
check(
  'applying sends only the choice the owner made',
  kept?.approval?.resolutions?.length === 1 &&
    kept.approval.resolutions[0].field === 'price' &&
    kept.approval.resolutions[0].choice === 'owner',
  JSON.stringify(kept?.approval?.resolutions),
)
check('the unresolved description is left as the owner’s', !kept?.approval?.resolutions?.some((entry) => entry.field === 'description'))
check('the owner image is not in the approved changes', !kept?.approval?.changed?.some((entry) => entry.endsWith('|image')))

await openDashboard()
await evaluate(`document.querySelector('[data-resolve-field="description"][value="source"]').click()`)
await evaluate(`document.querySelector('#applyImport').click()`)
await sleep(400)
const taken = await evaluate(`window.__captured`)
check(
  'taking the website value is its own explicit decision',
  taken?.approval?.resolutions?.length === 1 &&
    taken.approval.resolutions[0].field === 'description' &&
    taken.approval.resolutions[0].choice === 'source',
  JSON.stringify(taken?.approval?.resolutions),
)

await openDashboard()
await evaluate(`document.querySelector('#applyImport').click()`)
await sleep(400)
const deferred = await evaluate(`window.__captured`)
check('applying with no decision changes no owner field', (deferred?.approval?.resolutions ?? []).length === 0)

const result = { generatedAt: new Date().toISOString(), app: app.token, plan: PLAN, results, passed: results.filter((entry) => entry.ok).length, failed: results.filter((entry) => !entry.ok).length }
await mkdir(OUT, { recursive: true })
writeFileSync(`${OUT}/regeneration-ui.json`, JSON.stringify(result, null, 2))
console.log(`\n${result.passed} passed, ${result.failed} failed -> ${OUT}/regeneration-ui.json`)
socket.close()
process.exit(result.failed ? 1 : 0)
