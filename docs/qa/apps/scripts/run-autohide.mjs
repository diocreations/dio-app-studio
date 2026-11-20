/**
 * The editor must tell the owner when the server hid a component.
 *
 * The gym fixture has coaches supplied as sample content and no real team, so
 * the "Your coaches" component draws nothing. Showing it in the editor is
 * saved as visible, the server prunes it, and the page has to say so instead of
 * silently disagreeing with the document.
 *
 * The second half proves the loop closes: adding real coaches through the
 * dashboard brings the block back without anyone reopening the editor.
 *
 * Run against the local dev server with the fixture sessions minted:
 *   bun docs/qa/apps/scripts/sessions.mjs
 *   bun docs/qa/apps/scripts/run-autohide.mjs
 */
import { Database } from 'bun:sqlite'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { localDatabase } from './sessions.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(path.join(here, 'package.json'))
const { chromium } = require('playwright')

const BASE = process.env.BASE || 'http://127.0.0.1:8795'
const fixtures = JSON.parse(fs.readFileSync(path.join(here, 'fixtures.json'), 'utf8'))
const gym = fixtures.apps.find((app) => app.key === 'gym') || fixtures.apps[0]
const token = gym.token
const cookieFile = process.env.QA_COOKIES || path.join(os.tmpdir(), 'plattr-qa-owner-cookies.json')
if (!fs.existsSync(cookieFile)) {
  console.error(`No owner sessions in ${cookieFile}. Run sessions.mjs first.`)
  process.exit(2)
}
const session = JSON.parse(fs.readFileSync(cookieFile, 'utf8'))[token]
if (!session) {
  console.error(`No session for ${token} in ${cookieFile}. Run sessions.mjs first.`)
  process.exit(2)
}
const cookie = `${session.name}=${session.value}`
const NODE = 'sec_fx_gym_trainers'

const results = []
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail: detail ?? '' })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

async function serverDoc() {
  const response = await fetch(`${BASE}/api/projects/${token}/doc`, { headers: { cookie } })
  if (!response.ok) throw new Error(`doc GET ${response.status}`)
  return (await response.json()).doc
}
async function putDoc(doc) {
  const response = await fetch(`${BASE}/api/projects/${token}/doc`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie, origin: BASE },
    body: JSON.stringify({ doc }),
  })
  if (!response.ok) throw new Error(`doc PUT ${response.status}`)
  return response.json()
}

async function putSettings(team) {
  const response = await fetch(`${BASE}/api/projects/${token}/app-settings`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie, origin: BASE },
    body: JSON.stringify({ team }),
  })
  if (!response.ok) throw new Error(`settings PUT ${response.status}`)
  return response.json()
}

function readSpec() {
  const db = new Database(localDatabase())
  try {
    return db.query('select spec from projects where token = ?').get(token).spec
  } finally {
    db.close()
  }
}

function writeSpec(spec) {
  const db = new Database(localDatabase())
  try {
    db.query('update projects set spec = ?, updated_at = ? where token = ?').run(spec, new Date().toISOString(), token)
  } finally {
    db.close()
  }
}

const original = await serverDoc()
const originalSpec = readSpec()
const nodeIn = (doc) =>
  doc.screens.flatMap((screen) => screen.sections).find((entry) => entry.id === NODE)
if (!nodeIn(original)) {
  console.error(`${gym.key}: the fixture has no ${NODE} component`)
  process.exit(2)
}

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
await context.addCookies([{ name: session.name, value: session.value, domain: '127.0.0.1', path: '/' }])
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(String(error)))

try {
  await page.goto(`${BASE}/p/${token}/edit`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector(`#structure [data-node="${NODE}"]`, { timeout: 15000 })
  check('the fixture component starts hidden', await page.$eval(`[data-node="${NODE}"]`, (el) => el.classList.contains('off')), original.screens.flatMap((s) => s.sections).find((n) => n.id === NODE)?.hidden)

  // Show it. Nothing in the business can fill it, so the server hides it again.
  await page.click(`[data-hide="${NODE}"]`)
  await page.waitForFunction(
    () => {
      const toast = document.getElementById('toast')
      return toast && toast.classList.contains('on') && /hidden automatically/i.test(toast.textContent)
    },
    null,
    { timeout: 12000 },
  )
  const toast = await page.$eval('#toast', (el) => el.textContent)
  check('the owner is told the section was hidden automatically', /hidden automatically/i.test(toast), toast)

  await page.click(`[data-select="${NODE}"]`)
  const inspector = await page.$eval('#inspector', (el) => el.textContent)
  check('the selected component explains why it is hidden', /Hidden automatically/i.test(inspector), inspector.replace(/\s+/g, ' ').slice(0, 120))

  const row = await page.$eval(`[data-node="${NODE}"]`, (el) => el.textContent)
  check('the component is marked auto-hidden in the list', /auto-hidden/i.test(row), row.replace(/\s+/g, ' ').slice(0, 80))

  await page.waitForFunction(
    () => document.getElementById('saveStatus').textContent !== 'Saving…',
    null,
    { timeout: 8000 },
  )
  const stored = nodeIn(await serverDoc())
  check('the stored document keeps the reason', stored?.hidden === true && stored?.hiddenBecause === 'empty', JSON.stringify({ hidden: stored?.hidden, hiddenBecause: stored?.hiddenBecause }))

  // The business finally names its coaches, through the dashboard route.
  const settings = await putSettings('Ada Okafor|Head coach\nBen Silva|Strength coach')
  check('the dashboard reports the section restored', (settings.restored ?? []).includes(NODE), JSON.stringify(settings.restored ?? []))
  const after = nodeIn(await serverDoc())
  check('the stored document shows it again', after?.hidden === false && after?.hiddenBecause === undefined, JSON.stringify({ hidden: after?.hidden, hiddenBecause: after?.hiddenBecause }))

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector(`#structure [data-node="${NODE}"]`, { timeout: 15000 })
  const visible = await page.$eval(`[data-node="${NODE}"]`, (el) => !el.classList.contains('off') && !/auto-hidden/i.test(el.textContent))
  check('the editor shows the section without any manual step', visible)
  check('the page raised no errors', errors.length === 0, errors.join('; '))
} finally {
  // Put the fixture back exactly as it was.
  writeSpec(originalSpec)
  await putDoc(original)
  await browser.close()
}

const report = { at: new Date().toISOString(), app: gym.key, token, node: NODE, results, ok: results.every((entry) => entry.ok) }
fs.writeFileSync(path.join(here, '..', 'autohide-result.json'), JSON.stringify(report, null, 2) + '\n')
console.log(`\n${results.filter((entry) => entry.ok).length}/${results.length} checks passed`)
process.exit(report.ok ? 0 : 1)
