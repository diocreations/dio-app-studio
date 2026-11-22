#!/usr/bin/env bun
/**
 * One-shot production acceptance for the URL-first GeeStores release.
 *
 *   bun scripts/production-geestores-acceptance.mjs --preflight
 *   bun scripts/production-geestores-acceptance.mjs --run
 *
 * `--preflight` checks the released source/build and the browser without making
 * any production request. `--run` refuses to start before 2026-11-23T00:00:00Z,
 * sends exactly one POST /api/discover, and records every result. A state file
 * is created with O_EXCL immediately before the request; an interrupted run can
 * therefore never silently spend a second discovery.
 *
 * The run leaves the generated draft private. It approves and publishes once to
 * prove the privacy boundary, then unpublishes it again. No project is deleted:
 * the report contains the draft token so the evidence can still be inspected.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { mkdir, appendFile, writeFile } from 'node:fs/promises'
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'

const RELEASE_COMMIT = 'ba7e6be261f2421dd9966a1f0302846570b64971'
const RELEASE_DEPLOYMENT = '7f3f33af-b49a-4d69-993b-46e31269a087'
const RESET_AT = Date.parse('2026-11-23T00:00:00Z')
const ORIGIN = 'https://plattr-studio-67t93q.freebuff.page'
const SOURCE = 'https://geestores.com/'
const OUT = process.env.ACCEPTANCE_OUT ?? 'docs/qa/production-geestores-2026-11-23'
const STATE = process.env.ACCEPTANCE_STATE ?? '.chrome-qa/production-geestores-acceptance.json'
const WORKER_HASH = 'dc795ddeda2237103c392f25310a75301b9dbde379aece311588932731f1d20e'
const ASSET_TREE_HASH = 'c768f2fc73eed0bc884488d537b7f117609524af37dce629bcbc3616fa3ba946'
const SCREEN_DIR = join(OUT, 'screens')

const args = new Set(process.argv.slice(2))
if (args.has('--run') === args.has('--preflight') || [...args].some((arg) => !['--run', '--preflight'].includes(arg))) {
  console.error('Usage: bun scripts/production-geestores-acceptance.mjs (--preflight | --run)')
  process.exit(64)
}
const mode = args.has('--run') ? 'run' : 'preflight'
const now = new Date()

const checks = []
function check(id, ok, detail) {
  checks.push({ id, ok: Boolean(ok), detail: String(detail ?? '') })
  return Boolean(ok)
}
function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(dir, entry.name)
      return entry.isDirectory() ? walk(path) : [path]
    })
    .filter((path) => !path.endsWith('/.DS_Store'))
    .sort()
}
function sha256Assets() {
  const lines = walk('dist/client-deploy').map((path) => `${sha256File(path)}  ${path}\n`)
  return createHash('sha256').update(lines.join('')).digest('hex')
}
function releaseStatus() {
  const diff = spawnSync('git', ['diff', '--quiet', RELEASE_COMMIT, '--', 'src', 'tests', 'deploy.json'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  const workerHash = existsSync('dist/plattr_studio/index.js') ? sha256File('dist/plattr_studio/index.js') : ''
  const assetHash = existsSync('dist/client-deploy') ? sha256Assets() : ''
  const sourceMatch = diff.status === 0
  const workerMatch = workerHash === WORKER_HASH
  const assetMatch = assetHash === ASSET_TREE_HASH
  return { sourceMatch, workerMatch, assetMatch, workerHash, assetHash }
}
function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean)
  return candidates.find((path) => existsSync(path)) ?? ''
}

const release = releaseStatus()
const resetIn = Math.max(0, RESET_AT - now.getTime())
const stateExists = existsSync(STATE)
const chrome = chromePath()

console.log('Production GeeStores acceptance preflight')
console.log(`  now:              ${now.toISOString()}`)
console.log(`  reset:            ${new Date(RESET_AT).toISOString()} (${resetIn ? `${Math.ceil(resetIn / 60000)} minutes away` : 'open'})`)
console.log(`  release commit:   ${release.sourceMatch ? 'PASS' : 'FAIL'} ${RELEASE_COMMIT}`)
console.log(`  worker artifact:  ${release.workerMatch ? 'PASS' : 'FAIL'} ${release.workerHash || '(missing)'}`)
console.log(`  asset tree:       ${release.assetMatch ? 'PASS' : 'FAIL'} ${release.assetHash || '(missing)'}`)
console.log(`  browser:          ${chrome ? 'PASS' : 'FAIL'} ${chrome || '(not found)'}`)
console.log(`  one-shot state:   ${stateExists ? 'ALREADY USED' : 'absent'}`)
console.log('  discovery request: NOT SENT')

const ready = release.sourceMatch && release.workerMatch && release.assetMatch && Boolean(chrome) && !stateExists
if (!ready) {
  console.error('\nPreflight is not ready. Fix the source/build/browser/state issue before the reset.')
  process.exit(1)
}
if (mode === 'preflight') {
  if (now.getTime() < RESET_AT) console.log('\nPreflight passed. The discovery window is not open yet; no request was sent.')
  else console.log('\nPreflight passed. Ready for exactly one --run.')
  process.exit(0)
}
if (now.getTime() < RESET_AT) {
  console.error('\nRefusing to run before the UTC allowance reset.')
  process.exit(3)
}

await mkdir(SCREEN_DIR, { recursive: true })
await mkdir(dirname(STATE), { recursive: true })
try {
  await writeFile(STATE, JSON.stringify({ status: 'discovery-start', at: new Date().toISOString(), source: SOURCE }, null, 2), {
    flag: 'wx',
  })
} catch {
  console.error(`Refusing to run: the one-shot state already exists at ${STATE}.`)
  process.exit(4)
}

async function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`
  process.stdout.write(line)
  await appendFile(join(OUT, 'run.log'), line)
}
async function updateState(patch) {
  await writeFile(STATE, JSON.stringify({ ...JSON.parse(readFileSync(STATE, 'utf8')), ...patch }, null, 2))
}
function normalized(value) {
  return String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
}
function parseCounts(discovery) {
  const items = (discovery.commerce?.sections ?? []).flatMap((section) => section.items ?? [])
  return {
    pagesRead: discovery.pages?.read?.length ?? 0,
    pagesFailed: discovery.pages?.failed?.length ?? 0,
    sections: discovery.commerce?.sections?.length ?? 0,
    products: discovery.commerce?.products ?? 0,
    extractedItems: items.length,
    priced: discovery.commerce?.priced ?? items.filter((item) => item.price > 0).length,
    withImage: discovery.commerce?.withImage ?? items.filter((item) => item.image).length,
    currency: discovery.commerce?.currency?.value ?? '',
    status: discovery.commerce?.status ?? '',
    rejections: discovery.commerce?.rejected?.length ?? 0,
    itemNames: items.map((item) => item.name),
  }
}
function parseProfile(discovery) {
  return Object.fromEntries(
    Object.entries(discovery.business ?? {}).map(([key, value]) => [
      key,
      value && typeof value === 'object' && 'value' in value
        ? { value: value.value, source: value.source, method: value.method, confidence: value.confidence }
        : value,
    ]),
  )
}
function setCookies(headers) {
  const getSetCookie = headers.getSetCookie?.bind(headers)
  return (getSetCookie ? getSetCookie() : [headers.get('set-cookie')]).filter(Boolean)
}
function ownerCookieFrom(lines) {
  for (const line of lines) {
    const first = line.split(';')[0]
    const at = first.indexOf('=')
    if (at < 1) continue
    const name = first.slice(0, at)
    const value = first.slice(at + 1)
    if (/^plattr_owner_/.test(name)) return { name, value }
  }
  return null
}
async function publicFetch(path) {
  return fetch(`${ORIGIN}${path}`, { redirect: 'manual', headers: { 'cache-control': 'no-store' } })
}
async function ownerFetch(path, cookie, init = {}) {
  const headers = new Headers(init.headers ?? {})
  headers.set('cookie', `${cookie.name}=${cookie.value}`)
  headers.set('origin', ORIGIN)
  headers.set('cache-control', 'no-store')
  return fetch(`${ORIGIN}${path}`, { ...init, headers, redirect: 'manual' })
}
async function ownerJson(path, cookie, init = {}) {
  const response = await ownerFetch(path, cookie, init)
  const text = await response.text()
  let body = null
  try { body = JSON.parse(text) } catch {}
  return { status: response.status, body, text }
}
function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      server.close(() => resolve(port))
    })
  })
}
async function waitForHttp(url, timeoutMs = 20000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) return await response.json()
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error(`Timed out waiting for ${url}`)
}
async function launchChrome() {
  if (typeof WebSocket !== 'function') throw new Error('This harness must run with Bun (WebSocket is required).')
  const port = await freePort()
  const profile = join(OUT, 'chrome-profile')
  const child = spawn(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--remote-allow-origins=*',
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${port}`,
    '--window-size=1440,1000',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] })
  try {
    await waitForHttp(`http://127.0.0.1:${port}/json/version`)
  } catch (error) {
    child.kill('SIGTERM')
    throw error
  }
  return { child, port }
}
async function connectBrowser(port) {
  const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' }).then((response) => response.json())
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  let sequence = 0
  const pending = new Map()
  const call = (method, params = {}) => {
    const id = ++sequence
    socket.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
  }
  socket.addEventListener('message', (event) => {
    let message
    try { message = JSON.parse(String(event.data)) } catch { return }
    const entry = pending.get(message.id)
    if (!entry) return
    pending.delete(message.id)
    if (message.error) entry.reject(new Error(message.error.message))
    else entry.resolve(message.result)
  })
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  await call('Page.enable')
  await call('Runtime.enable')
  await call('Network.enable')
  return { call, socket, target }
}
async function main() {
  await log('Starting the single controlled production discovery.')
  const started = Date.now()
  let response
  let raw = ''
  try {
    response = await fetch(`${ORIGIN}/api/discover`, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(120000),
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        origin: ORIGIN,
        'cache-control': 'no-store',
        'user-agent': 'PlattrProductionAcceptance/1.0',
      },
      body: JSON.stringify({ url: SOURCE }),
    })
    raw = await response.text()
  } catch (error) {
    check('discovery_transport', false, error.message)
    await updateState({ status: 'failed', at: new Date().toISOString(), error: error.message })
    await writeFile(join(OUT, 'discovery-error.txt'), String(error.stack ?? error))
    await log(`Discovery transport failed: ${error.message}. No retry will be made.`)
    process.exitCode = 2
    await finish({ status: 'FAIL', error: error.message, transport: true })
    return
  }

  const headers = {}
  for (const [key, value] of response.headers) if (key.toLowerCase() !== 'set-cookie') headers[key] = value
  const cookies = setCookies(response.headers)
  const ownerCookie = ownerCookieFrom(cookies)
  await writeFile(join(OUT, 'discovery-response.json'), raw)
  await writeFile(join(OUT, 'discovery-headers.json'), JSON.stringify({ status: response.status, headers, cookies: cookies.map((line) => line.split('=')[0]) }, null, 2))
  await log(`Discovery response: HTTP ${response.status} in ${Date.now() - started} ms.`)

  let data = null
  try { data = JSON.parse(raw) } catch {}
  if (!response.ok || !data?.draft?.token) {
    check('discovery_ok', false, `HTTP ${response.status}; ${data?.error?.message ?? 'no draft returned'}`)
    await updateState({ status: 'failed', at: new Date().toISOString(), httpStatus: response.status })
    await finish(data ? { response: data, headers } : { headers })
    process.exitCode = 2
    return
  }
  check('discovery_ok', true, `HTTP ${response.status}; draft ${data.draft.token}`)
  check('owner_cookie', Boolean(ownerCookie), ownerCookie ? 'owner session returned' : 'no owner cookie returned')
  if (!ownerCookie) {
    await updateState({ status: 'failed', at: new Date().toISOString(), error: 'no owner cookie' })
    await finish({ response: data, headers })
    process.exitCode = 2
    return
  }

  const discovery = data.discovery ?? {}
  const counts = parseCounts(discovery)
  const profile = parseProfile(discovery)
  const concepts = Array.isArray(data.concepts) ? data.concepts : []
  const firstItem = counts.itemNames[0] ?? ''
  await writeFile(join(OUT, 'discovery.json'), JSON.stringify({
    source: data.source,
    host: data.host,
    pages: data.pages,
    counts,
    profile,
    blockers: data.blockers ?? [],
    confirmations: data.confirmations ?? [],
    diversity: data.diversity ?? null,
    concepts: concepts.map(({ id, name, note, preview }) => ({ id, name, note, preview })),
    draft: data.draft,
  }, null, 2))

  check('host', normalized(data.host) === 'geestores.com', data.host)
  check('business_name', Boolean(String(profile.name?.value ?? '').trim()), profile.name?.value ?? '')
  check('trade', Boolean(String(profile.trade?.value ?? '').trim()), profile.trade?.value ?? '')
  check('pages_read', counts.pagesRead > 0, String(counts.pagesRead))
  check('catalogue', counts.products > 0 && counts.extractedItems > 0, `${counts.products} products / ${counts.extractedItems} extracted`)
  check('concepts_three', concepts.length === 3, String(concepts.length))
  check('concept_directions_unique', new Set(concepts.map((concept) => concept.id)).size === 3, concepts.map((concept) => concept.id).join(', '))
  check('no_known_demo_items', !counts.itemNames.some((name) => /honeycomb tree|burrata|loft suite/i.test(name)), firstItem)

  const chosen = concepts[1] ?? concepts[0]
  const selection = await ownerJson(`/api/projects/${data.draft.token}`, ownerCookie, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ direction: chosen?.id }),
  })
  check('select_concept', selection.status === 200, `HTTP ${selection.status}; ${chosen?.id ?? 'none'}`)
  const docResponse = await ownerJson(`/api/projects/${data.draft.token}/doc`, ownerCookie)
  const selectedDocDirection = docResponse.body?.doc?.design?.direction ?? ''
  check('selected_direction_persisted', selectedDocDirection === chosen?.id, selectedDocDirection)

  let browser
  let page
  const report = {
    generatedAt: new Date().toISOString(),
    status: 'FAIL',
    release: {
      commit: RELEASE_COMMIT,
      deployment: RELEASE_DEPLOYMENT,
      sourceMatch: release.sourceMatch,
      workerHash: release.workerHash,
      assetTreeHash: release.assetHash,
    },
    run: {
      now: now.toISOString(),
      resetAt: new Date(RESET_AT).toISOString(),
      origin: ORIGIN,
      source: SOURCE,
      discoveryHttp: response.status,
      discoveryMs: Date.now() - started,
    },
    discovery: { host: data.host, pages: data.pages, counts, profile, blockers: data.blockers ?? [], confirmations: data.confirmations ?? [], diversity: data.diversity ?? null },
    draft: data.draft,
    selectedConcept: chosen ? { id: chosen.id, name: chosen.name } : null,
    selectedDocDirection,
    concepts: [],
    checks,
  }

  try {
    const launched = await launchChrome()
    browser = launched.child
    const connected = await connectBrowser(launched.port)
    page = connected
    const cookieSet = await page.call('Network.setCookie', {
      name: ownerCookie.name,
      value: ownerCookie.value,
      url: `${ORIGIN}/`,
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
    })
    check('browser_cookie', cookieSet.success !== false, JSON.stringify(cookieSet))

    const evaluate = async (expression) => {
      const answer = await page.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true })
      if (answer.exceptionDetails) throw new Error(answer.exceptionDetails.exception?.description ?? 'page evaluation failed')
      return answer.result?.value
    }
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    const waitFor = async (expression, timeoutMs = 12000) => {
      const started = Date.now()
      while (Date.now() - started < timeoutMs) {
        try { if (await evaluate(expression)) return true } catch {}
        await sleep(180)
      }
      throw new Error(`Timed out waiting for ${expression}`)
    }
    const navigate = async (url, width, height) => {
      await page.call('Emulation.setDeviceMetricsOverride', {
        width, height, deviceScaleFactor: 1, mobile: width < 700, screenWidth: width, screenHeight: height,
      })
      await page.call('Page.navigate', { url })
      await sleep(900)
      await waitFor("document.readyState === 'complete'", 12000)
      await evaluate(`(async () => {
        if (document.fonts) await document.fonts.ready;
        document.querySelector('[data-splash]')?.remove();
        document.querySelector('[data-offline]')?.remove();
        return location.pathname;
      })()`)
      await sleep(350)
    }
    const scrollAndLoad = async () => {
      await evaluate('window.scrollTo(0, 0)')
      let height = 0
      for (let index = 0; index < 24; index += 1) {
        const next = await evaluate('document.documentElement.scrollHeight')
        if (next === height && index > 2) break
        height = next
        await evaluate(`window.scrollTo(0, ${Math.min(height, (index + 1) * 650)})`)
        await sleep(120)
      }
      await evaluate('window.scrollTo(0, 0)')
      await sleep(250)
    }
    const capture = async (name) => {
      await scrollAndLoad()
      const metrics = await page.call('Page.getLayoutMetrics')
      const size = metrics.cssContentSize ?? metrics.contentSize ?? { width: 1440, height: 1000 }
      const width = Math.max(320, Math.min(2000, Math.ceil(size.width)))
      const height = Math.max(240, Math.min(12000, Math.ceil(size.height)))
      const shot = await page.call('Page.captureScreenshot', {
        format: 'png', fromSurface: true, captureBeyondViewport: true,
        clip: { x: 0, y: 0, width, height, scale: 1 },
      })
      const path = join(SCREEN_DIR, `${name}.png`)
      await writeFile(path, Buffer.from(shot.data, 'base64'))
      return { path, width, height, truncated: Math.ceil(size.height) > 12000 }
    }
    const facts = async () => evaluate(`(() => {
      const active = [...document.querySelectorAll('[data-screen]')].find((node) => node.classList.contains('on'));
      return {
        url: location.href,
        path: location.pathname,
        title: document.title,
        direction: document.body.dataset.direction || '',
        trade: document.body.dataset.trade || '',
        layout: document.body.dataset.layout || '',
        shell: document.body.dataset.shell || '',
        concept: document.body.dataset.concept || '',
        conceptType: document.body.dataset.conceptType || '',
        screens: [...document.querySelectorAll('[data-screen]')].map((node) => node.dataset.screen),
        activeScreen: active?.dataset.screen || '',
        activeText: (active?.innerText || '').slice(0, 16000),
        bodyText: (document.body.innerText || '').slice(0, 24000),
        cards: document.querySelectorAll('[data-item]').length,
        images: [...document.images].length,
        brokenImages: [...document.images].filter((image) => image.complete && image.naturalWidth === 0).length,
      };
    })()`)

    await navigate(`${ORIGIN}/p/${data.draft.token}`, 1440, 1000)
    const workspace = await facts()
    const workspaceDetails = await evaluate(`(() => ({
      name: document.querySelector('#edit-name')?.value ?? '',
      tagline: document.querySelector('#edit-tagline')?.value ?? '',
      category: document.querySelector('#edit-category')?.value ?? '',
      sourceLinks: [...document.querySelectorAll('a[href*="geestores"]')].map((node) => node.href),
      sectionNames: [...document.querySelectorAll('[data-menu] [data-section-name]')].map((node) => node.value),
      itemNames: [...document.querySelectorAll('[data-menu] [data-item]')].map((row) => row.querySelector('[data-item-name]')?.value ?? ''),
      bodyText: (document.body.innerText || '').slice(0, 20000),
      buildVersion: (document.body.innerText || '').match(/Build v(\\d+)/)?.[1] ?? '',
    }))()`)
    check('workspace_owner_view', workspace.path === `/p/${data.draft.token}`, workspace.path)
    check('workspace_name', workspaceDetails.name === profile.name?.value, `${workspaceDetails.name} / ${profile.name?.value}`)
    check('workspace_catalogue_count', workspaceDetails.itemNames.length === counts.products, `${workspaceDetails.itemNames.length} rows / ${counts.products} products`)
    const workspaceNames = workspaceDetails.itemNames.map(normalized)
    const discoveryNames = counts.itemNames.map(normalized)
    check('workspace_catalogue_identity', workspaceNames.length === discoveryNames.length && workspaceNames.every((name, index) => name === discoveryNames[index]), 'same order and names')
    check('workspace_private_copy', /nothing is public until you publish/i.test(workspaceDetails.bodyText), 'privacy notice present')
    check('no_demo_copy', !/honeycomb tree|burrata|loft suite/i.test(workspaceDetails.bodyText), 'no known demo items')
    report.workspace = {
      path: workspace.path,
      name: workspaceDetails.name,
      tagline: workspaceDetails.tagline,
      category: workspaceDetails.category,
      sectionNames: workspaceDetails.sectionNames,
      itemCount: workspaceDetails.itemNames.length,
      firstItems: workspaceDetails.itemNames.slice(0, 8),
      buildVersion: workspaceDetails.buildVersion,
      sourceLinks: workspaceDetails.sourceLinks,
      screenshots: [
        await capture('workspace-desktop-1440'),
      ],
    }
    await navigate(`${ORIGIN}/p/${data.draft.token}`, 390, 844)
    report.workspace.screenshots.push(await capture('workspace-mobile-390'))

    await navigate(`${ORIGIN}/p/${data.draft.token}/review`, 1440, 1000)
    const reviewText = await evaluate('(document.body.innerText || "").slice(0, 24000)')
    report.review = {
      bodyText: reviewText.slice(0, 8000),
      screenshots: [await capture('profile-review-desktop-1440')],
    }
    await navigate(`${ORIGIN}/p/${data.draft.token}/review`, 390, 844)
    report.review.screenshots.push(await capture('profile-review-mobile-390'))
    check('review_profile', reviewText.includes(profile.name?.value ?? '\u0000') || reviewText.includes(data.host ?? '\u0000'), profile.name?.value ?? '')
    check('review_catalogue', counts.products === 0 || reviewText.includes(String(counts.products)) || !/No items have been published/i.test(reviewText), `${counts.products} products`)

    for (const concept of concepts) {
      const entry = { id: concept.id, name: concept.name, viewports: {} }
      for (const viewport of [
        { name: 'desktop-1440', width: 1440, height: 1000 },
        { name: 'mobile-390', width: 390, height: 844 },
      ]) {
        await navigate(`${ORIGIN}/p/${data.draft.token}/app?concept=${encodeURIComponent(concept.id)}&acceptance=${Date.now()}`, viewport.width, viewport.height)
        const home = await facts()
        const pageText = normalized(home.bodyText)
        const activeText = normalized(home.activeText)
        const nameSeen = pageText.includes(normalized(profile.name?.value ?? ''))
        const firstItemSeen = !firstItem || pageText.includes(normalized(firstItem)) || activeText.includes(normalized(firstItem))
        const homeShot = await capture(`concept-${concept.id}-${viewport.name}`)
        let clickedCatalog = await evaluate(`(() => {
          const visible = (node) => node.offsetParent && getComputedStyle(node).visibility !== 'hidden' && node.getClientRects().length;
          const node = [...document.querySelectorAll('[data-go="catalog"]')].find(visible);
          if (!node) return false;
          node.click();
          return true;
        })()`)
        if (!clickedCatalog) {
          await evaluate(`(() => {
            const visible = (node) => node.offsetParent && getComputedStyle(node).visibility !== 'hidden' && node.getClientRects().length;
            [...document.querySelectorAll('[data-nav-open]')].find(visible)?.click();
            return true;
          })()`)
          await sleep(350)
          clickedCatalog = await evaluate(`(() => {
            const visible = (node) => node.offsetParent && getComputedStyle(node).visibility !== 'hidden' && node.getClientRects().length;
            const node = [...document.querySelectorAll('[data-sheet].on [data-go="catalog"], [data-go="catalog"]')].find(visible);
            if (!node) return false;
            node.click();
            return true;
          })()`)
        }
        if (clickedCatalog) await sleep(450)
        const catalogue = await facts()
        const catalogueShot = clickedCatalog ? await capture(`concept-${concept.id}-${viewport.name}-catalogue`) : null
        check(`concept_${concept.id}_${viewport.name}_business`, nameSeen, home.activeScreen)
        check(`concept_${concept.id}_${viewport.name}_catalogue`, !firstItem || firstItemSeen || catalogue.cards > 0, `${home.cards} home cards / ${catalogue.cards} catalogue cards`)
        entry.viewports[viewport.name] = {
          direction: home.direction,
          concept: home.concept,
          conceptType: home.conceptType,
          trade: home.trade,
          activeScreen: home.activeScreen,
          screens: home.screens,
          cards: home.cards,
          catalogueCards: catalogue.cards,
          images: home.images,
          brokenImages: home.brokenImages,
          businessSeen: nameSeen,
          firstItemSeen,
          clickedCatalog,
          screenshot: homeShot,
          catalogueScreenshot: catalogueShot,
          textSample: home.activeText.slice(0, 1200),
        }
      }
      report.concepts.push(entry)
      await log(`Captured ${concept.id} at desktop and mobile.`)
    }
    const directions = report.concepts.map((concept) => concept.viewports['desktop-1440'].direction)
    const layouts = report.concepts.map((concept) => concept.viewports['desktop-1440'].layout)
    const shells = report.concepts.map((concept) => concept.viewports['desktop-1440'].shell)
    check('concepts_visually_distinct', new Set(directions.filter(Boolean)).size === 3 && new Set(layouts.filter(Boolean)).size >= 2, `directions ${directions.join(', ')}; layouts ${layouts.join(', ')}; shells ${shells.join(', ')}`)

    await navigate(`${ORIGIN}/p/${data.draft.token}/edit`, 1440, 1000)
    await capture('editor-desktop-1440')
    check('editor_open', /Catalogue & offers|Edit /.test(await evaluate('document.body.innerText')), 'editor body rendered')

    const originalTagline = workspaceDetails.tagline
    const editedTagline = originalTagline
      ? `${originalTagline.slice(0, 80)} · production acceptance`.slice(0, 90)
      : 'Production acceptance check'
    await navigate(`${ORIGIN}/p/${data.draft.token}`, 1440, 1000)
    const editStep = async (value) => {
      await evaluate(`(() => {
        const field = document.querySelector('#edit-tagline');
        if (!field) return false;
        field.value = ${JSON.stringify(value)};
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
        document.querySelector('#edit-form')?.requestSubmit();
        return true;
      })()`)
      await sleep(3500)
      await navigate(`${ORIGIN}/p/${data.draft.token}?after=${Date.now()}`, 1440, 1000)
      return evaluate(`(() => ({
        tagline: document.querySelector('#edit-tagline')?.value ?? '',
        version: (document.body.innerText || '').match(/Build v(\\d+)/)?.[1] ?? '',
        bodyText: (document.body.innerText || '').slice(0, 12000),
      }))()`)
    }
    const afterSave = await editStep(editedTagline)
    check('edit_persisted', afterSave.tagline === editedTagline, afterSave.tagline)
    await capture('workspace-after-save-desktop-1440')
    const afterRefresh = await editStep(originalTagline)
    check('edit_restored', afterRefresh.tagline === originalTagline, afterRefresh.tagline)
    await capture('workspace-restored-desktop-1440')
    report.edit = {
      before: originalTagline,
      saved: editedTagline,
      afterSave,
      restored: originalTagline,
      afterRestore: afterRefresh,
      versionBefore: workspaceDetails.buildVersion,
    }
    await log(`Edit save/reload: ${afterSave.tagline === editedTagline ? 'PASS' : 'FAIL'}; restore: ${afterRefresh.tagline === originalTagline ? 'PASS' : 'FAIL'}.`)

    const draftPublic = await publicFetch(`/p/${data.draft.token}/app`)
    const ownerPrivate = await ownerFetch(`/p/${data.draft.token}/app`, ownerCookie)
    check('draft_public_private', draftPublic.status === 404, `public HTTP ${draftPublic.status}`)
    check('draft_owner_preview', ownerPrivate.status === 200, `owner HTTP ${ownerPrivate.status}`)
    check('draft_private_noindex', /noindex/i.test(draftPublic.headers.get('x-robots-tag') ?? ''), draftPublic.headers.get('x-robots-tag') ?? '')

    const approve = await ownerJson(`/api/projects/${data.draft.token}/approve`, ownerCookie, { method: 'POST' })
    check('approve', approve.status === 200, `HTTP ${approve.status}`)
    const publish = await ownerJson(`/api/projects/${data.draft.token}/publish`, ownerCookie, { method: 'POST' })
    check('explicit_publish', publish.status === 200 && publish.body?.status === 'published', `HTTP ${publish.status}; ${publish.body?.status ?? ''}`)
    const publicPublished = await publicFetch(`/p/${data.draft.token}/app`)
    const publicPublishedText = await publicPublished.text()
    check('published_public', publicPublished.status === 200 && publicPublishedText.includes(profile.name?.value ?? '\u0000'), `HTTP ${publicPublished.status}`)
    await navigate(`${ORIGIN}/p/${data.draft.token}/app?published=${Date.now()}`, 1440, 1000)
    report.published = { publicStatus: publicPublished.status, screenshot: await capture('published-public-desktop-1440') }

    const unpublish = await ownerJson(`/api/projects/${data.draft.token}/unpublish`, ownerCookie, { method: 'POST' })
    check('unpublish', unpublish.status === 200, `HTTP ${unpublish.status}`)
    const publicAfterUnpublish = await publicFetch(`/p/${data.draft.token}/app`)
    check('private_after_unpublish', publicAfterUnpublish.status === 404, `HTTP ${publicAfterUnpublish.status}`)
    report.privacy = {
      draftPublic: { status: draftPublic.status, robots: draftPublic.headers.get('x-robots-tag') ?? '' },
      ownerPreview: { status: ownerPrivate.status },
      publish: { status: publish.status, body: publish.body },
      publicPublished: { status: publicPublished.status, hasBusinessName: publicPublishedText.includes(profile.name?.value ?? '\u0000') },
      unpublish: { status: unpublish.status, body: unpublish.body },
      publicAfterUnpublish: { status: publicAfterUnpublish.status },
    }
    await log(`Privacy: draft ${draftPublic.status}, published ${publicPublished.status}, after unpublish ${publicAfterUnpublish.status}.`)

    report.failures = checks.filter((entry) => !entry.ok)
    report.status = report.failures.length ? 'FAIL' : 'PASS'
    page.socket.close()
    await fetch(`http://127.0.0.1:${launched.port}/json/close/${page.target.id}`).catch(() => {})
  } catch (error) {
    check('harness_run', false, error.message)
    report.failures = checks.filter((entry) => !entry.ok)
    report.status = 'FAIL'
    report.error = error.message
    await log(`Harness failed: ${error.message}. No retry will be made.`)
    if (page) page.socket.close()
    process.exitCode = 1
  } finally {
    if (browser) {
      browser.kill('SIGTERM')
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }

  await finish(report)
  if (report.status === 'PASS') process.exitCode = 0
  else if (!process.exitCode) process.exitCode = 1
}

async function finish(report) {
  const failures = checks.filter((entry) => !entry.ok)
  const status = report?.status ?? (failures.length ? 'FAIL' : 'PASS')
  const final = {
    generatedAt: new Date().toISOString(),
    status,
    release: {
      commit: RELEASE_COMMIT,
      deployment: RELEASE_DEPLOYMENT,
      sourceMatch: release.sourceMatch,
      workerHash: release.workerHash,
      assetMatch: release.assetMatch,
      assetTreeHash: release.assetHash,
    },
    origin: ORIGIN,
    result: report ?? null,
    checks,
    failures: report?.failures ?? failures,
    screenshots: existsSync(SCREEN_DIR) ? readdirSync(SCREEN_DIR).filter((name) => name.endsWith('.png')).sort() : [],
  }
  await writeFile(join(OUT, 'report.json'), JSON.stringify(final, null, 2))
  const lines = [
    '# Production GeeStores acceptance',
    '',
    `- Status: **${status}**`,
    `- Generated: ${final.generatedAt}`,
    `- Production origin: ${ORIGIN}`,
    `- Release commit: \`${RELEASE_COMMIT}\``,
    `- Deployment: \`${RELEASE_DEPLOYMENT}\``,
    '',
    '## Checks',
    '',
    ...checks.map((entry) => `- ${entry.ok ? '[x]' : '[ ]'} ${entry.id}: ${entry.detail}`),
    '',
    '## Evidence',
    '',
    `- Discovery response: \`${join(OUT, 'discovery-response.json')}\``,
    `- Discovery summary: \`${join(OUT, 'discovery.json')}\``,
    `- Machine report: \`${join(OUT, 'report.json')}\``,
    `- Screenshots: \`${SCREEN_DIR}\``,
  ]
  await writeFile(join(OUT, 'report.md'), lines.join('\n') + '\n')
  await updateState({ status: status === 'PASS' ? 'completed' : 'failed', at: new Date().toISOString(), report: join(OUT, 'report.json') })
  await log(`Finished: ${status}. Evidence at ${join(OUT, 'report.md')}.`)
  console.log(`\n${status}: ${join(OUT, 'report.md')}`)
}

await main().catch(async (error) => {
  check('harness_fatal', false, error.message)
  await mkdir(SCREEN_DIR, { recursive: true })
  await log(`Harness fatal error: ${error.message}. No retry will be made.`)
  await finish({ status: 'FAIL', error: error.message })
  process.exitCode = 1
})
