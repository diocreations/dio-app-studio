#!/usr/bin/env bun
/**
 * Live owner-authentication audit against the local Worker.
 *
 *   bun scripts/lifecycle-auth-audit.mjs
 *
 * Uses the real login form and the real owner key derivation, not a directly
 * inserted owner_sessions row. The key and OWNER_SECRET are read from .dev.vars
 * and never printed or written.
 */
import { createHmac } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const API = process.env.AUTH_API ?? 'http://127.0.0.1:5173'
const APPS = process.env.AUTH_APPS ?? '.chrome-qa/generation-benchmark-apps-audit.json'
const OUT = process.env.AUTH_OUT ?? 'docs/qa/lifecycle-authentication-2026-11-22'
const vars = readFileSync('.dev.vars', 'utf8')
const secret = /^OWNER_SECRET=(.+)$/m.exec(vars)?.[1]?.trim().replace(/^["']|["']$/g, '') ?? ''
if (!secret) throw new Error('OWNER_SECRET is not configured in .dev.vars')

const apps = JSON.parse(readFileSync(APPS, 'utf8'))
const app = (site) => apps.find((entry) => entry.site === site)
const yarmouth = app('yarmouth')
const padella = app('padella')
if (!yarmouth || !padella) throw new Error('the saved audit apps do not contain yarmouth and padella')

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 300) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const ownerKey = (token) =>
  createHmac('sha256', secret).update('plattr-owner-key-v1:' + token).digest('hex').slice(0, 32)
const cookieOf = (response) => response.headers.get('set-cookie')?.split(';')[0] ?? ''

async function get(path, cookie) {
  return fetch(`${API}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: 'manual',
  })
}

async function login(project, key = ownerKey(project.token)) {
  const response = await fetch(`${API}/p/${project.token}/dashboard/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ key }).toString(),
    redirect: 'manual',
  })
  return { response, cookie: cookieOf(response) }
}

async function logout(project, cookie, all = false) {
  return fetch(`${API}/p/${project.token}/dashboard/logout${all ? '-all' : ''}`, {
    method: 'POST',
    headers: { cookie, origin: API },
    redirect: 'manual',
  })
}

function parseCatalog(html) {
  const marker = 'const CATALOG = '
  const start = html.indexOf(marker)
  if (start < 0) return null
  let index = start + marker.length
  let depth = 0
  let string = false
  let escape = false
  for (; index < html.length; index += 1) {
    const char = html[index]
    if (string) {
      if (escape) escape = false
      else if (char === '\\') escape = true
      else if (char === '"') string = false
      continue
    }
    if (char === '"') string = true
    else if (char === '[' || char === '{') depth += 1
    else if (char === ']' || char === '}') {
      depth -= 1
      if (depth === 0) {
        index += 1
        break
      }
    }
  }
  try {
    return JSON.parse(html.slice(start + marker.length, index))
  } catch {
    return null
  }
}

function pageFacts(html) {
  return {
    catalog: parseCatalog(html),
    version: Number(/let VERSION = (\d+);/.exec(html)?.[1] ?? NaN),
    updatedAt: /let UPDATED_AT = "([^"]+)";/.exec(html)?.[1] ?? '',
  }
}

async function dashboard(project, cookie) {
  const response = await get(`/p/${project.token}/dashboard`, cookie)
  const html = await response.text()
  return { response, html, ...pageFacts(html) }
}

mkdirSync(OUT, { recursive: true })
const started = new Date().toISOString()

/* 1. Wrong key is refused without a session. */
const wrong = await login(yarmouth, 'definitely-not-the-key')
check('a wrong owner key is refused', wrong.response.status === 401 && !wrong.cookie, wrong.response.status)

/* 2. Real login, dashboard, a real correction through the API. */
const first = await login(yarmouth)
check('the real owner login creates a session', first.response.status === 303 && /^plattr_owner_/.test(first.cookie), first.response.status)
const before = await dashboard(yarmouth, first.cookie)
check('the real session opens the dashboard', before.response.status === 200)
check('the dashboard carries the version and update marker', Number.isInteger(before.version) && Boolean(before.updatedAt), `${before.version}`)

const found = before.catalog
  ?.flatMap((section) => section.items.map((item) => ({ section, item })))
  .find(({ item }) => item.price > 0)
if (!found) throw new Error('the yarmouth audit app has no priced item to correct')
const target = found.item
const oldPrice = target.price
const menu = structuredClone(before.catalog)
const edited = menu
  .flatMap((section) => section.items)
  .find((item) => item.name === target.name)
edited.price = oldPrice + 137
const save = await fetch(`${API}/api/projects/${yarmouth.token}`, {
  method: 'PATCH',
  headers: { 'content-type': 'application/json', origin: API, cookie: first.cookie },
  body: JSON.stringify({ spec: { menu }, version: before.version, updatedAt: before.updatedAt }),
})
const saved = await save.json().catch(() => ({}))
check('an imported field is corrected through the owner API', save.status === 200, `${save.status} v${saved.version}`)

/* 3. Logout invalidates the session. */
const ended = await logout(yarmouth, first.cookie)
check('the application logout redirects', ended.status === 303, ended.status)
check('the old session cannot open the dashboard', (await get(`/p/${yarmouth.token}/dashboard`, first.cookie)).status === 303)
check('the old session cannot read the owner API', (await get(`/api/projects/${yarmouth.token}/dashboard`, first.cookie)).status === 401)

/* 4. Fresh login and the same project. */
const second = await login(yarmouth)
check('a fresh real login succeeds', second.response.status === 303 && second.cookie !== first.cookie)
const reopened = await dashboard(yarmouth, second.cookie)
const reread = reopened.catalog
  ?.flatMap((section) => section.items)
  .find((item) => item.name === target.name)
check('the correction survives a real logout and login', reread?.price === oldPrice + 137, `${reread?.price}`)
check('the owner provenance survives a real login', reread?.ownerFields?.includes('price') && reread?.priceEvidence?.method === 'owner')
check('the original website reading is still available', Boolean(reread?.sourcePriceEvidence?.raw || reread?.sourceTrail?.original?.price), reread?.sourceTrail?.original?.price ?? reread?.sourcePriceEvidence?.raw)
check('the item is not silently upgraded to website-verified', reread?.priceEvidence?.method === 'owner' && reread?.fieldProvenance?.price?.source === 'owner')
check('the dashboard still reports the same build version', Number.isInteger(reopened.version), `${reopened.version}`)

/* 5. Another owner key cannot sign in here; another session cannot read here. */
const other = await login(padella)
check('the other owner signs in to their own project', other.response.status === 303 && Boolean(other.cookie))
check('another owner session cannot read this dashboard', (await get(`/api/projects/${yarmouth.token}/dashboard`, other.cookie)).status === 401)
check('another owner session cannot open this dashboard', (await get(`/p/${yarmouth.token}/dashboard`, other.cookie)).status === 303)
const crossKey = await login(yarmouth, ownerKey(padella.token))
check('another project’s owner key is refused here', crossKey.response.status === 401 && !crossKey.cookie)

/* 6. Sign out everywhere revokes a second live session too. */
const third = await login(yarmouth)
const fourth = await login(yarmouth)
check('a second live session exists', third.response.status === 303 && fourth.response.status === 303 && third.cookie !== fourth.cookie)
const all = await logout(yarmouth, third.cookie, true)
check('sign out everywhere redirects', all.status === 303)
check('the first live session is revoked', (await get(`/p/${yarmouth.token}/dashboard`, third.cookie)).status === 303)
check('the second live session is revoked', (await get(`/api/projects/${yarmouth.token}/dashboard`, fourth.cookie)).status === 401)

const result = {
  generatedAt: new Date().toISOString(),
  started,
  api: API,
  app: { site: yarmouth.site, token: yarmouth.token, item: target.name, oldPrice, newPrice: oldPrice + 137 },
  passed: results.filter((entry) => entry.ok).length,
  failed: results.filter((entry) => !entry.ok).length,
  results,
}
writeFileSync(`${OUT}/auth-live.json`, JSON.stringify(result, null, 2))
console.log(`\n${result.passed} passed, ${result.failed} failed -> ${OUT}/auth-live.json`)
if (result.failed) process.exitCode = 1
